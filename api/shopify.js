// Vercel serverless function — Shopify data pull
const API_VERSION = "2025-07";

function localDateToUTC(dateStr, timeStr, ianaTimezone) {
  const approxUTC = new Date(`${dateStr}T${timeStr}Z`);
  const utcMs = new Date(approxUTC.toLocaleString("en-US", { timeZone: "UTC" }));
  const tzMs  = new Date(approxUTC.toLocaleString("en-US", { timeZone: ianaTimezone }));
  const offsetMinutes = (tzMs - utcMs) / 60000;
  return new Date(approxUTC.getTime() - offsetMinutes * 60000).toISOString();
}

function extractDate(isoStr) { return isoStr.slice(0, 10); }

async function fetchAllOrders(store, headers, params) {
  const orders = [];
  let nextUrl = `https://${store}/admin/api/${API_VERSION}/orders.json?${params}&limit=250`;
  while (nextUrl) {
    const r = await fetch(nextUrl, { headers });
    if (!r.ok) {
      const text = await r.text();
      throw Object.assign(new Error(`Shopify API error (${r.status}): ${text.slice(0, 200)}`), { status: r.status });
    }
    const data = await r.json();
    orders.push(...(data.orders || []));
    const link = r.headers.get("link") || "";
    const next = link.match(/<([^>]+)>;\s*rel="next"/);
    nextUrl = next ? next[1] : null;
  }
  return orders;
}

