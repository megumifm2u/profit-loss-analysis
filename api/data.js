const SUPABASE_URL = "https://bpnlfbrkkwgrturkycpe.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": "Bearer " + SUPABASE_KEY,
    "Content-Type": "application/json",
  };

  // GET — load data
  if (req.method === "GET") {
    const r = await fetch(SUPABASE_URL + "/rest/v1/pl_data?id=eq.main&select=data", { headers });
    const rows = await r.json();
    const data = rows?.[0]?.data || {};
    return res.status(200).json(data);
  }

  // POST — save data
  if (req.method === "POST") {
    await fetch(SUPABASE_URL + "/rest/v1/pl_data?id=eq.main", {
      method: "PATCH",
      headers: { ...headers, "Prefer": "return=minimal" },
      body: JSON.stringify({ data: req.body, updated_at: new Date().toISOString() }),
    });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
