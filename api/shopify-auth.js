// Vercel serverless function — initiates Shopify OAuth flow
const STORE = "fm2uclothing.myshopify.com";
const SCOPES = "read_orders,read_all_orders";
const REDIRECT_URI = "https://cleartrace-au.vercel.app/api/shopify-callback";

module.exports = function handler(req, res) {
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  if (!clientId) {
    return res.status(500).send("SHOPIFY_CLIENT_ID environment variable not set. Add it in your Vercel project settings.");
  }

  const url =
    `https://${STORE}/admin/oauth/authorize` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

  res.redirect(302, url);
};