// Apply a refund to running totals (product refunds and shipping refunds tracked separately)
function applyRefund(refund, refundSeenIds, totals, startMs, endMs) {
  if (refundSeenIds.has(refund.id)) return;
  const refundMs = new Date(refund.created_at).getTime();
  if (refundMs < startMs || refundMs > endMs) return;
  refundSeenIds.add(refund.id);
  // Product refunds
  for (const rli of refund.refund_line_items || []) {
    // Prefer shop_money for multi-currency accuracy
    const amt = parseFloat(rli.subtotal_set?.shop_money?.amount ?? rli.subtotal ?? 0);
    totals.productRefunds += amt;
  }
  // Shipping refunds (tracked separately — reduces Shipping Income, not Refunds line)
  for (const adj of refund.order_adjustments || []) {
    if (adj.kind === "shipping_refund") {
      totals.shippingRefunds += Math.abs(parseFloat(adj.amount_set?.shop_money?.amount ?? adj.amount ?? 0));
    }
  }
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { accessToken, shop, startDate, endDate } = req.body || {};
  const store = shop;
  if (!accessToken) return res.status(400).json({ error: "Missing access token." });
  if (!store)       return res.status(400).json({ error: "Missing shop domain." });
  if (!startDate || !endDate) return res.status(400).json({ error: "Missing date range." });

  const headers = { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" };

  // Timezone
  let ianaTimezone = "Australia/Sydney";
  try {
    const shopRes = await fetch(`https://${store}/admin/api/${API_VERSION}/shop.json`, { headers });
    if (!shopRes.ok) {
      const text = await shopRes.text();
      return res.status(401).json({ error: `Token rejected (${shopRes.status}): ${text.slice(0, 200)}` });
    }
    const shopData = await shopRes.json();
    if (shopData?.shop?.iana_timezone) ianaTimezone = shopData.shop.iana_timezone;
  } catch (e) {
    return res.status(500).json({ error: `Could not reach ${store}: ${e.message}` });
  }

  const startUTC = localDateToUTC(extractDate(startDate), "00:00:00", ianaTimezone);
  const endUTC   = localDateToUTC(extractDate(endDate),   "23:59:59", ianaTimezone);
  const startMs  = new Date(startUTC).getTime();
  const endMs    = new Date(endUTC).getTime();
  const pMin = encodeURIComponent(startUTC);
  const pMax = encodeURIComponent(endUTC);

  // ── Fetch ALL orders for the period (status=any = open+closed+cancelled) ──
  let allOrders = [];
  try {
    allOrders = await fetchAllOrders(store, headers,
      `status=any&processed_at_min=${pMin}&processed_at_max=${pMax}`);
  } catch (e) {
    if (e.status === 401) return res.status(401).json({ error: "Invalid or expired token — reconnect Shopify in Settings." });
    return res.status(502).json({ error: e.message });
  }

  // Deduplicate; exclude voided
  const seen = new Set();
  const orders = allOrders.filter(o => {
    if (seen.has(o.id)) return false;
    seen.add(o.id);
    return o.financial_status !== "voided";
  });

  // ── Revenue aggregation ────────────────────────────────────────────────────
  // Shopify Analytics excludes:
  //   - cancelled orders (cancelled_at set) from Gross Sales / Discounts / Shipping
  //   - test orders (test: true) from all analytics metrics
  // Refunds from ALL orders (including cancelled) are counted.

  let grossSales = 0, totalDiscounts = 0, shippingGross = 0;
  const codeMap = {};
  const refundSeenIds = new Set();
  const refundTotals = { productRefunds: 0, shippingRefunds: 0 };

  let cancelledCount = 0, testCount = 0, draftCount = 0;

  for (const order of orders) {
    const isCancelled = !!order.cancelled_at;
    const isTest      = !!order.test;
    const isDraft     = order.source_name === "shopify_draft_order";
    if (isCancelled) cancelledCount++;
    if (isTest)      testCount++;
    if (isDraft)     draftCount++;

    // Revenue: skip cancelled and test orders (mirrors Shopify Analytics)
    if (!isCancelled && !isTest) {
      // Gross sales = subtotal before discounts = subtotal_price + total_discounts
      // Use shop_money variants for multi-currency accuracy
      const subtotal  = parseFloat(order.subtotal_price_set?.shop_money?.amount  ?? order.subtotal_price  ?? 0);
      const discounts = parseFloat(order.total_discounts_set?.shop_money?.amount ?? order.total_discounts ?? 0);
      grossSales     += subtotal + discounts;
      totalDiscounts += discounts;

      for (const sl of order.shipping_lines || []) {
        shippingGross += parseFloat(sl.price_set?.shop_money?.amount ?? sl.price ?? 0);
      }

      for (const dc of order.discount_codes || []) {
        const code = (dc.code || "").toUpperCase();
        if (!code) continue;
        if (!codeMap[code]) codeMap[code] = { code, amount: 0, orders: 0 };
        codeMap[code].amount += parseFloat(dc.amount || 0);
        codeMap[code].orders += 1;
      }
    }

    // Refunds from ALL non-test orders (including cancelled)
    if (!isTest) {
      for (const refund of order.refunds || []) {
        applyRefund(refund, refundSeenIds, refundTotals, startMs, endMs);
      }
    }
  }

  // ── Extended refund fetch: old orders refunded during this period ─────────
  // Checks open, closed, AND cancelled statuses to catch all cases
  const uMin = encodeURIComponent(startUTC);
  const uMax = encodeURIComponent(endUTC);
  for (const fs of ["refunded", "partially_refunded"]) {
    for (const status of ["open", "closed", "cancelled"]) {
      try {
        const oldOrders = await fetchAllOrders(store, headers,
          `status=${status}&financial_status=${fs}&updated_at_min=${uMin}&updated_at_max=${uMax}`);
        for (const order of oldOrders) {
          if (order.test) continue;
          for (const refund of order.refunds || []) {
            applyRefund(refund, refundSeenIds, refundTotals, startMs, endMs);
          }
        }
      } catch (e) { /* skip on individual failures */ }
    }
  }

  const r2 = v => Math.round(v * 100) / 100;

  // Shipping income = gross shipping charged minus shipping refunded
  // (Shopify Analytics shows net shipping)
  const shippingIncome = shippingGross - refundTotals.shippingRefunds;

  const nonTestNonCancelled = orders.filter(o => !o.cancelled_at && !o.test);

  return res.status(200).json({
    revenue: {
      gross_sales:     r2(grossSales),
      refunds:         r2(refundTotals.productRefunds),
      discounts:       r2(totalDiscounts),
      shipping_income: r2(shippingIncome),
    },
    orderCount: nonTestNonCancelled.length,
    discountCodes: Object.values(codeMap).sort((a, b) => b.amount - a.amount),
    _debug: {
      timezone: ianaTimezone,
      startUTC,
      endUTC,
      totalFetched:    orders.length,
      cancelledOrders: cancelledCount,
      testOrders:      testCount,
      draftOrders:     draftCount,
      revenueOrders:   nonTestNonCancelled.length,
      shippingGross:   r2(shippingGross),
      shippingRefunds: r2(refundTotals.shippingRefunds),
      productRefunds:  r2(refundTotals.productRefunds),
    },
  });
}
