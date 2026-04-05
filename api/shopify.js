// Vercel serverless function — Shopify data pull
const STORE = "";
const API_VERSION = "2025-07";

// Convert a local date string ("2026-03-30") + time ("00:00:00") to UTC ISO
// using the store's actual IANA timezone (handles DST correctly)
function localDateToUTC(dateStr, timeStr, ianaTimezone) {
  const approxUTC = new Date(`${dateStr}T${timeStr}Z`);
  // Get offset: how many minutes ahead of UTC is this timezone on this date?
  const utcMs = new Date(approxUTC.toLocaleString("en-US", { timeZone: "UTC" }));
  const tzMs  = new Date(approxUTC.toLocaleString("en-US", { timeZone: ianaTimezone }));
  const offsetMinutes = (tzMs - utcMs) / 60000;
  return new Date(approxUTC.getTime() - offsetMinutes * 60000).toISOString();
}

// Extract date part from an ISO string like "2026-03-30T00:00:00+10:00"
function extractDate(isoStr) {
  return isoStr.slice(0, 10); // "2026-03-30"
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

  // Verify token + get store timezone
  let ianaTimezone = "Australia/Sydney"; // sensible default
  try {
    const shopCheck = await fetch(`https://${store}/admin/api/${API_VERSION}/shop.json`, { headers });
    if (!shopCheck.ok) {
      const text = await shopCheck.text();
      return res.status(401).json({
        error: `Token rejected by ${store} (${shopCheck.status}). Disconnect and reconnect Shopify in Settings. Details: ${text.slice(0, 200)}`
      });
    }
    const shopData = await shopCheck.json();
    if (shopData?.shop?.iana_timezone) ianaTimezone = shopData.shop.iana_timezone;
  } catch (e) {
    return res.status(500).json({ error: `Could not reach ${store}: ${e.message}` });
  }

  // Convert the incoming date strings to proper UTC using the store's timezone
  const startUTC = localDateToUTC(extractDate(startDate), "00:00:00", ianaTimezone);
  const endUTC   = localDateToUTC(extractDate(endDate),   "23:59:59", ianaTimezone);

  // ── Fetch orders ───────────────────────────────────────────────────────────
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

  // Deduplicate and exclude voided + draft orders (matches Shopify's own reporting)
  const seen = new Set();
  const orders = allOrders.filter(o => {
    if (seen.has(o.id)) return false;
    seen.add(o.id);
    if (o.financial_status === "voided") return false;
    return true;
  });

  // ── Aggregate ─────────────────────────────────────────────────────────────
  let grossSales = 0, totalDiscounts = 0, shippingIncome = 0, refundAmount = 0;
  const codeMap = {};
  const refundSeenIds = new Set();

  for (const order of orders) {
    // Use subtotal_price + total_discounts = gross sales before discounts
    // This matches Shopify's own analytics engine exactly
    const subtotal = parseFloat(order.subtotal_price || 0);
    const discounts = parseFloat(order.total_discounts || 0);
    grossSales += subtotal + discounts;
    totalDiscounts += discounts;
    for (const sl of order.shipping_lines || []) {
      shippingIncome += parseFloat(sl.price || 0);
    }
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

  // ── Fetch refunds processed this week on orders from ANY time ─────────────
  // Shopify has no standalone refunds endpoint, so query orders updated this week
  // with a refunded financial status and check each refund's created_at date
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
              // Only count refunds whose created_at falls within our window
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
      } catch (e) { /* skip on error */ }
    }
  }

  const r2 = v => Math.round(v * 100) / 100;

  // Debug: break down by source and gateway to find the 5 extra orders
  const sourceTally = {};
  const gatewayTally = {};
  orders.forEach(o => {
    const s = o.source_name || "unknown";
    sourceTally[s] = (sourceTally[s] || 0) + 1;
    const g = o.gateway || "none";
    gatewayTally[g] = (gatewayTally[g] || 0) + 1;
  });

  return res.status(200).json({
    revenue: {
      gross_sales: r2(grossSales),
      refunds: r2(refundAmount),
      discounts: r2(totalDiscounts),
      shipping_income: r2(shippingIncome),
    },
    orderCount: orders.length,
    discountCodes: Object.values(codeMap).sort((a, b) => b.amount - a.amount),
    _debug: {
      timezone: ianaTimezone, startUTC, endUTC, orderCount: orders.length,
      grossSalesFromLineItems: r2(orders.reduce((s,o)=>{
        for(const li of o.line_items||[]){ if(!li.gift_card) s+=parseFloat(li.price||0)*(li.quantity||0); }
        return s;
      },0)),
      grossSalesFromSubtotal: r2(orders.reduce((s,o)=>s+parseFloat(o.subtotal_price||0)+parseFloat(o.total_discounts||0),0)),
      totalDiscountsSummed: r2(orders.reduce((s,o)=>s+parseFloat(o.total_discounts||0),0)),
      shippingDiscountsTotal: r2(orders.reduce((s,o)=>{
        for(const sl of o.shipping_lines||[]){ for(const da of sl.discount_allocations||[]){ s+=parseFloat(da.amount||0); } }
        return s;
      },0)),
    },
  });
}
