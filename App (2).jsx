import { useState, useEffect, useRef, useCallback } from "react";

const A = "#d8b9ff", BG = "#0a0a0e", S = "#12111a", S2 = "#1a1826", BR = "#2a2540";
const TX = "#e0e0e0", MU = "#777", RD = "#ff6b6b", GR = "#6bffb8", YL = "#ffd97d";
const ff = "Times New Roman";
const JSONBIN_ID = import.meta.env.VITE_JSONBIN_ID;
const JSONBIN_KEY = import.meta.env.VITE_JSONBIN_KEY;
const PASSWORD = import.meta.env.VITE_PASSWORD;

const WAGE_DEPTS = [
  { key: "ops_retail", label: "Operations - Retail" },
  { key: "ops_logistics", label: "Operations - Logistics" },
  { key: "ops_cs", label: "Operations - Customer Service" },
  { key: "marketing", label: "Marketing Department" },
  { key: "hr_management", label: "HR & General Management" },
];

const ALL_OPEX_KEYS = [
  ["office_costs", "Office Costs"],
  ["google_ms_admin", "Google / Microsoft Admin"],
  ["meta_tiktok_ads", "Meta, TikTok, Google Ads"],
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

// ---- Month / Week Helpers ----
function getMonthWeeks(year, month) {
  const first = new Date(year, month, 1);
  const dow = first.getDay();
  const daysBack = dow === 0 ? 6 : dow - 1;
  const mon0 = new Date(first);
  mon0.setDate(first.getDate() - daysBack);
  const fmt = d => String(d.getDate()).padStart(2,"0") + "/" + String(d.getMonth()+1).padStart(2,"0") + "/" + String(d.getFullYear()).slice(-2);
  return Array.from({length:4}, (_,w) => {
    const mon = new Date(mon0); mon.setDate(mon0.getDate() + w*7);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return { weekNum: w+1, label: "Week "+(w+1), dateRange: fmt(mon)+" - "+fmt(sun) };
  });
}

function monthKey(y, m) { return y+"-"+String(m).padStart(2,"0"); }
function monthLabel(y, m) { return new Date(y,m,1).toLocaleString("default",{month:"long",year:"numeric"}); }

function getAvailableMonths() {
  const out = [];
  const end = new Date(); end.setMonth(end.getMonth()+2);
  let cur = new Date(2025,0,1);
  while (cur <= end) {
    out.push({ year:cur.getFullYear(), month:cur.getMonth(), key:monthKey(cur.getFullYear(),cur.getMonth()), label:monthLabel(cur.getFullYear(),cur.getMonth()) });
    cur.setMonth(cur.getMonth()+1);
  }
  return out;
}

// ---- Data Structures ----
function emptyWeek(weekNum, dateRange, label) {
  return {
    weekNum: weekNum||1, label: label||("Week "+(weekNum||1)), dateRange: dateRange||"", notes: "", shopifyRaw: "",
    revenue: { gross_sales:"", refunds:"", discounts:"", shipping_income:"", paypal_fees:"" },
    cogs: { manufacturing_product:"", manufacturing_shipping:"", satchel_count:"", satchel_cost_each:"0.85", other_packaging:"" },
    freight: { auspost:"", fedex:"", customs_duties:"" },
    collabs: { shipping_cost:"", product_cogs:"", uppromote_commission:"", paid_collab_fees:"" },
    wages: { ops_retail:"", ops_logistics:"", ops_cs:"", marketing:"", hr_management:"" },
    opex: Object.fromEntries(ALL_OPEX_KEYS.map(([k])=>[k,""])),
  };
}

function emptyExtras() { return { opex: Object.fromEntries(ALL_OPEX_KEYS.map(([k])=>[k,""])), notes:"" }; }
function emptyFixed() { return { values: Object.fromEntries(ALL_OPEX_KEYS.map(([k])=>[k,""])), fixedKeys:[] }; }

const n = v => parseFloat(v)||0;

function calcWeek(week, fixed) {
  const r = week.revenue;
  const gross=n(r.gross_sales), refunds=n(r.refunds), discounts=n(r.discounts), shipInc=n(r.shipping_income), ppFees=n(r.paypal_fees);
  const netRevenue = gross - refunds - discounts + shipInc - ppFees;
  const mfgP=n(week.cogs.manufacturing_product), mfgS=n(week.cogs.manufacturing_shipping);
  const satchel=n(week.cogs.satchel_count)*n(week.cogs.satchel_cost_each), otherPkg=n(week.cogs.other_packaging);
  const totalCOGS = mfgP+mfgS+satchel+otherPkg;
  const auspost=n(week.freight.auspost), fedex=n(week.freight.fedex), customs=n(week.freight.customs_duties);
  const totalFreight = auspost+fedex+customs;
  const cShip=n(week.collabs.shipping_cost), cProd=n(week.collabs.product_cogs), cComm=n(week.collabs.uppromote_commission), cPaid=n(week.collabs.paid_collab_fees);
  const totalCollabs = cShip+cProd+cComm+cPaid;
  const totalWages = WAGE_DEPTS.reduce((s,d)=>s+n(week.wages[d.key]),0);
  const getO = k => week.opex[k]!==""&&week.opex[k]!==undefined ? n(week.opex[k]) : (fixed?.fixedKeys?.includes(k) ? n(fixed?.values?.[k]) : 0);
  const totalOPEX = ALL_OPEX_KEYS.reduce((s,[k])=>s+getO(k),0);
  const grossProfit = netRevenue-totalCOGS;
  const grossMargin = netRevenue>0?(grossProfit/netRevenue)*100:0;
  const totalExpenses = totalCOGS+totalFreight+totalCollabs+totalWages+totalOPEX;
  const netProfit = netRevenue-totalExpenses;
  const netMargin = netRevenue>0?(netProfit/netRevenue)*100:0;
  return { netRevenue, totalCOGS, grossProfit, grossMargin, totalFreight, totalCollabs, totalWages, totalOPEX, totalExpenses, netProfit, netMargin, auspost, fedex, customs, satchel, mfgP, mfgS, otherPkg, cShip, cProd, cComm, cPaid, ppFees, refunds, discounts, gross, shipInc };
}

function calcMonth(weeks, fixed, extras) {
  const wc = weeks.map(w=>calcWeek(w,fixed));
  const sum = f => wc.reduce((s,c)=>s+c[f],0);
  const extraOpex = extras ? ALL_OPEX_KEYS.reduce((s,[k])=>s+n(extras.opex?.[k]),0) : 0;
  const netRevenue=sum("netRevenue"), totalCOGS=sum("totalCOGS"), grossProfit=sum("grossProfit");
  const grossMargin=netRevenue>0?(grossProfit/netRevenue)*100:0;
  const totalFreight=sum("totalFreight"), totalCollabs=sum("totalCollabs"), totalWages=sum("totalWages");
  const totalOPEX=sum("totalOPEX")+extraOpex;
  const totalExpenses=sum("totalExpenses")+extraOpex;
  const netProfit=netRevenue-totalExpenses;
  const netMargin=netRevenue>0?(netProfit/netRevenue)*100:0;
  return { netRevenue, totalCOGS, grossProfit, grossMargin, totalFreight, totalCollabs, totalWages, totalOPEX, totalExpenses, netProfit, netMargin, weekCalcs:wc, extraOpex };
}

// ---- Storage ----
async function loadAll() {
  if (JSONBIN_ID && JSONBIN_KEY) {
    try {
      const res = await fetch("https://api.jsonbin.io/v3/b/"+JSONBIN_ID+"/latest", { headers:{"X-Master-Key":JSONBIN_KEY} });
      const d = await res.json();
      if (d.record) return { monthData:d.record.monthData||{}, fixed:d.record.fixed||emptyFixed() };
    } catch(e) { console.warn("JSONBin load failed",e); }
  }
  try { const loc=localStorage.getItem("pl_v4"); if(loc) return JSON.parse(loc); } catch(e){}
  return { monthData:{}, fixed:emptyFixed() };
}

async function saveAll(monthData, fixed) {
  const payload = { monthData, fixed };
  try { localStorage.setItem("pl_v4", JSON.stringify(payload)); } catch(e){}
  if (!JSONBIN_ID||!JSONBIN_KEY) return;
  try {
    const res = await fetch("https://api.jsonbin.io/v3/b/"+JSONBIN_ID, {
      method:"PUT", headers:{"Content-Type":"application/json","X-Master-Key":JSONBIN_KEY},
      body:JSON.stringify(payload),
    });
    if (!res.ok) console.warn("JSONBin save failed", res.status);
  } catch(e) { console.warn("JSONBin save error",e); }
}

// ---- Shopify Parser ----
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

// ---- Claude Export ----
function generateExport(weeks, fixed, extras, mLabel) {
  const fmt=v=>"$"+Math.abs(v).toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:2});
  const pct=(v,b)=>b>0?((v/b)*100).toFixed(1)+"%":"0.0%";
  const mc=calcMonth(weeks,fixed,extras);
  const gSales=weeks.reduce((s,w)=>s+n(w.revenue.gross_sales),0);
  const tDisc=weeks.reduce((s,w)=>s+n(w.revenue.discounts),0);
  let o="=== P&L ANALYSIS - "+mLabel+" ===\nGenerated: "+new Date().toLocaleDateString("en-AU")+"\n\n";
  o+="--- MONTHLY SUMMARY ---\n";
  o+="Gross Sales: "+fmt(gSales)+" | Discounts: "+fmt(tDisc)+" ("+pct(tDisc,gSales)+" of gross) | Net Revenue: "+fmt(mc.netRevenue)+"\n";
  o+="Total COGS: "+fmt(mc.totalCOGS)+" | Gross Profit: "+fmt(mc.grossProfit)+" ("+mc.grossMargin.toFixed(1)+"%)\n";
  o+="Freight: "+fmt(mc.totalFreight)+" | Collabs: "+fmt(mc.totalCollabs)+" | Wages: "+fmt(mc.totalWages)+" | OPEX: "+fmt(mc.totalOPEX)+"\n";
  o+="Total Expenses: "+fmt(mc.totalExpenses)+" | NET PROFIT: "+fmt(mc.netProfit)+" ("+mc.netMargin.toFixed(1)+"%)\n\n";
  weeks.forEach((w,i)=>{
    const c=mc.weekCalcs[i];
    o+="--- "+w.label+" | "+w.dateRange+" ---\n";
    o+="  Gross: "+fmt(n(w.revenue.gross_sales))+" | Refunds: -"+fmt(n(w.revenue.refunds))+" | Discounts: -"+fmt(n(w.revenue.discounts))+" | ShipIncome: +"+fmt(n(w.revenue.shipping_income))+" | PayPal: -"+fmt(n(w.revenue.paypal_fees))+" => NET: "+fmt(c.netRevenue)+"\n";
    o+="  COGS: MfgProduct "+fmt(n(w.cogs.manufacturing_product))+" | Inbound "+fmt(n(w.cogs.manufacturing_shipping))+" | Satchels "+n(w.cogs.satchel_count)+"@$"+w.cogs.satchel_cost_each+"="+fmt(c.satchel)+" | OtherPkg "+fmt(n(w.cogs.other_packaging))+" => TOTAL: "+fmt(c.totalCOGS)+" | GP: "+fmt(c.grossProfit)+" ("+c.grossMargin.toFixed(1)+"%)\n";
    o+="  Freight: AusPost "+fmt(n(w.freight.auspost))+" | FedEx "+fmt(n(w.freight.fedex))+" | Customs "+fmt(n(w.freight.customs_duties))+" => "+fmt(c.totalFreight)+"\n";
    o+="  Collabs: Ship "+fmt(n(w.collabs.shipping_cost))+" | ProdCOGS "+fmt(n(w.collabs.product_cogs))+" | Uppromote "+fmt(n(w.collabs.uppromote_commission))+" | PaidFees "+fmt(n(w.collabs.paid_collab_fees))+" => "+fmt(c.totalCollabs)+"\n";
    o+="  Wages: "+WAGE_DEPTS.map(d=>d.label.split("-")[1]?.trim()+": "+fmt(n(w.wages[d.key]))).join(" | ")+" => "+fmt(c.totalWages)+"\n";
    const opLines=ALL_OPEX_KEYS.map(([k,lbl])=>{const v=w.opex[k]!==""?n(w.opex[k]):(fixed?.fixedKeys?.includes(k)?n(fixed?.values?.[k]):0);return v>0?lbl+": "+fmt(v):null;}).filter(Boolean);
    o+="  OPEX: "+(opLines.join(" | ")||"none")+" => "+fmt(c.totalOPEX)+"\n";
    o+="  NET PROFIT: "+fmt(c.netProfit)+" ("+c.netMargin.toFixed(1)+"%)"+(w.notes?" | Notes: "+w.notes:"")+"\n\n";
  });
  if (extras&&mc.extraOpex>0){o+="--- MONTHLY ADJUSTMENTS ---\n";ALL_OPEX_KEYS.forEach(([k,lbl])=>{if(n(extras.opex?.[k])>0)o+="  "+lbl+": "+fmt(n(extras.opex[k]))+"\n";});o+="  Extra OPEX Total: "+fmt(mc.extraOpex)+"\n\n";}
  o+="=== END DATA ===\n\nYou are the COO's senior financial advisor for this e-commerce business. Produce a comprehensive written P&L analysis report. Write in full paragraphs - NOT dot points. Each section must go beyond the numbers and explain the why, the structural risk, the opportunity, and the exact action required.\n\n";
  o+="1. PROFITABILITY VERDICT - Assess the business's financial health. Is net margin sustainable? Compare to e-commerce benchmarks (10-15% net, 40-65% gross). Is the business in growth, maintenance, or risk posture? What is driving profitability and is it durable?\n\n";
  o+="2. WEEK-ON-WEEK TRENDS - Analyse each week's trajectory. Identify patterns and outliers. What does the trend signal about operational consistency and demand stability?\n\n";
  o+="3. MONEY BLEED - For every cost category, calculate exact dollar amount and % of net revenue. Rank by margin impact. Explain WHY each bleed matters structurally.\n\n";
  o+="4. REVENUE QUALITY - Analyse discount rate as % of gross. What does this signal about pricing strategy? What is the refund rate? Calculate net revenue yield per gross dollar.\n\n";
  o+="5. COGS AND GROSS MARGIN - Assess manufacturing efficiency. What happens to gross margin if volume doubles or halves? Is satchel packaging optimised?\n\n";
  o+="6. FREIGHT EFFICIENCY - AusPost vs FedEx split. Calculate net shipping subsidy per week and annualised. Recommend a specific quantified recovery strategy.\n\n";
  o+="7. COLLAB ROI - For total collab spend, calculate minimum revenue needed to justify at 3:1 and 5:1 ROAS. Is Uppromote commission sustainable?\n\n";
  o+="8. WAGES BY DEPARTMENT - For each department, wages as % of net revenue. Which are overstaffed? At what revenue level does the wage structure become unsustainable?\n\n";
  o+="9. OPEX LINE BY LINE - For each OPEX line, assess if justified, benchmarkable, or renegotiable. Model net profit impact of a 20% revenue decline.\n\n";
  o+="10. TOP 5 ACTIONS - Five specific recommendations by financial impact. Each must include: exact dollar improvement achievable, mechanism of change, timeline, and trade-off risk.\n\n";
  o+="11. MARGIN EXPANSION - What structural changes to pricing, product mix, or channels would expand margins over 90 days? Be specific about what to change and by how much.\n\n";
  o+="12. NEXT MONTH TARGETS - Exact dollar targets for: net revenue, discount rate, freight recovery, wages as % of revenue, net margin. Calculate the minimum revenue to break even at current costs.\n\nWrite in full paragraphs. Use exact figures. Flag anomalies. Make it worth reading.";
  return o;
}

