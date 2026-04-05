// Vercel serverless function — Shopify data pull
const STORE = "fm2uclothing.myshopify.com";
const API_VERSION = "2024-04";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { clientId, clientSecret, accessToken: directToken, startDate, endDate } = req.body || {};

  if (!clientId && !clientSecret && !directToken) {
    return res.status(400).json({ error: "Missing Shopify credentials. Add them in Settings → Shopify." });
  }
  if (!startDate || !endDate) {
    return res.status(400).json({ error: "Missing date range." });
  }

  // ── Get access token ──────────────────────────────────────────────────────
  let accessToken = directToken;

  if (!accessToken) {
    try {
      const tokenRes = await fetch(`https://${STORE}/admin/oauth/access_token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });

      if (!tokenRes.ok) {
        const text = await tokenRes.text();
        return res.status(401).json({ error: "Shopify auth failed — check your Client ID and Secret. " + text.slice(0, 200) });
      }

      const tokenData = await tokenRes.json();
      accessToken = tokenData.access_token;

      if (!accessToken) {
        return res.status(401).json({ error: "No access token returned — check your credentials." });
      }
    } catch (e) {
      return res.status(500).json({ error: "Token request failed: " + e.message });
    }
  }

  // ── Fetch all orders (paginated) ──────────────────────────────────────────
  const orders = [];
  const fields = "id,line_items,total_discounts,shipping_lines,refunds,discount_codes,financial_status";
  let nextUrl = `https://${STORE}/admin/api/${API_VERSION}/orders.json?status=any&created_at_min=${encodeURIComponent(startDate)}&created_at_max=${encodeURIComponent(endDate)}&limit=250&fields=${fields}`;

  try {
    while (nextUrl) {
      const r = await fetch(nextUrl, {
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
      });

      if (r.status === 401) {
        return res.status(401).json({ error: "Invalid credentials — rejected by Shopify." });
      }
      if (!r.ok) {
        const text = await r.text();
        return res.status(502).json({ error: "Shopify API error (" + r.status + "): " + text.slice(0, 200) });
      }

      const data = await r.json();
      orders.push(...(data.orders || []));

      const link = r.headers.get("link") || "";
      const next = link.match(/<([^>]+)>;\s*rel="next"/);
      nextUrl = next ? next[1] : null;
    }
  } catch (e) {
    return res.status(500).json({ error: "Fetch failed: " + e.message });
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
    for (const refund of order.refunds || []) {
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
