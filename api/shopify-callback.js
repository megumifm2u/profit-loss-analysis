// Vercel serverless function — handles Shopify OAuth callback
const STORE = "fm2uclothing.myshopify.com";

export default async function handler(req, res) {
  const { code, error } = req.query;

  if (error) {
    return res.redirect(302, `/?shopify_error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return res.status(400).send("Missing authorization code.");
  }

  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).send("SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET not set in Vercel environment variables.");
  }

  try {
    const tokenRes = await fetch(`https://${STORE}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      return res.status(401).send("Token exchange failed: " + text.slice(0, 300));
    }

    const data = await tokenRes.json();
    const accessToken = data.access_token;

    if (!accessToken) {
      return res.status(401).send("No access token in response: " + JSON.stringify(data));
    }

    res.redirect(302, `/?shopify_token=${encodeURIComponent(accessToken)}`);
  } catch (e) {
    res.status(500).send("OAuth callback error: " + e.message);
  }
}