// ---- UI Atoms ----
const baseInp = { width:"100%", boxSizing:"border-box", background:S, border:"1px solid "+BR, color:TX, padding:"8px 10px", fontFamily:ff, fontSize:14, outline:"none", borderRadius:4 };
const fmtD = v => (v<0?"-":"")+"$"+Math.abs(v).toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtS = v => (v<0?"-":"")+"$"+Math.abs(v).toLocaleString("en-AU",{minimumFractionDigits:0,maximumFractionDigits:0});

function CI({value,onChange,placeholder="0.00",tint}) {
  return (
    <div style={{position:"relative"}}>
      <span style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",color:MU,fontFamily:ff,fontSize:13,pointerEvents:"none"}}>$</span>
      <input type="number" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        style={{...baseInp,paddingLeft:22,background:tint||S}}
        onFocus={e=>e.target.style.borderColor=A} onBlur={e=>e.target.style.borderColor=BR}/>
    </div>
  );
}

function Lbl({c,children}){return <div style={{color:c||MU,fontFamily:ff,fontSize:11,letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>{children}</div>;}
function SH({children}){return <div style={{fontFamily:ff,fontSize:10,letterSpacing:2.5,textTransform:"uppercase",color:A,borderBottom:"1px solid "+BR,paddingBottom:7,marginBottom:14,marginTop:26}}>{children}</div>;}
function Row({children,gap=10}){return <div style={{display:"flex",gap,flexWrap:"wrap",marginTop:12}}>{children}</div>;}
function Grid({children,cols=2}){return <div style={{display:"grid",gridTemplateColumns:"repeat("+cols+",1fr)",gap:10}}>{children}</div>;}
function Fld({label,children}){return <div><Lbl>{label}</Lbl>{children}</div>;}

function Badge({label,value,color,small}) {
  const col=color||(typeof value==="number"&&value<0?RD:GR);
  return (
    <div style={{background:S2,border:"1px solid "+BR,borderRadius:5,padding:small?"9px 13px":"13px 17px",flex:1,minWidth:110}}>
      <Lbl c={MU}>{label}</Lbl>
      <div style={{color:col,fontFamily:ff,fontSize:small?14:18,fontWeight:"bold"}}>
        {typeof value==="number"?fmtD(value):value}
      </div>
    </div>
  );
}

function Pct({label,value,small}) {
  return (
    <div style={{background:S2,border:"1px solid "+BR,borderRadius:5,padding:small?"9px 13px":"13px 17px",flex:1,minWidth:90}}>
      <Lbl c={MU}>{label}</Lbl>
      <div style={{color:value>=0?GR:RD,fontFamily:ff,fontSize:small?14:18,fontWeight:"bold"}}>{value.toFixed(1)}%</div>
    </div>
  );
}

// ---- Shopify Import ----
function ShopifyImport({week,onChange}) {
  const [raw,setRaw]=useState(week.shopifyRaw||"");
  const [msg,setMsg]=useState("");
  function apply(){
    const parsed=parseShopify(raw);
    const filled=Object.values(parsed).filter(v=>v!=="").length;
    if(!filled){setMsg("No values detected - check format");return;}
    onChange({...week,shopifyRaw:raw,revenue:{...week.revenue,...parsed}});
    setMsg("Auto-filled "+filled+" revenue fields");
    setTimeout(()=>setMsg(""),3000);
  }
  return (
    <div style={{background:S2,border:"1px solid "+BR,borderRadius:6,padding:"16px 18px",marginBottom:20}}>
      <div style={{fontFamily:ff,fontSize:10,letterSpacing:2,textTransform:"uppercase",color:A,marginBottom:8}}>Shopify Data Import</div>
      <textarea value={raw} onChange={e=>setRaw(e.target.value)} placeholder="Paste Shopify CSV or tab-separated export here..." rows={4}
        style={{width:"100%",boxSizing:"border-box",background:S,border:"1px solid "+BR,color:TX,padding:"10px 12px",fontFamily:"monospace",fontSize:12,outline:"none",borderRadius:4,resize:"vertical"}}/>
      <div style={{display:"flex",alignItems:"center",gap:12,marginTop:10}}>
        <button onClick={apply} style={{padding:"8px 18px",background:A,border:"none",color:BG,fontFamily:ff,fontSize:12,cursor:"pointer",borderRadius:4,fontWeight:"bold",letterSpacing:1}}>AUTOFILL FROM DATA</button>
        {msg&&<span style={{fontFamily:ff,fontSize:12,color:msg.includes("No")?RD:GR}}>{msg}</span>}
      </div>
    </div>
  );
}

// ---- Week Form ----
function WeekForm({week,onChange,fixed}) {
  const up = section => (k,v) => onChange({...week,[section]:{...week[section],[k]:v}});
  const upR=up("revenue"),upC=up("cogs"),upF=up("freight"),upCo=up("collabs"),upW=up("wages"),upO=up("opex");
  const c=calcWeek(week,fixed);
  const satchelTotal=n(week.cogs.satchel_count)*n(week.cogs.satchel_cost_each);

  return (
    <div>
      <ShopifyImport week={week} onChange={onChange}/>

      <SH>Revenue and Deductions</SH>
      <Grid>
        <Fld label="Gross Sales"><CI value={week.revenue.gross_sales} onChange={v=>upR("gross_sales",v)}/></Fld>
        <Fld label="Refunds / Returns"><CI value={week.revenue.refunds} onChange={v=>upR("refunds",v)}/></Fld>
        <Fld label="Discounts"><CI value={week.revenue.discounts} onChange={v=>upR("discounts",v)}/></Fld>
        <Fld label="Shipping Income"><CI value={week.revenue.shipping_income} onChange={v=>upR("shipping_income",v)}/></Fld>
        <Fld label="PayPal Fees"><CI value={week.revenue.paypal_fees} onChange={v=>upR("paypal_fees",v)}/></Fld>
      </Grid>
      <Row><Badge small label="Net Revenue" value={c.netRevenue} color={A}/></Row>

      <SH>COGS - Cost of Goods</SH>
      <Grid>
        <Fld label="Manufacturing - Product COGS"><CI value={week.cogs.manufacturing_product} onChange={v=>upC("manufacturing_product",v)}/></Fld>
        <Fld label="Manufacturing Shipping (Inbound Freight)"><CI value={week.cogs.manufacturing_shipping} onChange={v=>upC("manufacturing_shipping",v)}/></Fld>
      </Grid>
      <div style={{marginTop:14,background:S2,border:"1px solid "+BR,borderRadius:5,padding:"12px 14px"}}>
        <div style={{fontFamily:ff,fontSize:10,letterSpacing:1.5,color:A,textTransform:"uppercase",marginBottom:10}}>Satchel Packaging - Auto-calculated by Order Count</div>
        <Grid>
          <Fld label="Number of Orders (Satchels)">
            <input type="number" value={week.cogs.satchel_count} onChange={e=>upC("satchel_count",e.target.value)} placeholder="0"
              style={baseInp} onFocus={e=>e.target.style.borderColor=A} onBlur={e=>e.target.style.borderColor=BR}/>
          </Fld>
          <Fld label="Cost Per Satchel ($)"><CI value={week.cogs.satchel_cost_each} onChange={v=>upC("satchel_cost_each",v)}/></Fld>
        </Grid>
        <div style={{fontFamily:ff,fontSize:13,color:YL,marginTop:8}}>Satchel Total: {fmtD(satchelTotal)}</div>
      </div>
      <div style={{marginTop:10}}><Fld label="Other Packaging"><CI value={week.cogs.other_packaging} onChange={v=>upC("other_packaging",v)}/></Fld></div>
      <Row>
        <Badge small label="Total COGS" value={-c.totalCOGS} color={RD}/>
        <Badge small label="Gross Profit" value={c.grossProfit}/>
        <Pct small label="Gross Margin" value={c.grossMargin}/>
      </Row>

      <SH>OPEX - Operating Expenses</SH>
      <div style={{fontFamily:ff,fontSize:11,color:MU,marginBottom:10}}>Fields with a tinted background are pre-filled from Fixed Costs. Enter a value to override for this week.</div>
      <Grid>
        {ALL_OPEX_KEYS.map(([k,label])=>{
          const isFixed=fixed?.fixedKeys?.includes(k);
          const hasFixed=isFixed&&n(fixed?.values?.[k])>0;
          const weekHasVal=week.opex[k]!=="";
          const tint=hasFixed&&!weekHasVal?"#1c1730":undefined;
          const display=weekHasVal?week.opex[k]:(hasFixed?fixed.values[k]:"");
          return <Fld key={k} label={label}><CI value={display} onChange={v=>upO(k,v)} tint={tint}/></Fld>;
        })}
      </Grid>
      <Row><Badge small label="Total OPEX" value={-c.totalOPEX} color={RD}/></Row>

      <SH>Customer Shipping and Freight</SH>
      <div style={{fontFamily:ff,fontSize:11,color:MU,marginBottom:10}}>Freight costs - included in total OPEX above.</div>
      <Grid>
        <Fld label="AusPost"><CI value={week.freight.auspost} onChange={v=>upF("auspost",v)}/></Fld>
        <Fld label="FedEx / International"><CI value={week.freight.fedex} onChange={v=>upF("fedex",v)}/></Fld>
        <Fld label="Customs and Duties"><CI value={week.freight.customs_duties} onChange={v=>upF("customs_duties",v)}/></Fld>
      </Grid>
      <Row><Badge small label="Total Freight" value={-c.totalFreight} color={RD}/></Row>

      <SH>Collaborations and Influencers</SH>
      <div style={{fontFamily:ff,fontSize:11,color:MU,marginBottom:10}}>Full cost breakdown per collaboration - all component costs included in total OPEX above.</div>
      <Grid>
        <Fld label="Shipping Cost (sending product to collab)"><CI value={week.collabs.shipping_cost} onChange={v=>upCo("shipping_cost",v)}/></Fld>
        <Fld label="Product COGS (manufacturer cost of goods sent)"><CI value={week.collabs.product_cogs} onChange={v=>upCo("product_cogs",v)}/></Fld>
        <Fld label="Uppromote Commission (affiliate payout)"><CI value={week.collabs.uppromote_commission} onChange={v=>upCo("uppromote_commission",v)}/></Fld>
        <Fld label="Paid Collaboration Fees"><CI value={week.collabs.paid_collab_fees} onChange={v=>upCo("paid_collab_fees",v)}/></Fld>
      </Grid>
      <Row><Badge small label="Total Collab Cost" value={-c.totalCollabs} color={RD}/></Row>

      <SH>Staff Wages - By Department</SH>
      <div style={{fontFamily:ff,fontSize:11,color:MU,marginBottom:10}}>Wages by department - included in total OPEX above.</div>
      <Grid>{WAGE_DEPTS.map(d=><Fld key={d.key} label={d.label}><CI value={week.wages[d.key]} onChange={v=>upW(d.key,v)}/></Fld>)}</Grid>
      <Row><Badge small label="Total Wages" value={-c.totalWages} color={RD}/></Row>

      <div style={{borderTop:"1px solid "+BR,marginTop:24,paddingTop:20}}>
        <div style={{fontFamily:ff,fontSize:10,letterSpacing:2,textTransform:"uppercase",color:A,marginBottom:14}}>Weekly P&L Summary</div>
        <Row>
          <Badge label="Net Revenue" value={c.netRevenue} color={A}/>
          <Badge label="Total Expenses" value={-c.totalExpenses} color={RD}/>
          <Badge label="Net Profit" value={c.netProfit}/>
          <Pct label="Net Margin" value={c.netMargin}/>
        </Row>
      </div>

      <SH>Notes / Context</SH>
      <textarea value={week.notes} onChange={e=>onChange({...week,notes:e.target.value})} placeholder="Unusual costs, one-offs, events, context for this week..." rows={3}
        style={{width:"100%",boxSizing:"border-box",background:S,border:"1px solid "+BR,color:TX,padding:"10px 12px",fontFamily:ff,fontSize:14,outline:"none",borderRadius:4,resize:"vertical"}}/>
    </div>
  );
}

// ---- Fixed Costs Page ----
function FixedCostsPage({fixed,onChange}) {
  const total=Object.values(fixed.values||{}).reduce((s,v)=>s+n(v),0);
  const fixedKeys=fixed.fixedKeys||[];
  const toggle=k=>{const nk=fixedKeys.includes(k)?fixedKeys.filter(x=>x!==k):[...fixedKeys,k];onChange({...fixed,fixedKeys:nk});};
  return (
    <div>
      <div style={{fontFamily:ff,fontSize:13,color:MU,marginBottom:20,lineHeight:1.8}}>
        Enter recurring costs and mark which ones auto-populate weekly OPEX. Click SET FIXED to enable auto-population.
      </div>
      <SH>Recurring Fixed Costs</SH>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
        {ALL_OPEX_KEYS.map(([k,label])=>{
          const isF=fixedKeys.includes(k);
          return (
            <div key={k} style={{background:isF?"#1c1730":S2,border:"1px solid "+(isF?A:BR),borderRadius:5,padding:"10px 12px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <Lbl c={isF?A:MU}>{label}</Lbl>
                <button onClick={()=>toggle(k)} style={{background:isF?A:"transparent",border:"1px solid "+(isF?A:BR),color:isF?BG:MU,padding:"2px 8px",fontFamily:ff,fontSize:10,cursor:"pointer",borderRadius:3,letterSpacing:1,whiteSpace:"nowrap"}}>
                  {isF?"FIXED":"SET FIXED"}
                </button>
              </div>
              <CI value={fixed.values?.[k]||""} onChange={v=>onChange({...fixed,values:{...fixed.values,[k]:v}})}/>
            </div>
          );
        })}
      </div>
      <div style={{marginTop:16,padding:"12px 16px",background:S2,border:"1px solid "+BR,borderRadius:5}}>
        <span style={{fontFamily:ff,fontSize:13,color:MU}}>Monthly fixed total: </span>
        <span style={{fontFamily:ff,fontSize:15,color:A,fontWeight:"bold"}}>{fmtD(total)}</span>
        <span style={{fontFamily:ff,fontSize:12,color:MU,marginLeft:12}}>({fmtD(total/4.33)} /wk avg)</span>
        <span style={{fontFamily:ff,fontSize:12,color:A,marginLeft:16}}>{fixedKeys.length} items auto-populate weekly</span>
      </div>
    </div>
  );
}

// ---- Monthly Overview ----
function MonthlyOverview({weeks,fixed,extras,onExtrasChange,onCopyForClaude,copied}) {
  const mc=calcMonth(weeks,fixed,extras);
  const [part2,setPart2]=useState(false);
  const [sumCopied,setSumCopied]=useState(false);

  const copySummary=()=>{
    const fmt=v=>"$"+Math.abs(v).toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:2});
    let t="## Monthly P&L Summary\n\n";
    t+="**Net Revenue:** "+fmt(mc.netRevenue)+"\n";
    t+="**Gross Profit:** "+fmt(mc.grossProfit)+" ("+mc.grossMargin.toFixed(1)+"%)\n";
    t+="**Total Expenses:** "+fmt(mc.totalExpenses)+"\n";
    t+="**Net Profit:** "+fmt(mc.netProfit)+" ("+mc.netMargin.toFixed(1)+"%)\n\n";
    t+="### Week Breakdown\n\n";
    weeks.forEach((w,i)=>{const c=mc.weekCalcs[i];t+="**"+w.label+"** ("+w.dateRange+") - Rev: "+fmt(c.netRevenue)+" | COGS: "+fmt(c.totalCOGS)+" | GP: "+c.grossMargin.toFixed(1)+"% | Net: "+fmt(c.netProfit)+" ("+c.netMargin.toFixed(1)+"%)\n";});
    t+="\n### Expense Summary\n\nCOGS: "+fmt(mc.totalCOGS)+" | Freight: "+fmt(mc.totalFreight)+" | Collabs: "+fmt(mc.totalCollabs)+" | Wages: "+fmt(mc.totalWages)+" | OPEX: "+fmt(mc.totalOPEX);
    navigator.clipboard.writeText(t);
    setSumCopied(true); setTimeout(()=>setSumCopied(false),3000);
  };

  return (
    <div>
      <div style={{display:"flex",gap:8,marginBottom:20}}>
        {["PART 1 - SUMMARY","PART 2 - MONTHLY ADJUSTMENTS"].map((lbl,i)=>(
          <button key={i} onClick={()=>setPart2(i===1)}
            style={{padding:"8px 16px",background:part2===(i===1)?A:"transparent",border:"1px solid "+(part2===(i===1)?A:BR),color:part2===(i===1)?BG:MU,fontFamily:ff,fontSize:11,cursor:"pointer",borderRadius:4,letterSpacing:1}}>
            {lbl}
          </button>
        ))}
      </div>

      {!part2&&(
        <div>
          <SH>Monthly P&L Summary</SH>
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
                <tr style={{borderBottom:"1px solid "+BR}}>
                  {["Week","Date Range","Revenue","COGS","Gross","GP%","Freight","Wages","OPEX","Net Profit","NP%"].map(h=>(
                    <th key={h} style={{padding:"8px 10px",color:MU,fontWeight:"normal",fontSize:10,letterSpacing:1,textTransform:"uppercase",textAlign:"right",whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weeks.map((w,i)=>{
                  const c=mc.weekCalcs[i];
                  return (
                    <tr key={i} style={{borderBottom:"1px solid "+BR+"22"}}>
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
                <tr style={{borderTop:"2px solid "+BR,background:S2}}>
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
          {[["COGS",mc.totalCOGS,"#ff9ecd"],["Freight",mc.totalFreight,RD],["Collabs",mc.totalCollabs,YL],["Wages",mc.totalWages,"#e0a0ff"],["OPEX",mc.totalOPEX,A]].map(([lbl,val,col])=>(
            <div key={lbl} style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",fontFamily:ff,fontSize:12,marginBottom:4}}>
                <span style={{color:TX}}>{lbl}</span>
                <span style={{color:RD}}>{fmtD(-val)} ({mc.totalExpenses>0?((val/mc.totalExpenses)*100).toFixed(1):0}% of expenses)</span>
              </div>
              <div style={{background:S2,borderRadius:3,height:7,overflow:"hidden"}}>
                <div style={{background:col,height:"100%",width:(mc.totalExpenses>0?Math.min((val/mc.totalExpenses)*100,100):0)+"%",borderRadius:3}}/>
              </div>
            </div>
          ))}

          <div style={{display:"flex",gap:10,marginTop:24}}>
            <button onClick={onCopyForClaude}
              style={{flex:1,padding:"13px 0",background:"transparent",border:"1px solid "+A,color:A,fontFamily:ff,fontSize:12,cursor:"pointer",borderRadius:4,letterSpacing:1.5,textTransform:"uppercase"}}>
              {copied?"Copied!":"Export for Claude Analysis"}
              <div style={{fontSize:9,color:MU,marginTop:2}}>paste into claude for deep insights</div>
            </button>
            <button onClick={copySummary}
              style={{flex:1,padding:"13px 0",background:S2,border:"1px solid "+BR,color:TX,fontFamily:ff,fontSize:12,cursor:"pointer",borderRadius:4,letterSpacing:1.5,textTransform:"uppercase"}}>
              {sumCopied?"Copied!":"Generate Monthly Summary"}
              <div style={{fontSize:9,color:MU,marginTop:2}}>copy for notion / export</div>
            </button>
          </div>
        </div>
      )}

      {part2&&(
        <div>
          <div style={{fontFamily:ff,fontSize:13,color:MU,marginBottom:20,lineHeight:1.8}}>
            Enter costs billed monthly not captured in weekly inputs (phone bill, annual subscriptions, etc). These are added to the monthly total.
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
            style={{width:"100%",boxSizing:"border-box",background:S,border:"1px solid "+BR,color:TX,padding:"10px 12px",fontFamily:ff,fontSize:14,outline:"none",borderRadius:4,resize:"vertical"}}/>
          <div style={{marginTop:20,padding:"14px 16px",background:S2,border:"1px solid "+BR,borderRadius:5}}>
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

// ---- Visualise Page ----
function VisualisePage({weeks,fixed,allMonthData}) {
  const METRICS = [
    {id:"netProfit",label:"Net Profit"},
    {id:"netRevenue",label:"Net Revenue"},
    {id:"grossProfit",label:"Gross Profit"},
    {id:"grossMargin",label:"Gross Margin %"},
    {id:"netMargin",label:"Net Margin %"},
    {id:"totalExpenses",label:"Total Expenses"},
    {id:"totalCOGS",label:"Total COGS"},
    {id:"totalFreight",label:"Freight"},
    {id:"totalCollabs",label:"Collabs"},
    {id:"totalWages",label:"Wages"},
    {id:"totalOPEX",label:"OPEX"},
  ];
  const [metric,setMetric]=useState("netProfit");
  const [view,setView]=useState("monthly");

  const isPct=metric==="grossMargin"||metric==="netMargin";

  // Build data points
  let points=[];
  if(view==="weekly"){
    const calcs=weeks.map(w=>calcWeek(w,fixed));
    points=calcs.map((c,i)=>({label:weeks[i]?.label||("W"+(i+1)),value:c[metric]||0}));
  } else {
    // monthly view across all stored months
    const sortedKeys=Object.keys(allMonthData).sort();
    points=sortedKeys.map(key=>{
      const md=allMonthData[key];
      const wks=md.weeks||[];
      const mc=calcMonth(wks,fixed,md.extras||emptyExtras());
      return {label:md.label||key,value:mc[metric]||0};
    });
    if(points.length===0){
      const calcs=weeks.map(w=>calcWeek(w,fixed));
      points=calcs.map((c,i)=>({label:weeks[i]?.label||("W"+(i+1)),value:c[metric]||0}));
    }
  }

  if(points.length===0) return <div style={{color:MU,fontFamily:ff,padding:40,textAlign:"center"}}>No data yet.</div>;

  const vals=points.map(p=>p.value);
  const minV=Math.min(...vals), maxV=Math.max(...vals);
  const range=maxV-minV||1;
  const PAD_L=80,PAD_R=24,PAD_T=40,PAD_B=60;
  const W=600,H=300;
  const chartW=W-PAD_L-PAD_R,chartH=H-PAD_T-PAD_B;
  const xStep=points.length>1?chartW/(points.length-1):chartW;
  const yPos=v=>PAD_T+chartH-((v-minV)/range)*chartH;
  const xPos=i=>PAD_L+(points.length>1?i*xStep:chartW/2);

  // Y axis ticks
  const tickCount=5;
  const ticks=Array.from({length:tickCount},(_,i)=>minV+(range/(tickCount-1))*i);

  const ptPath=points.map((p,i)=>xPos(i)+","+yPos(p.value)).join(" ");
  const areaPath="M"+xPos(0)+","+yPos(points[0].value)+" "+points.map((p,i)=>xPos(i)+","+yPos(p.value)).join(" L")+" L"+xPos(points.length-1)+","+(PAD_T+chartH)+" L"+xPos(0)+","+(PAD_T+chartH)+" Z";

  const posColor=GR,negColor=RD;
  const lineColor=vals.every(v=>v>=0)?posColor:vals.every(v=>v<=0)?negColor:A;

  return (
    <div>
      <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:20,alignItems:"flex-end"}}>
        <div>
          <Lbl>Metric</Lbl>
          <select value={metric} onChange={e=>setMetric(e.target.value)}
            style={{background:S2,border:"1px solid "+BR,color:TX,padding:"9px 12px",fontFamily:ff,fontSize:13,outline:"none",borderRadius:4}}>
            {METRICS.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <Lbl>View</Lbl>
          <select value={view} onChange={e=>setView(e.target.value)}
            style={{background:S2,border:"1px solid "+BR,color:TX,padding:"9px 12px",fontFamily:ff,fontSize:13,outline:"none",borderRadius:4}}>
            <option value="monthly">By Month</option>
            <option value="weekly">This Month - By Week</option>
          </select>
        </div>
      </div>

      <div style={{fontFamily:ff,fontSize:11,color:A,letterSpacing:1.5,textTransform:"uppercase",marginBottom:16}}>
        {METRICS.find(m=>m.id===metric)?.label} - {view==="weekly"?"Week by Week":"Month by Month"}
      </div>

      <svg width="100%" viewBox={"0 0 "+W+" "+H} style={{display:"block",overflow:"visible"}}>
        {/* Grid lines + Y labels */}
        {ticks.map((t,i)=>{
          const y=yPos(t);
          return (
            <g key={i}>
              <line x1={PAD_L} y1={y} x2={W-PAD_R} y2={y} stroke={BR} strokeWidth={0.5}/>
              <text x={PAD_L-8} y={y+4} fill={MU} fontSize={10} textAnchor="end" fontFamily={ff}>
                {isPct?t.toFixed(1)+"%":Math.abs(t)>=1000?fmtS(t):fmtD(t)}
              </text>
            </g>
          );
        })}
        {/* Zero line */}
        {minV<0&&maxV>0&&(
          <line x1={PAD_L} y1={yPos(0)} x2={W-PAD_R} y2={yPos(0)} stroke={MU} strokeWidth={1} strokeDasharray="4,3"/>
        )}
        {/* Area fill */}
        <path d={areaPath} fill={lineColor} opacity={0.07}/>
        {/* Line */}
        <polyline points={ptPath} fill="none" stroke={lineColor} strokeWidth={2.5} strokeLinejoin="round"/>
        {/* Points */}
        {points.map((p,i)=>(
          <g key={i}>
            <circle cx={xPos(i)} cy={yPos(p.value)} r={5} fill={p.value>=0?posColor:negColor} stroke={BG} strokeWidth={1.5}/>
            <text x={xPos(i)} y={yPos(p.value)-12} fill={p.value>=0?posColor:negColor} fontSize={9} textAnchor="middle" fontFamily={ff}>
              {isPct?p.value.toFixed(1)+"%":Math.abs(p.value)>=1000?fmtS(p.value):fmtD(p.value)}
            </text>
            <text x={xPos(i)} y={H-PAD_B+18} fill={MU} fontSize={9} textAnchor="middle" fontFamily={ff}>{p.label.replace("Week ","W").split(" ")[0]}</text>
            {view==="monthly"&&<text x={xPos(i)} y={H-PAD_B+30} fill={MU} fontSize={8} textAnchor="middle" fontFamily={ff}>{p.label.split(" ").slice(0,1).join("")}</text>}
          </g>
        ))}
        {/* X axis */}
        <line x1={PAD_L} y1={PAD_T+chartH} x2={W-PAD_R} y2={PAD_T+chartH} stroke={BR} strokeWidth={1}/>
      </svg>
    </div>
  );
}

// ---- Reports Page ----
function ReportsPage({monthData,fixed,onSave,onCopyForClaude}) {
  const [expanded,setExpanded]=useState(null);
  const [editing,setEditing]=useState(null); // key
  const [editWeeks,setEditWeeks]=useState(null);
  const [editExtras,setEditExtras]=useState(null);
  const [activeEditWeek,setActiveEditWeek]=useState(0);
  const [menu,setMenu]=useState(null);
  const [saving,setSaving]=useState(false);
  const [copied,setCopied]=useState(null);
  const [delConfirm,setDelConfirm]=useState(null);
  const menuRef=useRef(null);

  useEffect(()=>{
    function close(e){if(menuRef.current&&!menuRef.current.contains(e.target))setMenu(null);}
    document.addEventListener("mousedown",close);
    return()=>document.removeEventListener("mousedown",close);
  },[]);

  const allKeys=Object.keys(monthData).sort().reverse();

  if(!allKeys.length) return (
    <div style={{textAlign:"center",padding:"60px 20px",color:MU,fontFamily:ff}}>
      <div style={{fontSize:28,marginBottom:12,opacity:0.3}}>-</div>
      <div>No saved data yet.</div>
      <div style={{fontSize:13,marginTop:8}}>Data saves automatically as you enter it.</div>
    </div>
  );

  const startEdit=key=>{
    const md=monthData[key]||{};
    setEditWeeks((md.weeks||[]).map(w=>({...w})));
    setEditExtras(md.extras||emptyExtras());
    setEditing(key);
    setActiveEditWeek(0);
    setExpanded(key);
  };

  const saveEdit=async key=>{
    setSaving(true);
    const updated={...monthData,[key]:{...monthData[key],weeks:editWeeks,extras:editExtras,lastSaved:new Date().toLocaleString("en-AU")}};
    await onSave(updated);
    setSaving(false);
    setEditing(null);
    setEditWeeks(null);
  };

  const deleteMonth=async key=>{
    const updated={...monthData};
    delete updated[key];
    await onSave(updated);
    setDelConfirm(null);
    setExpanded(null);
  };

  return (
    <div>
      <SH>All Saved Months ({allKeys.length})</SH>
      {allKeys.map(key=>{
        const md=monthData[key]||{};
        const weeks=editing===key?editWeeks:(md.weeks||[]);
        const extras=editing===key?editExtras:(md.extras||emptyExtras());
        const mc=calcMonth(weeks,fixed,extras);
        const isOpen=expanded===key;
        const isEdit=editing===key;
        const mLabel=md.label||key;

        return (
          <div key={key} style={{border:"1px solid "+BR,borderRadius:6,marginBottom:10,overflow:"visible"}}>
            {/* Header row */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px",background:isOpen?S2:"transparent",borderRadius:isOpen?"6px 6px 0 0":"6px"}}>
              <div onClick={()=>setExpanded(isOpen?null:key)} style={{flex:1,cursor:"pointer"}}>
                <div style={{fontFamily:ff,fontSize:15,color:TX}}>{mLabel}</div>
                <div style={{fontFamily:ff,fontSize:11,color:MU,marginTop:2}}>
                  {weeks.length} weeks &nbsp;|&nbsp; Last saved: {md.lastSaved||"-"}
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{fontFamily:ff,fontSize:14,color:mc.netProfit>=0?GR:RD}}>{fmtD(mc.netProfit)}</div>
                <div style={{fontFamily:ff,fontSize:11,color:MU}}>{mc.netMargin.toFixed(1)}% NM</div>
                <div style={{position:"relative"}} ref={menu===key?menuRef:null}>
                  <button onClick={e=>{e.stopPropagation();setMenu(menu===key?null:key);}}
                    style={{background:"transparent",border:"1px solid "+BR,color:MU,padding:"4px 10px",fontFamily:ff,fontSize:16,cursor:"pointer",borderRadius:4,lineHeight:1}}>...</button>
                  {menu===key&&(
                    <div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:S2,border:"1px solid "+BR,borderRadius:6,zIndex:200,minWidth:190,overflow:"hidden",boxShadow:"0 8px 24px #00000088"}}>
                      {[
                        {label:"Edit Report",action:()=>{startEdit(key);setMenu(null);}},
                        {label:copied===key?"Copied!":"Export for Claude",action:()=>{onCopyForClaude(md.weeks||[],md.extras||emptyExtras(),mLabel);setCopied(key);setTimeout(()=>setCopied(null),3000);setMenu(null);}},
                        {label:"Copy Summary",action:()=>{
                          const fmt=v=>"$"+Math.abs(v).toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:2});
                          let t=mLabel+"\n\nNet Revenue: "+fmt(mc.netRevenue)+"\nNet Profit: "+fmt(mc.netProfit)+" ("+mc.netMargin.toFixed(1)+"%)\n";
                          (md.weeks||[]).forEach((w,i)=>{const c=mc.weekCalcs[i];t+=w.label+": "+fmt(c.netProfit)+" ("+c.netMargin.toFixed(1)+"%)\n";});
                          navigator.clipboard.writeText(t);setMenu(null);
                        }},
                        {label:"Delete",action:()=>{setDelConfirm(key);setMenu(null);},danger:true},
                      ].map(item=>(
                        <button key={item.label} onClick={item.action}
                          style={{display:"block",width:"100%",padding:"10px 16px",background:"transparent",border:"none",color:item.danger?RD:TX,fontFamily:ff,fontSize:13,cursor:"pointer",textAlign:"left"}}
                          onMouseEnter={e=>e.target.style.background=BR} onMouseLeave={e=>e.target.style.background="transparent"}>
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={()=>setExpanded(isOpen?null:key)} style={{background:"transparent",border:"none",color:MU,fontSize:20,cursor:"pointer",lineHeight:1}}>{isOpen?"-":"+"}</button>
              </div>
            </div>

            {/* Delete confirm */}
            {delConfirm===key&&(
              <div style={{padding:"16px 18px",background:"#1a0a0a",border:"1px solid "+RD,borderRadius:4,margin:"0 0 4px"}}>
                <div style={{fontFamily:ff,fontSize:13,color:RD,marginBottom:12}}>Delete {mLabel}? This cannot be undone.</div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>deleteMonth(key)} style={{padding:"8px 16px",background:RD,border:"none",color:BG,fontFamily:ff,fontSize:12,cursor:"pointer",borderRadius:4,fontWeight:"bold"}}>Delete</button>
                  <button onClick={()=>setDelConfirm(null)} style={{padding:"8px 16px",background:"transparent",border:"1px solid "+BR,color:MU,fontFamily:ff,fontSize:12,cursor:"pointer",borderRadius:4}}>Cancel</button>
                </div>
              </div>
            )}

            {/* Expanded */}
            {isOpen&&(
              <div style={{padding:"20px 18px",borderTop:"1px solid "+BR,background:S}}>
                {isEdit?(
                  <div>
                    <div style={{fontFamily:ff,fontSize:10,letterSpacing:1.5,color:A,textTransform:"uppercase",marginBottom:12}}>Editing - Select Week</div>
                    <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
                      {editWeeks.map((w,wi)=>(
                        <button key={wi} onClick={()=>setActiveEditWeek(wi)}
                          style={{padding:"9px 14px",background:activeEditWeek===wi?S2:"transparent",border:"1px solid "+(activeEditWeek===wi?A:BR),color:activeEditWeek===wi?A:MU,fontFamily:ff,fontSize:12,cursor:"pointer",borderRadius:4}}>
                          {w.label||"Week "+(wi+1)}
                        </button>
                      ))}
                    </div>
                    {editWeeks[activeEditWeek]&&(
                      <div style={{background:S2,border:"1px solid "+BR,borderRadius:6,padding:"20px"}}>
                        <WeekForm week={editWeeks[activeEditWeek]} onChange={updated=>{const arr=[...editWeeks];arr[activeEditWeek]=updated;setEditWeeks(arr);}} fixed={fixed}/>
                      </div>
                    )}
                    <div style={{display:"flex",gap:10,marginTop:16}}>
                      <button onClick={()=>saveEdit(key)} disabled={saving}
                        style={{flex:1,padding:"11px 0",background:A,border:"none",color:BG,fontFamily:ff,fontSize:13,cursor:"pointer",borderRadius:4,fontWeight:"bold",letterSpacing:1}}>
                        {saving?"SAVING...":"SAVE CHANGES"}
                      </button>
                      <button onClick={()=>{setEditing(null);setEditWeeks(null);}}
                        style={{padding:"11px 20px",background:"transparent",border:"1px solid "+BR,color:MU,fontFamily:ff,fontSize:13,cursor:"pointer",borderRadius:4}}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ):(
                  <div>
                    <Row>
                      <Badge small label="Revenue" value={mc.netRevenue} color={A}/>
                      <Badge small label="Gross Profit" value={mc.grossProfit}/>
                      <Badge small label="Total Expenses" value={-mc.totalExpenses} color={RD}/>
                      <Badge small label="Net Profit" value={mc.netProfit}/>
                    </Row>
                    <div style={{marginTop:14}}>
                      {(md.weeks||[]).map((w,wi)=>{
                        const c=mc.weekCalcs[wi];
                        return (
                          <div key={wi} style={{display:"flex",justifyContent:"space-between",padding:"9px 12px",background:S2,borderRadius:4,border:"1px solid "+BR,marginBottom:6}}>
                            <span style={{fontFamily:ff,fontSize:13,color:TX}}>{w.label} - {w.dateRange}</span>
                            <div>
                              <span style={{fontFamily:ff,fontSize:13,color:c.netProfit>=0?GR:RD}}>Net: {fmtD(c.netProfit)}</span>
                              <span style={{fontFamily:ff,fontSize:11,color:MU,marginLeft:12}}>GP: {c.grossMargin.toFixed(1)}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <button onClick={()=>startEdit(key)}
                      style={{marginTop:14,width:"100%",padding:"10px 0",background:"transparent",border:"1px solid "+A,color:A,fontFamily:ff,fontSize:13,cursor:"pointer",borderRadius:4,letterSpacing:1}}>
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

// ---- Password Screen ----
function PasswordScreen({onAuth}) {
  const [pw,setPw]=useState(""),[ err,setErr]=useState(false);
  const check=()=>{if(!PASSWORD||pw===PASSWORD){onAuth();}else{setErr(true);setTimeout(()=>setErr(false),1400);}};
  return (
    <div style={{minHeight:"100vh",background:BG,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:ff}}>
      <div style={{textAlign:"center",marginBottom:52}}>
        <div style={{fontSize:9,letterSpacing:6,color:MU,textTransform:"uppercase",marginBottom:14}}>Finance Operations</div>
        <div style={{fontSize:30,letterSpacing:5,color:TX,textTransform:"uppercase",fontWeight:"normal"}}>P&L Dashboard</div>
        <div style={{width:36,height:1,background:A,margin:"18px auto 0"}}/>
      </div>
      <div style={{width:290}}>
        <input type="password" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&check()} placeholder="PASSWORD" autoFocus
          style={{width:"100%",boxSizing:"border-box",background:"transparent",border:"1px solid "+(err?RD:BR),color:TX,padding:"14px 16px",fontFamily:ff,fontSize:13,outline:"none",borderRadius:2,letterSpacing:4,textAlign:"center",marginBottom:10,transition:"border-color 0.2s"}}/>
        {err&&<div style={{color:RD,fontSize:10,textAlign:"center",letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Incorrect Password</div>}
        <button onClick={check}
          style={{width:"100%",padding:"13px 0",background:"transparent",border:"1px solid "+A,color:A,fontFamily:ff,fontSize:11,cursor:"pointer",borderRadius:2,letterSpacing:5,textTransform:"uppercase"}}
          onMouseEnter={e=>{e.target.style.background=A;e.target.style.color=BG;}} onMouseLeave={e=>{e.target.style.background="transparent";e.target.style.color=A;}}>
          Enter
        </button>
      </div>
    </div>
  );
}

// ---- Main App ----
export default function App() {
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
    loadAll().then(({monthData:md,fixed:f})=>{
      setMonthData(md||{});
      setFixed(f||emptyFixed());
      setLoading(false);
    });
  },[authed]);

  const saveTimer=useRef(null);
  const autoSave=useCallback((md,fx)=>{
    if(saveTimer.current)clearTimeout(saveTimer.current);
    saveTimer.current=setTimeout(async()=>{
      await saveAll(md,fx);
      setSaveMsg("Saved");
      setTimeout(()=>setSaveMsg(""),2000);
    },1200);
  },[]);

  const curKey=selMonth?.key;
  const curEntry=monthData[curKey];
  const curWeeks=curEntry?.weeks||(()=>{
    const wd=getMonthWeeks(selMonth.year,selMonth.month);
    return wd.map(d=>emptyWeek(d.weekNum,d.dateRange,d.label));
  })();
  const curExtras=curEntry?.extras||emptyExtras();

  const updateWeeks=nw=>{
    const updated={...monthData,[curKey]:{...curEntry,weeks:nw,label:selMonth.label,lastSaved:new Date().toLocaleString("en-AU"),extras:curExtras}};
    setMonthData(updated);
    autoSave(updated,fixed);
  };

  const updateExtras=ne=>{
    const updated={...monthData,[curKey]:{...curEntry,weeks:curWeeks,extras:ne,label:selMonth.label,lastSaved:new Date().toLocaleString("en-AU")}};
    setMonthData(updated);
    autoSave(updated,fixed);
  };

  const updateFixed=async nf=>{
    setFixed(nf);
    await saveAll(monthData,nf);
    setSaveMsg("Fixed costs saved");
    setTimeout(()=>setSaveMsg(""),2000);
  };

  const handleCopyForClaude=(weeksData=curWeeks,extras=curExtras,label=selMonth?.label)=>{
    navigator.clipboard.writeText(generateExport(weeksData,fixed,extras,label));
    setCopied(true); setTimeout(()=>setCopied(false),3000);
  };

  const handleSaveMonthData=async md=>{setMonthData(md);await saveAll(md,fixed);};

  const calcs=curWeeks.map(w=>calcWeek(w,fixed));
  const mc=calcMonth(curWeeks,fixed,curExtras);

  if(!authed)return <PasswordScreen onAuth={()=>setAuthed(true)}/>;

  const TABS=[
    {id:"input",label:"WEEKLY INPUT"},
    {id:"overview",label:"MONTHLY OVERVIEW"},
    {id:"visualise",label:"VISUALISE"},
    {id:"fixed",label:"FIXED COSTS"},
    {id:"reports",label:"REPORTS ("+Object.keys(monthData).length+")"},
  ];

  return (
    <div style={{minHeight:"100vh",background:BG,color:TX,fontFamily:ff}}>
      <div style={{borderBottom:"1px solid "+BR,padding:"0 32px"}}>
        <div style={{maxWidth:1200,margin:"0 auto",padding:"22px 0 0"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",flexWrap:"wrap",gap:12}}>
            <div>
              <div style={{color:A,fontSize:9,letterSpacing:4,textTransform:"uppercase",marginBottom:4}}>Finance Operations</div>
              <h1 style={{margin:0,fontSize:24,fontWeight:"normal",letterSpacing:2,color:TX,textTransform:"uppercase"}}>P&L Dashboard</h1>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
              <select value={selIdx} onChange={e=>{setSelIdx(parseInt(e.target.value));setActiveWeek(0);}}
                style={{background:S2,border:"1px solid "+BR,color:TX,padding:"7px 12px",fontFamily:ff,fontSize:13,outline:"none",borderRadius:4,minWidth:170}}>
                {availableMonths.map((m,i)=><option key={m.key} value={i}>{m.label}</option>)}
              </select>
              <div style={{background:S2,border:"1px solid "+BR,borderRadius:4,padding:"7px 12px",fontSize:13,color:mc.netProfit>=0?GR:RD,fontFamily:ff}}>
                MTD: {fmtD(mc.netProfit)}
              </div>
              {saveMsg&&<div style={{fontFamily:ff,fontSize:11,color:GR,letterSpacing:1}}>{saveMsg}</div>}
            </div>
          </div>
          <div style={{display:"flex",gap:0,marginTop:18}}>
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)}
                style={{padding:"10px 18px",background:"transparent",border:"none",borderBottom:tab===t.id?"2px solid "+A:"2px solid transparent",color:tab===t.id?A:MU,fontFamily:ff,fontSize:12,cursor:"pointer",letterSpacing:1.5,marginBottom:-1,textTransform:"uppercase"}}>
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
              <div style={{fontFamily:ff,fontSize:11,color:MU,letterSpacing:1}}>{selMonth?.label} - weeks auto-dated Mon-Sun</div>
              <button onClick={()=>handleCopyForClaude()}
                style={{padding:"9px 16px",background:"transparent",border:"1px solid "+A,color:A,fontFamily:ff,fontSize:11,cursor:"pointer",borderRadius:4,letterSpacing:1.5,textTransform:"uppercase"}}>
                {copied?"Copied!":"Export for Claude Analysis"}
              </button>
            </div>
            <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
              {curWeeks.map((w,i)=>{
                const c=calcs[i];
                return (
                  <button key={i} onClick={()=>setActiveWeek(i)}
                    style={{padding:"10px 16px",background:activeWeek===i?S2:"transparent",border:"1px solid "+(activeWeek===i?A:BR),color:activeWeek===i?A:MU,fontFamily:ff,fontSize:12,cursor:"pointer",borderRadius:4,textAlign:"left",minWidth:140}}>
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
              <div style={{background:S,border:"1px solid "+BR,borderRadius:8,padding:"24px 28px"}}>
                <div style={{fontFamily:ff,fontSize:10,letterSpacing:2,color:A,textTransform:"uppercase",marginBottom:16}}>
                  {curWeeks[activeWeek].label} - {curWeeks[activeWeek].dateRange}
                </div>
                <WeekForm week={curWeeks[activeWeek]} onChange={updated=>{const nw=[...curWeeks];nw[activeWeek]=updated;updateWeeks(nw);}} fixed={fixed}/>
              </div>
            )}
          </div>
        )}

        {tab==="overview"&&!loading&&(
          <div style={{background:S,border:"1px solid "+BR,borderRadius:8,padding:"24px 28px"}}>
            <MonthlyOverview weeks={curWeeks} fixed={fixed} extras={curExtras} onExtrasChange={updateExtras} onCopyForClaude={()=>handleCopyForClaude()} copied={copied}/>
          </div>
        )}

        {tab==="visualise"&&!loading&&(
          <div style={{background:S,border:"1px solid "+BR,borderRadius:8,padding:"24px 28px"}}>
            <VisualisePage weeks={curWeeks} fixed={fixed} allMonthData={monthData}/>
          </div>
        )}

        {tab==="fixed"&&!loading&&(
          <div style={{background:S,border:"1px solid "+BR,borderRadius:8,padding:"24px 28px"}}>
            <FixedCostsPage fixed={fixed} onChange={updateFixed}/>
          </div>
        )}

        {tab==="reports"&&!loading&&(
          <div style={{background:S,border:"1px solid "+BR,borderRadius:8,padding:"24px 28px"}}>
            <ReportsPage monthData={monthData} fixed={fixed} onSave={handleSaveMonthData} onCopyForClaude={handleCopyForClaude}/>
          </div>
        )}
      </div>
    </div>
  );
}
