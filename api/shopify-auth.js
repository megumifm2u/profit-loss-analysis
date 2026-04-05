// Vercel serverless function — initiates Shopify OAuth flow
const SCOPES = "read_orders,read_reports";
const REDIRECT_URI = "https://cleartrace-au.vercel.app/api/shopify-callback";

export default function handler(req, res) {
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  if (!clientId) {
    return res.status(500).send("SHOPIFY_CLIENT_ID environment variable not set.");
  }

  const shop = (req.query.shop || "").trim().toLowerCase();
  if (!shop) {
    return res.status(400).send("Missing shop parameter. Pass ?shop=yourstore.myshopify.com");
  }

  // Ensure it's a valid myshopify.com domain
  const store = shop.includes(".") ? shop : `${shop}.myshopify.com`;

  const url =
    `https://${store}/admin/oauth/authorize` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

  res.redirect(302, url);
}
