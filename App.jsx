import { useState, useEffect, useRef, useCallback } from "react";

// ─── THEME ────────────────────────────────────────────────────────────────────
const A = "#d8b9ff", BG = "#0a0a0e", S = "#12111a", S2 = "#1a1826", BR = "#2a2540";
const TX = "#e0e0e0", MU = "#777", RD = "#ff6b6b", GR = "#6bffb8", YL = "#ffd97d";
const ff = "Times New Roman";
const JSONBIN_ID = import.meta.env.VITE_JSONBIN_ID;
const JSONBIN_KEY = import.meta.env.VITE_JSONBIN_KEY;
const PASSWORD = import.meta.env.VITE_PASSWORD;

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const WAGE_DEPTS = [
  { key: "ops_retail", label: "Operations — Retail" },
  { key: "ops_logistics", label: "Operations — Logistics" },
  { key: "ops_cs", label: "Operations — Customer Service" },
  { key: "marketing", label: "Marketing Department" },
  { key: "hr_management", label: "HR & General Management" },
];

const ALL_OPEX_KEYS = [
  ["office_costs", "Office Costs"],
  ["google_ms_admin", "Google, Microsoft Admin Software"],
  ["meta_tiktok_ads", "Meta, TikTok, Google Paid Ads"],
  ["model_wages", "Model Wages"],
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
];

// ─── WEEK / MONTH HELPERS ─────────────────────────────────────────────────────
function getMonthWeeks(year, month) {
  const firstOfMonth = new Date(year, month, 1);
  const dayOfWeek = firstOfMonth.getDay();
  const daysToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  let monday = new Date(firstOfMonth);
  monday.setDate(firstOfMonth.getDate() - daysToMon);
  const weeks = [];
  const fmt = d => `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getFullYear()).slice(-2)}`;
  for (let w = 0; w < 4; w++) {
    const mon = new Date(monday); mon.setDate(monday.getDate() + w * 7);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    weeks.push({ weekNum: w+1, label: `Week ${w+1}`, dateRange: `${fmt(mon)} \u2013 ${fmt(sun)}` });
  }
  return weeks;
}

function monthKey(year, month) { return `${year}-${String(month).padStart(2,"0")}`; }
function monthLabel(year, month) { return new Date(year, month, 1).toLocaleString("default", { month: "long", year: "numeric" }); }

