import { useState, useEffect, useRef } from "react";

// ─── THEME ────────────────────────────────────────────────────────────────────
const A = "#d8b9ff", BG = "#0a0a0e", S = "#12111a", S2 = "#1a1826", BR = "#2a2540";
const TX = "#e0e0e0", MU = "#777", RD = "#ff6b6b", GR = "#6bffb8", YL = "#ffd97d";
const ff = "Times New Roman";
const JSONBIN_ID = import.meta.env.VITE_JSONBIN_ID;
const JSONBIN_KEY = import.meta.env.VITE_JSONBIN_KEY;
const PASSWORD = import.meta.env.VITE_PASSWORD;

// ─── DATA STRUCTURE ───────────────────────────────────────────────────────────
const WAGE_DEPTS = [
  { key: "ops_retail", label: "Operations — Retail" },
  { key: "ops_logistics", label: "Operations — Logistics" },
  { key: "ops_cs", label: "Operations — Customer Service" },
  { key: "marketing", label: "Marketing Department" },
  { key: "hr_management", label: "HR & General Management" },
];

const FIXED_OPEX_KEYS = [
  ["shopify", "Shopify"],
  ["shopify_apps", "Shopify Apps"],
  ["general_apps", "General Apps"],
  ["accounting_xero", "Accounting (Xero)"],
  ["rostering_deputy", "Rostering (Deputy)"],
  ["customer_service_repliai", "Customer Service (Repliai)"],
  ["rent_utilities", "Rent + Utilities"],
  ["internet_phone", "Internet + Telephone"],
  ["insurance", "Insurance"],
  ["bank_accounting", "Bank / Accounting"],
  ["legal", "Legal"],
  ["google_ms_admin", "Google, Microsoft Admin"],
];

function emptyWeek() {
  return {
    label: "", dateRange: "", notes: "", shopifyRaw: "",
    revenue: { gross_sales:"", refunds:"", discounts:"", shipping_income:"", paypal_fees:"" },
    cogs: { manufacturing_product:"", manufacturing_shipping:"", satchel_count:"", satchel_cost_each:"0.85", other_packaging:"" },
    freight: { auspost:"", fedex:"", customs_duties:"" },
    collabs: { shipping_cost:"", product_cogs:"", uppromote_commission:"", paid_collab_fees:"" },
    wages: { ops_retail:"", ops_logistics:"", ops_cs:"", marketing:"", hr_management:"" },
    opex: { office_costs:"", google_ms_admin:"", meta_tiktok_ads:"", model_wages:"", shopify:"", shopify_apps:"", general_apps:"", accounting_xero:"", rostering_deputy:"", customer_service_repliai:"", rent_utilities:"", internet_phone:"", insurance:"", bank_accounting:"", legal:"" },
  };
}

function emptyFixed() {
  const f = {};
  FIXED_OPEX_KEYS.forEach(([k]) => { f[k] = ""; });
  return f;
}

const n = v => parseFloat(v) || 0;

function calcWeek(week, fixed = {}) {
  const rev = week.revenue;
  const gross = n(rev.gross_sales), refunds = n(rev.refunds), discounts = n(rev.discounts);
  const shippingIncome = n(rev.shipping_income), paypalFees = n(rev.paypal_fees);
  const netRevenue = gross - refunds - discounts + shippingIncome - paypalFees;

  const mfgProduct = n(week.cogs.manufacturing_product);
  const mfgShipping = n(week.cogs.manufacturing_shipping);
  const satchelCost = n(week.cogs.satchel_count) * n(week.cogs.satchel_cost_each);
  const otherPkg = n(week.cogs.other_packaging);
  const totalCOGS = mfgProduct + mfgShipping + satchelCost + otherPkg;
  const grossProfit = netRevenue - totalCOGS;
  const grossMargin = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;

  const auspost = n(week.freight.auspost), fedex = n(week.freight.fedex), customs = n(week.freight.customs_duties);
  const totalFreight = auspost + fedex + customs;

  const collabShip = n(week.collabs.shipping_cost), collabProd = n(week.collabs.product_cogs);
  const collabComm = n(week.collabs.uppromote_commission), collabPaid = n(week.collabs.paid_collab_fees);
  const totalCollabs = collabShip + collabProd + collabComm + collabPaid;

  const totalWages = WAGE_DEPTS.reduce((s, d) => s + n(week.wages[d.key]), 0);
  const getOpex = k => n(week.opex[k]) !== 0 ? n(week.opex[k]) : n(fixed[k]);
  const totalOPEX = Object.keys(week.opex).reduce((s, k) => s + getOpex(k), 0);

  const totalExpenses = totalCOGS + totalFreight + totalCollabs + totalWages + totalOPEX;
  const netProfit = netRevenue - totalExpenses;
  const netMargin = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;

  return { netRevenue, totalCOGS, grossProfit, grossMargin, totalFreight, totalCollabs, totalWages, totalOPEX, totalExpenses, netProfit, netMargin, auspost, fedex, customs, satchelCost, mfgProduct, mfgShipping, otherPkg, collabShip, collabProd, collabComm, collabPaid, paypalFees, refunds, discounts };
}

function autoWeek(offset = 0) {
  const today = new Date();
  const day = today.getDay();
  const mon = new Date(today);
  mon.setDate(today.getDate() - (day === 0 ? 6 : day - 1) - offset * 7);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const fmt = d => `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getFullYear()).slice(-2)}`;
  const wn = Math.ceil((mon.getDate() + new Date(mon.getFullYear(), mon.getMonth(), 1).getDay()) / 7);
  return { range: `${fmt(mon)} – ${fmt(sun)}`, label: `Week ${wn}, ${mon.toLocaleString("default",{month:"long"})} ${mon.getFullYear()}` };
}

// ─── STORAGE ─────────────────────────────────────────────────────────────────
async function loadAll() {
  if (!JSONBIN_ID || !JSONBIN_KEY) return { reports: [], fixed: emptyFixed() };
  try {
    const r = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}/latest`, { headers: { "X-Master-Key": JSONBIN_KEY } });
    const d = await r.json();
    return { reports: d.record?.reports || [], fixed: d.record?.fixed || emptyFixed() };
  } catch { return { reports: [], fixed: emptyFixed() }; }
}

async function saveAll(reports, fixed) {
  if (!JSONBIN_ID || !JSONBIN_KEY) return;
  try {
    await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}`, {
      method: "PUT", headers: { "Content-Type": "application/json", "X-Master-Key": JSONBIN_KEY },
      body: JSON.stringify({ reports, fixed }),
    });
  } catch {}
}

// ─── SHOPIFY PARSER ──────────────────────────────────────────────────────────
function parseShopify(raw) {
  if (!raw?.trim()) return {};
  const result = { gross_sales: 0, refunds: 0, discounts: 0, shipping_income: 0 };
  const lines = raw.split("\n");
  lines.forEach(line => {
    const low = line.toLowerCase();
    const nums = line.match(/[\d,]+\.?\d*/g);
    if (!nums) return;
    const val = parseFloat(nums[nums.length - 1].replace(/,/g, "")) || 0;
    if (low.includes("gross sale") || low.includes("total sale")) result.gross_sales = val;
    else if (low.includes("refund") || low.includes("return")) result.refunds = val;
    else if (low.includes("discount")) result.discounts = val;
    else if (low.includes("shipping") && !low.includes("free") && !low.includes("carrier")) result.shipping_income = val;
  });
  return Object.fromEntries(Object.entries(result).map(([k, v]) => [k, v || ""]));
}

