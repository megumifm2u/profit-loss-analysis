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

// Safely read a monetary value, preferring shop_money (store currency) for multi-currency orders
function shopMoney(moneySet, fallbackStr) {
  const v = moneySet?.shop_money?.amount ?? fallbackStr;
  return parseFloat(v || 0);
}

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

function applyRefund(refund, refundSeenIds, totals, startMs, endMs) {
  if (refundSeenIds.has(refund.id)) return;
  const refundMs = new Date(refund.created_at).getTime();
  if (refundMs < startMs || refundMs > endMs) return;
  refundSeenIds.add(refund.id);
  for (const rli of refund.refund_line_items || []) {
    // Use shop_money for multi-currency accuracy; fall back to subtotal
    totals.productRefunds += shopMoney(rli.subtotal_set, rli.subtotal);
  }
  for (const adj of refund.order_adjustments || []) {
    if (adj.kind === "shipping_refund") {
      totals.shippingRefunds += Math.abs(shopMoney(adj.amount_set, adj.amount));
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

  let ianaTimezone = "Australia/Sydney";
  try {
    const shopRes = await fetch(`https://${store}/admin/api/${API_VERSION}/shop.json`, { headers });
    if (!shopRes.ok) {
      const text = await shopRes.text();
      return res.status(401).json({ error: `Token rejected (${shopRes.status}): ${text.slice(0, 200)}` });
    }
    const sd = await shopRes.json();
    if (sd?.shop?.iana_timezone) ianaTimezone = sd.shop.iana_timezone;
  } catch (e) {
    return res.status(500).json({ error: `Could not reach ${store}: ${e.message}` });
  }

  const startUTC = localDateToUTC(extractDate(startDate), "00:00:00", ianaTimezone);
  const endUTC   = localDateToUTC(extractDate(endDate),   "23:59:59", ianaTimezone);
  const startMs  = new Date(startUTC).getTime();
  const endMs    = new Date(endUTC).getTime();

  // ── Fetch all orders for the period ───────────────────────────────────────
  let allOrders = [];
  try {
    allOrders = await fetchAllOrders(store, headers,
      `status=any&processed_at_min=${encodeURIComponent(startUTC)}&processed_at_max=${encodeURIComponent(endUTC)}`);
  } catch (e) {
    if (e.status === 401) return res.status(401).json({ error: "Invalid or expired token — reconnect Shopify in Settings." });
    return res.status(502).json({ error: e.message });
  }

  // Deduplicate; exclude voided (Shopify Analytics never counts voided orders)
  const seen = new Set();
  const orders = allOrders.filter(o => {
    if (seen.has(o.id)) return false;
    seen.add(o.id);
    return o.financial_status !== "voided";
  });

  // ── Revenue aggregation ────────────────────────────────────────────────────
  // Three gross formulas for comparison against Shopify Analytics:
  //   A) subtotal_price_set.shop_money + total_discounts_set.shop_money  (net+disc = gross)
  //   B) sum(line_item.price_set.shop_money × quantity)                  (Shopify's stated definition)
  //   C) current_subtotal_price_set.shop_money + current_total_discounts (post-edit values)

  let gs_A = 0, gs_B = 0, gs_C = 0;
  let disc_A = 0, disc_B = 0, disc_C = 0;
  let shippingGross = 0;
  const codeMap = {};
  const refundSeenIds = new Set();
  const refundTotals = { productRefunds: 0, shippingRefunds: 0 };

  // Per-day breakdown (local timezone) for date-boundary diagnosis
  const dayBreakdown = {};

  // Financial-status and source-name breakdowns to identify excess orders
  const grossByFinancialStatus = {};
  const grossBySourceName = {};
  const topOrders = [];   // top-10 by gross value

  let testCount = 0, cancelledCount = 0, draftCount = 0;
  const fsDist = {};

  for (const order of orders) {
    const isTest      = !!order.test;
    const isCancelled = !!order.cancelled_at;
    const isDraft     = order.source_name === "shopify_draft_order";
    const fs          = order.financial_status || "null";
    const src         = order.source_name || "unknown";
    if (isTest)      testCount++;
    if (isCancelled) cancelledCount++;
    if (isDraft)     draftCount++;
    fsDist[fs] = (fsDist[fs] || 0) + 1;

    if (!isTest) {
      // Shop-currency monetary values (multi-currency safe)
      const subtotal         = shopMoney(order.subtotal_price_set,         order.subtotal_price);
      const discounts        = shopMoney(order.total_discounts_set,        order.total_discounts);
      const currentSubtotal  = shopMoney(order.current_subtotal_price_set, order.current_subtotal_price ?? order.subtotal_price);
      const currentDiscounts = shopMoney(order.current_total_discounts_set, order.current_total_discounts ?? order.total_discounts);

      // Formula A
      gs_A   += subtotal + discounts;
      disc_A += discounts;

      // Formula B — line item prices × quantities (Shopify's stated definition)
      let orderGrossB = 0;
      for (const li of order.line_items || []) {
        const liPrice = shopMoney(li.price_set, li.price);
        orderGrossB += liPrice * parseInt(li.quantity || 0);
        for (const da of li.discount_allocations || []) {
          disc_B += shopMoney(da.amount_set, da.amount);
        }
      }
      gs_B += orderGrossB;

      // Formula C — current (post-edit/refund) values
      gs_C   += currentSubtotal + currentDiscounts;
      disc_C += currentDiscounts;

      // Shipping (shop currency)
      for (const sl of order.shipping_lines || []) {
        shippingGross += shopMoney(sl.price_set, sl.price);
      }

      // Discount codes
      for (const dc of order.discount_codes || []) {
        const code = (dc.code || "").toUpperCase();
        if (!code) continue;
        if (!codeMap[code]) codeMap[code] = { code, amount: 0, orders: 0 };
        codeMap[code].amount += parseFloat(dc.amount || 0);
        codeMap[code].orders += 1;
      }

      // Per-day breakdown (Formula A, store timezone)
      const dayKey = new Date(order.processed_at || order.created_at)
        .toLocaleDateString("en-AU", { timeZone: ianaTimezone, day: "2-digit", month: "2-digit" });
      if (!dayBreakdown[dayKey]) dayBreakdown[dayKey] = { orders: 0, gross: 0, discounts: 0, shipping: 0 };
      dayBreakdown[dayKey].orders++;
      dayBreakdown[dayKey].gross     += subtotal + discounts;
      dayBreakdown[dayKey].discounts += discounts;
      for (const sl of order.shipping_lines || []) {
        dayBreakdown[dayKey].shipping += shopMoney(sl.price_set, sl.price);
      }

      // Financial-status and source-name gross breakdowns (Formula B per order)
      grossByFinancialStatus[fs] = (grossByFinancialStatus[fs] || 0) + orderGrossB;
      grossBySourceName[src]     = (grossBySourceName[src]     || 0) + orderGrossB;

      // Track top-10 orders by gross (Formula B)
      topOrders.push({ id: order.id, processed_at: order.processed_at, financial_status: fs, source_name: src, gross: orderGrossB });
    }

    // Refunds from ALL non-test orders (including cancelled)
    if (!isTest) {
      for (const refund of order.refunds || []) {
        applyRefund(refund, refundSeenIds, refundTotals, startMs, endMs);
      }
    }
  }

  // Keep only top 10 by gross
  topOrders.sort((a, b) => b.gross - a.gross);
  topOrders.splice(10);

  // ── Extended refund fetch — 12-month lookback ──────────────────────────────
  // Catches refunds issued this week on orders from up to 12 months ago.
  // Uses created_at_min to avoid missing orders whose updated_at changed after the period.
  const twelveMonthsAgo = new Date(startMs);
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  const lookbackMin = encodeURIComponent(twelveMonthsAgo.toISOString());
  const lookbackMax = encodeURIComponent(endUTC);

  for (const fs of ["refunded", "partially_refunded"]) {
    try {
      const oldOrders = await fetchAllOrders(store, headers,
        `status=any&financial_status=${fs}&created_at_min=${lookbackMin}&created_at_max=${lookbackMax}`);
      for (const order of oldOrders) {
        if (order.test) continue;
        for (const refund of order.refunds || []) {
          applyRefund(refund, refundSeenIds, refundTotals, startMs, endMs);
        }
      }
    } catch (e) {
      console.error(`Extended refund fetch error (${fs}):`, e.message);
    }
  }

  const r2 = v => Math.round(v * 100) / 100;

  // Round day breakdown values
  for (const day of Object.keys(dayBreakdown)) {
    dayBreakdown[day].gross     = r2(dayBreakdown[day].gross);
    dayBreakdown[day].discounts = r2(dayBreakdown[day].discounts);
    dayBreakdown[day].shipping  = r2(dayBreakdown[day].shipping);
  }

  // Round status/source breakdowns
  for (const k of Object.keys(grossByFinancialStatus)) grossByFinancialStatus[k] = r2(grossByFinancialStatus[k]);
  for (const k of Object.keys(grossBySourceName))      grossBySourceName[k]      = r2(grossBySourceName[k]);
  for (const o of topOrders) o.gross = r2(o.gross);

  const shippingIncome = shippingGross - refundTotals.shippingRefunds;
  const orderCount = orders.filter(o => !o.test).length;

  // Primary response uses Formula B (Shopify's official gross-sales definition:
  // sum of line_item.price × quantity, in shop currency).
  // All three formulas are in _debug so you can confirm which matches Analytics.
  return res.status(200).json({
    revenue: {
      gross_sales:     r2(gs_B),
      refunds:         r2(refundTotals.productRefunds),
      discounts:       r2(disc_B),
      shipping_income: r2(shippingIncome),
    },
    orderCount,
    discountCodes: Object.values(codeMap).sort((a, b) => b.amount - a.amount),
    _debug: {
      timezone:     ianaTimezone,
      startUTC,
      endUTC,
      totalFetched:    orders.length,
      testOrders:      testCount,
      cancelledOrders: cancelledCount,
      draftOrders:     draftCount,
      financialStatuses: fsDist,

      // ── 3 gross sales formulas — which one = 44793.73? ──
      grossA_subtotalPlusDisc: r2(gs_A),
      grossB_lineItems:        r2(gs_B),
      grossC_currentFields:    r2(gs_C),

      // ── 3 discount formulas — which one = 5676.26? ──
      discA_totalDiscounts: r2(disc_A),
      discB_lineItemAlloc:  r2(disc_B),
      discC_currentTotal:   r2(disc_C),

      // ── Shipping breakdown ──
      shippingGross:   r2(shippingGross),
      shippingRefunds: r2(refundTotals.shippingRefunds),
      shippingNet:     r2(shippingIncome),

      // ── Refunds ──
      productRefunds: r2(refundTotals.productRefunds),

      // ── Targeted diagnosis: gross by financial status and source ──
      // Look for which status/source contributes the ~$1,391.55 excess
      grossByFinancialStatus,
      grossBySourceName,

      // ── Top 10 orders by value ──
      topOrders,

      // ── Per-day breakdown (diagnose timezone/date boundary issues) ──
      byDay: dayBreakdown,
    },
  });
}