function getAvailableMonths() {
  const months = [];
  const start = new Date(2025, 0, 1);
  const end = new Date(); end.setMonth(end.getMonth() + 2);
  let cur = new Date(start);
  while (cur <= end) {
    months.push({ year: cur.getFullYear(), month: cur.getMonth(), key: monthKey(cur.getFullYear(), cur.getMonth()), label: monthLabel(cur.getFullYear(), cur.getMonth()) });
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

// ─── DATA STRUCTURES ─────────────────────────────────────────────────────────
function emptyWeek(weekNum, dateRange, label) {
  return {
    weekNum: weekNum||1, label: label||`Week ${weekNum||1}`, dateRange: dateRange||"", notes: "", shopifyRaw: "",
    revenue: { gross_sales:"", refunds:"", discounts:"", shipping_income:"", paypal_fees:"" },
    cogs: { manufacturing_product:"", manufacturing_shipping:"", satchel_count:"", satchel_cost_each:"0.85", other_packaging:"" },
    freight: { auspost:"", fedex:"", customs_duties:"" },
    collabs: { shipping_cost:"", product_cogs:"", uppromote_commission:"", paid_collab_fees:"" },
    wages: { ops_retail:"", ops_logistics:"", ops_cs:"", marketing:"", hr_management:"" },
    opex: Object.fromEntries(ALL_OPEX_KEYS.map(([k])=>[k,""])),
  };
}

function emptyMonthExtras() {
  return { opex: Object.fromEntries(ALL_OPEX_KEYS.map(([k])=>[k,""])), notes:"" };
}

function emptyFixed() {
  return { values: Object.fromEntries(ALL_OPEX_KEYS.map(([k])=>[k,""])), fixedKeys:[] };
}

const n = v => parseFloat(v)||0;

function calcWeek(week, fixed) {
  const rev = week.revenue;
  const gross=n(rev.gross_sales), refunds=n(rev.refunds), discounts=n(rev.discounts);
  const shippingIncome=n(rev.shipping_income), paypalFees=n(rev.paypal_fees);
  const netRevenue = gross - refunds - discounts + shippingIncome - paypalFees;
  const mfgProduct=n(week.cogs.manufacturing_product), mfgShipping=n(week.cogs.manufacturing_shipping);
  const satchelCost=n(week.cogs.satchel_count)*n(week.cogs.satchel_cost_each), otherPkg=n(week.cogs.other_packaging);
  const totalCOGS = mfgProduct+mfgShipping+satchelCost+otherPkg;
  const grossProfit=netRevenue-totalCOGS, grossMargin=netRevenue>0?(grossProfit/netRevenue)*100:0;
  const auspost=n(week.freight.auspost), fedex=n(week.freight.fedex), customs=n(week.freight.customs_duties);
  const totalFreight=auspost+fedex+customs;
  const collabShip=n(week.collabs.shipping_cost), collabProd=n(week.collabs.product_cogs);
  const collabComm=n(week.collabs.uppromote_commission), collabPaid=n(week.collabs.paid_collab_fees);
  const totalCollabs=collabShip+collabProd+collabComm+collabPaid;
  const totalWages=WAGE_DEPTS.reduce((s,d)=>s+n(week.wages[d.key]),0);
  const getOpex=k=>{
    if(week.opex[k]!==""&&week.opex[k]!==undefined)return n(week.opex[k]);
    if(fixed?.fixedKeys?.includes(k))return n(fixed?.values?.[k]);
    return 0;
  };
  const totalOPEX=ALL_OPEX_KEYS.reduce((s,[k])=>s+getOpex(k),0);
  const totalExpenses=totalCOGS+totalFreight+totalCollabs+totalWages+totalOPEX;
  const netProfit=netRevenue-totalExpenses, netMargin=netRevenue>0?(netProfit/netRevenue)*100:0;
  return { netRevenue, totalCOGS, grossProfit, grossMargin, totalFreight, totalCollabs, totalWages, totalOPEX, totalExpenses, netProfit, netMargin, auspost, fedex, customs, satchelCost, mfgProduct, mfgShipping, otherPkg, collabShip, collabProd, collabComm, collabPaid, paypalFees, refunds, discounts, gross };
}

function calcMonthWithExtras(weeks, fixed, extras) {
  const wc=weeks.map(w=>calcWeek(w,fixed));
  const sum=f=>wc.reduce((s,c)=>s+c[f],0);
  const extraOpex=extras?ALL_OPEX_KEYS.reduce((s,[k])=>s+n(extras.opex?.[k]),0):0;
  const netRevenue=sum("netRevenue"), totalCOGS=sum("totalCOGS"), grossProfit=sum("grossProfit");
  const grossMargin=netRevenue>0?(grossProfit/netRevenue)*100:0;
  const totalFreight=sum("totalFreight"), totalCollabs=sum("totalCollabs"), totalWages=sum("totalWages");
  const totalOPEX=sum("totalOPEX")+extraOpex, totalExpenses=sum("totalExpenses")+extraOpex;
  const netProfit=netRevenue-totalExpenses, netMargin=netRevenue>0?(netProfit/netRevenue)*100:0;
  return { netRevenue, totalCOGS, grossProfit, grossMargin, totalFreight, totalCollabs, totalWages, totalOPEX, totalExpenses, netProfit, netMargin, weekCalcs:wc, extraOpex };
}

// ─── STORAGE ─────────────────────────────────────────────────────────────────
async function loadAll() {
  if (JSONBIN_ID && JSONBIN_KEY) {
    try {
      const r = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}/latest`, { headers: { "X-Master-Key": JSONBIN_KEY } });
      const d = await r.json();
      if (d.record) return { monthData: d.record.monthData||{}, fixed: d.record.fixed||emptyFixed() };
    } catch {}
  }
  try {
    const local = localStorage.getItem("pl_v3");
    if (local) return JSON.parse(local);
  } catch {}
  return { monthData:{}, fixed:emptyFixed() };
}

async function saveAll(monthData, fixed) {
  const payload = { monthData, fixed };
  try { localStorage.setItem("pl_v3", JSON.stringify(payload)); } catch {}
  if (!JSONBIN_ID||!JSONBIN_KEY) return;
  try {
    await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}`, {
      method:"PUT", headers:{"Content-Type":"application/json","X-Master-Key":JSONBIN_KEY},
      body: JSON.stringify(payload),
    });
  } catch {}
}

// ─── SHOPIFY PARSER ──────────────────────────────────────────────────────────
function parseShopify(raw) {
  if (!raw?.trim()) return {};
  const result = { gross_sales:0, refunds:0, discounts:0, shipping_income:0 };
  raw.split("\n").forEach(line => {
    const low=line.toLowerCase(), nums=line.match(/[\d,]+\.?\d*/g);
    if (!nums) return;
    const val=parseFloat(nums[nums.length-1].replace(/,/g,""))||0;
    if (low.includes("gross sale")||low.includes("total sale")) result.gross_sales=val;
    else if (low.includes("refund")||low.includes("return")) result.refunds=val;
    else if (low.includes("discount")) result.discounts=val;
    else if (low.includes("shipping")&&!low.includes("free")&&!low.includes("carrier")) result.shipping_income=val;
  });
  return Object.fromEntries(Object.entries(result).map(([k,v])=>[k,v||""]));
}

// ─── CLAUDE EXPORT ───────────────────────────────────────────────────────────
function generateClaudeExport(weeks, fixed, extras, mLabel) {
  const fmt=v=>`$${Math.abs(v).toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const pct=(v,b)=>b>0?`${((v/b)*100).toFixed(1)}%`:"0.0%";
  const mc=calcMonthWithExtras(weeks,fixed,extras);
  const grossSales=weeks.reduce((s,w)=>s+n(w.revenue.gross_sales),0);
  const totalDisc=weeks.reduce((s,w)=>s+n(w.revenue.discounts),0);

  let o=`=== P&L ANALYSIS \u2014 ${mLabel} ===\nGenerated: ${new Date().toLocaleDateString("en-AU")}\n\n`;
  o+=`--- MONTHLY SUMMARY ---\n`;
  o+=`Gross Sales: ${fmt(grossSales)} | Discounts: ${fmt(totalDisc)} (${pct(totalDisc,grossSales)} of gross) | Net Revenue: ${fmt(mc.netRevenue)}\n`;
  o+=`Total COGS: ${fmt(mc.totalCOGS)} | Gross Profit: ${fmt(mc.grossProfit)} (${mc.grossMargin.toFixed(1)}%)\n`;
  o+=`Freight: ${fmt(mc.totalFreight)} | Collabs: ${fmt(mc.totalCollabs)} | Wages: ${fmt(mc.totalWages)} | OPEX: ${fmt(mc.totalOPEX)}\n`;
  o+=`Total Expenses: ${fmt(mc.totalExpenses)} | NET PROFIT: ${fmt(mc.netProfit)} (${mc.netMargin.toFixed(1)}%)\n\n`;
  weeks.forEach((w,i)=>{
    const c=mc.weekCalcs[i];
    o+=`--- ${w.label} | ${w.dateRange} ---\n`;
    o+=`  Gross: ${fmt(n(w.revenue.gross_sales))} Refunds: -${fmt(n(w.revenue.refunds))} Discounts: -${fmt(n(w.revenue.discounts))} ShipIncome: +${fmt(n(w.revenue.shipping_income))} PayPal: -${fmt(n(w.revenue.paypal_fees))} => NET: ${fmt(c.netRevenue)}\n`;
    o+=`  COGS: MfgProduct ${fmt(n(w.cogs.manufacturing_product))} | InboundFreight ${fmt(n(w.cogs.manufacturing_shipping))} | Satchels ${n(w.cogs.satchel_count)}@$${w.cogs.satchel_cost_each}=${fmt(c.satchelCost)} | OtherPkg ${fmt(n(w.cogs.other_packaging))} => TOTAL: ${fmt(c.totalCOGS)} | GP: ${fmt(c.grossProfit)} (${c.grossMargin.toFixed(1)}%)\n`;
    o+=`  Freight: AusPost ${fmt(n(w.freight.auspost))} | FedEx ${fmt(n(w.freight.fedex))} | Customs ${fmt(n(w.freight.customs_duties))} => ${fmt(c.totalFreight)}\n`;
    o+=`  Collabs: Ship ${fmt(n(w.collabs.shipping_cost))} | ProdCOGS ${fmt(n(w.collabs.product_cogs))} | Uppromote ${fmt(n(w.collabs.uppromote_commission))} | PaidFees ${fmt(n(w.collabs.paid_collab_fees))} => ${fmt(c.totalCollabs)}\n`;
    o+=`  Wages: ${WAGE_DEPTS.map(d=>`${d.label.split("\u2014")[1]?.trim()||d.label} ${fmt(n(w.wages[d.key]))}`).join(" | ")} => ${fmt(c.totalWages)}\n`;
    const opexLines=ALL_OPEX_KEYS.map(([k,label])=>{const v=w.opex[k]!==""?n(w.opex[k]):(fixed?.fixedKeys?.includes(k)?n(fixed?.values?.[k]):0);return v>0?`${label} ${fmt(v)}`:null;}).filter(Boolean);
    o+=`  OPEX: ${opexLines.join(" | ")||"none"} => ${fmt(c.totalOPEX)}\n`;
    o+=`  NET PROFIT: ${fmt(c.netProfit)} (${c.netMargin.toFixed(1)}%)${w.notes?` | Notes: ${w.notes}`:""}\n\n`;
  });
  if (extras&&mc.extraOpex>0){o+=`--- MONTHLY ADJUSTMENTS ---\n`;ALL_OPEX_KEYS.forEach(([k,label])=>{if(n(extras.opex?.[k])>0)o+=`  ${label}: ${fmt(n(extras.opex[k]))}\n`;});o+=`  Extra OPEX: ${fmt(mc.extraOpex)}\n\n`;}
  o+=`=== END DATA ===\n\nYou are acting as the COO's senior financial advisor for this e-commerce business. Based on the above P&L data, produce a comprehensive written analysis report. This must be a fully written, commercially rigorous report — NOT a dot-point list. Each section must provide deep insight beyond the raw numbers: explain the why, the structural risk, the opportunity, and the precise action required. Write as a professional report for executive review.\n\n`;
  o+=`1. PROFITABILITY VERDICT\nProvide a frank, evidence-based assessment of the business's financial health this period. Is the net margin sustainable and repeatable? How does it compare to e-commerce benchmarks (10-15% net, 40-65% gross)? Is the business in a growth, maintenance, or risk posture? What is driving profitability — and is that driver durable?\n\n`;
  o+=`2. WEEK-ON-WEEK PERFORMANCE TRENDS\nAnalyse each week's revenue, gross margin, and net profit trajectory. Identify patterns and outliers. What does the trend signal about operational consistency and demand stability? Are any weeks anomalous — and if so, what likely caused them?\n\n`;
  o+=`3. MONEY BLEED IDENTIFICATION & RANKING\nFor every cost category, calculate the exact dollar amount and percentage of net revenue. Rank by margin impact. Explain specifically WHY each bleed matters structurally — not just that it is large, but what it represents and what happens if unaddressed over 3-6 months.\n\n`;
  o+=`4. REVENUE QUALITY DEEP DIVE\nAnalyse the discount rate as a percentage of gross sales. What does this level of discounting signal about pricing strategy, promotion dependency, or customer behaviour? What is the refund rate and what might be causing returns? Calculate the true net revenue yield per gross dollar and compare to benchmarks.\n\n`;
  o+=`5. COGS AND GROSS MARGIN ANALYSIS\nAssess manufacturing efficiency and structural soundness of gross margin. What happens to gross margin if volume doubles or halves? Is satchel packaging cost optimised? Are inbound freight costs appropriate? Identify any COGS risks or optimisation opportunities.\n\n`;
  o+=`6. FREIGHT EFFICIENCY & SHIPPING STRATEGY\nBreak down AusPost vs FedEx spend and assess the carrier mix. Calculate the net shipping subsidy per week and annualised. Is the business recovering shipping costs from customers? Recommend a specific, quantified shipping cost recovery strategy.\n\n`;
  o+=`7. COLLABORATION AND INFLUENCER ROI\nFor total collab spend, calculate the minimum revenue that must have been driven to justify costs at 3:1 and 5:1 ROAS thresholds. Assess whether the Uppromote commission structure is sustainable. Are paid collab fees proportionate to the current revenue base? What is the evidence-based recommendation?\n\n`;
  o+=`8. WAGES EFFICIENCY BY DEPARTMENT\nFor each department, calculate wages as % of net revenue. Which departments are at risk relative to output? What is the revenue-per-labour-dollar across total wages? At what revenue level does the current wage structure become unsustainable? What is the recommended restructure if revenue declines 20%?\n\n`;
  o+=`9. OPEX LINE-BY-LINE REVIEW\nFor each OPEX category with a value, assess whether it is justified, benchmarkable, or renegotiable. Flag costs to review, cancel, or restructure. Identify which costs are fixed regardless of revenue and model the net profit impact of a 20% revenue decline with current fixed costs.\n\n`;
  o+=`10. TOP 5 IMMEDIATE ACTIONS\nFive specific, commercially actionable recommendations strictly prioritised by financial impact. Each must include: the exact dollar improvement achievable, the mechanism of change, the implementation timeline, and any trade-off or risk to monitor.\n\n`;
  o+=`11. MARGIN EXPANSION STRATEGY\nBeyond cost-cutting, what structural changes to pricing, product mix, channel strategy, or fulfilment would meaningfully expand margins over the next 90 days? Be specific about what to change and by how much.\n\n`;
  o+=`12. NEXT MONTH TARGETS & PATH FORWARD\nState precisely what the business must achieve next month in dollar terms across each major line. Set specific targets: net revenue, discount rate, freight recovery, wages as % of revenue, net margin. Calculate the minimum revenue required to break even at current cost levels. What is the single most important thing to change?\n\nWrite in full paragraphs throughout. Be commercially direct and evidence-based. Use exact figures from the data. Flag anomalies. This report is for the COO — make it worth reading.`;
  return o;
}

// ─── UI ATOMS ─────────────────────────────────────────────────────────────────
const baseInp = { width:"100%", boxSizing:"border-box", background:S, border:`1px solid ${BR}`, color:TX, padding:"8px 10px", fontFamily:ff, fontSize:14, outline:"none", borderRadius:4 };

function CI({ value, onChange, placeholder="0.00", tint }) {
  return (
    <div style={{position:"relative"}}>
      <span style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",color:MU,fontFamily:ff,fontSize:13,pointerEvents:"none"}}>$</span>
      <input type="number" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        style={{...baseInp, paddingLeft:22, background:tint||S}}
        onFocus={e=>e.target.style.borderColor=A} onBlur={e=>e.target.style.borderColor=BR} />
    </div>
  );
}

function Lbl({c,children}){return <div style={{color:c||MU,fontFamily:ff,fontSize:11,letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>{children}</div>;}
function SH({children}){return <div style={{fontFamily:ff,fontSize:10,letterSpacing:2.5,textTransform:"uppercase",color:A,borderBottom:`1px solid ${BR}`,paddingBottom:7,marginBottom:14,marginTop:26}}>{children}</div>;}

function Badge({label,value,color,small}){
  const col=color||(typeof value==="number"&&value<0?RD:GR);
  return(
    <div style={{background:S2,border:`1px solid ${BR}`,borderRadius:5,padding:small?"9px 13px":"13px 17px",flex:1,minWidth:110}}>
      <Lbl c={MU}>{label}</Lbl>
      <div style={{color:col,fontFamily:ff,fontSize:small?14:18,fontWeight:"bold"}}>
        {typeof value==="number"?`${value<0?"\u2212":""}$${Math.abs(value).toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:2})}`:value}
      </div>
    </div>
  );
}

function Pct({label,value,small}){
  return(
    <div style={{background:S2,border:`1px solid ${BR}`,borderRadius:5,padding:small?"9px 13px":"13px 17px",flex:1,minWidth:90}}>
      <Lbl c={MU}>{label}</Lbl>
      <div style={{color:value>=0?GR:RD,fontFamily:ff,fontSize:small?14:18,fontWeight:"bold"}}>{value.toFixed(1)}%</div>
    </div>
  );
}

function Row({children,gap=10}){return <div style={{display:"flex",gap,flexWrap:"wrap",marginTop:12}}>{children}</div>;}
function Grid({children,cols=2}){return <div style={{display:"grid",gridTemplateColumns:`repeat(${cols},1fr)`,gap:10}}>{children}</div>;}
function Fld({label,children}){return <div><Lbl>{label}</Lbl>{children}</div>;}

const fmtD=v=>`${v<0?"\u2212":""}$${Math.abs(v).toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const fmtS=v=>`${v<0?"\u2212":""}$${Math.abs(v).toLocaleString("en-AU",{minimumFractionDigits:0,maximumFractionDigits:0})}`;

// ─── SHOPIFY IMPORT ───────────────────────────────────────────────────────────
function ShopifyImport({week,onChange}){
  const [raw,setRaw]=useState(week.shopifyRaw||"");
  const [msg,setMsg]=useState("");
  function apply(){
    const parsed=parseShopify(raw);
    const filled=Object.values(parsed).filter(v=>v!=="").length;
    if(!filled){setMsg("No values detected \u2014 check format");return;}
    onChange({...week,shopifyRaw:raw,revenue:{...week.revenue,...parsed}});
    setMsg(`Auto-filled ${filled} revenue fields`);
    setTimeout(()=>setMsg(""),3000);
  }
  return(
    <div style={{background:S2,border:`1px solid ${BR}`,borderRadius:6,padding:"16px 18px",marginBottom:20}}>
      <div style={{fontFamily:ff,fontSize:10,letterSpacing:2,textTransform:"uppercase",color:A,marginBottom:8}}>Shopify Data Import</div>
      <textarea value={raw} onChange={e=>setRaw(e.target.value)} placeholder="Paste Shopify CSV or tab-separated export here..." rows={4}
        style={{width:"100%",boxSizing:"border-box",background:S,border:`1px solid ${BR}`,color:TX,padding:"10px 12px",fontFamily:"monospace",fontSize:12,outline:"none",borderRadius:4,resize:"vertical"}}/>
      <div style={{display:"flex",alignItems:"center",gap:12,marginTop:10}}>
        <button onClick={apply} style={{padding:"8px 18px",background:A,border:"none",color:BG,fontFamily:ff,fontSize:12,cursor:"pointer",borderRadius:4,fontWeight:"bold",letterSpacing:1}}>AUTOFILL FROM DATA</button>
        {msg&&<span style={{fontFamily:ff,fontSize:12,color:msg.includes("No")?RD:GR}}>{msg}</span>}
      </div>
    </div>
  );
}

// ─── WEEK FORM ────────────────────────────────────────────────────────────────
function WeekForm({week,onChange,fixed}){
  const up=section=>(k,v)=>onChange({...week,[section]:{...week[section],[k]:v}});
  const upRev=up("revenue"),upCogs=up("cogs"),upFrt=up("freight"),upCol=up("collabs"),upWage=up("wages"),upOpex=up("opex");
  const c=calcWeek(week,fixed);
  const satchelTotal=n(week.cogs.satchel_count)*n(week.cogs.satchel_cost_each);
  return(
    <div>
      <ShopifyImport week={week} onChange={onChange}/>
      <SH>Revenue &amp; Deductions</SH>
      <Grid>
        <Fld label="Gross Sales"><CI value={week.revenue.gross_sales} onChange={v=>upRev("gross_sales",v)}/></Fld>
        <Fld label="Refunds / Returns"><CI value={week.revenue.refunds} onChange={v=>upRev("refunds",v)}/></Fld>
        <Fld label="Discounts"><CI value={week.revenue.discounts} onChange={v=>upRev("discounts",v)}/></Fld>
        <Fld label="Shipping Income"><CI value={week.revenue.shipping_income} onChange={v=>upRev("shipping_income",v)}/></Fld>
        <Fld label="PayPal Fees"><CI value={week.revenue.paypal_fees} onChange={v=>upRev("paypal_fees",v)}/></Fld>
      </Grid>
      <Row><Badge small label="Net Revenue" value={c.netRevenue} color={A}/></Row>
      <SH>COGS \u2014 Cost of Goods</SH>
      <Grid>
        <Fld label="Manufacturing \u2014 Product COGS"><CI value={week.cogs.manufacturing_product} onChange={v=>upCogs("manufacturing_product",v)}/></Fld>
        <Fld label="Manufacturing Shipping (Inbound Freight)"><CI value={week.cogs.manufacturing_shipping} onChange={v=>upCogs("manufacturing_shipping",v)}/></Fld>
      </Grid>
      <div style={{marginTop:14,background:S2,border:`1px solid ${BR}`,borderRadius:5,padding:"12px 14px"}}>
        <div style={{fontFamily:ff,fontSize:10,letterSpacing:1.5,color:A,textTransform:"uppercase",marginBottom:10}}>Satchel Packaging \u2014 Auto-calculated by Order Count</div>
        <Grid>
          <Fld label="Number of Orders (Satchels)">
            <input type="number" value={week.cogs.satchel_count} onChange={e=>upCogs("satchel_count",e.target.value)} placeholder="0"
              style={baseInp} onFocus={e=>e.target.style.borderColor=A} onBlur={e=>e.target.style.borderColor=BR}/>
          </Fld>
          <Fld label="Cost Per Satchel ($)"><CI value={week.cogs.satchel_cost_each} onChange={v=>upCogs("satchel_cost_each",v)}/></Fld>
        </Grid>
        <div style={{fontFamily:ff,fontSize:13,color:YL,marginTop:8}}>Satchel Total: {fmtD(satchelTotal)}</div>
      </div>
      <div style={{marginTop:10}}><Fld label="Other Packaging"><CI value={week.cogs.other_packaging} onChange={v=>upCogs("other_packaging",v)}/></Fld></div>
      <Row>
        <Badge small label="Total COGS" value={-c.totalCOGS} color={RD}/>
        <Badge small label="Gross Profit" value={c.grossProfit}/>
        <Pct small label="Gross Margin" value={c.grossMargin}/>
      </Row>
      <SH>Customer Shipping / Freight</SH>
      <Grid>
        <Fld label="AusPost"><CI value={week.freight.auspost} onChange={v=>upFrt("auspost",v)}/></Fld>
        <Fld label="FedEx / International"><CI value={week.freight.fedex} onChange={v=>upFrt("fedex",v)}/></Fld>
        <Fld label="Customs &amp; Duties"><CI value={week.freight.customs_duties} onChange={v=>upFrt("customs_duties",v)}/></Fld>
      </Grid>
      <Row><Badge small label="Total Freight" value={-c.totalFreight} color={RD}/></Row>
      <SH>Collaborations / Influencers</SH>
      <div style={{fontFamily:ff,fontSize:11,color:MU,marginBottom:12}}>Full cost breakdown per collaboration \u2014 all component costs included.</div>
      <Grid>
        <Fld label="Shipping Cost (sending product to collab)"><CI value={week.collabs.shipping_cost} onChange={v=>upCol("shipping_cost",v)}/></Fld>
        <Fld label="Product COGS (manufacturer cost of goods sent)"><CI value={week.collabs.product_cogs} onChange={v=>upCol("product_cogs",v)}/></Fld>
        <Fld label="Uppromote Commission (affiliate payout)"><CI value={week.collabs.uppromote_commission} onChange={v=>upCol("uppromote_commission",v)}/></Fld>
        <Fld label="Paid Collaboration Fees"><CI value={week.collabs.paid_collab_fees} onChange={v=>upCol("paid_collab_fees",v)}/></Fld>
      </Grid>
      <Row><Badge small label="Total Collab Cost" value={-c.totalCollabs} color={RD}/></Row>
      <SH>Staff Wages \u2014 By Department</SH>
      <Grid>{WAGE_DEPTS.map(d=><Fld key={d.key} label={d.label}><CI value={week.wages[d.key]} onChange={v=>upWage(d.key,v)}/></Fld>)}</Grid>
      <Row><Badge small label="Total Wages" value={-c.totalWages} color={RD}/></Row>
      <SH>OPEX \u2014 Operating Expenses</SH>
      <div style={{fontFamily:ff,fontSize:11,color:MU,marginBottom:10}}>Fields with a tinted background are pre-filled from Fixed Costs. Enter a value to override for this week.</div>
      <Grid>
        {ALL_OPEX_KEYS.map(([k,label])=>{
          const isFixed=fixed?.fixedKeys?.includes(k);
          const hasFixedVal=isFixed&&n(fixed?.values?.[k])>0;
          const weekHasVal=week.opex[k]!=="";
          const tint=hasFixedVal&&!weekHasVal?"#1c1730":undefined;
          const displayVal=weekHasVal?week.opex[k]:(hasFixedVal?fixed.values[k]:"");
          return(
            <Fld key={k} label={label}>
              <CI value={displayVal} onChange={v=>upOpex(k,v)} tint={tint}/>
            </Fld>
          );
        })}
      </Grid>
      <Row><Badge small label="Total OPEX" value={-c.totalOPEX} color={RD}/></Row>
      <div style={{borderTop:`1px solid ${BR}`,marginTop:24,paddingTop:20}}>
        <div style={{fontFamily:ff,fontSize:10,letterSpacing:2,textTransform:"uppercase",color:A,marginBottom:14}}>Weekly P&amp;L Summary</div>
        <Row>
          <Badge label="Net Revenue" value={c.netRevenue} color={A}/>
          <Badge label="Total Expenses" value={-c.totalExpenses} color={RD}/>
          <Badge label="Net Profit" value={c.netProfit}/>
          <Pct label="Net Margin" value={c.netMargin}/>
        </Row>
      </div>
      <SH>Notes / Context</SH>
      <textarea value={week.notes} onChange={e=>onChange({...week,notes:e.target.value})} placeholder="Unusual costs, one-offs, events, context for this week..." rows={3}
        style={{width:"100%",boxSizing:"border-box",background:S,border:`1px solid ${BR}`,color:TX,padding:"10px 12px",fontFamily:ff,fontSize:14,outline:"none",borderRadius:4,resize:"vertical"}}/>
    </div>
  );
}

// ─── FIXED COSTS PAGE ─────────────────────────────────────────────────────────
function FixedCostsPage({fixed,onChange}){
  const total=Object.values(fixed.values||{}).reduce((s,v)=>s+n(v),0);
  const fixedKeys=fixed.fixedKeys||[];
  const toggleFixed=k=>{
    const newKeys=fixedKeys.includes(k)?fixedKeys.filter(x=>x!==k):[...fixedKeys,k];
    onChange({...fixed,fixedKeys:newKeys});
  };
  return(
    <div>
      <div style={{fontFamily:ff,fontSize:13,color:MU,marginBottom:20,lineHeight:1.8}}>
        Enter recurring costs and mark which ones auto-populate the weekly OPEX fields. Toggle <strong style={{color:A}}>SET FIXED</strong> to enable auto-population for any line.
      </div>
      <SH>Recurring Fixed Costs</SH>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
        {ALL_OPEX_KEYS.map(([k,label])=>{
          const isFixed=fixedKeys.includes(k);
          return(
            <div key={k} style={{background:isFixed?"#1c1730":S2,border:`1px solid ${isFixed?A:BR}`,borderRadius:5,padding:"10px 12px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <Lbl c={isFixed?A:MU}>{label}</Lbl>
                <button onClick={()=>toggleFixed(k)}
                  style={{background:isFixed?A:"transparent",border:`1px solid ${isFixed?A:BR}`,color:isFixed?BG:MU,padding:"2px 8px",fontFamily:ff,fontSize:10,cursor:"pointer",borderRadius:3,letterSpacing:1,whiteSpace:"nowrap"}}>
                  {isFixed?"FIXED \u2713":"SET FIXED"}
                </button>
              </div>
              <CI value={fixed.values?.[k]||""} onChange={v=>onChange({...fixed,values:{...fixed.values,[k]:v}})}/>
            </div>
          );
        })}
      </div>
      <div style={{marginTop:16,padding:"12px 16px",background:S2,border:`1px solid ${BR}`,borderRadius:5}}>
        <span style={{fontFamily:ff,fontSize:13,color:MU}}>Monthly fixed total: </span>
        <span style={{fontFamily:ff,fontSize:15,color:A,fontWeight:"bold"}}>{fmtD(total)}</span>
        <span style={{fontFamily:ff,fontSize:12,color:MU,marginLeft:12}}>({fmtD(total/4.33)} /wk avg)</span>
        <span style={{fontFamily:ff,fontSize:12,color:A,marginLeft:16}}>{fixedKeys.length} items auto-populate weekly</span>
      </div>
    </div>
  );
}

// ─── MONTHLY OVERVIEW ─────────────────────────────────────────────────────────
function MonthlyOverview({weeks,fixed,extras,onExtrasChange,onCopyForClaude,copied}){
  const mc=calcMonthWithExtras(weeks,fixed,extras);
  const [showPart2,setShowPart2]=useState(false);
  const [summaryCopied,setSummaryCopied]=useState(false);

  const copySummary=()=>{
    const fmt=v=>`$${Math.abs(v).toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
    let t=`## Monthly P&L Summary\n\n**Net Revenue:** ${fmt(mc.netRevenue)}\n**Gross Profit:** ${fmt(mc.grossProfit)} (${mc.grossMargin.toFixed(1)}%)\n**Total Expenses:** ${fmt(mc.totalExpenses)}\n**Net Profit:** ${fmt(mc.netProfit)} (${mc.netMargin.toFixed(1)}%)\n\n### Week Breakdown\n\n`;
    weeks.forEach((w,i)=>{const c=mc.weekCalcs[i];t+=`**${w.label}** (${w.dateRange}) \u2014 Rev: ${fmt(c.netRevenue)} | COGS: ${fmt(c.totalCOGS)} | GP: ${c.grossMargin.toFixed(1)}% | Net: ${fmt(c.netProfit)} (${c.netMargin.toFixed(1)}%)\n`;});
    t+=`\n### Expense Summary\n\nCOGS: ${fmt(mc.totalCOGS)} | Freight: ${fmt(mc.totalFreight)} | Collabs: ${fmt(mc.totalCollabs)} | Wages: ${fmt(mc.totalWages)} | OPEX: ${fmt(mc.totalOPEX)}`;
    navigator.clipboard.writeText(t);
    setSummaryCopied(true);
    setTimeout(()=>setSummaryCopied(false),3000);
  };

  return(
    <div>
      <div style={{display:"flex",gap:8,marginBottom:20}}>
        {["PART 1 \u2014 SUMMARY","PART 2 \u2014 MONTHLY ADJUSTMENTS"].map((label,i)=>(
          <button key={i} onClick={()=>setShowPart2(i===1)}
            style={{padding:"8px 16px",background:showPart2===(i===1)?A:"transparent",border:`1px solid ${showPart2===(i===1)?A:BR}`,color:showPart2===(i===1)?BG:MU,fontFamily:ff,fontSize:11,cursor:"pointer",borderRadius:4,letterSpacing:1}}>
            {label}
          </button>
        ))}
      </div>

      {!showPart2&&(
        <div>
          <SH>Monthly P&amp;L Summary</SH>
          <Row>
            <Badge label="Net Revenue" value={mc.netRevenue} color={A}/>
            <Badge label="Gross Profit" value={mc.grossProfit}/>
            <Badge label="Total Expenses" value={-mc.totalExpenses} color={RD}/>
            <Badge label="Net Profit" value={mc.netProfit}/>
          </Row>
          <Row><Pct label="Gross Margin" value={mc.grossMargin}/><Pct label="Net Margin" value={mc.netMargin}/></Row>
          <SH>Week by Week</SH>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontFamily:ff,fontSize:13}}>
              <thead>
                <tr style={{borderBottom:`1px solid ${BR}`}}>
                  {["Week","Date Range","Revenue","COGS","Gross","GP%","Freight","Wages","OPEX","Net Profit","NP%"].map(h=>(
                    <th key={h} style={{padding:"8px 10px",color:MU,fontWeight:"normal",fontSize:10,letterSpacing:1,textTransform:"uppercase",textAlign:"right",whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weeks.map((w,i)=>{
                  const c=mc.weekCalcs[i];
                  return(
                    <tr key={i} style={{borderBottom:`1px solid ${BR}22`}}>
                      <td style={{padding:"10px",color:TX}}>{w.label}</td>
                      <td style={{padding:"10px",color:MU,fontSize:11,whiteSpace:"nowrap"}}>{w.dateRange}</td>
                      <td style={{padding:"10px",color:A,textAlign:"right"}}>{fmtD(c.netRevenue)}</td>
                      <td style={{padding:"10px",color:RD,textAlign:"right"}}>{fmtD(-c.totalCOGS)}</td>
                      <td style={{padding:"10px",color:c.grossProfit>=0?GR:RD,textAlign:"right"}}>{fmtD(c.grossProfit)}</td>
                      <td style={{padding:"10px",color:c.grossMargin>=0?GR:RD,textAlign:"right"}}>{c.grossMargin.toFixed(1)}%</td>
                      <td style={{padding:"10px",color:RD,textAlign:"right"}}>{fmtD(-c.totalFreight)}</td>
                      <td style={{padding:"10px",color:RD,textAlign:"right"}}>{fmtD(-c.totalWages)}</td>
                      <td style={{padding:"10px",color:RD,textAlign:"right"}}>{fmtD(-c.totalOPEX)}</td>
                      <td style={{padding:"10px",color:c.netProfit>=0?GR:RD,textAlign:"right",fontWeight:"bold"}}>{fmtD(c.netProfit)}</td>
                      <td style={{padding:"10px",color:c.netMargin>=0?GR:RD,textAlign:"right"}}>{c.netMargin.toFixed(1)}%</td>
                    </tr>
                  );
                })}
                <tr style={{borderTop:`2px solid ${BR}`,background:S2}}>
                  <td style={{padding:"10px",color:A,fontWeight:"bold"}}>TOTAL</td>
                  <td style={{padding:"10px"}}></td>
                  <td style={{padding:"10px",color:A,fontWeight:"bold",textAlign:"right"}}>{fmtD(mc.netRevenue)}</td>
                  <td style={{padding:"10px",color:RD,fontWeight:"bold",textAlign:"right"}}>{fmtD(-mc.totalCOGS)}</td>
                  <td style={{padding:"10px",color:mc.grossProfit>=0?GR:RD,fontWeight:"bold",textAlign:"right"}}>{fmtD(mc.grossProfit)}</td>
                  <td style={{padding:"10px",color:mc.grossMargin>=0?GR:RD,fontWeight:"bold",textAlign:"right"}}>{mc.grossMargin.toFixed(1)}%</td>
                  <td style={{padding:"10px",color:RD,fontWeight:"bold",textAlign:"right"}}>{fmtD(-mc.totalFreight)}</td>
                  <td style={{padding:"10px",color:RD,fontWeight:"bold",textAlign:"right"}}>{fmtD(-mc.totalWages)}</td>
                  <td style={{padding:"10px",color:RD,fontWeight:"bold",textAlign:"right"}}>{fmtD(-mc.totalOPEX)}</td>
                  <td style={{padding:"10px",color:mc.netProfit>=0?GR:RD,fontWeight:"bold",textAlign:"right"}}>{fmtD(mc.netProfit)}</td>
                  <td style={{padding:"10px",color:mc.netMargin>=0?GR:RD,fontWeight:"bold",textAlign:"right"}}>{mc.netMargin.toFixed(1)}%</td>
                </tr>
              </tbody>
            </table>
          </div>
          <SH>Expense Breakdown</SH>
          {[["COGS",mc.totalCOGS,"#ff9ecd"],["Freight",mc.totalFreight,RD],["Collabs",mc.totalCollabs,YL],["Wages",mc.totalWages,"#e0a0ff"],["OPEX",mc.totalOPEX,A]].map(([label,val,color])=>(
            <div key={label} style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",fontFamily:ff,fontSize:12,marginBottom:4}}>
                <span style={{color:TX}}>{label}</span>
                <span style={{color:RD}}>{fmtD(-val)} ({mc.totalExpenses>0?((val/mc.totalExpenses)*100).toFixed(1):0}% of expenses)</span>
              </div>
              <div style={{background:S2,borderRadius:3,height:7,overflow:"hidden"}}>
                <div style={{background:color,height:"100%",width:`${mc.totalExpenses>0?Math.min((val/mc.totalExpenses)*100,100):0}%`,borderRadius:3}}/>
              </div>
            </div>
          ))}
          <div style={{display:"flex",gap:10,marginTop:24}}>
            <button onClick={onCopyForClaude}
              style={{flex:1,padding:"13px 0",background:"transparent",border:`1px solid ${A}`,color:A,fontFamily:ff,fontSize:12,cursor:"pointer",borderRadius:4,letterSpacing:1.5,textTransform:"uppercase"}}>
              {copied?"Copied!":"Export for Claude Analysis"}
              <div style={{fontSize:9,color:MU,marginTop:2}}>paste into claude for deep insights</div>
            </button>
            <button onClick={copySummary}
              style={{flex:1,padding:"13px 0",background:S2,border:`1px solid ${BR}`,color:TX,fontFamily:ff,fontSize:12,cursor:"pointer",borderRadius:4,letterSpacing:1.5,textTransform:"uppercase"}}>
              {summaryCopied?"Copied!":"Generate Monthly Summary"}
              <div style={{fontSize:9,color:MU,marginTop:2}}>copy for notion / export</div>
            </button>
          </div>
        </div>
      )}

      {showPart2&&(
        <div>
          <div style={{fontFamily:ff,fontSize:13,color:MU,marginBottom:20,lineHeight:1.8}}>
            Enter costs billed monthly that are not captured in weekly inputs (e.g. annual subscriptions, phone bills, quarterly fees). These are added directly to the monthly total.
          </div>
          <SH>Monthly-Only Adjustments</SH>
          <Grid>
            {ALL_OPEX_KEYS.map(([k,label])=>(
              <Fld key={k} label={label}>
                <CI value={extras?.opex?.[k]||""} onChange={v=>onExtrasChange({...extras,opex:{...extras?.opex,[k]:v}})}/>
              </Fld>
            ))}
          </Grid>
          <Row><Badge small label="Monthly Adjustment Total" value={-mc.extraOpex} color={RD}/></Row>
          <SH>Notes</SH>
          <textarea value={extras?.notes||""} onChange={e=>onExtrasChange({...extras,notes:e.target.value})} placeholder="Monthly context, one-off costs, adjustments..." rows={3}
            style={{width:"100%",boxSizing:"border-box",background:S,border:`1px solid ${BR}`,color:TX,padding:"10px 12px",fontFamily:ff,fontSize:14,outline:"none",borderRadius:4,resize:"vertical"}}/>
          <div style={{marginTop:20,padding:"14px 16px",background:S2,border:`1px solid ${BR}`,borderRadius:5}}>
            <div style={{fontFamily:ff,fontSize:11,color:MU,marginBottom:8,letterSpacing:1,textTransform:"uppercase"}}>Adjusted Monthly Total (Part 1 + Part 2)</div>
            <Row>
              <Badge small label="Net Revenue" value={mc.netRevenue} color={A}/>
              <Badge small label="Total Expenses" value={-mc.totalExpenses} color={RD}/>
              <Badge small label="Net Profit" value={mc.netProfit}/>
              <Pct small label="Net Margin" value={mc.netMargin}/>
            </Row>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── VISUALISE ────────────────────────────────────────────────────────────────
function VisualisePage({weeks,fixed}){
  const [chart,setChart]=useState("profit");
  const [period,setPeriod]=useState("all");
  const calcs=weeks.map(w=>calcWeek(w,fixed));
  const fc=period==="all"?calcs:[calcs[parseInt(period)]];
  const fw=period==="all"?weeks:[weeks[parseInt(period)]];
  const CHARTS=[
    {id:"profit",label:"Profit / Loss Overview"},
    {id:"revenue_waterfall",label:"Revenue Waterfall"},
    {id:"expenses",label:"Expense Breakdown"},
    {id:"margins",label:"Margin Trends"},
    {id:"wages",label:"Wages by Department"},
    {id:"freight",label:"Freight Split"},
    {id:"collabs",label:"Collab Breakdown"},
    {id:"revenue_vs_cost",label:"Revenue vs Cost Trend"},
    {id:"cogs",label:"COGS Breakdown"},
  ];

  function SVGBars({metric,color,label,suffix=""}){
    const vals=calcs.map(c=>c[metric]);
    const max=Math.max(...vals.map(Math.abs),1);
    const H=120,W=Math.floor(500/Math.max(weeks.length,1));
    return(
      <div style={{marginBottom:28}}>
        <div style={{fontFamily:ff,fontSize:10,letterSpacing:1.5,color:MU,textTransform:"uppercase",marginBottom:8}}>{label}</div>
        <svg width="100%" viewBox={`0 0 500 ${H+44}`} style={{display:"block"}}>
          {vals.map((v,i)=>{
            const bH=Math.max((Math.abs(v)/max)*H,2);
            const x=i*W+4,y=H-bH;
            const col=color||(v>=0?GR:RD);
            return(
              <g key={i}>
                <rect x={x} y={y} width={W-8} height={bH} fill={col} opacity={0.85} rx={2}/>
                <text x={x+(W-8)/2} y={y-5} fill={col} fontSize={9} textAnchor="middle" fontFamily={ff}>{Math.abs(v)>=1000?fmtS(v):fmtD(v)}{suffix}</text>
                <text x={x+(W-8)/2} y={H+16} fill={MU} fontSize={9} textAnchor="middle" fontFamily={ff}>{w=>w?.label?.replace("Week ","W")||`W${i+1}`}(weeks[i])</text>
                <text x={x+(W-8)/2} y={H+28} fill={MU} fontSize={8} textAnchor="middle" fontFamily={ff}>{weeks[i]?.dateRange?.split("\u2013")[0]?.trim()||""}</text>
              </g>
            );
          })}
          <line x1={0} y1={H} x2={500} y2={H} stroke={BR} strokeWidth={1}/>
        </svg>
      </div>
    );
  }

  function HBar({data,maxVal}){
    return(
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {data.map(({label,value,color},i)=>(
          <div key={i}>
            <div style={{display:"flex",justifyContent:"space-between",fontFamily:ff,fontSize:12,marginBottom:5}}>
              <span style={{color:TX}}>{label}</span>
              <span style={{color:color||A}}>{fmtD(value)}{maxVal>0&&<span style={{color:MU,fontSize:10,marginLeft:6}}>({((Math.abs(value)/maxVal)*100).toFixed(1)}%)</span>}</span>
            </div>
            <div style={{background:S2,borderRadius:3,height:22,overflow:"hidden"}}>
              <div style={{background:color||A,height:"100%",borderRadius:3,width:`${maxVal>0?Math.min((Math.abs(value)/maxVal)*100,100):0}%`,transition:"width 0.4s"}}/>
            </div>
          </div>
        ))}
      </div>
    );
  }

  function LineChart({series,label}){
    const allVals=series.flatMap(s=>s.data);
    const min=Math.min(...allVals,0),max=Math.max(...allVals,1);
    const H=160,PAD=40,W=500;
    const xStep=weeks.length>1?(W-PAD*2)/(weeks.length-1):W-PAD*2;
    const yS=v=>H-PAD-((v-min)/(max-min||1))*(H-PAD*2);
    return(
      <div style={{marginBottom:28}}>
        <div style={{fontFamily:ff,fontSize:10,letterSpacing:1.5,color:MU,textTransform:"uppercase",marginBottom:8}}>{label}</div>
        <svg width="100%" viewBox={`0 0 ${W} ${H+20}`} style={{display:"block"}}>
          {[0,0.25,0.5,0.75,1].map((p,i)=><line key={i} x1={PAD} y1={PAD+p*(H-PAD*2)} x2={W-PAD} y2={PAD+p*(H-PAD*2)} stroke={BR} strokeWidth={0.5}/>)}
          <line x1={PAD} y1={yS(0)} x2={W-PAD} y2={yS(0)} stroke={MU} strokeWidth={1} strokeDasharray="4,4"/>
          {series.map((s,si)=>{
            const pts=s.data.map((v,i)=>`${PAD+i*xStep},${yS(v)}`).join(" ");
            return(
              <g key={si}>
                <polyline points={pts} fill="none" stroke={s.color} strokeWidth={2.5}/>
                {s.data.map((v,i)=>(
                  <g key={i}>
                    <circle cx={PAD+i*xStep} cy={yS(v)} r={4} fill={s.color}/>
                    <text x={PAD+i*xStep} y={yS(v)-9} fill={s.color} fontSize={9} textAnchor="middle" fontFamily={ff}>{typeof v==="number"&&Math.abs(v)<1000?v.toFixed(1):fmtS(v)}{s.suffix||""}</text>
                  </g>
                ))}
              </g>
            );
          })}
          {weeks.map((w,i)=>(
            <text key={i} x={PAD+i*xStep} y={H+14} fill={MU} fontSize={8} textAnchor="middle" fontFamily={ff}>{w.label?.replace("Week ","W")||`W${i+1}`}</text>
          ))}
          {series.map((s,i)=>(
            <g key={i}>
              <rect x={PAD+i*90} y={4} width={10} height={4} fill={s.color} rx={1}/>
              <text x={PAD+i*90+14} y={10} fill={s.color} fontSize={9} fontFamily={ff}>{s.label}</text>
            </g>
          ))}
        </svg>
      </div>
    );
  }

  const tRev=fc.reduce((s,c)=>s+c.netRevenue,0),tExp=fc.reduce((s,c)=>s+c.totalExpenses,0),tNet=fc.reduce((s,c)=>s+c.netProfit,0);
  return(
    <div>
      <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:20,alignItems:"flex-end"}}>
        <div>
          <Lbl>Chart Type</Lbl>
          <select value={chart} onChange={e=>setChart(e.target.value)}
            style={{background:S2,border:`1px solid ${BR}`,color:TX,padding:"9px 12px",fontFamily:ff,fontSize:13,outline:"none",borderRadius:4}}>
            {CHARTS.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <Lbl>Period</Lbl>
          <select value={period} onChange={e=>setPeriod(e.target.value)}
            style={{background:S2,border:`1px solid ${BR}`,color:TX,padding:"9px 12px",fontFamily:ff,fontSize:13,outline:"none",borderRadius:4}}>
            <option value="all">All Weeks</option>
            {weeks.map((w,i)=><option key={i} value={i}>{w.label||`Week ${i+1}`}</option>)}
          </select>
        </div>
      </div>
      <Row>
        <Badge label="Revenue" value={tRev} color={A}/>
        <Badge label="Total Expenses" value={-tExp} color={RD}/>
        <Badge label="Net Profit" value={tNet}/>
        <Pct label="Net Margin" value={tRev>0?(tNet/tRev)*100:0}/>
      </Row>
      <div style={{marginTop:32}}>
        {chart==="profit"&&<div><SH>Profit / Loss \u2014 Week by Week</SH><SVGBars metric="netRevenue" color={A} label="Net Revenue"/><SVGBars metric="totalExpenses" color={RD} label="Total Expenses"/><SVGBars metric="netProfit" label="Net Profit / Loss"/></div>}
        {chart==="revenue_waterfall"&&(()=>{
          const gross=fw.reduce((s,w)=>s+n(w.revenue.gross_sales),0),ref=fw.reduce((s,w)=>s+n(w.revenue.refunds),0);
          const disc=fw.reduce((s,w)=>s+n(w.revenue.discounts),0),shi=fw.reduce((s,w)=>s+n(w.revenue.shipping_income),0);
          const pp=fw.reduce((s,w)=>s+n(w.revenue.paypal_fees),0);
          return <div><SH>Revenue Waterfall</SH><HBar maxVal={gross} data={[{label:"Gross Sales",value:gross,color:GR},{label:"Less: Discounts",value:disc,color:RD},{label:"Less: Refunds",value:ref,color:RD},{label:"Add: Shipping Income",value:shi,color:YL},{label:"Less: PayPal Fees",value:pp,color:"#888"},{label:"NET REVENUE",value:gross-ref-disc+shi-pp,color:A}]}/></div>;
        })()}
        {chart==="expenses"&&<div><SH>Expense Breakdown</SH><HBar maxVal={tExp} data={[{label:"COGS",value:fc.reduce((s,c)=>s+c.totalCOGS,0),color:"#ff9ecd"},{label:"Freight",value:fc.reduce((s,c)=>s+c.totalFreight,0),color:RD},{label:"Collabs",value:fc.reduce((s,c)=>s+c.totalCollabs,0),color:YL},{label:"Wages",value:fc.reduce((s,c)=>s+c.totalWages,0),color:"#e0a0ff"},{label:"OPEX",value:fc.reduce((s,c)=>s+c.totalOPEX,0),color:A}]}/></div>}
        {chart==="margins"&&<div><SH>Margin Trends</SH><LineChart label="Gross &amp; Net Margin %" series={[{label:"Gross Margin",data:calcs.map(c=>c.grossMargin),color:YL,suffix:"%"},{label:"Net Margin",data:calcs.map(c=>c.netMargin),color:GR,suffix:"%"}]}/></div>}
        {chart==="wages"&&(()=>{
          const data=WAGE_DEPTS.map(d=>({label:d.label,value:fw.reduce((s,w)=>s+n(w.wages[d.key]),0),color:A}));
          const mx=Math.max(...data.map(d=>d.value),1);
          return<div><SH>Wages by Department</SH><HBar maxVal={mx} data={data}/><div style={{marginTop:14,padding:"10px 14px",background:S2,border:`1px solid ${BR}`,borderRadius:5,fontFamily:ff,fontSize:13}}>Total: <span style={{color:RD}}>{fmtD(data.reduce((s,d)=>s+d.value,0))}</span>{tRev>0&&<span style={{color:MU,marginLeft:12}}>({((data.reduce((s,d)=>s+d.value,0)/tRev)*100).toFixed(1)}% of revenue)</span>}</div></div>;
        })()}
        {chart==="freight"&&(()=>{
          const aus=fw.reduce((s,w)=>s+n(w.freight.auspost),0),fedx=fw.reduce((s,w)=>s+n(w.freight.fedex),0),cust=fw.reduce((s,w)=>s+n(w.freight.customs_duties),0);
          return<div><SH>Freight Split</SH><HBar maxVal={Math.max(aus,fedx,cust,1)} data={[{label:"AusPost",value:aus,color:YL},{label:"FedEx / International",value:fedx,color:RD},{label:"Customs & Duties",value:cust,color:"#aaa"}]}/></div>;
        })()}
        {chart==="collabs"&&(()=>{
          const ship=fw.reduce((s,w)=>s+n(w.collabs.shipping_cost),0),prod=fw.reduce((s,w)=>s+n(w.collabs.product_cogs),0);
          const comm=fw.reduce((s,w)=>s+n(w.collabs.uppromote_commission),0),paid=fw.reduce((s,w)=>s+n(w.collabs.paid_collab_fees),0);
          return<div><SH>Collab Cost Breakdown</SH><HBar maxVal={Math.max(ship,prod,comm,paid,1)} data={[{label:"Shipping to Collab",value:ship,color:A},{label:"Product COGS",value:prod,color:YL},{label:"Uppromote Commission",value:comm,color:GR},{label:"Paid Collab Fees",value:paid,color:RD}]}/></div>;
        })()}
        {chart==="revenue_vs_cost"&&<div><SH>Revenue vs Costs Trend</SH><LineChart label="Weekly Revenue, Costs &amp; Profit" series={[{label:"Net Revenue",data:calcs.map(c=>c.netRevenue),color:A},{label:"Total Expenses",data:calcs.map(c=>c.totalExpenses),color:RD},{label:"Net Profit",data:calcs.map(c=>c.netProfit),color:GR}]}/></div>}
        {chart==="cogs"&&(()=>{
          const mfgP=fw.reduce((s,w)=>s+n(w.cogs.manufacturing_product),0),mfgS=fw.reduce((s,w)=>s+n(w.cogs.manufacturing_shipping),0);
          const satch=fw.reduce((s,w)=>s+n(w.cogs.satchel_count)*n(w.cogs.satchel_cost_each),0),other=fw.reduce((s,w)=>s+n(w.cogs.other_packaging),0);
          return<div><SH>COGS Breakdown</SH><HBar maxVal={Math.max(mfgP,mfgS,satch,other,1)} data={[{label:"Manufacturing \u2014 Product",value:mfgP,color:"#ff9ecd"},{label:"Inbound Freight",value:mfgS,color:RD},{label:"Satchel Packaging",value:satch,color:YL},{label:"Other Packaging",value:other,color:"#aaa"}]}/></div>;
        })()}
      </div>
    </div>
  );
}

// ─── REPORTS PAGE ─────────────────────────────────────────────────────────────
function ReportsPage({monthData,fixed,onCopyForClaude}){
  const [expanded,setExpanded]=useState(null);
  const [menu,setMenu]=useState(null);
  const [copied,setCopied]=useState(null);
  const menuRef=useRef(null);
  useEffect(()=>{
    function close(e){if(menuRef.current&&!menuRef.current.contains(e.target))setMenu(null);}
    document.addEventListener("mousedown",close);
    return()=>document.removeEventListener("mousedown",close);
  },[]);
  const allMonths=Object.keys(monthData).sort().reverse();
  if(!allMonths.length)return(
    <div style={{textAlign:"center",padding:"60px 20px",color:MU,fontFamily:ff}}>
      <div style={{fontSize:28,marginBottom:12,opacity:0.3}}>\u2014</div>
      <div>No saved data yet.</div>
      <div style={{fontSize:13,marginTop:8}}>Data saves automatically as you enter it each week.</div>
    </div>
  );
  return(
    <div>
      <SH>All Months ({allMonths.length})</SH>
      {allMonths.map(key=>{
        const md=monthData[key]||{};
        const weeks=md.weeks||[];
        const extras=md.extras||emptyMonthExtras();
        const mc=calcMonthWithExtras(weeks,fixed,extras);
        const isOpen=expanded===key;
        const mLabel=md.label||key;
        return(
          <div key={key} style={{border:`1px solid ${BR}`,borderRadius:6,marginBottom:10,overflow:"visible"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px",background:isOpen?S2:"transparent",borderRadius:isOpen?"6px 6px 0 0":"6px"}}>
              <div onClick={()=>setExpanded(isOpen?null:key)} style={{flex:1,cursor:"pointer"}}>
                <div style={{fontFamily:ff,fontSize:15,color:TX}}>{mLabel}</div>
                <div style={{fontFamily:ff,fontSize:11,color:MU,marginTop:2}}>{weeks.length} weeks \u00b7 Last saved: {md.lastSaved||"\u2014"}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{fontFamily:ff,fontSize:14,color:mc.netProfit>=0?GR:RD}}>{fmtD(mc.netProfit)}</div>
                <div style={{fontFamily:ff,fontSize:11,color:MU}}>{mc.netMargin.toFixed(1)}% NM</div>
                <div style={{position:"relative"}} ref={menu===key?menuRef:null}>
                  <button onClick={e=>{e.stopPropagation();setMenu(menu===key?null:key);}}
                    style={{background:"transparent",border:`1px solid ${BR}`,color:MU,padding:"4px 10px",fontFamily:ff,fontSize:18,cursor:"pointer",borderRadius:4,lineHeight:1,letterSpacing:2}}>\u22ef</button>
                  {menu===key&&(
                    <div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:S2,border:`1px solid ${BR}`,borderRadius:6,zIndex:200,minWidth:190,overflow:"hidden",boxShadow:"0 8px 24px #00000088"}}>
                      {[
                        {label:copied===key?"Copied!":"Export for Claude",action:()=>{onCopyForClaude(weeks,extras,mLabel);setCopied(key);setTimeout(()=>setCopied(null),3000);setMenu(null);}},
                        {label:"Copy Summary for Notion",action:()=>{
                          const fmt=v=>`$${Math.abs(v).toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
                          let t=`## ${mLabel}\n\nNet Revenue: ${fmt(mc.netRevenue)}\nGross Profit: ${fmt(mc.grossProfit)} (${mc.grossMargin.toFixed(1)}%)\nTotal Expenses: ${fmt(mc.totalExpenses)}\nNet Profit: ${fmt(mc.netProfit)} (${mc.netMargin.toFixed(1)}%)\n\n`;
                          weeks.forEach((w,i)=>{const c=mc.weekCalcs[i];t+=`${w.label}: Rev ${fmt(c.netRevenue)} | Net ${fmt(c.netProfit)} (${c.netMargin.toFixed(1)}%)\n`;});
                          navigator.clipboard.writeText(t);setMenu(null);
                        }},
                      ].map(item=>(
                        <button key={item.label} onClick={item.action}
                          style={{display:"block",width:"100%",padding:"10px 16px",background:"transparent",border:"none",color:TX,fontFamily:ff,fontSize:13,cursor:"pointer",textAlign:"left"}}
                          onMouseEnter={e=>e.target.style.background=BR} onMouseLeave={e=>e.target.style.background="transparent"}>
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={()=>setExpanded(isOpen?null:key)} style={{background:"transparent",border:"none",color:MU,fontSize:20,cursor:"pointer",lineHeight:1}}>{isOpen?"\u2212":"+"}</button>
              </div>
            </div>
            {isOpen&&(
              <div style={{padding:"20px 18px",borderTop:`1px solid ${BR}`,background:S}}>
                <Row>
                  <Badge small label="Revenue" value={mc.netRevenue} color={A}/>
                  <Badge small label="Gross Profit" value={mc.grossProfit}/>
                  <Badge small label="Total Expenses" value={-mc.totalExpenses} color={RD}/>
                  <Badge small label="Net Profit" value={mc.netProfit}/>
                </Row>
                <div style={{marginTop:14}}>
                  {weeks.map((w,wi)=>{
                    const c=mc.weekCalcs[wi];
                    return(
                      <div key={wi} style={{display:"flex",justifyContent:"space-between",padding:"9px 12px",background:S2,borderRadius:4,border:`1px solid ${BR}`,marginBottom:6}}>
                        <span style={{fontFamily:ff,fontSize:13,color:TX}}>{w.label} \u2014 {w.dateRange}</span>
                        <div>
                          <span style={{fontFamily:ff,fontSize:13,color:c.netProfit>=0?GR:RD}}>Net: {fmtD(c.netProfit)}</span>
                          <span style={{fontFamily:ff,fontSize:11,color:MU,marginLeft:12}}>GP: {c.grossMargin.toFixed(1)}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── PASSWORD ─────────────────────────────────────────────────────────────────
function PasswordScreen({onAuth}){
  const [pw,setPw]=useState(""),[ err,setErr]=useState(false);
  const check=()=>{
    if(!PASSWORD||pw===PASSWORD){onAuth();}
    else{setErr(true);setTimeout(()=>setErr(false),1400);}
  };
  return(
    <div style={{minHeight:"100vh",background:BG,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:ff}}>
      <div style={{textAlign:"center",marginBottom:52}}>
        <div style={{fontSize:9,letterSpacing:6,color:MU,textTransform:"uppercase",marginBottom:14}}>Finance Operations</div>
        <div style={{fontSize:30,letterSpacing:5,color:TX,textTransform:"uppercase",fontWeight:"normal"}}>P&amp;L Dashboard</div>
        <div style={{width:36,height:1,background:A,margin:"18px auto 0"}}/>
      </div>
      <div style={{width:290}}>
        <input type="password" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&check()}
          placeholder="PASSWORD" autoFocus
          style={{width:"100%",boxSizing:"border-box",background:"transparent",border:`1px solid ${err?RD:BR}`,color:TX,padding:"14px 16px",fontFamily:ff,fontSize:13,outline:"none",borderRadius:2,letterSpacing:4,textAlign:"center",marginBottom:10,transition:"border-color 0.2s"}}/>
        {err&&<div style={{color:RD,fontSize:10,textAlign:"center",letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Incorrect Password</div>}
        <button onClick={check}
          style={{width:"100%",padding:"13px 0",background:"transparent",border:`1px solid ${A}`,color:A,fontFamily:ff,fontSize:11,cursor:"pointer",borderRadius:2,letterSpacing:5,textTransform:"uppercase"}}
          onMouseEnter={e=>{e.target.style.background=A;e.target.style.color=BG;}}
          onMouseLeave={e=>{e.target.style.background="transparent";e.target.style.color=A;}}>
          Enter
        </button>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App(){
  const [authed,setAuthed]=useState(!PASSWORD);
  const [tab,setTab]=useState("input");
  const [loading,setLoading]=useState(false);
  const [saveMsg,setSaveMsg]=useState("");
  const [copied,setCopied]=useState(false);

  const availableMonths=getAvailableMonths();
  const now=new Date();
  const initIdx=availableMonths.findIndex(m=>m.year===now.getFullYear()&&m.month===now.getMonth());
  const [selIdx,setSelIdx]=useState(initIdx>=0?initIdx:availableMonths.length-1);
  const selMonth=availableMonths[selIdx];

  const [monthData,setMonthData]=useState({});
  const [fixed,setFixed]=useState(emptyFixed());
  const [activeWeek,setActiveWeek]=useState(0);

  useEffect(()=>{
    if(!authed)return;
    setLoading(true);
    loadAll().then(({monthData:md,fixed:f})=>{setMonthData(md||{});setFixed(f||emptyFixed());setLoading(false);});
  },[authed]);

  const saveTimer=useRef(null);
  const autoSave=useCallback((md,fx)=>{
    if(saveTimer.current)clearTimeout(saveTimer.current);
    saveTimer.current=setTimeout(async()=>{
      await saveAll(md,fx);
      setSaveMsg("\u00b7 Saved");
      setTimeout(()=>setSaveMsg(""),2000);
    },1200);
  },[]);

  const curKey=selMonth?.key;
  const curMonthEntry=monthData[curKey];
  const curWeeks=curMonthEntry?.weeks||(()=>{
    const wd=getMonthWeeks(selMonth.year,selMonth.month);
    return wd.map(d=>emptyWeek(d.weekNum,d.dateRange,d.label));
  })();
  const curExtras=curMonthEntry?.extras||emptyMonthExtras();

  const updateWeeks=newWeeks=>{
    const updated={...monthData,[curKey]:{...curMonthEntry,weeks:newWeeks,label:selMonth.label,lastSaved:new Date().toLocaleString("en-AU"),extras:curExtras}};
    setMonthData(updated);
    autoSave(updated,fixed);
  };

  const updateExtras=newExtras=>{
    const updated={...monthData,[curKey]:{...curMonthEntry,weeks:curWeeks,extras:newExtras,label:selMonth.label,lastSaved:new Date().toLocaleString("en-AU")}};
    setMonthData(updated);
    autoSave(updated,fixed);
  };

  const updateFixed=async newFixed=>{
    setFixed(newFixed);
    await saveAll(monthData,newFixed);
    setSaveMsg("\u00b7 Fixed costs saved");
    setTimeout(()=>setSaveMsg(""),2000);
  };

  const handleCopyForClaude=(weeksData=curWeeks,extras=curExtras,label=selMonth?.label)=>{
    navigator.clipboard.writeText(generateClaudeExport(weeksData,fixed,extras,label));
    setCopied(true);
    setTimeout(()=>setCopied(false),3000);
  };

  const calcs=curWeeks.map(w=>calcWeek(w,fixed));
  const mc=calcMonthWithExtras(curWeeks,fixed,curExtras);

  if(!authed)return <PasswordScreen onAuth={()=>setAuthed(true)}/>;

  const TABS=[
    {id:"input",label:"WEEKLY INPUT"},
    {id:"overview",label:"MONTHLY OVERVIEW"},
    {id:"visualise",label:"VISUALISE"},
    {id:"fixed",label:"FIXED COSTS"},
    {id:"reports",label:`REPORTS (${Object.keys(monthData).length})`},
  ];

  return(
    <div style={{minHeight:"100vh",background:BG,color:TX,fontFamily:ff}}>
      <div style={{borderBottom:`1px solid ${BR}`,padding:"0 32px"}}>
        <div style={{maxWidth:1200,margin:"0 auto",padding:"22px 0 0"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",flexWrap:"wrap",gap:12}}>
            <div>
              <div style={{color:A,fontSize:9,letterSpacing:4,textTransform:"uppercase",marginBottom:4}}>Finance Operations</div>
              <h1 style={{margin:0,fontSize:24,fontWeight:"normal",letterSpacing:2,color:TX,textTransform:"uppercase"}}>P&amp;L Dashboard</h1>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
              <select value={selIdx} onChange={e=>{setSelIdx(parseInt(e.target.value));setActiveWeek(0);}}
                style={{background:S2,border:`1px solid ${BR}`,color:TX,padding:"7px 12px",fontFamily:ff,fontSize:13,outline:"none",borderRadius:4,minWidth:170}}>
                {availableMonths.map((m,i)=><option key={m.key} value={i}>{m.label}</option>)}
              </select>
              <div style={{background:S2,border:`1px solid ${BR}`,borderRadius:4,padding:"7px 12px",fontSize:13,color:mc.netProfit>=0?GR:RD,fontFamily:ff}}>
                MTD: {fmtD(mc.netProfit)}
              </div>
              {saveMsg&&<div style={{fontFamily:ff,fontSize:11,color:GR,letterSpacing:1}}>{saveMsg}</div>}
            </div>
          </div>
          <div style={{display:"flex",gap:0,marginTop:18}}>
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)}
                style={{padding:"10px 18px",background:"transparent",border:"none",borderBottom:tab===t.id?`2px solid ${A}`:"2px solid transparent",color:tab===t.id?A:MU,fontFamily:ff,fontSize:12,cursor:"pointer",letterSpacing:1.5,marginBottom:-1,textTransform:"uppercase"}}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{maxWidth:1200,margin:"0 auto",padding:"28px 32px"}}>
        {loading&&<div style={{textAlign:"center",color:MU,padding:40,fontFamily:ff}}>Loading...</div>}

        {tab==="input"&&!loading&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12,marginBottom:20}}>
              <div style={{fontFamily:ff,fontSize:11,color:MU,letterSpacing:1}}>{selMonth?.label} \u2014 weeks auto-dated Mon\u2013Sun</div>
              <button onClick={()=>handleCopyForClaude()}
                style={{padding:"9px 16px",background:"transparent",border:`1px solid ${A}`,color:A,fontFamily:ff,fontSize:11,cursor:"pointer",borderRadius:4,letterSpacing:1.5,textTransform:"uppercase"}}>
                {copied?"Copied!":"Export for Claude Analysis"}
              </button>
            </div>
            <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
              {curWeeks.map((w,i)=>{
                const c=calcs[i];
                return(
                  <button key={i} onClick={()=>setActiveWeek(i)}
                    style={{padding:"10px 16px",background:activeWeek===i?S2:"transparent",border:`1px solid ${activeWeek===i?A:BR}`,color:activeWeek===i?A:MU,fontFamily:ff,fontSize:12,cursor:"pointer",borderRadius:4,textAlign:"left",minWidth:140}}>
                    <div style={{fontWeight:"bold"}}>{w.label}</div>
                    <div style={{fontSize:10,color:MU,marginTop:1}}>{w.dateRange}</div>
                    <div style={{fontSize:11,color:c.netProfit!==0?(c.netProfit>=0?GR:RD):MU,marginTop:2}}>
                      {c.netProfit!==0?fmtS(c.netProfit):"No data"}
                    </div>
                  </button>
                );
              })}
            </div>
            {curWeeks[activeWeek]&&(
              <div style={{background:S,border:`1px solid ${BR}`,borderRadius:8,padding:"24px 28px"}}>
                <div style={{fontFamily:ff,fontSize:10,letterSpacing:2,color:A,textTransform:"uppercase",marginBottom:16}}>
                  {curWeeks[activeWeek].label} \u00b7 {curWeeks[activeWeek].dateRange}
                </div>
                <WeekForm week={curWeeks[activeWeek]} onChange={updated=>{const nw=[...curWeeks];nw[activeWeek]=updated;updateWeeks(nw);}} fixed={fixed}/>
              </div>
            )}
          </div>
        )}

        {tab==="overview"&&!loading&&(
          <div style={{background:S,border:`1px solid ${BR}`,borderRadius:8,padding:"24px 28px"}}>
            <MonthlyOverview weeks={curWeeks} fixed={fixed} extras={curExtras} onExtrasChange={updateExtras} onCopyForClaude={()=>handleCopyForClaude()} copied={copied}/>
          </div>
        )}

        {tab==="visualise"&&!loading&&(
          <div style={{background:S,border:`1px solid ${BR}`,borderRadius:8,padding:"24px 28px"}}>
            <VisualisePage weeks={curWeeks} fixed={fixed}/>
          </div>
        )}

        {tab==="fixed"&&!loading&&(
          <div style={{background:S,border:`1px solid ${BR}`,borderRadius:8,padding:"24px 28px"}}>
            <FixedCostsPage fixed={fixed} onChange={updateFixed}/>
          </div>
        )}

        {tab==="reports"&&!loading&&(
          <div style={{background:S,border:`1px solid ${BR}`,borderRadius:8,padding:"24px 28px"}}>
            <ReportsPage monthData={monthData} fixed={fixed} onCopyForClaude={handleCopyForClaude}/>
          </div>
        )}
      </div>
    </div>
  );
}