// ─── CLAUDE DATA EXPORT ───────────────────────────────────────────────────────
function generateClaudeData(weeks, fixed, monthLabel) {
  const fmt = v => `$${Math.abs(v).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const calcs = weeks.map(w => calcWeek(w, fixed));
  const tot = f => calcs.reduce((s, c) => s + c[f], 0);
  const tRev = tot("netRevenue"), tNet = tot("netProfit"), tExp = tot("totalExpenses");

  let out = `=== P&L WEEKLY ANALYSIS — ${monthLabel || "Monthly Report"} ===\nGenerated: ${new Date().toLocaleDateString("en-AU")}\n\n`;
  out += `--- MONTHLY TOTALS ---\nNet Revenue: ${fmt(tRev)}\nTotal COGS: ${fmt(-tot("totalCOGS"))}\nGross Profit: ${fmt(tot("grossProfit"))} (${tRev>0?((tot("grossProfit")/tRev)*100).toFixed(1):0}% margin)\nTotal Freight: ${fmt(-tot("totalFreight"))}\nTotal Collabs: ${fmt(-tot("totalCollabs"))}\nTotal Wages: ${fmt(-tot("totalWages"))}\nTotal OPEX: ${fmt(-tot("totalOPEX"))}\nTotal Expenses: ${fmt(-tExp)}\nNET PROFIT: ${fmt(tNet)} (${tRev>0?((tNet/tRev)*100).toFixed(1):0}% margin)\n\n`;

  weeks.forEach((w, i) => {
    const c = calcs[i];
    out += `--- ${w.label || `Week ${i+1}`} | ${w.dateRange} ---\n`;
    out += `  Gross Sales: ${fmt(n(w.revenue.gross_sales))} | Refunds: ${fmt(-n(w.revenue.refunds))} | Discounts: ${fmt(-n(w.revenue.discounts))} | Shipping Income: ${fmt(n(w.revenue.shipping_income))} | PayPal Fees: ${fmt(-n(w.revenue.paypal_fees))}\n`;
    out += `  NET REVENUE: ${fmt(c.netRevenue)}\n`;
    out += `  COGS: Manufacturing Product ${fmt(n(w.cogs.manufacturing_product))} | Inbound Freight ${fmt(n(w.cogs.manufacturing_shipping))} | Satchels ${n(w.cogs.satchel_count)} orders @ $${w.cogs.satchel_cost_each} = ${fmt(c.satchelCost)}\n`;
    out += `  TOTAL COGS: ${fmt(-c.totalCOGS)} | GROSS PROFIT: ${fmt(c.grossProfit)} (${c.grossMargin.toFixed(1)}%)\n`;
    out += `  Freight: AusPost ${fmt(n(w.freight.auspost))} | FedEx ${fmt(n(w.freight.fedex))} | Customs ${fmt(n(w.freight.customs_duties))} | TOTAL: ${fmt(-c.totalFreight)}\n`;
    out += `  Collabs: Ship ${fmt(n(w.collabs.shipping_cost))} | Product COGS ${fmt(n(w.collabs.product_cogs))} | Uppromote Commission ${fmt(n(w.collabs.uppromote_commission))} | Paid Fees ${fmt(n(w.collabs.paid_collab_fees))} | TOTAL: ${fmt(-c.totalCollabs)}\n`;
    out += `  Wages: ${WAGE_DEPTS.map(d => `${d.label.split("—")[1]?.trim() || d.label} ${fmt(n(w.wages[d.key]))}`).join(" | ")} | TOTAL: ${fmt(-c.totalWages)}\n`;
    out += `  OPEX: ${Object.entries(w.opex).filter(([k,v]) => n(v)||n(fixed[k])).map(([k,v]) => `${k.replace(/_/g," ")} ${fmt(n(v)||n(fixed[k]))}`).join(" | ")} | TOTAL: ${fmt(-c.totalOPEX)}\n`;
    out += `  NET PROFIT: ${fmt(c.netProfit)} (${c.netMargin.toFixed(1)}%)\n`;
    if (w.notes) out += `  Notes: ${w.notes}\n`;
    out += "\n";
  });

  out += `=== END DATA ===\n\nPlease analyse this P&L and provide a comprehensive dot-point business report:\n\n1. PROFITABILITY VERDICT — Are we profitable? How urgent is the situation? Overall assessment.\n2. WEEK-ON-WEEK TRENDS — What is improving, deteriorating, or flat? What does it signal operationally?\n3. MONEY BLEED IDENTIFICATION — List each overspend category with exact dollar amounts and % of revenue. Rank by impact.\n4. COGS EFFICIENCY — Is gross margin healthy? Are manufacturing or packaging costs appropriate for this revenue level?\n5. FREIGHT ANALYSIS — AusPost vs FedEx split. Are we over-shipping? Is international freight eroding margin?\n6. COLLAB ROI — Are influencer/collaboration costs justified given revenue output? Flag if collab costs are disproportionate.\n7. WAGES EFFICIENCY — Wages as % of revenue per department. Which departments are overstaffed relative to output?\n8. OPEX LINE-BY-LINE — Which recurring costs are too high? What should be renegotiated, cancelled, or reduced?\n9. REVENUE QUALITY — Refund rate, discount depth, PayPal fee drag as % of gross. What's eating into top-line?\n10. TOP 5 IMMEDIATE ACTIONS — Specific, prioritised steps to cut costs or improve revenue this week/month.\n11. MARGIN STRATEGY — What pricing, product mix, or channel changes would meaningfully improve margins?\n12. PATH TO PROFITABILITY — Exactly what needs to change in dollar terms to be profitable next month.\n\nBe commercially direct. Use exact figures from the data. Flag anomalies. Prioritise recommendations by financial impact.`;
  return out;
}

// ─── UI ATOMS ─────────────────────────────────────────────────────────────────
const baseInp = { width:"100%", boxSizing:"border-box", background:S, border:`1px solid ${BR}`, color:TX, padding:"8px 10px", fontFamily:ff, fontSize:14, outline:"none", borderRadius:4 };

function CI({ value, onChange, placeholder="0.00", tint }) {
  return (
    <div style={{ position:"relative" }}>
      <span style={{ position:"absolute", left:9, top:"50%", transform:"translateY(-50%)", color:MU, fontFamily:ff, fontSize:13, pointerEvents:"none" }}>$</span>
      <input type="number" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        style={{ ...baseInp, paddingLeft:22, background: tint||S }}
        onFocus={e=>e.target.style.borderColor=A} onBlur={e=>e.target.style.borderColor=BR} />
    </div>
  );
}

function Lbl({ c, children }) { return <div style={{ color:c||MU, fontFamily:ff, fontSize:11, letterSpacing:0.8, textTransform:"uppercase", marginBottom:5 }}>{children}</div>; }
function SH({ children }) { return <div style={{ fontFamily:ff, fontSize:10, letterSpacing:2.5, textTransform:"uppercase", color:A, borderBottom:`1px solid ${BR}`, paddingBottom:7, marginBottom:14, marginTop:26 }}>{children}</div>; }

function Badge({ label, value, color, small }) {
  const col = color || (typeof value==="number"&&value<0?RD:GR);
  return (
    <div style={{ background:S2, border:`1px solid ${BR}`, borderRadius:5, padding:small?"9px 13px":"13px 17px", flex:1, minWidth:110 }}>
      <Lbl c={MU}>{label}</Lbl>
      <div style={{ color:col, fontFamily:ff, fontSize:small?14:18, fontWeight:"bold" }}>
        {typeof value==="number"?`${value<0?"−":""}$${Math.abs(value).toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:2})}`:value}
      </div>
    </div>
  );
}

function Pct({ label, value, small }) {
  return (
    <div style={{ background:S2, border:`1px solid ${BR}`, borderRadius:5, padding:small?"9px 13px":"13px 17px", flex:1, minWidth:90 }}>
      <Lbl c={MU}>{label}</Lbl>
      <div style={{ color:value>=0?GR:RD, fontFamily:ff, fontSize:small?14:18, fontWeight:"bold" }}>{value.toFixed(1)}%</div>
    </div>
  );
}

function Row({ children, gap=10 }) { return <div style={{ display:"flex", gap, flexWrap:"wrap", marginTop:12 }}>{children}</div>; }
function Grid({ children, cols=2 }) { return <div style={{ display:"grid", gridTemplateColumns:`repeat(${cols},1fr)`, gap:10 }}>{children}</div>; }
function Fld({ label, children }) { return <div><Lbl>{label}</Lbl>{children}</div>; }

