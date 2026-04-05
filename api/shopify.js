// Vercel serverless function — Shopify data pull
// Uses GraphQL Analytics API for revenue (matches Shopify dashboard exactly)
// Uses REST Orders API for discount code breakdown
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
  const startLocal = extractDate(startDate);
  const endLocal   = extractDate(endDate);

  // ── GraphQL Analytics — exact same figures as Shopify dashboard ────────────
  const analyticsQuery = `
    {
      shopifyqlQuery(query: "FROM sales SHOW gross_sales, returns, discounts, shipping, orders SINCE ${startLocal} UNTIL ${endLocal}") {
        parseErrors { code message }
        tableData {
          rowData
          columns { name dataType }
        }
      }
    }
  `;

  let grossSales = 0, refundAmount = 0, totalDiscounts = 0, shippingIncome = 0, orderCount = 0;
  let usedGraphQL = false;
  let gqlDebug = null;

  try {
    const gqlRes = await fetch(`https://${store}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query: analyticsQuery }),
    });

    const gqlData = await gqlRes.json();
    gqlDebug = JSON.stringify(gqlData).slice(0, 500);

    if (gqlRes.ok) {
      const tableData = gqlData?.data?.shopifyqlQuery?.tableData;
      const parseErrors = gqlData?.data?.shopifyqlQuery?.parseErrors;

      if (!parseErrors?.length && tableData?.rowData?.length) {
        const cols = tableData.columns.map(c => c.name);
        for (const row of tableData.rowData) {
          const get = name => {
            const idx = cols.indexOf(name);
            return idx >= 0 ? parseFloat(row[idx] || 0) : 0;
          };
          grossSales    += get("gross_sales");
          refundAmount  += Math.abs(get("returns"));
          totalDiscounts+= Math.abs(get("discounts"));
          shippingIncome+= get("shipping");
          orderCount    += get("orders");
        }
        usedGraphQL = true;
      }
    }
  } catch (e) { gqlDebug = e.message; }

  // ── Fallback: REST Orders API if GraphQL analytics not available ───────────
  if (!usedGraphQL) {
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
          if (!r.ok) break;
          const data = await r.json();
          allOrders.push(...(data.orders || []));
          const link = r.headers.get("link") || "";
          const next = link.match(/<([^>]+)>;\s*rel="next"/);
          nextUrl = next ? next[1] : null;
        }
      } catch (e) { break; }
    }
    const seen = new Set();
    const orders = allOrders.filter(o => { if (seen.has(o.id)) return false; seen.add(o.id); return o.financial_status !== "voided"; });
    orderCount = orders.length;
    const refundSeenIds = new Set();
    for (const order of orders) {
      grossSales     += parseFloat(order.subtotal_price || 0) + parseFloat(order.total_discounts || 0);
      totalDiscounts += parseFloat(order.total_discounts || 0);
      for (const sl of order.shipping_lines || []) shippingIncome += parseFloat(sl.price || 0);
      for (const refund of order.refunds || []) {
        if (refundSeenIds.has(refund.id)) continue;
        refundSeenIds.add(refund.id);
        for (const rli of refund.refund_line_items || []) refundAmount += parseFloat(rli.subtotal || 0);
      }
    }
  }

  // ── REST Orders — discount codes (GraphQL analytics doesn't break these down) ──
  const codeMap = {};
  const allOrders2 = [];
  for (const status of ["open", "closed"]) {
    let nextUrl =
      `https://${store}/admin/api/${API_VERSION}/orders.json` +
      `?status=${status}` +
      `&created_at_min=${encodeURIComponent(startUTC)}` +
      `&created_at_max=${encodeURIComponent(endUTC)}` +
      `&fields=id,discount_codes,financial_status` +
      `&limit=250`;
    try {
      while (nextUrl) {
        const r = await fetch(nextUrl, { headers });
        if (!r.ok) break;
        const data = await r.json();
        allOrders2.push(...(data.orders || []));
        const link = r.headers.get("link") || "";
        const next = link.match(/<([^>]+)>;\s*rel="next"/);
        nextUrl = next ? next[1] : null;
      }
    } catch (e) { break; }
  }
  const seen2 = new Set();
  const codeOrders = allOrders2.filter(o => { if (seen2.has(o.id)) return false; seen2.add(o.id); return o.financial_status !== "voided"; });
  for (const order of codeOrders) {
    for (const dc of order.discount_codes || []) {
      const code = (dc.code || "").toUpperCase();
      if (!code) continue;
      if (!codeMap[code]) codeMap[code] = { code, amount: 0, orders: 0 };
      codeMap[code].amount += parseFloat(dc.amount || 0);
      codeMap[code].orders += 1;
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
    orderCount: Math.round(orderCount),
    discountCodes: Object.values(codeMap).sort((a, b) => b.amount - a.amount),
    _debug: { usedGraphQL, timezone: ianaTimezone, startLocal, endLocal, gqlDebug },
  });
}
