// Vercel serverless function — handles Shopify OAuth callback
const API_VERSION = "2025-07";

export default async function handler(req, res) {
  const { code, error, shop } = req.query;

  if (error) {
    return res.redirect(302, `/?shopify_error=${encodeURIComponent(error)}`);
  }

  if (!code || !shop) {
    return res.status(400).send(`Missing params. code=${code} shop=${shop}`);
  }

  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).send("SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET not set in Vercel environment variables.");
  }

  let accessToken;
  try {
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });

    const raw = await tokenRes.text();

    if (!tokenRes.ok) {
      return res.status(401).send(`Token exchange failed (${tokenRes.status}): ${raw.slice(0, 500)}`);
    }

    let data;
    try { data = JSON.parse(raw); } catch(e) { return res.status(500).send(`Non-JSON token response: ${raw.slice(0, 500)}`); }

    accessToken = data.access_token;
    if (!accessToken) {
      return res.status(401).send(`No access_token in response. Keys returned: ${Object.keys(data).join(", ")}. Full: ${raw.slice(0, 500)}`);
    }
  } catch (e) {
    return res.status(500).send("Token request error: " + e.message);
  }

  // Verify token works for this store
  try {
    const check = await fetch(`https://${shop}/admin/api/${API_VERSION}/shop.json`, {
      headers: { "X-Shopify-Access-Token": accessToken },
    });
    if (!check.ok) {
      const text = await check.text();
      return res.status(401).send(`Token obtained but rejected by ${shop} (${check.status}): ${text.slice(0, 300)}\n\nToken starts with: ${accessToken.slice(0, 20)}...`);
    }
  } catch (e) {
    return res.status(500).send("Token verification error: " + e.message);
  }

  // Token verified — redirect back to the app
  res.redirect(302, `/?shopify_token=${encodeURIComponent(accessToken)}&shopify_shop=${encodeURIComponent(shop)}`);
}