const fmtD = v => `${v<0?"−":""}$${Math.abs(v).toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const fmtS = v => `${v<0?"−":""}$${Math.abs(v).toLocaleString("en-AU",{minimumFractionDigits:0,maximumFractionDigits:0})}`;

// ─── SHOPIFY IMPORT PANEL ─────────────────────────────────────────────────────
function ShopifyImport({ week, onChange }) {
  const [raw, setRaw] = useState(week.shopifyRaw||"");
  const [msg, setMsg] = useState("");
  function apply() {
    const parsed = parseShopify(raw);
    const filled = Object.values(parsed).filter(v=>v!=="").length;
    if (!filled) { setMsg("No values detected — check format"); return; }
    onChange({ ...week, shopifyRaw:raw, revenue:{ ...week.revenue, ...parsed } });
    setMsg(`Auto-filled ${filled} revenue fields`);
    setTimeout(()=>setMsg(""),3000);
  }
  return (
    <div style={{ background:S2, border:`1px solid ${BR}`, borderRadius:6, padding:"16px 18px", marginBottom:20 }}>
      <div style={{ fontFamily:ff, fontSize:10, letterSpacing:2, textTransform:"uppercase", color:A, marginBottom:8 }}>Shopify Data Import</div>
      <div style={{ fontFamily:ff, fontSize:12, color:MU, marginBottom:10 }}>Paste your Shopify exported sales report. Auto-fills Gross Sales, Refunds, Discounts, Shipping Income.</div>
      <textarea value={raw} onChange={e=>setRaw(e.target.value)} placeholder="Paste Shopify CSV or tab-separated export here..." rows={5}
        style={{ width:"100%", boxSizing:"border-box", background:S, border:`1px solid ${BR}`, color:TX, padding:"10px 12px", fontFamily:"monospace", fontSize:12, outline:"none", borderRadius:4, resize:"vertical" }} />
      <div style={{ display:"flex", alignItems:"center", gap:12, marginTop:10 }}>
        <button onClick={apply} style={{ padding:"8px 18px", background:A, border:"none", color:BG, fontFamily:ff, fontSize:12, cursor:"pointer", borderRadius:4, fontWeight:"bold", letterSpacing:1 }}>AUTOFILL FROM DATA</button>
        {msg && <span style={{ fontFamily:ff, fontSize:12, color:msg.includes("No")?RD:GR }}>{msg}</span>}
      </div>
    </div>
  );
}

// ─── WEEK FORM ────────────────────────────────────────────────────────────────
function WeekForm({ week, onChange, fixed }) {
  const up = section => (k, v) => onChange({ ...week, [section]:{ ...week[section], [k]:v } });
  const upRev=up("revenue"), upCogs=up("cogs"), upFrt=up("freight"), upCol=up("collabs"), upWage=up("wages"), upOpex=up("opex");
  const c = calcWeek(week, fixed);
  const satchelTotal = n(week.cogs.satchel_count)*n(week.cogs.satchel_cost_each);

  return (
    <div>
      <ShopifyImport week={week} onChange={onChange} />

      <SH>Revenue & Deductions</SH>
      <Grid>
        <Fld label="Gross Sales"><CI value={week.revenue.gross_sales} onChange={v=>upRev("gross_sales",v)} /></Fld>
        <Fld label="Refunds / Returns"><CI value={week.revenue.refunds} onChange={v=>upRev("refunds",v)} /></Fld>
        <Fld label="Discounts"><CI value={week.revenue.discounts} onChange={v=>upRev("discounts",v)} /></Fld>
        <Fld label="Shipping Income"><CI value={week.revenue.shipping_income} onChange={v=>upRev("shipping_income",v)} /></Fld>
        <Fld label="PayPal Fees"><CI value={week.revenue.paypal_fees} onChange={v=>upRev("paypal_fees",v)} /></Fld>
      </Grid>
      <Row><Badge small label="Net Revenue" value={c.netRevenue} color={A} /></Row>

      <SH>COGS — Cost of Goods</SH>
      <Grid>
        <Fld label="Manufacturing — Product COGS"><CI value={week.cogs.manufacturing_product} onChange={v=>upCogs("manufacturing_product",v)} /></Fld>
        <Fld label="Manufacturing Shipping (Inbound Freight)"><CI value={week.cogs.manufacturing_shipping} onChange={v=>upCogs("manufacturing_shipping",v)} /></Fld>
      </Grid>
      <div style={{ marginTop:14, background:S2, border:`1px solid ${BR}`, borderRadius:5, padding:"12px 14px" }}>
        <div style={{ fontFamily:ff, fontSize:10, letterSpacing:1.5, color:A, textTransform:"uppercase", marginBottom:10 }}>Satchel Packaging — Auto-calculated by Order Count</div>
        <Grid>
          <Fld label="Number of Orders (Satchels)">
            <input type="number" value={week.cogs.satchel_count} onChange={e=>upCogs("satchel_count",e.target.value)} placeholder="0"
              style={baseInp} onFocus={e=>e.target.style.borderColor=A} onBlur={e=>e.target.style.borderColor=BR} />
          </Fld>
          <Fld label="Cost Per Satchel ($)"><CI value={week.cogs.satchel_cost_each} onChange={v=>upCogs("satchel_cost_each",v)} /></Fld>
        </Grid>
        <div style={{ fontFamily:ff, fontSize:13, color:YL, marginTop:8 }}>Satchel Total: {fmtD(satchelTotal)}</div>
      </div>
      <div style={{ marginTop:10 }}><Fld label="Other Packaging"><CI value={week.cogs.other_packaging} onChange={v=>upCogs("other_packaging",v)} /></Fld></div>
      <Row>
        <Badge small label="Total COGS" value={-c.totalCOGS} color={RD} />
        <Badge small label="Gross Profit" value={c.grossProfit} />
        <Pct small label="Gross Margin" value={c.grossMargin} />
      </Row>

      <SH>Customer Shipping / Freight</SH>
      <Grid>
        <Fld label="AusPost"><CI value={week.freight.auspost} onChange={v=>upFrt("auspost",v)} /></Fld>
        <Fld label="FedEx / International"><CI value={week.freight.fedex} onChange={v=>upFrt("fedex",v)} /></Fld>
        <Fld label="Customs & Duties"><CI value={week.freight.customs_duties} onChange={v=>upFrt("customs_duties",v)} /></Fld>
      </Grid>
      <Row><Badge small label="Total Freight" value={-c.totalFreight} color={RD} /></Row>

      <SH>Collaborations / Influencers</SH>
      <div style={{ fontFamily:ff, fontSize:11, color:MU, marginBottom:12 }}>Full cost breakdown per collaboration — all component costs included.</div>
      <Grid>
        <Fld label="Shipping Cost (sending product to collab)"><CI value={week.collabs.shipping_cost} onChange={v=>upCol("shipping_cost",v)} /></Fld>
        <Fld label="Product COGS (manufacturer cost of goods sent)"><CI value={week.collabs.product_cogs} onChange={v=>upCol("product_cogs",v)} /></Fld>
        <Fld label="Uppromote Commission (affiliate payout)"><CI value={week.collabs.uppromote_commission} onChange={v=>upCol("uppromote_commission",v)} /></Fld>
        <Fld label="Paid Collaboration Fees"><CI value={week.collabs.paid_collab_fees} onChange={v=>upCol("paid_collab_fees",v)} /></Fld>
      </Grid>
      <Row><Badge small label="Total Collab Cost" value={-c.totalCollabs} color={RD} /></Row>

      <SH>Staff Wages — By Department</SH>
      <Grid>
        {WAGE_DEPTS.map(d=>(
          <Fld key={d.key} label={d.label}><CI value={week.wages[d.key]} onChange={v=>upWage(d.key,v)} /></Fld>
        ))}
      </Grid>
      <Row><Badge small label="Total Wages" value={-c.totalWages} color={RD} /></Row>

      <SH>OPEX — Operating Expenses</SH>
      <div style={{ fontFamily:ff, fontSize:11, color:MU, marginBottom:10 }}>Fields with a tinted background are pre-filled from your Fixed Costs. Enter a value to override for this week.</div>
      <Grid>
        {[
          ["office_costs","Office Costs"],
          ["google_ms_admin","Google, Microsoft Admin Software"],
          ["meta_tiktok_ads","Meta, TikTok, Google Paid Ads"],
          ["model_wages","Model Wages"],
          ["shopify","Shopify"],
          ["shopify_apps","Shopify Apps"],
          ["general_apps","General Apps"],
          ["accounting_xero","Accounting (Xero)"],
          ["rostering_deputy","Rostering (Deputy)"],
          ["customer_service_repliai","Customer Service (Repliai)"],
          ["rent_utilities","Rent + Utilities"],
          ["internet_phone","Internet + Telephone"],
          ["insurance","Insurance"],
          ["bank_accounting","Bank / Accounting"],
          ["legal","Legal"],
        ].map(([k,label])=>{
          const hasFixed = n(fixed[k])>0 && !week.opex[k];
          return (
            <Fld key={k} label={label}>
              <CI value={week.opex[k]||(hasFixed?fixed[k]:"")} onChange={v=>upOpex(k,v)} tint={hasFixed?"#1c1730":undefined} />
            </Fld>
          );
        })}
      </Grid>
      <Row><Badge small label="Total OPEX" value={-c.totalOPEX} color={RD} /></Row>

      <div style={{ borderTop:`1px solid ${BR}`, marginTop:24, paddingTop:20 }}>
        <div style={{ fontFamily:ff, fontSize:10, letterSpacing:2, textTransform:"uppercase", color:A, marginBottom:14 }}>Weekly P&L Summary</div>
        <Row>
          <Badge label="Net Revenue" value={c.netRevenue} color={A} />
          <Badge label="Total Expenses" value={-c.totalExpenses} color={RD} />
          <Badge label="Net Profit" value={c.netProfit} />
          <Pct label="Net Margin" value={c.netMargin} />
        </Row>
      </div>

      <SH>Notes / Context</SH>
      <textarea value={week.notes} onChange={e=>onChange({...week,notes:e.target.value})} placeholder="Unusual costs, one-offs, events, context for this week..." rows={3}
        style={{ width:"100%", boxSizing:"border-box", background:S, border:`1px solid ${BR}`, color:TX, padding:"10px 12px", fontFamily:ff, fontSize:14, outline:"none", borderRadius:4, resize:"vertical" }} />
    </div>
  );
}

// ─── FIXED COSTS PAGE ─────────────────────────────────────────────────────────
function FixedCostsPage({ fixed, onChange }) {
  const total = Object.values(fixed).reduce((s,v)=>s+n(v),0);
  return (
    <div>
      <div style={{ fontFamily:ff, fontSize:13, color:MU, marginBottom:20, lineHeight:1.8 }}>
        Set recurring costs here. They auto-populate every week's OPEX section. Override per-week anytime.
      </div>
      <SH>Recurring Fixed Costs</SH>
      <Grid>
        {FIXED_OPEX_KEYS.map(([k,label])=>(
          <Fld key={k} label={label}><CI value={fixed[k]} onChange={v=>onChange({...fixed,[k]:v})} /></Fld>
        ))}
      </Grid>
      <div style={{ marginTop:16, padding:"12px 16px", background:S2, border:`1px solid ${BR}`, borderRadius:5 }}>
        <span style={{ fontFamily:ff, fontSize:13, color:MU }}>Monthly fixed total: </span>
        <span style={{ fontFamily:ff, fontSize:15, color:A, fontWeight:"bold" }}>{fmtD(total)}</span>
        <span style={{ fontFamily:ff, fontSize:12, color:MU, marginLeft:12 }}>({fmtD(total/4.33)} per week avg)</span>
      </div>
    </div>
  );
}

// ─── MONTHLY OVERVIEW ─────────────────────────────────────────────────────────
function MonthlyOverview({ weeks, fixed }) {
  const calcs = weeks.map(w=>calcWeek(w,fixed));
  const tot = f => calcs.reduce((s,c)=>s+c[f],0);
  const tRev=tot("netRevenue"), tGross=tot("grossProfit"), tExp=tot("totalExpenses"), tNet=tot("netProfit");
  const avgGM=tRev>0?(tGross/tRev)*100:0, avgNM=tRev>0?(tNet/tRev)*100:0;

  return (
    <div>
      <SH>Monthly P&L Summary</SH>
      <Row><Badge label="Net Revenue" value={tRev} color={A} /><Badge label="Gross Profit" value={tGross} /><Badge label="Total Expenses" value={-tExp} color={RD} /><Badge label="Net Profit" value={tNet} /></Row>
      <Row><Pct label="Gross Margin" value={avgGM} /><Pct label="Net Margin" value={avgNM} /></Row>

      <SH>Week by Week</SH>
      <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontFamily:ff, fontSize:13 }}>
          <thead>
            <tr style={{ borderBottom:`1px solid ${BR}` }}>
              {["Week","Revenue","COGS","Gross","GP%","Freight","Wages","OPEX","Net Profit","NP%"].map(h=>(
                <th key={h} style={{ padding:"8px 10px", color:MU, fontWeight:"normal", fontSize:10, letterSpacing:1, textTransform:"uppercase", textAlign:"right", whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((w,i)=>{
              const c=calcs[i];
              return (
                <tr key={i} style={{ borderBottom:`1px solid ${BR}22` }}>
                  <td style={{ padding:"10px", color:TX, textAlign:"left", whiteSpace:"nowrap" }}>{w.label||`Week ${i+1}`}</td>
                  <td style={{ padding:"10px", color:A, textAlign:"right" }}>{fmtD(c.netRevenue)}</td>
                  <td style={{ padding:"10px", color:RD, textAlign:"right" }}>{fmtD(-c.totalCOGS)}</td>
                  <td style={{ padding:"10px", color:c.grossProfit>=0?GR:RD, textAlign:"right" }}>{fmtD(c.grossProfit)}</td>
                  <td style={{ padding:"10px", color:c.grossMargin>=0?GR:RD, textAlign:"right" }}>{c.grossMargin.toFixed(1)}%</td>
                  <td style={{ padding:"10px", color:RD, textAlign:"right" }}>{fmtD(-c.totalFreight)}</td>
                  <td style={{ padding:"10px", color:RD, textAlign:"right" }}>{fmtD(-c.totalWages)}</td>
                  <td style={{ padding:"10px", color:RD, textAlign:"right" }}>{fmtD(-c.totalOPEX)}</td>
                  <td style={{ padding:"10px", color:c.netProfit>=0?GR:RD, textAlign:"right", fontWeight:"bold" }}>{fmtD(c.netProfit)}</td>
                  <td style={{ padding:"10px", color:c.netMargin>=0?GR:RD, textAlign:"right" }}>{c.netMargin.toFixed(1)}%</td>
                </tr>
              );
            })}
            <tr style={{ borderTop:`2px solid ${BR}`, background:S2 }}>
              <td style={{ padding:"10px", color:A, fontWeight:"bold" }}>TOTAL</td>
              <td style={{ padding:"10px", color:A, fontWeight:"bold", textAlign:"right" }}>{fmtD(tRev)}</td>
              <td style={{ padding:"10px", color:RD, fontWeight:"bold", textAlign:"right" }}>{fmtD(-tot("totalCOGS"))}</td>
              <td style={{ padding:"10px", color:tGross>=0?GR:RD, fontWeight:"bold", textAlign:"right" }}>{fmtD(tGross)}</td>
              <td style={{ padding:"10px", color:avgGM>=0?GR:RD, fontWeight:"bold", textAlign:"right" }}>{avgGM.toFixed(1)}%</td>
              <td style={{ padding:"10px", color:RD, fontWeight:"bold", textAlign:"right" }}>{fmtD(-tot("totalFreight"))}</td>
              <td style={{ padding:"10px", color:RD, fontWeight:"bold", textAlign:"right" }}>{fmtD(-tot("totalWages"))}</td>
              <td style={{ padding:"10px", color:RD, fontWeight:"bold", textAlign:"right" }}>{fmtD(-tot("totalOPEX"))}</td>
              <td style={{ padding:"10px", color:tNet>=0?GR:RD, fontWeight:"bold", textAlign:"right" }}>{fmtD(tNet)}</td>
              <td style={{ padding:"10px", color:avgNM>=0?GR:RD, fontWeight:"bold", textAlign:"right" }}>{avgNM.toFixed(1)}%</td>
            </tr>
          </tbody>
        </table>
      </div>

      <SH>Expense Breakdown</SH>
      {[["COGS","totalCOGS","#ff9ecd"],["Freight","totalFreight",RD],["Collabs","totalCollabs",YL],["Wages","totalWages","#e0a0ff"],["OPEX","totalOPEX",A]].map(([label,field,color])=>{
        const val=tot(field), tE=tot("totalExpenses");
        return (
          <div key={label} style={{ marginBottom:10 }}>
            <div style={{ display:"flex", justifyContent:"space-between", fontFamily:ff, fontSize:12, marginBottom:4 }}>
              <span style={{ color:TX }}>{label}</span>
              <span style={{ color:RD }}>{fmtD(-val)} ({tE>0?((val/tE)*100).toFixed(1):0}% of expenses)</span>
            </div>
            <div style={{ background:S2, borderRadius:3, height:7, overflow:"hidden" }}>
              <div style={{ background:color, height:"100%", width:`${tE>0?Math.min((val/tE)*100,100):0}%`, borderRadius:3, transition:"width 0.4s" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── VISUALISE PAGE ───────────────────────────────────────────────────────────
function VisualisePage({ weeks, fixed }) {
  const [chart, setChart] = useState("profit");
  const [wf, setWf] = useState("all");
  const calcs = weeks.map(w=>calcWeek(w,fixed));
  const fc = wf==="all"?calcs:[calcs[parseInt(wf)]];
  const fw = wf==="all"?weeks:[weeks[parseInt(wf)]];

  const CHARTS=[
    {id:"profit",label:"Profit / Loss Overview"},
    {id:"expenses",label:"Expense Breakdown"},
    {id:"wages",label:"Wages by Department"},
    {id:"freight",label:"Freight Split"},
    {id:"collabs",label:"Collab Cost Breakdown"},
    {id:"margins",label:"Margin Trends"},
    {id:"revenue",label:"Revenue Waterfall"},
  ];

  function Bar({ data, maxVal }) {
    return (
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {data.map(({label,value,color},i)=>(
          <div key={i}>
            <div style={{ display:"flex", justifyContent:"space-between", fontFamily:ff, fontSize:12, marginBottom:4 }}>
              <span style={{ color:TX }}>{label}</span>
              <span style={{ color:color||A }}>{fmtD(value)}</span>
            </div>
            <div style={{ background:S2, borderRadius:3, height:22, overflow:"hidden" }}>
              <div style={{ background:color||A, height:"100%", borderRadius:3, width:`${maxVal>0?Math.min((Math.abs(value)/maxVal)*100,100):0}%`, transition:"width 0.4s" }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  function WeekBars({ metric, color, label }) {
    const vals = calcs.map(c=>c[metric]);
    const max = Math.max(...vals.map(Math.abs),1);
    return (
      <div style={{ marginBottom:22 }}>
        <div style={{ fontFamily:ff, fontSize:10, letterSpacing:1.5, color:MU, textTransform:"uppercase", marginBottom:10 }}>{label}</div>
        <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}>
          {vals.map((v,i)=>(
            <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
              <div style={{ fontFamily:ff, fontSize:10, color:v>=0?GR:RD }}>{fmtS(v)}</div>
              <div style={{ width:"100%", background:color||(v>=0?GR:RD), borderRadius:"3px 3px 0 0", height:`${(Math.abs(v)/max)*80}px`, opacity:0.85, minHeight:3 }} />
              <div style={{ fontFamily:ff, fontSize:9, color:MU, textAlign:"center", whiteSpace:"nowrap", overflow:"hidden", maxWidth:80 }}>{weeks[i]?.label?.split(",")[0]||`W${i+1}`}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const tRev=fc.reduce((s,c)=>s+c.netRevenue,0), tExp=fc.reduce((s,c)=>s+c.totalExpenses,0), tNet=fc.reduce((s,c)=>s+c.netProfit,0);

  return (
    <div>
      <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:20, alignItems:"flex-end" }}>
        <div>
          <Lbl>Chart Type</Lbl>
          <select value={chart} onChange={e=>setChart(e.target.value)}
            style={{ background:S2, border:`1px solid ${BR}`, color:TX, padding:"9px 12px", fontFamily:ff, fontSize:13, outline:"none", borderRadius:4 }}>
            {CHARTS.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <Lbl>Period Filter</Lbl>
          <select value={wf} onChange={e=>setWf(e.target.value)}
            style={{ background:S2, border:`1px solid ${BR}`, color:TX, padding:"9px 12px", fontFamily:ff, fontSize:13, outline:"none", borderRadius:4 }}>
            <option value="all">All Weeks (Monthly)</option>
            {weeks.map((w,i)=><option key={i} value={i}>{w.label||`Week ${i+1}`}</option>)}
          </select>
        </div>
      </div>

      <Row>
        <Badge label="Revenue" value={tRev} color={A} />
        <Badge label="Total Expenses" value={-tExp} color={RD} />
        <Badge label="Net Profit" value={tNet} />
        <Pct label="Net Margin" value={tRev>0?(tNet/tRev)*100:0} />
      </Row>

      <div style={{ marginTop:28 }}>
        {chart==="profit" && (
          <div>
            <SH>Profit / Loss — Week by Week</SH>
            <WeekBars metric="netRevenue" color={A} label="Net Revenue" />
            <WeekBars metric="totalExpenses" color={RD} label="Total Expenses" />
            <WeekBars metric="netProfit" color={GR} label="Net Profit" />
          </div>
        )}
        {chart==="expenses" && (
          <div>
            <SH>Expense Breakdown</SH>
            <Bar maxVal={tExp} data={[
              {label:"COGS",value:fc.reduce((s,c)=>s+c.totalCOGS,0),color:"#ff9ecd"},
              {label:"Customer Freight",value:fc.reduce((s,c)=>s+c.totalFreight,0),color:RD},
              {label:"Collaborations",value:fc.reduce((s,c)=>s+c.totalCollabs,0),color:YL},
              {label:"Wages",value:fc.reduce((s,c)=>s+c.totalWages,0),color:"#e0a0ff"},
              {label:"OPEX",value:fc.reduce((s,c)=>s+c.totalOPEX,0),color:A},
            ]} />
          </div>
        )}
        {chart==="wages" && (
          <div>
            <SH>Wages by Department</SH>
            {(()=>{
              const data=WAGE_DEPTS.map(d=>({label:d.label,value:fw.reduce((s,w)=>s+n(w.wages[d.key]),0),color:A}));
              const mx=Math.max(...data.map(d=>d.value),1);
              return (
                <>
                  <Bar maxVal={mx} data={data} />
                  <div style={{ marginTop:14, padding:"10px 14px", background:S2, border:`1px solid ${BR}`, borderRadius:5, fontFamily:ff, fontSize:13 }}>
                    Total: <span style={{ color:RD }}>{fmtD(data.reduce((s,d)=>s+d.value,0))}</span>
                    {tRev>0&&<span style={{ color:MU, marginLeft:12 }}>({((data.reduce((s,d)=>s+d.value,0)/tRev)*100).toFixed(1)}% of revenue)</span>}
                  </div>
                </>
              );
            })()}
          </div>
        )}
        {chart==="freight" && (
          <div>
            <SH>Customer Freight Split</SH>
            {(()=>{
              const aus=fw.reduce((s,w)=>s+n(w.freight.auspost),0);
              const fedx=fw.reduce((s,w)=>s+n(w.freight.fedex),0);
              const cust=fw.reduce((s,w)=>s+n(w.freight.customs_duties),0);
              return <Bar maxVal={Math.max(aus,fedx,cust,1)} data={[
                {label:"AusPost",value:aus,color:YL},
                {label:"FedEx / International",value:fedx,color:RD},
                {label:"Customs & Duties",value:cust,color:"#aaa"},
              ]} />;
            })()}
          </div>
        )}
        {chart==="collabs" && (
          <div>
            <SH>Collab Cost Breakdown</SH>
            {(()=>{
              const ship=fw.reduce((s,w)=>s+n(w.collabs.shipping_cost),0);
              const prod=fw.reduce((s,w)=>s+n(w.collabs.product_cogs),0);
              const comm=fw.reduce((s,w)=>s+n(w.collabs.uppromote_commission),0);
              const paid=fw.reduce((s,w)=>s+n(w.collabs.paid_collab_fees),0);
              return <Bar maxVal={Math.max(ship,prod,comm,paid,1)} data={[
                {label:"Shipping to Collab",value:ship,color:A},
                {label:"Product COGS",value:prod,color:YL},
                {label:"Uppromote Commission",value:comm,color:GR},
                {label:"Paid Collab Fees",value:paid,color:RD},
              ]} />;
            })()}
          </div>
        )}
        {chart==="margins" && (
          <div>
            <SH>Margin Trends — Week by Week</SH>
            <WeekBars metric="grossMargin" color={YL} label="Gross Margin %" />
            <WeekBars metric="netMargin" color={GR} label="Net Margin %" />
          </div>
        )}
        {chart==="revenue" && (
          <div>
            <SH>Revenue Waterfall</SH>
            {(()=>{
              const gross=fw.reduce((s,w)=>s+n(w.revenue.gross_sales),0);
              const ref=fw.reduce((s,w)=>s+n(w.revenue.refunds),0);
              const disc=fw.reduce((s,w)=>s+n(w.revenue.discounts),0);
              const shi=fw.reduce((s,w)=>s+n(w.revenue.shipping_income),0);
              const pp=fw.reduce((s,w)=>s+n(w.revenue.paypal_fees),0);
              return <Bar maxVal={gross} data={[
                {label:"Gross Sales",value:gross,color:GR},
                {label:"Less: Refunds",value:ref,color:RD},
                {label:"Less: Discounts",value:disc,color:RD},
                {label:"Add: Shipping Income",value:shi,color:YL},
                {label:"Less: PayPal Fees",value:pp,color:"#888"},
                {label:"NET REVENUE",value:gross-ref-disc+shi-pp,color:A},
              ]} />;
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── REPORTS PAGE ─────────────────────────────────────────────────────────────
function ReportsPage({ reports, fixed, onSave, onDelete, onCopyForClaude }) {
  const [expanded, setExpanded] = useState(null);
  const [editIdx, setEditIdx] = useState(null);
  const [editWeeks, setEditWeeks] = useState(null);
  const [editLabel, setEditLabel] = useState("");
  const [activeEditWeek, setActiveEditWeek] = useState(0);
  const [menu, setMenu] = useState(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    function close(e) { if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(null); }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (!reports.length) return (
    <div style={{ textAlign:"center", padding:"60px 20px", color:MU, fontFamily:ff }}>
      <div style={{ fontSize:28, marginBottom:12, opacity:0.3 }}>—</div>
      <div>No saved reports yet.</div>
      <div style={{ fontSize:13, marginTop:8 }}>Complete a weekly P&L and save it.</div>
    </div>
  );

  const startEdit = idx => {
    const r = reports[idx];
    setEditWeeks((r.weeks||[]).map(w=>({...w})));
    setEditLabel(r.title);
    setEditIdx(idx);
    setActiveEditWeek(0);
    setExpanded(idx);
  };

  const saveEdit = async idx => {
    setSaving(true);
    const calcs = editWeeks.map(w=>calcWeek(w,fixed));
    const updated = reports.map((r,i) => i!==idx?r : {
      ...r, title:editLabel, weeks:editWeeks,
      netRevenue:calcs.reduce((s,c)=>s+c.netRevenue,0),
      grossProfit:calcs.reduce((s,c)=>s+c.grossProfit,0),
      totalExpenses:calcs.reduce((s,c)=>s+c.totalExpenses,0),
      netProfit:calcs.reduce((s,c)=>s+c.netProfit,0),
      savedAt:`Updated ${new Date().toLocaleString("en-AU")}`,
    });
    await onSave(updated);
    setSaving(false);
    setEditIdx(null);
    setEditWeeks(null);
  };

  return (
    <div>
      <SH>Saved Reports ({reports.length})</SH>
      {reports.slice().reverse().map((r,ri)=>{
        const rIdx = reports.length-1-ri;
        const isOpen = expanded===rIdx;
        const isEdit = editIdx===rIdx;
        const calcs = (isEdit?editWeeks:r.weeks||[]).map(w=>calcWeek(w,fixed));

        return (
          <div key={r.id} style={{ border:`1px solid ${BR}`, borderRadius:6, marginBottom:10, overflow:"visible" }}>
            {/* Row header */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 16px", background:isOpen?S2:"transparent", borderRadius:isOpen?"6px 6px 0 0":"6px" }}>
              <div onClick={()=>setExpanded(isOpen?null:rIdx)} style={{ flex:1, cursor:"pointer" }}>
                {isEdit
                  ? <input value={editLabel} onChange={e=>setEditLabel(e.target.value)} onClick={e=>e.stopPropagation()}
                      style={{ background:S, border:`1px solid ${A}`, color:TX, padding:"4px 8px", fontFamily:ff, fontSize:15, outline:"none", borderRadius:3, width:280 }} />
                  : <div style={{ fontFamily:ff, fontSize:15, color:TX }}>{r.title}</div>
                }
                <div style={{ fontFamily:ff, fontSize:11, color:MU, marginTop:2 }}>{r.savedAt}</div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ fontFamily:ff, fontSize:14, color:n(r.netProfit)>=0?GR:RD }}>{fmtD(n(r.netProfit))}</div>
                {/* 3-dot menu */}
                <div style={{ position:"relative" }} ref={menu===rIdx?menuRef:null}>
                  <button onClick={e=>{e.stopPropagation();setMenu(menu===rIdx?null:rIdx);}}
                    style={{ background:"transparent", border:`1px solid ${BR}`, color:MU, padding:"4px 10px", fontFamily:ff, fontSize:18, cursor:"pointer", borderRadius:4, lineHeight:1, letterSpacing:2 }}>⋯</button>
                  {menu===rIdx && (
                    <div style={{ position:"absolute", right:0, top:"calc(100% + 6px)", background:S2, border:`1px solid ${BR}`, borderRadius:6, zIndex:200, minWidth:170, overflow:"hidden", boxShadow:"0 8px 24px #00000088" }}>
                      {[
                        {label:"Edit Report", action:()=>{startEdit(rIdx);setMenu(null);}},
                        {label:copied===rIdx?"Copied!":"Copy for Claude", action:()=>{onCopyForClaude(r.weeks||[],r.title);setCopied(rIdx);setTimeout(()=>setCopied(null),3000);setMenu(null);}},
                        {label:"Delete", action:()=>{onDelete(rIdx);setMenu(null);}, danger:true},
                      ].map(item=>(
                        <button key={item.label} onClick={item.action}
                          style={{ display:"block", width:"100%", padding:"10px 16px", background:"transparent", border:"none", color:item.danger?RD:TX, fontFamily:ff, fontSize:13, cursor:"pointer", textAlign:"left" }}
                          onMouseEnter={e=>e.target.style.background=BR}
                          onMouseLeave={e=>e.target.style.background="transparent"}>
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={()=>setExpanded(isOpen?null:rIdx)} style={{ background:"transparent", border:"none", color:MU, fontSize:20, cursor:"pointer", lineHeight:1 }}>{isOpen?"−":"+"}</button>
              </div>
            </div>

            {/* Expanded content */}
            {isOpen && (
              <div style={{ padding:"20px 18px", borderTop:`1px solid ${BR}`, background:S }}>
                {isEdit ? (
                  <div>
                    <div style={{ fontFamily:ff, fontSize:10, letterSpacing:1.5, color:A, textTransform:"uppercase", marginBottom:12 }}>Editing Report — Select Week to Edit</div>
                    <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" }}>
                      {editWeeks.map((w,wi)=>(
                        <button key={wi} onClick={()=>setActiveEditWeek(wi)}
                          style={{ padding:"9px 14px", background:activeEditWeek===wi?S2:"transparent", border:`1px solid ${activeEditWeek===wi?A:BR}`, color:activeEditWeek===wi?A:MU, fontFamily:ff, fontSize:12, cursor:"pointer", borderRadius:4 }}>
                          {w.label||`Week ${wi+1}`}
                        </button>
                      ))}
                    </div>
                    {editWeeks[activeEditWeek] && (
                      <div style={{ background:S2, border:`1px solid ${BR}`, borderRadius:6, padding:"20px" }}>
                        <WeekForm week={editWeeks[activeEditWeek]} onChange={updated=>{const arr=[...editWeeks];arr[activeEditWeek]=updated;setEditWeeks(arr);}} fixed={fixed} />
                      </div>
                    )}
                    <div style={{ display:"flex", gap:10, marginTop:16 }}>
                      <button onClick={()=>saveEdit(rIdx)} disabled={saving}
                        style={{ flex:1, padding:"11px 0", background:A, border:"none", color:BG, fontFamily:ff, fontSize:13, cursor:"pointer", borderRadius:4, fontWeight:"bold", letterSpacing:1 }}>
                        {saving?"SAVING...":"SAVE CHANGES"}
                      </button>
                      <button onClick={()=>{setEditIdx(null);setEditWeeks(null);}}
                        style={{ padding:"11px 20px", background:"transparent", border:`1px solid ${BR}`, color:MU, fontFamily:ff, fontSize:13, cursor:"pointer", borderRadius:4 }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <Row>
                      <Badge small label="Revenue" value={n(r.netRevenue)} color={A} />
                      <Badge small label="Gross Profit" value={n(r.grossProfit)} />
                      <Badge small label="Total Expenses" value={-n(r.totalExpenses)} color={RD} />
                      <Badge small label="Net Profit" value={n(r.netProfit)} />
                    </Row>
                    <div style={{ marginTop:14 }}>
                      {(r.weeks||[]).map((w,wi)=>{
                        const c=calcs[wi];
                        return (
                          <div key={wi} style={{ display:"flex", justifyContent:"space-between", padding:"9px 12px", background:S2, borderRadius:4, border:`1px solid ${BR}`, marginBottom:6 }}>
                            <span style={{ fontFamily:ff, fontSize:13, color:TX }}>{w.label||`Week ${wi+1}`} — {w.dateRange}</span>
                            <div>
                              <span style={{ fontFamily:ff, fontSize:13, color:c.netProfit>=0?GR:RD }}>Net: {fmtD(c.netProfit)}</span>
                              <span style={{ fontFamily:ff, fontSize:11, color:MU, marginLeft:12 }}>GP: {c.grossMargin.toFixed(1)}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <button onClick={()=>startEdit(rIdx)}
                      style={{ marginTop:14, width:"100%", padding:"10px 0", background:"transparent", border:`1px solid ${A}`, color:A, fontFamily:ff, fontSize:13, cursor:"pointer", borderRadius:4, letterSpacing:1 }}>
                      EDIT REPORT
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── PASSWORD ─────────────────────────────────────────────────────────────────
function PasswordScreen({ onAuth }) {
  const [pw, setPw] = useState(""), [err, setErr] = useState(false);
  const check = () => {
    if (!PASSWORD || pw===PASSWORD) { onAuth(); }
    else { setErr(true); setTimeout(()=>setErr(false),1400); }
  };
  return (
    <div style={{ minHeight:"100vh", background:BG, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:ff }}>
      <div style={{ textAlign:"center", marginBottom:52 }}>
        <div style={{ fontSize:9, letterSpacing:6, color:MU, textTransform:"uppercase", marginBottom:14 }}>Finance Operations</div>
        <div style={{ fontSize:30, letterSpacing:5, color:TX, textTransform:"uppercase", fontWeight:"normal" }}>P&L Dashboard</div>
        <div style={{ width:36, height:1, background:A, margin:"18px auto 0" }} />
      </div>
      <div style={{ width:290 }}>
        <input type="password" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&check()}
          placeholder="PASSWORD" autoFocus
          style={{ width:"100%", boxSizing:"border-box", background:"transparent", border:`1px solid ${err?RD:BR}`, color:TX, padding:"14px 16px", fontFamily:ff, fontSize:13, outline:"none", borderRadius:2, letterSpacing:4, textAlign:"center", marginBottom:10, transition:"border-color 0.2s" }} />
        {err && <div style={{ color:RD, fontSize:10, textAlign:"center", letterSpacing:2, textTransform:"uppercase", marginBottom:8 }}>Incorrect Password</div>}
        <button onClick={check}
          style={{ width:"100%", padding:"13px 0", background:"transparent", border:`1px solid ${A}`, color:A, fontFamily:ff, fontSize:11, cursor:"pointer", borderRadius:2, letterSpacing:5, textTransform:"uppercase", transition:"all 0.2s" }}
          onMouseEnter={e=>{e.target.style.background=A;e.target.style.color=BG;}}
          onMouseLeave={e=>{e.target.style.background="transparent";e.target.style.color=A;}}>
          Enter
        </button>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [authed, setAuthed] = useState(!PASSWORD);
  const [tab, setTab] = useState("input");
  const [monthLabel, setMonthLabel] = useState("");
  const [numWeeks, setNumWeeks] = useState(4);
  const [weeks, setWeeks] = useState(()=>Array.from({length:4},(_,i)=>{const d=autoWeek(3-i);return{...emptyWeek(),label:d.label,dateRange:d.range};}));
  const [activeWeek, setActiveWeek] = useState(0);
  const [fixed, setFixed] = useState(emptyFixed());
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(()=>{
    const now=new Date();
    setMonthLabel(`${now.toLocaleString("default",{month:"long"})} ${now.getFullYear()}`);
  },[]);

  useEffect(()=>{
    if(!authed)return;
    setLoading(true);
    loadAll().then(({reports:r,fixed:f})=>{setReports(r);setFixed(f);setLoading(false);});
  },[authed]);

  useEffect(()=>{
    setWeeks(prev=>{
      let arr=[...prev];
      while(arr.length<numWeeks){const d=autoWeek(numWeeks-1-arr.length);arr.push({...emptyWeek(),label:d.label,dateRange:d.range});}
      return arr.slice(0,numWeeks);
    });
    if(activeWeek>=numWeeks)setActiveWeek(numWeeks-1);
  },[numWeeks]);

  const calcs = weeks.map(w=>calcWeek(w,fixed));
  const totalNet = calcs.reduce((s,c)=>s+c.netProfit,0);

  const handleSave = async () => {
    setSaving(true);
    const c=weeks.map(w=>calcWeek(w,fixed));
    const report={
      id:Date.now(), title:monthLabel||`Report ${new Date().toLocaleDateString("en-AU")}`,
      savedAt:new Date().toLocaleString("en-AU"),
      netRevenue:c.reduce((s,x)=>s+x.netRevenue,0), grossProfit:c.reduce((s,x)=>s+x.grossProfit,0),
      totalExpenses:c.reduce((s,x)=>s+x.totalExpenses,0), netProfit:c.reduce((s,x)=>s+x.netProfit,0),
      weeks,
    };
    const updated=[...reports,report];
    await saveAll(updated,fixed);
    setReports(updated);
    setSaving(false);
    setSaveMsg("· Saved");
    setTimeout(()=>setSaveMsg(""),3000);
  };

  const handleSaveFixed = async f=>{setFixed(f);await saveAll(reports,f);};
  const handleSaveReports = async updated=>{await saveAll(updated,fixed);setReports(updated);};
  const handleDeleteReport = async idx=>{const updated=reports.filter((_,i)=>i!==idx);await saveAll(updated,fixed);setReports(updated);};
  const handleCopyForClaude = (weeksData=weeks, label=monthLabel)=>{
    navigator.clipboard.writeText(generateClaudeData(weeksData,fixed,label));
    setCopied(true);
    setTimeout(()=>setCopied(false),3000);
  };

  if(!authed)return <PasswordScreen onAuth={()=>setAuthed(true)} />;

  const TABS=[
    {id:"input",label:"Weekly Input"},
    {id:"overview",label:"Monthly Overview"},
    {id:"visualise",label:"Visualise"},
    {id:"fixed",label:"Fixed Costs"},
    {id:"reports",label:`Reports (${reports.length})`},
  ];

  return (
    <div style={{ minHeight:"100vh", background:BG, color:TX, fontFamily:ff }}>
      {/* Header */}
      <div style={{ borderBottom:`1px solid ${BR}`, padding:"0 32px" }}>
        <div style={{ maxWidth:1200, margin:"0 auto", padding:"22px 0 0" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", flexWrap:"wrap", gap:12 }}>
            <div>
              <div style={{ color:A, fontSize:9, letterSpacing:4, textTransform:"uppercase", marginBottom:4 }}>Finance Operations</div>
              <h1 style={{ margin:0, fontSize:24, fontWeight:"normal", letterSpacing:2, color:TX, textTransform:"uppercase" }}>Weekly P&L Dashboard</h1>
            </div>
            <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
              <input value={monthLabel} onChange={e=>setMonthLabel(e.target.value)}
                style={{ background:S, border:`1px solid ${BR}`, color:TX, padding:"7px 12px", fontFamily:ff, fontSize:13, outline:"none", borderRadius:4, width:210 }}
                placeholder="Report label (e.g. March 2025)" />
              <div style={{ background:S2, border:`1px solid ${BR}`, borderRadius:4, padding:"7px 12px", fontSize:13, color:totalNet>=0?GR:RD, fontFamily:ff }}>
                MTD: {fmtD(totalNet)}
              </div>
            </div>
          </div>
          <div style={{ display:"flex", gap:0, marginTop:18 }}>
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)}
                style={{ padding:"10px 18px", background:"transparent", border:"none", borderBottom:tab===t.id?`2px solid ${A}`:"2px solid transparent", color:tab===t.id?A:MU, fontFamily:ff, fontSize:13, cursor:"pointer", letterSpacing:0.5, marginBottom:-1 }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth:1200, margin:"0 auto", padding:"28px 32px" }}>
        {loading&&<div style={{ textAlign:"center", color:MU, padding:40 }}>Loading...</div>}

        {/* INPUT */}
        {tab==="input"&&(
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12, marginBottom:20 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ color:MU, fontSize:11, letterSpacing:1, textTransform:"uppercase" }}>Weeks:</span>
                {[1,2,3,4,5].map(nn=>(
                  <button key={nn} onClick={()=>setNumWeeks(nn)}
                    style={{ width:30, height:30, background:numWeeks===nn?A:S2, border:`1px solid ${numWeeks===nn?A:BR}`, color:numWeeks===nn?BG:TX, fontFamily:ff, fontSize:13, cursor:"pointer", borderRadius:4 }}>{nn}</button>
                ))}
              </div>
              <div style={{ display:"flex", gap:10 }}>
                <button onClick={()=>handleCopyForClaude()}
                  style={{ padding:"9px 16px", background:"transparent", border:`1px solid ${A}`, color:A, fontFamily:ff, fontSize:11, cursor:"pointer", borderRadius:4, letterSpacing:1.5, textTransform:"uppercase" }}>
                  {copied?"Copied!":"Copy for Claude"}
                  <div style={{ fontSize:9, color:MU, marginTop:1, letterSpacing:0.5 }}>for claude analysis</div>
                </button>
                <button onClick={handleSave} disabled={saving}
                  style={{ padding:"9px 16px", background:A, border:"none", color:BG, fontFamily:ff, fontSize:11, cursor:"pointer", borderRadius:4, fontWeight:"bold", letterSpacing:1.5, textTransform:"uppercase" }}>
                  {saving?"Saving...":"Save Report"}
                  {saveMsg&&<span style={{ fontSize:9, marginLeft:6, opacity:0.7 }}>{saveMsg}</span>}
                </button>
              </div>
            </div>

            <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" }}>
              {weeks.map((w,i)=>{
                const c=calcs[i];
                return (
                  <button key={i} onClick={()=>setActiveWeek(i)}
                    style={{ padding:"10px 16px", background:activeWeek===i?S2:"transparent", border:`1px solid ${activeWeek===i?A:BR}`, color:activeWeek===i?A:MU, fontFamily:ff, fontSize:12, cursor:"pointer", borderRadius:4, textAlign:"left", minWidth:120 }}>
                    <div>{w.label||`Week ${i+1}`}</div>
                    <div style={{ fontSize:11, color:c.netProfit!==0?(c.netProfit>=0?GR:RD):MU, marginTop:2 }}>
                      {c.netProfit!==0?fmtS(c.netProfit):"No data"}
                    </div>
                  </button>
                );
              })}
            </div>

            {weeks[activeWeek]&&(
              <div style={{ background:S, border:`1px solid ${BR}`, borderRadius:8, padding:"24px 28px" }}>
                <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:20 }}>
                  <div style={{ flex:1, minWidth:180 }}>
                    <Lbl>Week Label</Lbl>
                    <input value={weeks[activeWeek].label} onChange={e=>{const a=[...weeks];a[activeWeek]={...a[activeWeek],label:e.target.value};setWeeks(a);}}
                      style={baseInp} placeholder="Week 1, March 2025"
                      onFocus={e=>e.target.style.borderColor=A} onBlur={e=>e.target.style.borderColor=BR} />
                  </div>
                  <div style={{ flex:1, minWidth:180 }}>
                    <Lbl>Date Range</Lbl>
                    <input value={weeks[activeWeek].dateRange} onChange={e=>{const a=[...weeks];a[activeWeek]={...a[activeWeek],dateRange:e.target.value};setWeeks(a);}}
                      style={baseInp} placeholder="01/03/25 – 07/03/25"
                      onFocus={e=>e.target.style.borderColor=A} onBlur={e=>e.target.style.borderColor=BR} />
                  </div>
                </div>
                <WeekForm week={weeks[activeWeek]} onChange={d=>{const a=[...weeks];a[activeWeek]=d;setWeeks(a);}} fixed={fixed} />
              </div>
            )}
          </div>
        )}

        {/* OVERVIEW */}
        {tab==="overview"&&(
          <div style={{ background:S, border:`1px solid ${BR}`, borderRadius:8, padding:"24px 28px" }}>
            <MonthlyOverview weeks={weeks} fixed={fixed} />
            <div style={{ display:"flex", gap:10, marginTop:24 }}>
              <button onClick={()=>handleCopyForClaude()}
                style={{ flex:1, padding:"13px 0", background:"transparent", border:`1px solid ${A}`, color:A, fontFamily:ff, fontSize:12, cursor:"pointer", borderRadius:4, letterSpacing:1.5, textTransform:"uppercase" }}>
                {copied?"Copied!":"Copy for Claude Analysis"}
                <div style={{ fontSize:9, color:MU, marginTop:2 }}>paste into claude for deep insights</div>
              </button>
              <button onClick={handleSave} disabled={saving}
                style={{ flex:1, padding:"13px 0", background:A, border:"none", color:BG, fontFamily:ff, fontSize:12, cursor:"pointer", borderRadius:4, fontWeight:"bold", letterSpacing:1.5, textTransform:"uppercase" }}>
                {saving?"Saving...":"Save Report"}
              </button>
            </div>
          </div>
        )}

        {/* VISUALISE */}
        {tab==="visualise"&&(
          <div style={{ background:S, border:`1px solid ${BR}`, borderRadius:8, padding:"24px 28px" }}>
            <VisualisePage weeks={weeks} fixed={fixed} />
          </div>
        )}

        {/* FIXED */}
        {tab==="fixed"&&(
          <div style={{ background:S, border:`1px solid ${BR}`, borderRadius:8, padding:"24px 28px" }}>
            <FixedCostsPage fixed={fixed} onChange={async f=>{await handleSaveFixed(f);setSaveMsg("Fixed costs saved");setTimeout(()=>setSaveMsg(""),2000);}} />
            {saveMsg&&<div style={{ marginTop:12, fontFamily:ff, fontSize:12, color:GR }}>{saveMsg}</div>}
          </div>
        )}

        {/* REPORTS */}
        {tab==="reports"&&(
          <div style={{ background:S, border:`1px solid ${BR}`, borderRadius:8, padding:"24px 28px" }}>
            {loading?(
              <div style={{ textAlign:"center", color:MU, padding:40 }}>Loading reports...</div>
            ):(
              <ReportsPage reports={reports} fixed={fixed} onSave={handleSaveReports} onDelete={handleDeleteReport} onCopyForClaude={handleCopyForClaude} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
