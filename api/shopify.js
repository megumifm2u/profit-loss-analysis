// Vercel serverless function — Shopify data pull
const STORE = "";
const API_VERSION = "2025-07";

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

  // Verify token
  try {
    const shopCheck = await fetch(`https://${store}/admin/api/${API_VERSION}/shop.json`, { headers });
    if (!shopCheck.ok) {
      const text = await shopCheck.text();
      return res.status(401).json({
        error: `Token rejected by ${store} (${shopCheck.status}). Disconnect and reconnect Shopify in Settings. Details: ${text.slice(0, 200)}`
      });
    }
  } catch (e) {
    return res.status(500).json({ error: `Could not reach ${store}: ${e.message}` });
  }

  // ── Fetch orders by processed_at (matches Shopify's own reporting) ─────────
  // Use open + closed status; exclude voided orders in aggregation
  const allOrders = [];
  for (const status of ["open", "closed"]) {
    let nextUrl =
      `https://${store}/admin/api/${API_VERSION}/orders.json` +
      `?status=${status}` +
      `&processed_at_min=${encodeURIComponent(startDate)}` +
      `&processed_at_max=${encodeURIComponent(endDate)}` +
      `&limit=250`;

    try {
      while (nextUrl) {
        const r = await fetch(nextUrl, { headers });
        if (r.status === 401) return res.status(401).json({ error: "Invalid or expired token — reconnect Shopify in Settings." });
        if (!r.ok) {
          const text = await r.text();
          return res.status(502).json({ error: `Shopify API error (${r.status}) for status=${status}: ${text.slice(0, 200)}` });
        }
        const data = await r.json();
        allOrders.push(...(data.orders || []));
        const link = r.headers.get("link") || "";
        const next = link.match(/<([^>]+)>;\s*rel="next"/);
        nextUrl = next ? next[1] : null;
      }
    } catch (e) {
      return res.status(500).json({ error: `Fetch failed for status=${status}: ${e.message}` });
    }
  }

  // Deduplicate
  const seen = new Set();
  const orders = allOrders.filter(o => {
    if (seen.has(o.id)) return false;
    seen.add(o.id);
    // Exclude voided orders (cancelled before payment — no revenue)
    return o.financial_status !== "voided";
  });

  // ── Fetch refunds processed during this period (covers refunds on older orders) ──
  // We pull refunds separately using the Refunds endpoint isn't available at store level,
  // so we collect refunds from the fetched orders plus extend the order window slightly.
  // For orders created before this week but refunded this week, we fetch by updated_at.
  const refundOrders = [];
  for (const status of ["open", "closed"]) {
    let nextUrl =
      `https://${store}/admin/api/${API_VERSION}/orders.json` +
      `?status=${status}` +
      `&updated_at_min=${encodeURIComponent(startDate)}` +
      `&updated_at_max=${encodeURIComponent(endDate)}` +
      `&financial_status=refunded,partially_refunded` +
      `&limit=250`;

    // Note: financial_status doesn't accept comma-separated values, so do two passes
    for (const fs of ["refunded", "partially_refunded"]) {
      let url =
        `https://${store}/admin/api/${API_VERSION}/orders.json` +
        `?status=${status}` +
        `&updated_at_min=${encodeURIComponent(startDate)}` +
        `&updated_at_max=${encodeURIComponent(endDate)}` +
        `&financial_status=${fs}` +
        `&limit=250`;
      try {
        while (url) {
          const r = await fetch(url, { headers });
          if (!r.ok) break;
          const data = await r.json();
          refundOrders.push(...(data.orders || []));
          const link = r.headers.get("link") || "";
          const next = link.match(/<([^>]+)>;\s*rel="next"/);
          url = next ? next[1] : null;
        }
      } catch (e) { /* skip refund fetch errors */ }
    }
  }

  // ── Aggregate ─────────────────────────────────────────────────────────────
  let grossSales = 0, totalDiscounts = 0, shippingIncome = 0, refundAmount = 0;
  const codeMap = {};

  for (const order of orders) {
    for (const li of order.line_items || []) {
      grossSales += parseFloat(li.price || 0) * (li.quantity || 0);
    }
    totalDiscounts += parseFloat(order.total_discounts || 0);
    for (const sl of order.shipping_lines || []) {
      shippingIncome += parseFloat(sl.price || 0);
    }
    for (const dc of order.discount_codes || []) {
      const code = (dc.code || "").toUpperCase();
      if (!code) continue;
      if (!codeMap[code]) codeMap[code] = { code, amount: 0, orders: 0 };
      codeMap[code].amount += parseFloat(dc.amount || 0);
      codeMap[code].orders += 1;
    }
  }

  // Collect refunds from both the main orders and the extended refund window
  const refundSeenIds = new Set();
  const allRefundSources = [...orders, ...refundOrders];
  for (const order of allRefundSources) {
    for (const refund of order.refunds || []) {
      if (refundSeenIds.has(refund.id)) continue;
      refundSeenIds.add(refund.id);
      for (const rli of refund.refund_line_items || []) {
        refundAmount += parseFloat(rli.subtotal || 0);
      }
    }
  }

  const r2 = v => Math.round(v * 100) / 100;

  return res.status(200).json({
    revenue: {
      gross_sales: r2(grossSales),
      refunds: r2(refundAmount),
      discounts: r2(totalDiscounts),
      shipping_income: r2(shippingIncome),
    },
    orderCount: orders.length,
    discountCodes: Object.values(codeMap).sort((a, b) => b.amount - a.amount),
  });
}
