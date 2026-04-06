// Vercel serverless function — Shopify data pull
const STORE = "";
const API_VERSION = "2025-07";

function localDateToUTC(dateStr, timeStr, ianaTimezone) {
  const approxUTC = new Date(`${dateStr}T${timeStr}Z`);
  const utcMs = new Date(approxUTC.toLocaleString("en-US", { timeZone: "UTC" }));
  const tzMs  = new Date(approxUTC.toLocaleString("en-US", { timeZone: ianaTimezone }));
  const offsetMinutes = (tzMs - utcMs) / 60000;
  return new Date(approxUTC.getTime() - offsetMinutes * 60000).toISOString();
}

function extractDate(isoStr) {
  return isoStr.slice(0, 10);
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { accessToken, shop, startDate, endDate } = req.body || {};
  const store = shop || STORE;

  if (!accessToken) {
    return res.status(400).json({ error: "Missing Shopify access token. Connect Shopify in Settings first." });
  }
  if (!startDate || !endDate) {
    return res.status(400).json({ error: "Missing date range." });
  }

  const headers = {
    "X-Shopify-Access-Token": accessToken,
    "Content-Type": "application/json",
  };

  // Get store timezone
  let ianaTimezone = "Australia/Sydney";
  try {
    const shopRes = await fetch(`https://${store}/admin/api/${API_VERSION}/shop.json`, { headers });
    if (!shopRes.ok) {
      const text = await shopRes.text();
      return res.status(401).json({ error: `Token rejected by ${store} (${shopRes.status}). Disconnect and reconnect Shopify in Settings. Details: ${text.slice(0, 200)}` });
    }
    const shopData = await shopRes.json();
    if (shopData?.shop?.iana_timezone) ianaTimezone = shopData.shop.iana_timezone;
  } catch (e) {
    return res.status(500).json({ error: `Could not reach ${store}: ${e.message}` });
  }

  const startUTC = localDateToUTC(extractDate(startDate), "00:00:00", ianaTimezone);
  const endUTC   = localDateToUTC(extractDate(endDate),   "23:59:59", ianaTimezone);

  // ── Fetch all orders ───────────────────────────────────────────────────────
  const allOrders = [];
  for (const status of ["open", "closed"]) {
    let nextUrl =
      `https://${store}/admin/api/${API_VERSION}/orders.json` +
      `?status=${status}` +
      `&created_at_min=${encodeURIComponent(startUTC)}` +
      `&created_at_max=${encodeURIComponent(endUTC)}` +
      `&limit=250`;
    try {
      while (nextUrl) {
        const r = await fetch(nextUrl, { headers });
        if (r.status === 401) return res.status(401).json({ error: "Invalid or expired token — reconnect Shopify in Settings." });
        if (!r.ok) {
          const text = await r.text();
          return res.status(502).json({ error: `Shopify API error (${r.status}): ${text.slice(0, 200)}` });
        }
        const data = await r.json();
        allOrders.push(...(data.orders || []));
        const link = r.headers.get("link") || "";
        const next = link.match(/<([^>]+)>;\s*rel="next"/);
        nextUrl = next ? next[1] : null;
      }
    } catch (e) {
      return res.status(500).json({ error: `Fetch failed: ${e.message}` });
    }
  }

  // Deduplicate
  const seen = new Set();
  const orders = allOrders.filter(o => {
    if (seen.has(o.id)) return false;
    seen.add(o.id);
    return o.financial_status !== "voided";
  });

  // ── Aggregate revenue — exclude draft orders from revenue but keep in count ──
  // Shopify analytics counts draft-converted orders but excludes their pre-conversion
  // draft values from gross sales
  let grossSales = 0, totalDiscounts = 0, shippingIncome = 0;
  const codeMap = {};

  // refundSeenIds declared here (outside all blocks) so it can be reused below
  const refundSeenIds = new Set();
  let refundAmount = 0;

  for (const order of orders) {
    const isDraft = order.source_name === "shopify_draft_order";

    if (!isDraft) {
      grossSales     += parseFloat(order.subtotal_price || 0) + parseFloat(order.total_discounts || 0);
      totalDiscounts += parseFloat(order.total_discounts || 0);
      for (const sl of order.shipping_lines || []) {
        shippingIncome += parseFloat(sl.price || 0);
      }
    }

    // Refunds from all orders (draft or not)
    for (const refund of order.refunds || []) {
      if (refundSeenIds.has(refund.id)) continue;
      refundSeenIds.add(refund.id);
      for (const rli of refund.refund_line_items || []) {
        refundAmount += parseFloat(rli.subtotal || 0);
      }
    }

    for (const dc of order.discount_codes || []) {
      const code = (dc.code || "").toUpperCase();
      if (!code) continue;
      if (!codeMap[code]) codeMap[code] = { code, amount: 0, orders: 0 };
      codeMap[code].amount += parseFloat(dc.amount || 0);
      codeMap[code].orders += 1;
    }
  }

  // ── Fetch refunds on OLDER orders that were refunded during this week ──────
  for (const fs of ["refunded", "partially_refunded"]) {
    for (const status of ["open", "closed"]) {
      let url =
        `https://${store}/admin/api/${API_VERSION}/orders.json` +
        `?status=${status}` +
        `&financial_status=${fs}` +
        `&updated_at_min=${encodeURIComponent(startUTC)}` +
        `&updated_at_max=${encodeURIComponent(endUTC)}` +
        `&limit=250`;
      try {
        while (url) {
          const r = await fetch(url, { headers });
          if (!r.ok) break;
          const data = await r.json();
          for (const order of data.orders || []) {
            for (const refund of order.refunds || []) {
              if (refundSeenIds.has(refund.id)) continue;
              const refundTime = new Date(refund.created_at).getTime();
              if (refundTime < new Date(startUTC).getTime() || refundTime > new Date(endUTC).getTime()) continue;
              refundSeenIds.add(refund.id);
              for (const rli of refund.refund_line_items || []) {
                refundAmount += parseFloat(rli.subtotal || 0);
              }
            }
          }
          const link = r.headers.get("link") || "";
          const next = link.match(/<([^>]+)>;\s*rel="next"/);
          url = next ? next[1] : null;
        }
      } catch (e) { /* skip */ }
    }
  }

  const r2 = v => Math.round(v * 100) / 100;

  const draftCount  = orders.filter(o => o.source_name === "shopify_draft_order").length;
  const revenueCount = orders.filter(o => o.source_name !== "shopify_draft_order" && o.financial_status !== "voided").length;

  return res.status(200).json({
    revenue: {
      gross_sales: r2(grossSales),
      refunds: r2(refundAmount),
      discounts: r2(totalDiscounts),
      shipping_income: r2(shippingIncome),
    },
    orderCount: orders.length,
    discountCodes: Object.values(codeMap).sort((a, b) => b.amount - a.amount),
    _debug: { timezone: ianaTimezone, startUTC, endUTC, totalOrders: orders.length, draftOrders: draftCount, revenueOrders: revenueCount },
  });
}
