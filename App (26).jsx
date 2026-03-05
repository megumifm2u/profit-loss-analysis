import { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";

// ─── Theme Context ────────────────────────────────────────────────────────────
const ThemeContext = createContext(null);
const useTheme = () => useContext(ThemeContext);

const DEFAULT_THEME = {
  accent:"#d8b9ff", bg:"#0a0a0e", surface:"#12111a", surface2:"#1a1826",
  border:"#2a2540", text:"#e0e0e0", muted:"#777777",
  red:"#ff6b6b", green:"#6bffb8", yellow:"#ffd97d",
  titleFont:"Times New Roman", bodyFont:"Times New Roman",
  borderRadius:4, lightness:50,
};

function applyLightness(hex, lightness) {
  try {
    const factor = (lightness - 50) / 50;
    const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
    const adj=c=>factor>0?Math.min(255,Math.round(c+(255-c)*factor*0.7)):Math.max(0,Math.round(c+c*factor*0.7));
    return "#"+[adj(r),adj(g),adj(b)].map(v=>v.toString(16).padStart(2,"0")).join("");
  } catch(e){ return hex; }
}

function buildTheme(t) {
  const l=t.lightness??50, ap=hex=>applyLightness(hex,l);
  return {
    A:ap(t.accent), BG:ap(t.bg), S:ap(t.surface), S2:ap(t.surface2),
    BR:ap(t.border), TX:ap(t.text), MU:ap(t.muted),
    RD:ap(t.red), GR:ap(t.green), YL:ap(t.yellow),
    ff:t.bodyFont||"Times New Roman", ffTitle:t.titleFont||"Times New Roman",
    radius:t.borderRadius??4,
  };
}

// ─── Labels ───────────────────────────────────────────────────────────────────
const DEFAULT_LABELS = {
  header_brand:"Finance Operations", header_title:"P&L Dashboard", header_subtitle:"weeks auto-dated Mon-Sun",
  tab_input:"WEEKLY INPUT", tab_overview:"MONTHLY OVERVIEW", tab_visualise:"VISUALISE",
  tab_compare:"COMPARE", tab_fixed:"FIXED COSTS", tab_reports:"REPORTS",
  sec_shopify:"Shopify Data Import", sec_shopify_btn:"AUTOFILL FROM DATA",
  sec_revenue:"Revenue and Deductions", sec_cogs:"COGS - Cost of Goods",
  sec_satchel:"Satchel Packaging - Auto-calculated by Order Count",
  sec_opex:"OPEX - Operating Expenses",
  sec_opex_sub:"All operating costs including freight, collabs, and wages. Tinted fields are pre-filled from Fixed Costs.",
  sec_freight:"Customer Shipping and Freight", sec_freight_sub:"Freight costs - included in total OPEX above.",
  sec_collabs:"Collaborations and Influencers", sec_collabs_sub:"Full cost breakdown per collaboration.",
  sec_wages:"Staff Wages - By Department", sec_wages_sub:"Wages by department - included in total OPEX above.",
  sec_general:"General Operating Costs", sec_notes:"Notes / Context", sec_summary:"Weekly P&L Summary",
  field_gross_sales:"Gross Sales", field_refunds:"Refunds / Returns",
  field_discounts:"Gross Discounts (all codes)", field_shipping_income:"Shipping Income",
  field_paypal_fees:"PayPal Fees", field_net_revenue:"Net Revenue",
  field_mfg_product:"Manufacturing - Product COGS", field_mfg_shipping:"Manufacturing Shipping (Inbound Freight)",
  field_satchel_count:"Number of Orders (Satchels)", field_satchel_cost:"Cost Per Satchel ($)",
  field_satchel_total:"Satchel Total", field_other_pkg:"Other Packaging",
  field_total_cogs:"Total COGS", field_gross_profit:"Gross Profit", field_gross_margin:"Gross Margin",
  field_total_expenses:"Total Expenses", field_net_profit:"Net Profit", field_net_margin:"Net Margin",
  // Discount breakdown
  disc_section:"Discount Code Breakdown",
  disc_section_sub:"Reclassifies discount codes into true cost categories. Gross Discounts above shows all codes combined. Expand below to break them out correctly.",
  disc_service_recovery:"Service Recovery",
  disc_service_recovery_sub:"Reshipments, exchanges, warranty, CS errors. Reclassified as operational/COGS expense.",
  disc_marketing:"Marketing / Influencer",
  disc_marketing_sub:"Collab codes, gifting. Reclassified as marketing expense.",
  disc_staff:"Staff Discounts",
  disc_staff_sub:"Staff purchase discounts. Reclassified as staff benefits expense.",
  disc_promotional:"Promotional / Sale",
  disc_promotional_sub:"True sale codes. This is the only bucket that stays as a revenue deduction.",
  disc_field_retail:"Total retail value discounted ($)",
  disc_field_orders:"Number of orders",
  disc_field_cogs:"Manufacturing COGS of goods sent ($)",
  disc_field_codes:"Discount codes in this bucket (comma separated)",
  // Buttons
  btn_generate_export:"GENERATE EXPORT", btn_generate_export_sub:"paste into claude for deep insights",
  btn_monthly_summary:"Generate Monthly Summary", btn_monthly_summary_sub:"copy for notion / export",
  btn_compare_export:"GENERATE EXPORT", btn_compare_export_sub:"comparative analysis export for claude",
  btn_weekly_budget_export:"GENERATE BUDGET PLAN", btn_weekly_budget_export_sub:"next week staffing and budget guide",
  // Fixed costs
  fixed_help:"Enter recurring costs and mark which ones auto-populate weekly OPEX. Click SET FIXED to enable.",
  fixed_satchel_label:"Default Satchel Cost", fixed_satchel_sub:"per satchel (used when weekly input is blank)",
  // Overview
  overview_part1:"PART 1 - SUMMARY", overview_part2:"PART 2 - MONTHLY ADJUSTMENTS",
  overview_adjustments_help:"Enter costs billed monthly not captured in weekly inputs.",
  // Compare
  compare_title:"Comparative Analysis", compare_help:"Select two periods to compare performance side by side.",
};

// ─── Discount Bucket Defaults ─────────────────────────────────────────────────
const DEFAULT_DISC_BUCKETS = [
  {
    id:"service_recovery", labelKey:"disc_service_recovery", subKey:"disc_service_recovery_sub",
    reclassAs:"cogs", // shown under COGS/Operational expense
    defaultCodes:"RESHIP-FAULTY,RESHIP-LOST,RESHIP-DAMAGED,RESHIP-RTS,RESHIP-CUSTOMS,EXCHANGE-SE,EXCHANGE-GIFT,CS-WARRANTY,CS-ERROR",
    hasCOGS:true, // show manufacturing COGS field
  },
  {
    id:"marketing", labelKey:"disc_marketing", subKey:"disc_marketing_sub",
    reclassAs:"marketing",
    defaultCodes:"COLLAB2026",
    hasCOGS:false,
  },
  {
    id:"staff", labelKey:"disc_staff", subKey:"disc_staff_sub",
    reclassAs:"wages",
    defaultCodes:"STAFF",
    hasCOGS:false,
  },
  {
    id:"promotional", labelKey:"disc_promotional", subKey:"disc_promotional_sub",
    reclassAs:"promotional", // stays in revenue deductions
    defaultCodes:"",
    hasCOGS:false,
  },
];

// ─── OPEX / Wage defaults ─────────────────────────────────────────────────────
const DEFAULT_OPEX_KEYS = [
  {key:"auspost",label:"AusPost",group:"freight"},
  {key:"fedex",label:"FedEx / International",group:"freight"},
  {key:"customs_duties",label:"Customs and Duties",group:"freight"},
  {key:"collab_shipping",label:"Collab Shipping",group:"collabs"},
  {key:"collab_product_cogs",label:"Collab Product COGS",group:"collabs"},
  {key:"uppromote_commission",label:"Uppromote Commission",group:"collabs"},
  {key:"paid_collab_fees",label:"Paid Collaboration Fees",group:"collabs"},
  {key:"office_costs",label:"Office Costs",group:"general"},
  {key:"google_ms_admin",label:"Google / Microsoft Admin",group:"general"},
  {key:"meta_tiktok_ads",label:"Meta, TikTok, Google Ads",group:"general"},
  {key:"model_wages",label:"Model Wages",group:"general"},
  {key:"shopify",label:"Shopify",group:"general"},
  {key:"shopify_apps",label:"Shopify Apps",group:"general"},
  {key:"general_apps",label:"General Apps",group:"general"},
  {key:"accounting_xero",label:"Accounting (Xero)",group:"general"},
  {key:"rostering_deputy",label:"Rostering (Deputy)",group:"general"},
  {key:"customer_service_repliai",label:"Customer Service (Repliai)",group:"general"},
  {key:"rent_utilities",label:"Rent + Utilities",group:"general"},
  {key:"internet_phone",label:"Internet + Telephone",group:"general"},
  {key:"insurance",label:"Insurance",group:"general"},
  {key:"bank_accounting",label:"Bank / Accounting",group:"general"},
  {key:"legal",label:"Legal",group:"general"},
];

const DEFAULT_WAGE_DEPTS = [
  {key:"ops",label:"Operations",subs:[
    {key:"ops_retail",label:"Retail"},
    {key:"ops_logistics",label:"Logistics"},
    {key:"ops_cs",label:"Customer Service"},
  ]},
  {key:"marketing",label:"Marketing",subs:[{key:"marketing_dept",label:"Marketing"}]},
  {key:"hr",label:"HR & General Management",subs:[{key:"hr_management",label:"HR & General Management"}]},
];

const DEFAULT_STAFF = [
  {id:"s1",name:"Staff Member 1",type:"fulltime",hourlyRate:25,hoursPerWeek:38,dept:"ops_retail"},
  {id:"s2",name:"Staff Member 2",type:"parttime",hourlyRate:25,hoursPerWeek:20,dept:"ops_logistics"},
];

const allWageKeys = depts => (depts||DEFAULT_WAGE_DEPTS).flatMap(d=>d.subs.map(s=>s.key));

// ─── Month / Week helpers ─────────────────────────────────────────────────────
function getMonthWeeks(year,month){
  const first=new Date(year,month,1);
  const dow=first.getDay(), daysBack=dow===0?6:dow-1;
  const mon0=new Date(first); mon0.setDate(first.getDate()-daysBack);
  const fmt=d=>String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0")+"/"+String(d.getFullYear()).slice(-2);
  return Array.from({length:4},(_,w)=>{
    const mon=new Date(mon0); mon.setDate(mon0.getDate()+w*7);
    const sun=new Date(mon); sun.setDate(mon.getDate()+6);
    return {weekNum:w+1,label:"Week "+(w+1),dateRange:fmt(mon)+" - "+fmt(sun)};
  });
}
function monthKey(y,m){return y+"-"+String(m).padStart(2,"0");}
function monthLabel(y,m){return new Date(y,m,1).toLocaleString("default",{month:"long",year:"numeric"});}
function getAvailableMonths(){
  const out=[]; const end=new Date(); end.setMonth(end.getMonth()+2);
  let cur=new Date(2025,0,1);
  while(cur<=end){out.push({year:cur.getFullYear(),month:cur.getMonth(),key:monthKey(cur.getFullYear(),cur.getMonth()),label:monthLabel(cur.getFullYear(),cur.getMonth())});cur.setMonth(cur.getMonth()+1);}
  return out;
}

// ─── Data Structures ──────────────────────────────────────────────────────────
const n=v=>parseFloat(v)||0;

function emptyDiscBuckets(){
  const out={};
  DEFAULT_DISC_BUCKETS.forEach(b=>{
    out[b.id]={retailValue:"",orders:"",cogsValue:"",codes:b.defaultCodes};
  });
  return out;
}

function emptyWages(depts){const w={};allWageKeys(depts).forEach(k=>{w[k]="";});return w;}
function emptyOpex(keys){const o={};(keys||DEFAULT_OPEX_KEYS).forEach(({key})=>{o[key]="";});return o;}

function emptyWeek(weekNum,dateRange,label,depts,opexKeys){
  return {
    weekNum:weekNum||1, label:label||("Week "+(weekNum||1)), dateRange:dateRange||"",
    notes:"", shopifyRaw:"",
    revenue:{gross_sales:"",refunds:"",discounts:"",shipping_income:"",paypal_fees:""},
    cogs:{manufacturing_product:"",manufacturing_shipping:"",satchel_count:"",satchel_cost_each:"",other_packaging:""},
    discBuckets:emptyDiscBuckets(),
    wages:emptyWages(depts),
    opex:emptyOpex(opexKeys),
  };
}
function emptyExtras(keys){return {opex:emptyOpex(keys),notes:""};}
function emptyFixed(keys){return {values:emptyOpex(keys),fixedKeys:[],satchelCostDefault:"0.85"};}

// Compute reclassified discount amounts from buckets
function calcDiscReclassification(discBuckets){
  const sr=discBuckets?.service_recovery||{};
  const mkt=discBuckets?.marketing||{};
  const staff=discBuckets?.staff||{};
  const promo=discBuckets?.promotional||{};
  return {
    serviceRecoveryCOGS: n(sr.cogsValue)||n(sr.retailValue), // prefer COGS value if entered
    serviceRecoveryRetail: n(sr.retailValue),
    serviceRecoveryOrders: n(sr.orders),
    // Marketing gifting: retailValue is Shopify's artefact (full retail of gifted units).
    // It is NOT a real cash cost at retail — the actual cost is the manufacturing COGS
    // of those units, which the user already enters in Collab COGS under OPEX.
    // Therefore: strip retail value from all P&L calculations entirely.
    // marketingDiscRetail = reference display only, zero P&L impact.
    marketingDiscRetail: n(mkt.retailValue),
    marketingOrders: n(mkt.orders),
    // staffDisc stays — it IS a real cash cost (staff buying product at discount)
    staffDisc: n(staff.retailValue),
    staffOrders: n(staff.orders),
    promoDisc: n(promo.retailValue),
    promoOrders: n(promo.orders),
  };
}

function calcWeek(week,fixed,opexKeys,depts){
  const r=week.revenue;
  const gross=n(r.gross_sales), refunds=n(r.refunds), totalDiscounts=n(r.discounts);
  const shipInc=n(r.shipping_income), ppFees=n(r.paypal_fees);

  // Reclassify discounts
  const dr=calcDiscReclassification(week.discBuckets);
  // True promotional discount: total discounts minus service recovery and staff discounts.
  // Marketing gifting (dr.marketingDiscRetail) is Shopify's retail artefact — NOT subtracted
  // from revenue. The real gifting cost (COGS of units) is already in Collab COGS in OPEX.
  const promoDisc = dr.promoDisc || (totalDiscounts - dr.serviceRecoveryRetail - dr.staffDisc - dr.marketingDiscRetail);
  const truePromoDisc = Math.max(0, promoDisc);

  const netRevenue = gross - refunds - truePromoDisc + shipInc - ppFees;

  const mfgP=n(week.cogs.manufacturing_product), mfgS=n(week.cogs.manufacturing_shipping);
  const satchelCost=week.cogs.satchel_cost_each||fixed?.satchelCostDefault||"0.85";
  const satchel=n(week.cogs.satchel_count)*n(satchelCost);
  const otherPkg=n(week.cogs.other_packaging);
  // Service recovery COGS added to COGS
  const totalCOGS=mfgP+mfgS+satchel+otherPkg+dr.serviceRecoveryCOGS;

  const grossProfit=netRevenue-totalCOGS;
  const grossMargin=netRevenue>0?(grossProfit/netRevenue)*100:0;

  const keys=opexKeys||DEFAULT_OPEX_KEYS;
  const getO=k=>{
    if(week.opex?.[k]!==""&&week.opex?.[k]!==undefined)return n(week.opex[k]);
    if(fixed?.fixedKeys?.includes(k))return n(fixed?.values?.[k]);
    return 0;
  };
  const totalOPEXBase=keys.reduce((s,{key})=>s+getO(key),0);
  // Marketing gifting retail value is NOT added to OPEX.
  // The real cost (manufacturing COGS of gifted units) is already captured
  // by the user in Collab COGS under OPEX. No double-counting.
  const totalOPEX=totalOPEXBase;

  const wDepts=depts||DEFAULT_WAGE_DEPTS;
  // Staff discount reclassified as wages/staff benefit
  const totalWages=allWageKeys(wDepts).reduce((s,k)=>s+n(week.wages?.[k]||0),0)+dr.staffDisc;

  const totalFreight=keys.filter(k=>k.group==="freight").reduce((s,{key})=>s+getO(key),0);
  const totalCollabs=keys.filter(k=>k.group==="collabs").reduce((s,{key})=>s+getO(key),0);

  const totalExpenses=totalCOGS+totalOPEX+totalWages;
  const netProfit=netRevenue-totalExpenses;
  const netMargin=netRevenue>0?(netProfit/netRevenue)*100:0;

  return {
    netRevenue, totalCOGS, grossProfit, grossMargin, totalOPEX, totalWages,
    totalFreight, totalCollabs, totalExpenses, netProfit, netMargin,
    mfgP, mfgS, satchel, otherPkg, ppFees, refunds,
    gross, shipInc,
    truePromoDisc, totalDiscounts,
    discReclass:dr,
  };
}

function calcMonth(weeks,fixed,extras,opexKeys,depts){
  const wc=weeks.map(w=>calcWeek(w,fixed,opexKeys,depts));
  const sum=f=>wc.reduce((s,c)=>s+c[f],0);
  const keys=opexKeys||DEFAULT_OPEX_KEYS;
  const extraOpex=extras?keys.reduce((s,{key})=>s+n(extras.opex?.[key]),0):0;
  const netRevenue=sum("netRevenue"), totalCOGS=sum("totalCOGS"), grossProfit=sum("grossProfit");
  const grossMargin=netRevenue>0?(grossProfit/netRevenue)*100:0;
  const totalFreight=sum("totalFreight"), totalCollabs=sum("totalCollabs"), totalWages=sum("totalWages");
  const totalOPEX=sum("totalOPEX")+extraOpex;
  const totalExpenses=sum("totalExpenses")+extraOpex;
  const netProfit=netRevenue-totalExpenses;
  const netMargin=netRevenue>0?(netProfit/netRevenue)*100:0;
  return {netRevenue,totalCOGS,grossProfit,grossMargin,totalFreight,totalCollabs,totalWages,totalOPEX,totalExpenses,netProfit,netMargin,weekCalcs:wc,extraOpex};
}

// ─── Storage ──────────────────────────────────────────────────────────────────
const JSONBIN_ID=import.meta.env.VITE_JSONBIN_ID;
const JSONBIN_KEY=import.meta.env.VITE_JSONBIN_KEY;
const PASSWORD=import.meta.env.VITE_PASSWORD;

async function loadAll(){
  if(JSONBIN_ID&&JSONBIN_KEY){
    try{
      const res=await fetch("https://api.jsonbin.io/v3/b/"+JSONBIN_ID+"/latest",{headers:{"X-Master-Key":JSONBIN_KEY}});
      const d=await res.json();
      if(d.record)return{monthData:d.record.monthData||{},fixed:d.record.fixed||null,settings:d.record.settings||null};
    }catch(e){console.warn("JSONBin load failed",e);}
  }
  // Try both storage keys (migration from older versions)
  for(const key of["pl_v6","pl_v5","pl_v4"]){
    try{const loc=localStorage.getItem(key);if(loc)return JSON.parse(loc);}catch(e){}
  }
  return{monthData:{},fixed:null,settings:null};
}

async function saveAll(monthData,fixed,settings){
  const payload={monthData,fixed,settings};
  try{localStorage.setItem("pl_v6",JSON.stringify(payload));}catch(e){}
  if(!JSONBIN_ID||!JSONBIN_KEY)return;
  try{
    const res=await fetch("https://api.jsonbin.io/v3/b/"+JSONBIN_ID,{method:"PUT",headers:{"Content-Type":"application/json","X-Master-Key":JSONBIN_KEY},body:JSON.stringify(payload)});
    if(!res.ok)console.warn("JSONBin save failed",res.status);
  }catch(e){console.warn("JSONBin save error",e);}
}

// ─── Shopify Parser ───────────────────────────────────────────────────────────
function parseShopify(raw){
  if(!raw?.trim())return{};
  const result={gross_sales:0,refunds:0,discounts:0,shipping_income:0};
  raw.split("\n").forEach(line=>{
    const low=line.toLowerCase(),nums=line.match(/[\d,]+\.?\d*/g);
    if(!nums)return;
    const val=parseFloat(nums[nums.length-1].replace(/,/g,""))||0;
    if(low.includes("gross sale")||low.includes("total sale"))result.gross_sales=val;
    else if(low.includes("refund")||low.includes("return"))result.refunds=val;
    else if(low.includes("discount"))result.discounts=val;
    else if(low.includes("shipping")&&!low.includes("free")&&!low.includes("carrier"))result.shipping_income=val;
  });
  return Object.fromEntries(Object.entries(result).map(([k,v])=>[k,v||""]));
}

// ─── Export ───────────────────────────────────────────────────────────────────
function generateExport(weeks,fixed,extras,mLabel,opexKeys,depts,staff,labels){
  const fmt=v=>"$"+Math.abs(v).toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:2});
  const pct=(v,b)=>b>0?((v/b)*100).toFixed(1)+"%":"0.0%";
  const keys=opexKeys||DEFAULT_OPEX_KEYS;
  const wDepts=depts||DEFAULT_WAGE_DEPTS;
  const mc=calcMonth(weeks,fixed,extras,keys,wDepts);
  const gSales=weeks.reduce((s,w)=>s+n(w.revenue.gross_sales),0);
  const tDisc=weeks.reduce((s,w)=>s+n(w.revenue.discounts),0);
  let o="=== P&L ANALYSIS - "+mLabel+" ===\nGenerated: "+new Date().toLocaleDateString("en-AU")+"\n\n";
  o+="--- MONTHLY SUMMARY ---\n";
  o+="Gross Sales: "+fmt(gSales)+" | Total Discounts (all codes): "+fmt(tDisc)+" ("+pct(tDisc,gSales)+" of gross)\n";
  o+="Net Revenue (after true promo discounts only): "+fmt(mc.netRevenue)+"\n";
  o+="Total COGS (incl. service recovery): "+fmt(mc.totalCOGS)+" | Gross Profit: "+fmt(mc.grossProfit)+" ("+mc.grossMargin.toFixed(1)+"%)\n";
  o+="Freight: "+fmt(mc.totalFreight)+" | Collabs: "+fmt(mc.totalCollabs)+" | Wages (incl. staff discounts): "+fmt(mc.totalWages)+" | OPEX (incl. influencer gifting): "+fmt(mc.totalOPEX)+"\n";
  o+="Total Expenses: "+fmt(mc.totalExpenses)+" | NET PROFIT: "+fmt(mc.netProfit)+" ("+mc.netMargin.toFixed(1)+"%)\n\n";

  // Discount reclassification summary
  const totalDR=mc.weekCalcs.reduce((s,c)=>({
    serviceRecoveryCOGS:s.serviceRecoveryCOGS+(c.discReclass?.serviceRecoveryCOGS||0),
    serviceRecoveryOrders:s.serviceRecoveryOrders+(c.discReclass?.serviceRecoveryOrders||0),
    marketingDiscRetail:s.marketingDiscRetail+(c.discReclass?.marketingDiscRetail||0),
    staffDisc:s.staffDisc+(c.discReclass?.staffDisc||0),
    promoDisc:s.promoDisc+(c.discReclass?.promoDisc||0),
  }),{serviceRecoveryCOGS:0,serviceRecoveryOrders:0,marketingDiscRetail:0,staffDisc:0,promoDisc:0});
  o+="--- DISCOUNT RECLASSIFICATION ---\n";
  o+="Total Shopify discounts recorded: "+fmt(tDisc)+"\n";
  o+="  Influencer gifting — Shopify retail artefact (REFERENCE ONLY, zero P&L impact): "+fmt(totalDR.marketingDiscRetail)+"\n";
  o+="  IMPORTANT: This is the retail price of product sent to influencers at $0. It is NOT\n";
  o+="  a cash cost at retail value and NOT a revenue loss. Shopify records it as a 'discount'\n";
  o+="  because checkout price was $0. The real cost — manufacturing COGS of gifted units —\n";
  o+="  is already captured in Collab COGS under OPEX. Do not treat this as gifting spend.\n";
  o+="  Service Recovery (reclassified → COGS): "+fmt(totalDR.serviceRecoveryCOGS)+" | "+totalDR.serviceRecoveryOrders+" orders\n";
  o+="  Staff discounts (reclassified → Wages / staff benefit): "+fmt(totalDR.staffDisc)+"\n";
  o+="  TRUE PROMOTIONAL DISCOUNTS (the only bucket reducing Net Revenue): "+fmt(totalDR.promoDisc)+" ("+pct(totalDR.promoDisc,gSales)+" of gross)\n\n";

  weeks.forEach((w,i)=>{
    const c=mc.weekCalcs[i];
    o+="--- "+w.label+" | "+w.dateRange+" ---\n";
    o+="  Gross: "+fmt(n(w.revenue.gross_sales))+" | Total Discounts: -"+fmt(n(w.revenue.discounts))+" | True Promo Discount: -"+fmt(c.truePromoDisc)+" | Refunds: -"+fmt(n(w.revenue.refunds))+" | ShipIncome: +"+fmt(n(w.revenue.shipping_income))+" | PayPal: -"+fmt(n(w.revenue.paypal_fees))+" => NET: "+fmt(c.netRevenue)+"\n";
    o+="  COGS: MfgProduct "+fmt(n(w.cogs.manufacturing_product))+" | Inbound "+fmt(n(w.cogs.manufacturing_shipping))+" | Satchels "+n(w.cogs.satchel_count)+"@$"+(w.cogs.satchel_cost_each||fixed?.satchelCostDefault||"0.85")+"="+fmt(c.satchel)+" | ServiceRecovery "+fmt(c.discReclass.serviceRecoveryCOGS)+" => TOTAL: "+fmt(c.totalCOGS)+" | GP: "+fmt(c.grossProfit)+" ("+c.grossMargin.toFixed(1)+"%)\n";
    const fLines=keys.filter(k=>k.group==="freight").map(k=>{const v=w.opex?.[k.key]!==""?n(w.opex[k.key]):(fixed?.fixedKeys?.includes(k.key)?n(fixed?.values?.[k.key]):0);return k.label+": "+fmt(v);});
    o+="  Freight: "+fLines.join(" | ")+" => "+fmt(c.totalFreight)+"\n";
    const cLines=keys.filter(k=>k.group==="collabs").map(k=>{const v=w.opex?.[k.key]!==""?n(w.opex[k.key]):(fixed?.fixedKeys?.includes(k.key)?n(fixed?.values?.[k.key]):0);return k.label+": "+fmt(v);});
    o+="  Collabs (OPEX): "+cLines.join(" | ")+" => "+fmt(c.totalCollabs)+" [NOTE: Collab COGS already includes manufacturing cost of gifted units]\n";
    const wLines=wDepts.flatMap(d=>d.subs.map(s=>s.label+": "+fmt(n(w.wages?.[s.key]||0))));
    o+="  Wages: "+wLines.join(" | ")+" | StaffBenefits: "+fmt(c.discReclass.staffDisc)+" => "+fmt(c.totalWages)+"\n";
    const gLines=keys.filter(k=>k.group==="general").map(k=>{const v=w.opex?.[k.key]!==""?n(w.opex[k.key]):(fixed?.fixedKeys?.includes(k.key)?n(fixed?.values?.[k.key]):0);return v>0?k.label+": "+fmt(v):null;}).filter(Boolean);
    o+="  OPEX: "+(gLines.join(" | ")||"none")+" => "+fmt(c.totalOPEX)+"\n";
    o+="  NET PROFIT: "+fmt(c.netProfit)+" ("+c.netMargin.toFixed(1)+"%)"+(w.notes?" | Notes: "+w.notes:"")+"\n\n";
  });

  if(extras&&mc.extraOpex>0){
    o+="--- MONTHLY ADJUSTMENTS ---\n";
    keys.forEach(({key,label})=>{if(n(extras.opex?.[key])>0)o+="  "+label+": "+fmt(n(extras.opex[key]))+"\n";});
    o+="  Extra OPEX Total: "+fmt(mc.extraOpex)+"\n\n";
  }
  if(staff&&staff.length>0){
    o+="--- STAFF ROSTER ---\n";
    staff.forEach(s=>{const wc=n(s.hourlyRate)*n(s.hoursPerWeek);o+="  "+s.name+" | "+s.type+" | $"+n(s.hourlyRate).toFixed(2)+"/hr | "+n(s.hoursPerWeek)+"hrs/wk | Weekly cost: "+fmt(wc)+"\n";});
    const total=staff.reduce((s,m)=>s+n(m.hourlyRate)*n(m.hoursPerWeek),0);
    o+="  Budgeted: "+fmt(total)+" | Actual: "+fmt(mc.totalWages)+" | Variance: "+fmt(mc.totalWages-total)+"\n\n";
  }
  o+="=== END DATA ===\n\nYou are the COO's senior financial advisor. Produce a comprehensive P&L analysis in full paragraphs (NOT dot points).\n\n";
  o+="1. PROFITABILITY VERDICT - Net margin vs benchmarks (10-15% net, 40-65% gross). Growth/maintenance/risk posture.\n\n";
  o+="2. DISCOUNT RECLASSIFICATION IMPACT - The Shopify 'discounts' figure includes the retail value of influencer gifting (a Shopify accounting artefact — the product was sent at $0 so Shopify records the full retail price as a discount, but this is NOT a real cash cost at retail and NOT lost revenue), service recovery codes (operational/COGS expense), and staff discounts (staff benefit). The real cost of influencer gifting is the manufacturing COGS of units sent, which is already captured in Collab COGS under OPEX. Explain clearly: (a) what the true promotional discount rate is to paying customers, (b) how the reclassification corrects Net Revenue, and (c) what the service recovery rate signals about product quality and operational efficiency.\n\n";
  o+="3. WEEK-ON-WEEK TRENDS - Trajectory, patterns, outliers.\n\n";
  o+="4. MONEY BLEED - Every cost category, dollar amount and % of net revenue. Ranked by impact.\n\n";
  o+="5. REVENUE QUALITY - True promo discount rate, refund rate, net revenue yield per gross dollar.\n\n";
  o+="6. SERVICE RECOVERY DEEP DIVE - Cost per service recovery order. What product/process failure is driving this? Annualise the cost.\n\n";
  o+="7. COGS AND GROSS MARGIN - Manufacturing efficiency. Volume scenarios.\n\n";
  o+="8. FREIGHT EFFICIENCY - Carrier split, net shipping subsidy, recovery strategy.\n\n";
  o+="9. COLLAB AND INFLUENCER ROI - Total spend including gifting. Minimum ROAS thresholds.\n\n";
  o+="10. WAGES BY DEPARTMENT - Wages as % of net revenue. Efficiency and sustainability.\n\n";
  o+="11. OPEX LINE BY LINE - Justify, benchmark, renegotiate. Model 20% revenue decline.\n\n";
  o+="12. TOP 5 ACTIONS - Exact dollar improvement, mechanism, timeline, trade-off.\n\n";
  o+="13. MARGIN EXPANSION - Structural changes over 90 days.\n\n";
  o+="14. NEXT MONTH TARGETS - Exact dollar targets. Break-even calculation.\n\n";
  o+="15. NEXT WEEK STAFFING PLAN - Based on roster vs actual wages variance, recommend exact hours per person for next week to hit a 15% net margin at current revenue run rate.\n\nUse exact figures. Flag anomalies. Make it worth reading.";
  return o;
}

function generateComparativeExport(periodsData){
  const fmt=v=>"$"+Math.abs(v).toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:2});
  let o="=== COMPARATIVE P&L ANALYSIS ===\nGenerated: "+new Date().toLocaleDateString("en-AU")+"\n\n";
  periodsData.forEach(({label,mc})=>{o+=label+": Net Revenue "+fmt(mc.netRevenue)+" | GP "+mc.grossMargin.toFixed(1)+"% | Net Profit "+fmt(mc.netProfit)+" ("+mc.netMargin.toFixed(1)+"%)\n";});
  o+="\n--- METRICS ---\n";
  [["Net Revenue","netRevenue"],["Gross Profit","grossProfit"],["Gross Margin %","grossMargin"],["Total COGS","totalCOGS"],["Total Freight","totalFreight"],["Total Wages","totalWages"],["Total OPEX","totalOPEX"],["Total Expenses","totalExpenses"],["Net Profit","netProfit"],["Net Margin %","netMargin"]].forEach(([l,k])=>{
    const p=l.includes("%");
    o+=l+": "+periodsData.map(({label:pl,mc})=>pl+": "+(p?mc[k].toFixed(1)+"%":fmt(mc[k]))).join(" | ")+"\n";
  });
  o+="\n=== END DATA ===\n\nComparative P&L analysis in full paragraphs:\n1. PERFORMANCE COMPARISON 2. TREND DIRECTION 3. COST STRUCTURE CHANGES 4. REVENUE QUALITY 5. MARGIN TRAJECTORY 6. WHAT WORKED 7. WHAT DETERIORATED 8. FORWARD PROJECTION 9. TOP 5 ACTIONS\n\nUse exact figures. Be commercially direct.";
  return o;
}

// ─── UI Atoms ─────────────────────────────────────────────────────────────────
const fmtD=v=>(v<0?"-":"")+"$"+Math.abs(v).toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtS=v=>(v<0?"-":"")+"$"+Math.abs(v).toLocaleString("en-AU",{minimumFractionDigits:0,maximumFractionDigits:0});

function useBI(){const {S,BR,TX,ff,radius}=useTheme();return {width:"100%",boxSizing:"border-box",background:S,border:"1px solid "+BR,color:TX,padding:"8px 10px",fontFamily:ff,fontSize:14,outline:"none",borderRadius:radius};}

function CI({value,onChange,placeholder="0.00",tint}){
  const {S,BR,A,MU,ff,radius}=useTheme();
  const bi=useBI();
  return(
    <div style={{position:"relative"}}>
      <span style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",color:MU,fontFamily:ff,fontSize:13,pointerEvents:"none"}}>$</span>
      <input type="number" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        style={{...bi,paddingLeft:22,background:tint||S}} onFocus={e=>e.target.style.borderColor=A} onBlur={e=>e.target.style.borderColor=BR}/>
    </div>
  );
}

function NI({value,onChange,placeholder="0"}){
  const {BR,A}=useTheme(); const bi=useBI();
  return <input type="number" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
    style={bi} onFocus={e=>e.target.style.borderColor=A} onBlur={e=>e.target.style.borderColor=BR}/>;
}

function Lbl({c,children}){const {MU,ff}=useTheme();return <div style={{color:c||MU,fontFamily:ff,fontSize:11,letterSpacing:0.8,textTransform:"uppercase",marginBottom:5}}>{children}</div>;}
function SH({children,sub}){const {A,BR,MU,ff}=useTheme();return <div style={{fontFamily:ff,fontSize:sub?9:10,letterSpacing:sub?1.5:2.5,textTransform:"uppercase",color:sub?MU:A,borderBottom:"1px solid "+BR,paddingBottom:7,marginBottom:14,marginTop:sub?16:26}}>{children}</div>;}
function Row({children,gap=10}){return <div style={{display:"flex",gap,flexWrap:"wrap",marginTop:12}}>{children}</div>;}
function Grid({children,cols=2}){return <div style={{display:"grid",gridTemplateColumns:"repeat("+cols+",1fr)",gap:10}}>{children}</div>;}
function Fld({label,children}){return <div><Lbl>{label}</Lbl>{children}</div>;}

function Badge({label,value,color,small}){
  const {S2,BR,GR,RD,MU,ff,radius}=useTheme();
  const col=color||(typeof value==="number"&&value<0?RD:GR);
  return(
    <div style={{background:S2,border:"1px solid "+BR,borderRadius:radius+1,padding:small?"9px 13px":"13px 17px",flex:1,minWidth:110}}>
      <Lbl c={MU}>{label}</Lbl>
      <div style={{color:col,fontFamily:ff,fontSize:small?14:18,fontWeight:"bold"}}>{typeof value==="number"?fmtD(value):value}</div>
    </div>
  );
}
function Pct({label,value,small}){
  const {S2,BR,MU,GR,RD,ff,radius}=useTheme();
  return(
    <div style={{background:S2,border:"1px solid "+BR,borderRadius:radius+1,padding:small?"9px 13px":"13px 17px",flex:1,minWidth:90}}>
      <Lbl c={MU}>{label}</Lbl>
      <div style={{color:value>=0?GR:RD,fontFamily:ff,fontSize:small?14:18,fontWeight:"bold"}}>{value.toFixed(1)}%</div>
    </div>
  );
}

// E = Editable inline text (hover to reveal edit)
function E({value,onSave,style={},multiline=false}){
  const [editing,setEditing]=useState(false);
  const [draft,setDraft]=useState(value);
  const [hover,setHover]=useState(false);
  const {A}=useTheme();
  useEffect(()=>setDraft(value),[value]);
  const commit=()=>{setEditing(false);if(draft.trim()!==value)onSave(draft.trim()||value);};
  if(editing){
    if(multiline)return <textarea value={draft} onChange={e=>setDraft(e.target.value)} onBlur={commit} autoFocus
      style={{background:"transparent",border:"none",borderBottom:"1px solid "+A,color:"inherit",fontFamily:"inherit",fontSize:"inherit",outline:"none",width:"100%",resize:"none",lineHeight:1.5,...style}}/>;
    return <input value={draft} onChange={e=>setDraft(e.target.value)} onBlur={commit}
      onKeyDown={e=>{if(e.key==="Enter")commit();if(e.key==="Escape"){setEditing(false);setDraft(value);}}}
      autoFocus style={{background:"transparent",border:"none",borderBottom:"1px solid "+A,color:"inherit",fontFamily:"inherit",fontSize:"inherit",outline:"none",width:"100%",...style}}/>;
  }
  return(
    <span onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}
      style={{display:"inline-flex",alignItems:"center",gap:5,cursor:"text",...style}}>
      <span>{value}</span>
      <span onClick={()=>setEditing(true)} style={{opacity:hover?0.35:0,fontSize:9,color:A,transition:"opacity 0.15s",userSelect:"none",letterSpacing:0.5,textTransform:"lowercase",fontWeight:"normal"}}>edit</span>
    </span>
  );
}

// Accordion wrapper
function Accordion({title,children,defaultOpen=false,accent=false}){
  const [open,setOpen]=useState(defaultOpen);
  const {A,MU,BR,S2,ff,radius}=useTheme();
  return(
    <div style={{border:"1px solid "+(accent?A:BR),borderRadius:radius+2,marginTop:16,overflow:"hidden"}}>
      <button onClick={()=>setOpen(!open)}
        style={{width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",background:open?S2:"transparent",border:"none",cursor:"pointer",textAlign:"left"}}>
        <span style={{fontFamily:ff,fontSize:10,letterSpacing:2,textTransform:"uppercase",color:accent?A:MU}}>{title}</span>
        <span style={{color:accent?A:MU,fontSize:14,lineHeight:1,transition:"transform 0.2s",transform:open?"rotate(180deg)":"rotate(0deg)"}}>v</span>
      </button>
      {open&&<div style={{padding:"16px"}}>{children}</div>}
    </div>
  );
}

// ─── Discount Breakdown Section ───────────────────────────────────────────────
function DiscountBreakdown({week,onChange,labels}){
  const {A,MU,BR,S2,TX,GR,RD,YL,ff,radius}=useTheme();
  const buckets=DEFAULT_DISC_BUCKETS;
  const db=week.discBuckets||emptyDiscBuckets();
  const totalDiscounts=n(week.revenue.discounts);

  const upBucket=(id,field,val)=>{
    onChange({...week,discBuckets:{...db,[id]:{...db[id],[field]:val}}});
  };

  const dr=calcDiscReclassification(db);
  const allocatedDisc=dr.serviceRecoveryRetail+dr.marketingDiscRetail+dr.staffDisc+dr.promoDisc;
  const unallocated=totalDiscounts-allocatedDisc;

  const bucketColors={service_recovery:RD,marketing:YL,staff:A,promotional:GR};
  const bucketIcons={service_recovery:"!",marketing:"*",staff:"s",promotional:"p"};

  return(
    <Accordion title={<E value={labels.disc_section} onSave={v=>labels._save("disc_section",v)} style={{fontFamily:ff,fontSize:10,color:A}}/>} accent>
      <div style={{fontFamily:ff,fontSize:12,color:MU,marginBottom:16,lineHeight:1.7}}>
        <E value={labels.disc_section_sub} onSave={v=>labels._save("disc_section_sub",v)} style={{fontFamily:ff,fontSize:12,color:MU}} multiline/>
      </div>

      {/* Summary bar */}
      <div style={{background:S2,borderRadius:radius+1,padding:"12px 14px",marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
          <span style={{fontFamily:ff,fontSize:11,color:MU,textTransform:"uppercase",letterSpacing:1}}>Total Shopify Discounts to Allocate</span>
          <span style={{fontFamily:ff,fontSize:14,color:TX,fontWeight:"bold"}}>{fmtD(totalDiscounts)}</span>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {[["Service Rec.",dr.serviceRecoveryRetail,RD,"→ COGS"],["Staff",dr.staffDisc,A,"→ Wages"],["Promo",dr.promoDisc,GR,"→ Revenue deduction"],["Gifting (ref)",dr.marketingDiscRetail,"#ffd97d","retail artefact only"]].map(([l,v,c,note])=>(
            <div key={l} style={{flex:1,minWidth:80,background:BR,borderRadius:3,padding:"6px 8px",borderLeft:"3px solid "+c}}>
              <div style={{fontFamily:ff,fontSize:9,color:MU,textTransform:"uppercase",letterSpacing:0.8}}>{l}</div>
              <div style={{fontFamily:ff,fontSize:12,color:c,fontWeight:"bold",marginTop:2}}>{fmtD(v)}</div>
              <div style={{fontFamily:ff,fontSize:9,color:MU,marginTop:1}}>{note}</div>
            </div>
          ))}
        </div>
        {/* Allocation check: gifting retail doesn't count toward allocation since it's not a real discount to paying customers */}
        {(()=>{const realAlloc=dr.serviceRecoveryRetail+dr.staffDisc+dr.promoDisc+dr.marketingDiscRetail; const diff=totalDiscounts-realAlloc; return Math.abs(diff)>0.01?(<div style={{marginTop:8,fontFamily:ff,fontSize:11,color:Math.abs(diff)>1?RD:MU}}>Unallocated: {fmtD(diff)} — allocate remaining across buckets below</div>):null;})()}
      </div>

      {buckets.map(bucket=>{
        const bData=db[bucket.id]||{retailValue:"",orders:"",cogsValue:"",codes:bucket.defaultCodes};
        const col=bucketColors[bucket.id]||A;
        const reclassBadge={service_recovery:"Reclassified as: COGS / Operational Expense",marketing:"Reference only — real cost (unit COGS) is in Collab COGS",staff:"Reclassified as: Staff Benefits (Wages)",promotional:"Stays as: Revenue Deduction"}[bucket.id];
        return(
          <div key={bucket.id} style={{background:S2,border:"1px solid "+col+"44",borderRadius:radius+1,padding:"14px 16px",marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
              <div>
                <div style={{fontFamily:ff,fontSize:11,color:col,letterSpacing:1.5,textTransform:"uppercase",fontWeight:"bold",marginBottom:4}}>
                  <E value={labels[bucket.labelKey]||bucket.id} onSave={v=>labels._save(bucket.labelKey,v)} style={{fontFamily:ff,fontSize:11,color:col}}/>
                </div>
                <div style={{fontFamily:ff,fontSize:11,color:MU,lineHeight:1.6}}>
                  <E value={labels[bucket.subKey]||""} onSave={v=>labels._save(bucket.subKey,v)} style={{fontFamily:ff,fontSize:11,color:MU}}/>
                </div>
              </div>
              <div style={{background:col+"22",border:"1px solid "+col+"44",borderRadius:3,padding:"3px 8px",fontFamily:ff,fontSize:9,color:col,letterSpacing:0.8,textTransform:"uppercase",whiteSpace:"nowrap",marginLeft:12}}>
                {reclassBadge}
              </div>
            </div>
            <Grid cols={bucket.hasCOGS?3:2}>
              <Fld label={<E value={labels.disc_field_retail} onSave={v=>labels._save("disc_field_retail",v)} style={{fontFamily:ff,fontSize:11,color:MU}}/>}>
                <CI value={bData.retailValue} onChange={v=>upBucket(bucket.id,"retailValue",v)}/>
              </Fld>
              <Fld label={<E value={labels.disc_field_orders} onSave={v=>labels._save("disc_field_orders",v)} style={{fontFamily:ff,fontSize:11,color:MU}}/>}>
                <NI value={bData.orders} onChange={v=>upBucket(bucket.id,"orders",v)}/>
              </Fld>
              {bucket.hasCOGS&&(
                <Fld label={<E value={labels.disc_field_cogs} onSave={v=>labels._save("disc_field_cogs",v)} style={{fontFamily:ff,fontSize:11,color:MU}}/>}>
                  <CI value={bData.cogsValue} onChange={v=>upBucket(bucket.id,"cogsValue",v)}/>
                </Fld>
              )}
            </Grid>
            <div style={{marginTop:10}}>
              <Lbl><E value={labels.disc_field_codes} onSave={v=>labels._save("disc_field_codes",v)} style={{fontFamily:ff,fontSize:11,color:MU}}/></Lbl>
              <input value={bData.codes} onChange={e=>upBucket(bucket.id,"codes",e.target.value)} placeholder="CODE1, CODE2, ..."
                style={{...useBI(),fontFamily:"monospace",fontSize:12}}
                onFocus={e=>e.target.style.borderColor=col} onBlur={e=>{}}/>
            </div>
          </div>
        );
      })}
    </Accordion>
  );
}

// ─── Shopify Import ───────────────────────────────────────────────────────────
function ShopifyImport({week,onChange,labels}){
  const {S2,BR,A,S,TX,ff,MU,GR,RD,radius}=useTheme();
  const bi=useBI();
  const [raw,setRaw]=useState(week.shopifyRaw||"");
  const [msg,setMsg]=useState("");
  function apply(){
    const parsed=parseShopify(raw);
    const filled=Object.values(parsed).filter(v=>v!=="").length;
    if(!filled){setMsg("No values detected - check format");return;}
    onChange({...week,shopifyRaw:raw,revenue:{...week.revenue,...parsed}});
    setMsg("Auto-filled "+filled+" fields");setTimeout(()=>setMsg(""),3000);
  }
  return(
    <div style={{background:S2,border:"1px solid "+BR,borderRadius:radius+2,padding:"16px 18px",marginBottom:20}}>
      <div style={{fontFamily:ff,fontSize:10,letterSpacing:2,textTransform:"uppercase",color:A,marginBottom:8}}>
        <E value={labels.sec_shopify} onSave={v=>labels._save("sec_shopify",v)} style={{fontFamily:ff,fontSize:10,color:A}}/>
      </div>
      <textarea value={raw} onChange={e=>setRaw(e.target.value)} placeholder="Paste Shopify CSV or tab-separated export here..." rows={4}
        style={{width:"100%",boxSizing:"border-box",background:S,border:"1px solid "+BR,color:TX,padding:"10px 12px",fontFamily:"monospace",fontSize:12,outline:"none",borderRadius:radius,resize:"vertical"}}/>
      <div style={{display:"flex",alignItems:"center",gap:12,marginTop:10}}>
        <button onClick={apply} style={{padding:"8px 18px",background:A,border:"none",color:"#000",fontFamily:ff,fontSize:12,cursor:"pointer",borderRadius:radius,fontWeight:"bold",letterSpacing:1}}>
          <E value={labels.sec_shopify_btn} onSave={v=>labels._save("sec_shopify_btn",v)} style={{fontFamily:ff,fontSize:12,color:"#000"}}/>
        </button>
        {msg&&<span style={{fontFamily:ff,fontSize:12,color:msg.includes("No")?RD:GR}}>{msg}</span>}
      </div>
    </div>
  );
}

// ─── Week Form ────────────────────────────────────────────────────────────────
function WeekForm({week,onChange,fixed,opexKeys,depts,settings,onSettingsChange,labels}){
  const {S,S2,BR,A,MU,YL,RD,TX,ff,radius}=useTheme();
  const keys=opexKeys||DEFAULT_OPEX_KEYS;
  const wDepts=depts||DEFAULT_WAGE_DEPTS;
  const bi=useBI();
  const upR=(k,v)=>onChange({...week,revenue:{...week.revenue,[k]:v}});
  const upC=(k,v)=>onChange({...week,cogs:{...week.cogs,[k]:v}});
  const upO=(k,v)=>onChange({...week,opex:{...week.opex,[k]:v}});
  const upW=(k,v)=>onChange({...week,wages:{...week.wages,[k]:v}});
  const c=calcWeek(week,fixed,keys,wDepts);
  const satchelCost=week.cogs.satchel_cost_each||fixed?.satchelCostDefault||"0.85";
  const freightKeys=keys.filter(k=>k.group==="freight");
  const collabKeys=keys.filter(k=>k.group==="collabs");
  const generalKeys=keys.filter(k=>k.group==="general");

  const renameOpex=(key,nl)=>{if(onSettingsChange){const nk=(settings?.opexKeys||keys).map(k=>k.key===key?{...k,label:nl}:k);onSettingsChange({...settings,opexKeys:nk});}};
  const renameDept=(dk,nl)=>{if(onSettingsChange){const nd=(settings?.wageDepts||wDepts).map(d=>d.key===dk?{...d,label:nl}:d);onSettingsChange({...settings,wageDepts:nd});}};
  const renameSub=(sk,nl)=>{if(onSettingsChange){const nd=(settings?.wageDepts||wDepts).map(d=>({...d,subs:d.subs.map(s=>s.key===sk?{...s,label:nl}:s)}));onSettingsChange({...settings,wageDepts:nd});}};

  const opexField=(key,label)=>{
    const isFixed=fixed?.fixedKeys?.includes(key);
    const hasFixed=isFixed&&n(fixed?.values?.[key])>0;
    const weekHasVal=week.opex?.[key]!=="";
    const tint=hasFixed&&!weekHasVal?"#1c1730":undefined;
    const display=weekHasVal?week.opex[key]:(hasFixed?fixed.values[key]:"");
    return(
      <Fld key={key} label={<E value={label} onSave={nl=>renameOpex(key,nl)} style={{fontFamily:ff,fontSize:11,color:MU,textTransform:"uppercase",letterSpacing:0.8}}/>}>
        <CI value={display} onChange={v=>upO(key,v)} tint={tint}/>
      </Fld>
    );
  };

  return(
    <div>
      <ShopifyImport week={week} onChange={onChange} labels={labels}/>

      <SH><E value={labels.sec_revenue} onSave={v=>labels._save("sec_revenue",v)} style={{color:A,fontFamily:ff,fontSize:10}}/></SH>
      <Grid>
        <Fld label={<E value={labels.field_gross_sales} onSave={v=>labels._save("field_gross_sales",v)} style={{color:MU,fontFamily:ff,fontSize:11}}/>}><CI value={week.revenue.gross_sales} onChange={v=>upR("gross_sales",v)}/></Fld>
        <Fld label={<E value={labels.field_refunds} onSave={v=>labels._save("field_refunds",v)} style={{color:MU,fontFamily:ff,fontSize:11}}/>}><CI value={week.revenue.refunds} onChange={v=>upR("refunds",v)}/></Fld>
        <Fld label={<E value={labels.field_discounts} onSave={v=>labels._save("field_discounts",v)} style={{color:MU,fontFamily:ff,fontSize:11}}/>}><CI value={week.revenue.discounts} onChange={v=>upR("discounts",v)}/></Fld>
        <Fld label={<E value={labels.field_shipping_income} onSave={v=>labels._save("field_shipping_income",v)} style={{color:MU,fontFamily:ff,fontSize:11}}/>}><CI value={week.revenue.shipping_income} onChange={v=>upR("shipping_income",v)}/></Fld>
        <Fld label={<E value={labels.field_paypal_fees} onSave={v=>labels._save("field_paypal_fees",v)} style={{color:MU,fontFamily:ff,fontSize:11}}/>}><CI value={week.revenue.paypal_fees} onChange={v=>upR("paypal_fees",v)}/></Fld>
      </Grid>
      {/* Discount reclassification - collapsed by default */}
      <DiscountBreakdown week={week} onChange={onChange} labels={labels}/>
      {/* Show reclassified net revenue impact */}
      <div style={{marginTop:12,background:S2,border:"1px solid "+BR+"66",borderRadius:radius+1,padding:"10px 14px"}}>
        <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
          <span style={{fontFamily:ff,fontSize:11,color:MU}}>Total discounts (entered above): {fmtD(-n(week.revenue.discounts))}</span>
          <span style={{fontFamily:ff,fontSize:11,color:A}}>True promo discount only: {fmtD(-c.truePromoDisc)}</span>
          <span style={{fontFamily:ff,fontSize:11,color:MU}}>Reclassified to expenses: {fmtD(-(n(week.revenue.discounts)-c.truePromoDisc))}</span>
        </div>
      </div>
      <Row><Badge small label={<E value={labels.field_net_revenue} onSave={v=>labels._save("field_net_revenue",v)} style={{color:MU,fontFamily:ff,fontSize:11}}/>} value={c.netRevenue} color={A}/></Row>

      <SH><E value={labels.sec_cogs} onSave={v=>labels._save("sec_cogs",v)} style={{color:A,fontFamily:ff,fontSize:10}}/></SH>
      <Grid>
        <Fld label={<E value={labels.field_mfg_product} onSave={v=>labels._save("field_mfg_product",v)} style={{color:MU,fontFamily:ff,fontSize:11}}/>}><CI value={week.cogs.manufacturing_product} onChange={v=>upC("manufacturing_product",v)}/></Fld>
        <Fld label={<E value={labels.field_mfg_shipping} onSave={v=>labels._save("field_mfg_shipping",v)} style={{color:MU,fontFamily:ff,fontSize:11}}/>}><CI value={week.cogs.manufacturing_shipping} onChange={v=>upC("manufacturing_shipping",v)}/></Fld>
      </Grid>
      <div style={{marginTop:14,background:S2,border:"1px solid "+BR,borderRadius:radius+1,padding:"12px 14px"}}>
        <div style={{fontFamily:ff,fontSize:10,letterSpacing:1.5,color:A,textTransform:"uppercase",marginBottom:10}}>
          <E value={labels.sec_satchel} onSave={v=>labels._save("sec_satchel",v)} style={{color:A,fontFamily:ff,fontSize:10}}/>
        </div>
        <Grid>
          <Fld label={<E value={labels.field_satchel_count} onSave={v=>labels._save("field_satchel_count",v)} style={{color:MU,fontFamily:ff,fontSize:11}}/>}>
            <input type="number" value={week.cogs.satchel_count} onChange={e=>upC("satchel_count",e.target.value)} placeholder="0" style={bi} onFocus={e=>e.target.style.borderColor=A} onBlur={e=>e.target.style.borderColor=BR}/>
          </Fld>
          <Fld label={<E value={labels.field_satchel_cost} onSave={v=>labels._save("field_satchel_cost",v)} style={{color:MU,fontFamily:ff,fontSize:11}}/>}><CI value={satchelCost} onChange={v=>upC("satchel_cost_each",v)}/></Fld>
        </Grid>
        <div style={{fontFamily:ff,fontSize:13,color:YL,marginTop:8}}><E value={labels.field_satchel_total} onSave={v=>labels._save("field_satchel_total",v)} style={{color:YL,fontFamily:ff,fontSize:13}}/>: {fmtD(c.satchel)}</div>
      </div>
      {c.discReclass.serviceRecoveryCOGS>0&&(
        <div style={{marginTop:10,background:"#1a0a0a",border:"1px solid "+RD+"44",borderRadius:radius+1,padding:"10px 14px"}}>
          <span style={{fontFamily:ff,fontSize:11,color:RD}}>Service Recovery COGS auto-added: {fmtD(c.discReclass.serviceRecoveryCOGS)} (from discount breakdown above)</span>
        </div>
      )}
      <div style={{marginTop:10}}><Fld label={<E value={labels.field_other_pkg} onSave={v=>labels._save("field_other_pkg",v)} style={{color:MU,fontFamily:ff,fontSize:11}}/>}><CI value={week.cogs.other_packaging} onChange={v=>upC("other_packaging",v)}/></Fld></div>
      <Row>
        <Badge small label={<E value={labels.field_total_cogs} onSave={v=>labels._save("field_total_cogs",v)} style={{color:MU,fontFamily:ff,fontSize:11}}/>} value={-c.totalCOGS} color={RD}/>
        <Badge small label={<E value={labels.field_gross_profit} onSave={v=>labels._save("field_gross_profit",v)} style={{color:MU,fontFamily:ff,fontSize:11}}/>} value={c.grossProfit}/>
        <Pct small label={<E value={labels.field_gross_margin} onSave={v=>labels._save("field_gross_margin",v)} style={{color:MU,fontFamily:ff,fontSize:11}}/>} value={c.grossMargin}/>
      </Row>

      <SH><E value={labels.sec_opex} onSave={v=>labels._save("sec_opex",v)} style={{color:A,fontFamily:ff,fontSize:10}}/></SH>
      <div style={{fontFamily:ff,fontSize:11,color:MU,marginBottom:16}}><E value={labels.sec_opex_sub} onSave={v=>labels._save("sec_opex_sub",v)} style={{color:MU,fontFamily:ff,fontSize:11}} multiline/></div>

      <SH sub><E value={labels.sec_freight} onSave={v=>labels._save("sec_freight",v)} style={{color:MU,fontFamily:ff,fontSize:9}}/></SH>
      <div style={{fontFamily:ff,fontSize:11,color:MU,marginBottom:10}}><E value={labels.sec_freight_sub} onSave={v=>labels._save("sec_freight_sub",v)} style={{color:MU,fontFamily:ff,fontSize:11}}/></div>
      <Grid>{freightKeys.map(({key,label})=>opexField(key,label))}</Grid>
      <Row><Badge small label="Total Freight" value={-c.totalFreight} color={RD}/></Row>

      <SH sub><E value={labels.sec_collabs} onSave={v=>labels._save("sec_collabs",v)} style={{color:MU,fontFamily:ff,fontSize:9}}/></SH>
      <div style={{fontFamily:ff,fontSize:11,color:MU,marginBottom:10}}><E value={labels.sec_collabs_sub} onSave={v=>labels._save("sec_collabs_sub",v)} style={{color:MU,fontFamily:ff,fontSize:11}}/></div>
      <Grid>{collabKeys.map(({key,label})=>opexField(key,label))}</Grid>
      <Row><Badge small label="Total Collabs" value={-c.totalCollabs} color={RD}/></Row>

      <SH sub><E value={labels.sec_wages} onSave={v=>labels._save("sec_wages",v)} style={{color:MU,fontFamily:ff,fontSize:9}}/></SH>
      <div style={{fontFamily:ff,fontSize:11,color:MU,marginBottom:10}}><E value={labels.sec_wages_sub} onSave={v=>labels._save("sec_wages_sub",v)} style={{color:MU,fontFamily:ff,fontSize:11}}/></div>
      {wDepts.map(dept=>(
        <div key={dept.key} style={{marginBottom:16}}>
          <div style={{fontFamily:ff,fontSize:11,color:A,letterSpacing:1,textTransform:"uppercase",marginBottom:8,paddingBottom:4,borderBottom:"1px solid "+BR+"44"}}>
            <E value={dept.label} onSave={nl=>renameDept(dept.key,nl)} style={{fontFamily:ff,fontSize:11,color:A}}/>
          </div>
          <Grid>{dept.subs.map(sub=>(
            <Fld key={sub.key} label={<E value={sub.label} onSave={nl=>renameSub(sub.key,nl)} style={{color:MU,fontFamily:ff,fontSize:11}}/>}>
              <CI value={week.wages?.[sub.key]||""} onChange={v=>upW(sub.key,v)}/>
            </Fld>
          ))}</Grid>
        </div>
      ))}
      <Row><Badge small label="Total Wages" value={-c.totalWages} color={RD}/></Row>

      <SH sub><E value={labels.sec_general} onSave={v=>labels._save("sec_general",v)} style={{color:MU,fontFamily:ff,fontSize:9}}/></SH>
      <Grid>{generalKeys.map(({key,label})=>opexField(key,label))}</Grid>
      <Row><Badge small label="Total OPEX" value={-c.totalOPEX} color={RD}/></Row>

      <div style={{borderTop:"1px solid "+BR,marginTop:24,paddingTop:20}}>
        <div style={{fontFamily:ff,fontSize:10,letterSpacing:2,textTransform:"uppercase",color:A,marginBottom:14}}>
          <E value={labels.sec_summary} onSave={v=>labels._save("sec_summary",v)} style={{color:A,fontFamily:ff,fontSize:10}}/>
        </div>
        <Row>
          <Badge label={<E value={labels.field_net_revenue} onSave={v=>labels._save("field_net_revenue",v)} style={{color:MU,fontFamily:ff,fontSize:11}}/>} value={c.netRevenue} color={A}/>
          <Badge label={<E value={labels.field_total_expenses} onSave={v=>labels._save("field_total_expenses",v)} style={{color:MU,fontFamily:ff,fontSize:11}}/>} value={-c.totalExpenses} color={RD}/>
          <Badge label={<E value={labels.field_net_profit} onSave={v=>labels._save("field_net_profit",v)} style={{color:MU,fontFamily:ff,fontSize:11}}/>} value={c.netProfit}/>
          <Pct label={<E value={labels.field_net_margin} onSave={v=>labels._save("field_net_margin",v)} style={{color:MU,fontFamily:ff,fontSize:11}}/>} value={c.netMargin}/>
        </Row>
      </div>
      <SH><E value={labels.sec_notes} onSave={v=>labels._save("sec_notes",v)} style={{color:A,fontFamily:ff,fontSize:10}}/></SH>
      <textarea value={week.notes} onChange={e=>onChange({...week,notes:e.target.value})} placeholder="Unusual costs, one-offs, events..." rows={3}
        style={{width:"100%",boxSizing:"border-box",background:S,border:"1px solid "+BR,color:TX,padding:"10px 12px",fontFamily:ff,fontSize:14,outline:"none",borderRadius:radius,resize:"vertical"}}/>
    </div>
  );
}

// ─── Fixed Costs Page ─────────────────────────────────────────────────────────
function FixedCostsPage({fixed,onChange,opexKeys,settings,onSettingsChange,labels}){
  const {S2,BR,A,MU,ff,radius}=useTheme();
  const keys=opexKeys||DEFAULT_OPEX_KEYS;
  const total=keys.reduce((s,{key})=>s+n(fixed?.values?.[key]||0),0);
  const fixedKeys=fixed?.fixedKeys||[];
  const toggle=k=>{const nk=fixedKeys.includes(k)?fixedKeys.filter(x=>x!==k):[...fixedKeys,k];onChange({...fixed,fixedKeys:nk});};
  const renameKey=(key,nl)=>{if(onSettingsChange){const nk=keys.map(k=>k.key===key?{...k,label:nl}:k);onSettingsChange({...settings,opexKeys:nk});}};
  const renderGroup=(groupKeys,titleLabelKey)=>(
    <div style={{marginBottom:20}}>
      <SH sub><E value={labels[titleLabelKey]||groupKeys[0]?.group||"Group"} onSave={v=>labels._save(titleLabelKey,v)} style={{color:MU,fontFamily:ff,fontSize:9}}/></SH>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
        {groupKeys.map(({key,label})=>{
          const isF=fixedKeys.includes(key);
          return(
            <div key={key} style={{background:isF?"#1c1730":S2,border:"1px solid "+(isF?A:BR),borderRadius:radius+1,padding:"10px 12px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <E value={label} onSave={nl=>renameKey(key,nl)} style={{fontFamily:ff,fontSize:11,color:isF?A:MU,textTransform:"uppercase",letterSpacing:0.8}}/>
                <button onClick={()=>toggle(key)} style={{background:isF?A:"transparent",border:"1px solid "+(isF?A:BR),color:isF?"#000":MU,padding:"2px 8px",fontFamily:ff,fontSize:10,cursor:"pointer",borderRadius:radius,letterSpacing:1,whiteSpace:"nowrap",marginLeft:8}}>
                  {isF?"FIXED":"SET FIXED"}
                </button>
              </div>
              <CI value={fixed?.values?.[key]||""} onChange={v=>onChange({...fixed,values:{...fixed.values,[key]:v}})}/>
            </div>
          );
        })}
      </div>
    </div>
  );
  return(
    <div>
      <div style={{fontFamily:ff,fontSize:13,color:MU,marginBottom:20,lineHeight:1.8}}>
        <E value={labels.fixed_help} onSave={v=>labels._save("fixed_help",v)} style={{fontFamily:ff,fontSize:13,color:MU}} multiline/>
      </div>
      <div style={{background:S2,border:"1px solid "+BR,borderRadius:radius+1,padding:"12px 16px",marginBottom:20}}>
        <div style={{fontFamily:ff,fontSize:10,letterSpacing:1.5,color:A,textTransform:"uppercase",marginBottom:10}}>
          <E value={labels.fixed_satchel_label} onSave={v=>labels._save("fixed_satchel_label",v)} style={{color:A,fontFamily:ff,fontSize:10}}/>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:200}}><CI value={fixed?.satchelCostDefault||"0.85"} onChange={v=>onChange({...fixed,satchelCostDefault:v})}/></div>
          <span style={{fontFamily:ff,fontSize:12,color:MU}}>
            <E value={labels.fixed_satchel_sub} onSave={v=>labels._save("fixed_satchel_sub",v)} style={{color:MU,fontFamily:ff,fontSize:12}}/>
          </span>
        </div>
      </div>
      {renderGroup(keys.filter(k=>k.group==="freight"),"sec_freight")}
      {renderGroup(keys.filter(k=>k.group==="collabs"),"sec_collabs")}
      {renderGroup(keys.filter(k=>k.group==="general"),"sec_general")}
      <div style={{marginTop:16,padding:"12px 16px",background:S2,border:"1px solid "+BR,borderRadius:radius+1}}>
        <span style={{fontFamily:ff,fontSize:13,color:MU}}>Monthly fixed total: </span>
        <span style={{fontFamily:ff,fontSize:15,color:A,fontWeight:"bold"}}>{fmtD(total)}</span>
        <span style={{fontFamily:ff,fontSize:12,color:MU,marginLeft:12}}>({fmtD(total/4.33)} /wk avg)</span>
        <span style={{fontFamily:ff,fontSize:12,color:A,marginLeft:16}}>{fixedKeys.length} items auto-populate weekly</span>
      </div>
    </div>
  );
}

// ─── Settings Page ────────────────────────────────────────────────────────────
const FONT_OPTIONS=["Times New Roman","Georgia","Garamond","Palatino","Helvetica","Arial","Inter","system-ui","monospace","Courier New"];
const COLOR_PRESETS=[
  {name:"Default",theme:{accent:"#d8b9ff",bg:"#0a0a0e",surface:"#12111a",surface2:"#1a1826",border:"#2a2540",text:"#e0e0e0",muted:"#777777",red:"#ff6b6b",green:"#6bffb8",yellow:"#ffd97d"}},
  {name:"Deep Ocean",theme:{accent:"#7dd3fc",bg:"#020617",surface:"#0f172a",surface2:"#1e293b",border:"#334155",text:"#e2e8f0",muted:"#64748b",red:"#f87171",green:"#34d399",yellow:"#fbbf24"}},
  {name:"Forest",theme:{accent:"#86efac",bg:"#030712",surface:"#0f1b12",surface2:"#172018",border:"#2d4a32",text:"#dcfce7",muted:"#6b7280",red:"#fca5a5",green:"#86efac",yellow:"#fde68a"}},
  {name:"Rose",theme:{accent:"#fda4af",bg:"#0c0a0b",surface:"#1a1016",surface2:"#231520",border:"#4a2030",text:"#fce7f3",muted:"#9d8090",red:"#fb7185",green:"#6ee7b7",yellow:"#fde68a"}},
  {name:"Slate",theme:{accent:"#94a3b8",bg:"#0f0f0f",surface:"#161616",surface2:"#1e1e1e",border:"#2a2a2a",text:"#d4d4d4",muted:"#737373",red:"#f87171",green:"#86efac",yellow:"#fcd34d"}},
];

function SettingsPage({settings,onSettingsChange,theme,onThemeChange}){
  const {S2,BR,A,MU,TX,GR,RD,ff,radius}=useTheme();
  const [themeEdit,setThemeEdit]=useState({...DEFAULT_THEME,...theme});
  const [activeTab,setActiveTab]=useState("appearance");
  const [staff,setStaff]=useState(settings?.staff||DEFAULT_STAFF);
  const [saved,setSaved]=useState(false);
  const apply=()=>{onThemeChange(themeEdit);setSaved(true);setTimeout(()=>setSaved(false),2000);};
  const reset=()=>{setThemeEdit({...DEFAULT_THEME});onThemeChange({...DEFAULT_THEME});};
  const updateStaff=ns=>{setStaff(ns);onSettingsChange({...settings,staff:ns});};
  const addStaff=()=>updateStaff([...staff,{id:"s"+Date.now(),name:"New Staff",type:"casual",hourlyRate:25,hoursPerWeek:20,dept:"ops_retail"}]);
  const removeStaff=id=>updateStaff(staff.filter(s=>s.id!==id));
  const editStaff=(id,f,v)=>updateStaff(staff.map(s=>s.id===id?{...s,[f]:v}:s));
  const inp={background:S2,border:"1px solid "+BR,color:TX,padding:"7px 10px",fontFamily:ff,fontSize:13,outline:"none",borderRadius:radius,width:"100%",boxSizing:"border-box"};
  return(
    <div>
      <div style={{display:"flex",gap:8,marginBottom:24}}>
        {["appearance","colours","staff"].map(t=>(
          <button key={t} onClick={()=>setActiveTab(t)}
            style={{padding:"8px 16px",background:activeTab===t?A:"transparent",border:"1px solid "+(activeTab===t?A:BR),color:activeTab===t?"#000":MU,fontFamily:ff,fontSize:11,cursor:"pointer",borderRadius:radius,letterSpacing:1,textTransform:"uppercase"}}>
            {t}
          </button>
        ))}
      </div>
      {activeTab==="appearance"&&(
        <div>
          <SH>Fonts</SH>
          <Grid>
            <Fld label="Title Font"><select value={themeEdit.titleFont||"Times New Roman"} onChange={e=>setThemeEdit({...themeEdit,titleFont:e.target.value})} style={inp}>{FONT_OPTIONS.map(f=><option key={f} value={f}>{f}</option>)}</select></Fld>
            <Fld label="Body Font"><select value={themeEdit.bodyFont||"Times New Roman"} onChange={e=>setThemeEdit({...themeEdit,bodyFont:e.target.value})} style={inp}>{FONT_OPTIONS.map(f=><option key={f} value={f}>{f}</option>)}</select></Fld>
          </Grid>
          <SH>Border Radius</SH>
          <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:20}}>
            <input type="range" min={0} max={16} value={themeEdit.borderRadius??4} onChange={e=>setThemeEdit({...themeEdit,borderRadius:parseInt(e.target.value)})} style={{flex:1}}/>
            <span style={{fontFamily:ff,fontSize:13,color:TX,minWidth:30}}>{themeEdit.borderRadius??4}px</span>
          </div>
          <SH>Global Lightness</SH>
          <div style={{fontFamily:ff,fontSize:12,color:MU,marginBottom:10}}>Shift all colours toward black (left) or pastel/white (right).</div>
          <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:24}}>
            <span style={{fontFamily:ff,fontSize:11,color:MU}}>Darker</span>
            <input type="range" min={0} max={100} value={themeEdit.lightness??50} onChange={e=>setThemeEdit({...themeEdit,lightness:parseInt(e.target.value)})} style={{flex:1}}/>
            <span style={{fontFamily:ff,fontSize:11,color:MU}}>Lighter</span>
            <span style={{fontFamily:ff,fontSize:13,color:TX,minWidth:30}}>{themeEdit.lightness??50}</span>
          </div>
          <SH>Presets</SH>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:20}}>
            {COLOR_PRESETS.map(p=>(
              <button key={p.name} onClick={()=>{const nt={...themeEdit,...p.theme};setThemeEdit(nt);onThemeChange(nt);}}
                style={{padding:"8px 14px",background:"transparent",border:"1px solid "+BR,color:TX,fontFamily:ff,fontSize:11,cursor:"pointer",borderRadius:radius,display:"flex",alignItems:"center",gap:8}}>
                <div style={{display:"flex",gap:3}}>{["accent","bg","green","red"].map(k=><div key={k} style={{width:10,height:10,borderRadius:2,background:p.theme[k]||"#888"}}/>)}</div>
                {p.name}
              </button>
            ))}
          </div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={apply} style={{flex:1,padding:"11px 0",background:A,border:"none",color:"#000",fontFamily:ff,fontSize:12,cursor:"pointer",borderRadius:radius,fontWeight:"bold",letterSpacing:1}}>{saved?"APPLIED!":"APPLY"}</button>
            <button onClick={reset} style={{padding:"11px 20px",background:"transparent",border:"1px solid "+BR,color:MU,fontFamily:ff,fontSize:12,cursor:"pointer",borderRadius:radius}}>Reset</button>
          </div>
        </div>
      )}
      {activeTab==="colours"&&(
        <div>
          <Grid cols={2}>
            {[["Accent","accent"],["Background","bg"],["Surface","surface"],["Surface 2","surface2"],["Border","border"],["Text","text"],["Muted","muted"],["Red","red"],["Green","green"],["Yellow","yellow"]].map(([label,key])=>(
              <div key={key} style={{marginBottom:12}}>
                <div style={{fontFamily:ff,fontSize:10,color:MU,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>{label}</div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <input type="color" value={themeEdit[key]||"#ffffff"} onChange={e=>setThemeEdit({...themeEdit,[key]:e.target.value})} style={{width:40,height:30,border:"none",background:"none",cursor:"pointer",padding:0}}/>
                  <input type="text" value={themeEdit[key]||""} onChange={e=>setThemeEdit({...themeEdit,[key]:e.target.value})} style={{...inp,width:110,fontFamily:"monospace"}}/>
                  <div style={{width:28,height:28,borderRadius:4,background:themeEdit[key]||"#888",border:"1px solid #333"}}/>
                </div>
              </div>
            ))}
          </Grid>
          <button onClick={apply} style={{marginTop:16,width:"100%",padding:"11px 0",background:A,border:"none",color:"#000",fontFamily:ff,fontSize:12,cursor:"pointer",borderRadius:radius,fontWeight:"bold",letterSpacing:1}}>{saved?"APPLIED!":"APPLY COLOURS"}</button>
        </div>
      )}
      {activeTab==="staff"&&(
        <div>
          <div style={{fontFamily:ff,fontSize:13,color:MU,marginBottom:20,lineHeight:1.8}}>Staff roster powers the budget planning section in weekly exports. Claude uses this to recommend next-week staffing based on actual vs budgeted wages.</div>
          {staff.map(s=>(
            <div key={s.id} style={{background:S2,border:"1px solid "+BR,borderRadius:radius+2,padding:"14px 16px",marginBottom:12}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr auto",gap:10,alignItems:"end"}}>
                <Fld label="Name"><input value={s.name} onChange={e=>editStaff(s.id,"name",e.target.value)} style={inp}/></Fld>
                <Fld label="Type"><select value={s.type} onChange={e=>editStaff(s.id,"type",e.target.value)} style={inp}><option value="fulltime">Full Time</option><option value="parttime">Part Time</option><option value="casual">Casual</option></select></Fld>
                <Fld label="$/hr"><input type="number" value={s.hourlyRate} onChange={e=>editStaff(s.id,"hourlyRate",e.target.value)} style={inp}/></Fld>
                <Fld label="Hrs/wk"><input type="number" value={s.hoursPerWeek} onChange={e=>editStaff(s.id,"hoursPerWeek",e.target.value)} style={inp}/></Fld>
                <div><div style={{fontFamily:ff,fontSize:10,color:MU,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Wkly Cost</div><div style={{fontFamily:ff,fontSize:15,color:GR,paddingTop:5}}>{fmtD(n(s.hourlyRate)*n(s.hoursPerWeek))}</div></div>
                <button onClick={()=>removeStaff(s.id)} style={{background:"transparent",border:"1px solid "+RD,color:RD,padding:"6px 10px",fontFamily:ff,fontSize:11,cursor:"pointer",borderRadius:radius,alignSelf:"end"}}>-</button>
              </div>
            </div>
          ))}
          <button onClick={addStaff} style={{width:"100%",padding:"11px 0",background:"transparent",border:"1px solid "+A,color:A,fontFamily:ff,fontSize:12,cursor:"pointer",borderRadius:radius,letterSpacing:1.5,marginTop:4}}>+ ADD STAFF MEMBER</button>
          <div style={{marginTop:16,padding:"12px 16px",background:S2,border:"1px solid "+BR,borderRadius:radius+1}}>
            <span style={{fontFamily:ff,fontSize:13,color:MU}}>Total budgeted weekly wages: </span>
            <span style={{fontFamily:ff,fontSize:15,color:A,fontWeight:"bold"}}>{fmtD(staff.reduce((s,m)=>s+n(m.hourlyRate)*n(m.hoursPerWeek),0))}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Monthly Overview ─────────────────────────────────────────────────────────
function MonthlyOverview({weeks,fixed,extras,onExtrasChange,onExport,copied,opexKeys,depts,labels}){
  const {S2,BR,A,MU,TX,ff,RD,GR,radius}=useTheme();
  const keys=opexKeys||DEFAULT_OPEX_KEYS;
  const wDepts=depts||DEFAULT_WAGE_DEPTS;
  const mc=calcMonth(weeks,fixed,extras,keys,wDepts);
  const [part2,setPart2]=useState(false);
  const [sumCopied,setSumCopied]=useState(false);

  // Monthly discount reclassification totals
  const totalDR=mc.weekCalcs.reduce((s,c)=>({
    serviceRecoveryCOGS:s.serviceRecoveryCOGS+(c.discReclass?.serviceRecoveryCOGS||0),
    serviceRecoveryOrders:s.serviceRecoveryOrders+(c.discReclass?.serviceRecoveryOrders||0),
    marketingDiscRetail:s.marketingDiscRetail+(c.discReclass?.marketingDiscRetail||0),
    staffDisc:s.staffDisc+(c.discReclass?.staffDisc||0),
    promoDisc:s.promoDisc+(c.discReclass?.promoDisc||0),
    totalDisc:s.totalDisc+c.totalDiscounts,
  }),{serviceRecoveryCOGS:0,serviceRecoveryOrders:0,marketingDiscRetail:0,staffDisc:0,promoDisc:0,totalDisc:0});

  const copySummary=()=>{
    const fmt=v=>"$"+Math.abs(v).toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:2});
    let t="## Monthly P&L Summary\n\n**Net Revenue:** "+fmt(mc.netRevenue)+"\n**Gross Profit:** "+fmt(mc.grossProfit)+" ("+mc.grossMargin.toFixed(1)+"%)\n**Total Expenses:** "+fmt(mc.totalExpenses)+"\n**Net Profit:** "+fmt(mc.netProfit)+" ("+mc.netMargin.toFixed(1)+"%)\n\n";
    t+="### Discount Reclassification\n";
    t+="Shopify gifting artefact (retail, ref only): "+fmt(totalDR.marketingDiscRetail)+" | Service Recovery: "+fmt(totalDR.serviceRecoveryCOGS)+" | Staff: "+fmt(totalDR.staffDisc)+" | True Promo: "+fmt(totalDR.promoDisc)+"\n\n";
    t+="### Week Breakdown\n";
    weeks.forEach((w,i)=>{const c=mc.weekCalcs[i];t+="**"+w.label+"** ("+w.dateRange+") - Rev: "+fmt(c.netRevenue)+" | GP: "+c.grossMargin.toFixed(1)+"% | Net: "+fmt(c.netProfit)+" ("+c.netMargin.toFixed(1)+"%)\n";});
    navigator.clipboard.writeText(t);setSumCopied(true);setTimeout(()=>setSumCopied(false),3000);
  };

  return(
    <div>
      <div style={{display:"flex",gap:8,marginBottom:20}}>
        {[{key:"overview_part1",label:labels.overview_part1,i:0},{key:"overview_part2",label:labels.overview_part2,i:1}].map(({key,label,i})=>(
          <button key={i} onClick={()=>setPart2(i===1)}
            style={{padding:"8px 16px",background:part2===(i===1)?A:"transparent",border:"1px solid "+(part2===(i===1)?A:BR),color:part2===(i===1)?"#000":MU,fontFamily:ff,fontSize:11,cursor:"pointer",borderRadius:radius,letterSpacing:1}}>
            <E value={label} onSave={v=>labels._save(key,v)} style={{fontFamily:ff,fontSize:11,color:part2===(i===1)?"#000":MU}}/>
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

          <Accordion title="Discount Reclassification Summary" accent>
            <div style={{fontFamily:ff,fontSize:12,color:MU,marginBottom:14,lineHeight:1.7}}>
              Monthly breakdown of how {fmtD(totalDR.totalDisc)} in total Shopify-recorded discounts are understood. The influencer gifting figure is a Shopify artefact — its real cost is already in Collab COGS.
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:12}}>
              {[
                {label:"True Promotional (→ Revenue Deduction)",val:totalDR.promoDisc,col:GR,sub:"only this bucket reduces Net Revenue"},
                {label:"Service Recovery (→ COGS)",val:totalDR.serviceRecoveryCOGS,col:RD,sub:totalDR.serviceRecoveryOrders+" orders — reclassified as operational cost"},
                {label:"Staff Benefits (→ Wages)",val:totalDR.staffDisc,col:A,sub:"reclassified as staff benefit"},
                {label:"Influencer Gifting — Shopify retail artefact",val:totalDR.marketingDiscRetail,col:"#ffd97d",sub:"REFERENCE ONLY — zero P&L impact. Real cost (unit COGS) is in Collab COGS."},
              ].map(({label,val,col,sub})=>(
                <div key={label} style={{background:"#12111a",border:"1px solid "+col+"44",borderRadius:radius+1,padding:"12px 14px"}}>
                  <div style={{fontFamily:ff,fontSize:10,color:col,letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>{label}</div>
                  <div style={{fontFamily:ff,fontSize:18,color:col,fontWeight:"bold"}}>{fmtD(val)}</div>
                  <div style={{fontFamily:ff,fontSize:11,color:MU,marginTop:4}}>{sub}</div>
                </div>
              ))}
            </div>
            <div style={{fontFamily:ff,fontSize:12,color:MU,padding:"10px 14px",background:"#1a1826",borderRadius:radius+1,borderLeft:"3px solid "+A}}>
              Net Revenue is only reduced by {fmtD(totalDR.promoDisc)} in true promotional discounts. The {fmtD(totalDR.marketingDiscRetail)} gifting figure is a Shopify checkout artefact — it was never real revenue and costs the business only the manufacturing COGS of those units, already recorded in Collab COGS.
            </div>
          </Accordion>

          <SH>Week by Week</SH>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontFamily:ff,fontSize:13}}>
              <thead><tr style={{borderBottom:"1px solid "+BR}}>
                {["Week","Dates","Revenue","COGS","Gross","GP%","Freight","Wages","OPEX","Net Profit","NP%"].map(h=>(
                  <th key={h} style={{padding:"8px 10px",color:MU,fontWeight:"normal",fontSize:10,letterSpacing:1,textTransform:"uppercase",textAlign:"right",whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {weeks.map((w,i)=>{const c=mc.weekCalcs[i];return(
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
                );})}
                <tr style={{borderTop:"2px solid "+BR,background:S2}}>
                  <td style={{padding:"10px",color:A,fontWeight:"bold"}}>TOTAL</td><td/>
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
          {[["COGS (incl. service recovery)",mc.totalCOGS,"#ff9ecd"],["Freight",mc.totalFreight,RD],["Collabs (incl. gifting COGS)",mc.totalCollabs,"#ffd97d"],["Wages (incl. staff disc)",mc.totalWages,"#e0a0ff"],["OPEX",mc.totalOPEX,A]].map(([lbl,val,col])=>(
            <div key={lbl} style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",fontFamily:ff,fontSize:12,marginBottom:4}}>
                <span style={{color:TX}}>{lbl}</span>
                <span style={{color:RD}}>{fmtD(-val)} ({mc.totalExpenses>0?((val/mc.totalExpenses)*100).toFixed(1):0}%)</span>
              </div>
              <div style={{background:S2,borderRadius:3,height:7,overflow:"hidden"}}>
                <div style={{background:col,height:"100%",width:(mc.totalExpenses>0?Math.min((val/mc.totalExpenses)*100,100):0)+"%",borderRadius:3}}/>
              </div>
            </div>
          ))}

          <div style={{display:"flex",gap:10,marginTop:24}}>
            <button onClick={onExport}
              style={{flex:1,padding:"13px 0",background:"transparent",border:"1px solid "+A,color:A,fontFamily:ff,fontSize:12,cursor:"pointer",borderRadius:radius,letterSpacing:1.5,textTransform:"uppercase"}}>
              <div><E value={labels.btn_generate_export} onSave={v=>labels._save("btn_generate_export",v)} style={{color:A,fontFamily:ff,fontSize:12}}/>{copied?" - Copied!":""}</div>
              <div style={{fontSize:9,color:MU,marginTop:2}}><E value={labels.btn_generate_export_sub} onSave={v=>labels._save("btn_generate_export_sub",v)} style={{color:MU,fontFamily:ff,fontSize:9}}/></div>
            </button>
            <button onClick={copySummary}
              style={{flex:1,padding:"13px 0",background:S2,border:"1px solid "+BR,color:TX,fontFamily:ff,fontSize:12,cursor:"pointer",borderRadius:radius,letterSpacing:1.5,textTransform:"uppercase"}}>
              <div><E value={labels.btn_monthly_summary} onSave={v=>labels._save("btn_monthly_summary",v)} style={{color:TX,fontFamily:ff,fontSize:12}}/>{sumCopied?" - Copied!":""}</div>
              <div style={{fontSize:9,color:MU,marginTop:2}}><E value={labels.btn_monthly_summary_sub} onSave={v=>labels._save("btn_monthly_summary_sub",v)} style={{color:MU,fontFamily:ff,fontSize:9}}/></div>
            </button>
          </div>
        </div>
      )}

      {part2&&(
        <div>
          <div style={{fontFamily:ff,fontSize:13,color:MU,marginBottom:20,lineHeight:1.8}}>
            <E value={labels.overview_adjustments_help} onSave={v=>labels._save("overview_adjustments_help",v)} style={{color:MU,fontFamily:ff,fontSize:13}} multiline/>
          </div>
          <SH>Monthly-Only Adjustments</SH>
          <Grid>{keys.map(({key,label})=>(
            <Fld key={key} label={label}><CI value={extras?.opex?.[key]||""} onChange={v=>onExtrasChange({...extras,opex:{...extras?.opex,[key]:v}})}/></Fld>
          ))}</Grid>
          <Row><Badge small label="Monthly Adjustment Total" value={-mc.extraOpex} color={RD}/></Row>
          <SH>Notes</SH>
          <textarea value={extras?.notes||""} onChange={e=>onExtrasChange({...extras,notes:e.target.value})} placeholder="Monthly context, one-off costs..." rows={3}
            style={{width:"100%",boxSizing:"border-box",background:"#12111a",border:"1px solid "+BR,color:TX,padding:"10px 12px",fontFamily:ff,fontSize:14,outline:"none",borderRadius:radius,resize:"vertical"}}/>
          <Row>
            <Badge small label="Net Revenue" value={mc.netRevenue} color={A}/>
            <Badge small label="Total Expenses" value={-mc.totalExpenses} color={RD}/>
            <Badge small label="Net Profit" value={mc.netProfit}/>
            <Pct small label="Net Margin" value={mc.netMargin}/>
          </Row>
        </div>
      )}
    </div>
  );
}

// ─── Visualise Page ───────────────────────────────────────────────────────────
function VisualisePage({weeks,fixed,allMonthData,opexKeys,depts}){
  const {A,BR,S2,TX,MU,ff,GR,RD,BG}=useTheme();
  const keys=opexKeys||DEFAULT_OPEX_KEYS;
  const wDepts=depts||DEFAULT_WAGE_DEPTS;
  const baseMetrics=[
    {id:"netProfit",label:"Net Profit"},{id:"netRevenue",label:"Net Revenue"},{id:"grossProfit",label:"Gross Profit"},
    {id:"grossMargin",label:"Gross Margin %"},{id:"netMargin",label:"Net Margin %"},{id:"totalExpenses",label:"Total Expenses"},
    {id:"totalCOGS",label:"Total COGS"},{id:"totalFreight",label:"Total Freight"},{id:"totalCollabs",label:"Total Collabs"},
    {id:"totalWages",label:"Total Wages"},{id:"totalOPEX",label:"Total OPEX"},{id:"gross",label:"Gross Sales"},
    {id:"truePromoDisc",label:"True Promo Discounts"},{id:"totalDiscounts",label:"All Discounts (gross)"},
  ];
  const discMetrics=[
    {id:"disc_sr",label:"Service Recovery Cost",isDR:true,drKey:"serviceRecoveryCOGS"},
    {id:"disc_mkt",label:"Influencer Gifting — Shopify retail artefact (ref only)",isDR:true,drKey:"marketingDiscRetail"},
    {id:"disc_staff",label:"Staff Discount Benefits",isDR:true,drKey:"staffDisc"},
  ];
  const wageMetrics=wDepts.flatMap(d=>d.subs.map(s=>({id:"wage_"+s.key,label:d.label+" - "+s.label,isWage:true,wageKey:s.key})));
  const opexMetrics=keys.map(k=>({id:"opex_"+k.key,label:k.label,isOpex:true,opexKey:k.key}));
  const allMetrics=[...baseMetrics,...discMetrics,...wageMetrics,...opexMetrics];

  const [metric,setMetric]=useState("netProfit");
  const [view,setView]=useState("monthly");
  const sel=allMetrics.find(m=>m.id===metric)||allMetrics[0];
  const isPct=sel.label.includes("%");

  const getVal=(calc,week,m)=>{
    if(m.isDR)return calc?.discReclass?.[m.drKey]||0;
    if(m.isWage)return n(week?.wages?.[m.wageKey]||0);
    if(m.isOpex)return n(week?.opex?.[m.opexKey]||0);
    return calc?.[m.id]||0;
  };

  let points=[];
  if(view==="weekly"){
    const calcs=weeks.map(w=>calcWeek(w,fixed,keys,wDepts));
    points=calcs.map((c,i)=>({label:weeks[i]?.label||("W"+(i+1)),value:getVal(c,weeks[i],sel)}));
  } else {
    const sk=Object.keys(allMonthData).sort();
    points=sk.map(k=>{
      const md=allMonthData[k]; const wks=md.weeks||[];
      const mc=calcMonth(wks,fixed,md.extras,keys,wDepts);
      if(sel.isDR){const val=mc.weekCalcs.reduce((s,c)=>s+(c.discReclass?.[sel.drKey]||0),0);return{label:(md.label||k).split(" ")[0],value:val};}
      if(sel.isWage){return{label:(md.label||k).split(" ")[0],value:wks.reduce((s,w)=>s+n(w.wages?.[sel.wageKey]||0),0)};}
      if(sel.isOpex){return{label:(md.label||k).split(" ")[0],value:wks.reduce((s,w)=>s+n(w.opex?.[sel.opexKey]||0),0)};}
      return{label:(md.label||k).split(" ")[0],value:mc[metric]||0};
    });
    if(!points.length){const calcs=weeks.map(w=>calcWeek(w,fixed,keys,wDepts));points=calcs.map((c,i)=>({label:weeks[i]?.label||("W"+(i+1)),value:getVal(c,weeks[i],sel)}));}
  }

  if(!points.length)return <div style={{color:MU,fontFamily:ff,padding:40,textAlign:"center"}}>No data yet.</div>;
  const vals=points.map(p=>p.value);
  const minV=Math.min(...vals),maxV=Math.max(...vals),range=maxV-minV||1;
  const PAD_L=90,PAD_R=24,PAD_T=44,PAD_B=60,W=600,H=300;
  const chartW=W-PAD_L-PAD_R,chartH=H-PAD_T-PAD_B;
  const xStep=points.length>1?chartW/(points.length-1):chartW;
  const yPos=v=>PAD_T+chartH-((v-minV)/range)*chartH;
  const xPos=i=>PAD_L+(points.length>1?i*xStep:chartW/2);
  const ticks=Array.from({length:5},(_,i)=>minV+(range/4)*i);
  const ptPath=points.map((p,i)=>xPos(i)+","+yPos(p.value)).join(" ");
  const areaPath="M"+xPos(0)+","+yPos(points[0].value)+" "+points.slice(1).map((p,i)=>"L"+xPos(i+1)+","+yPos(p.value)).join(" ")+" L"+xPos(points.length-1)+","+(PAD_T+chartH)+" L"+xPos(0)+","+(PAD_T+chartH)+" Z";
  const lineColor=vals.every(v=>v>=0)?GR:vals.every(v=>v<=0)?RD:A;

  return(
    <div>
      <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:20,alignItems:"flex-end"}}>
        <div><Lbl>Metric</Lbl>
          <select value={metric} onChange={e=>setMetric(e.target.value)} style={{background:S2,border:"1px solid "+BR,color:TX,padding:"9px 12px",fontFamily:ff,fontSize:13,outline:"none",borderRadius:4,maxWidth:290}}>
            <optgroup label="Profit & Revenue">{baseMetrics.slice(0,6).map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>
            <optgroup label="Revenue & Discount Detail">{baseMetrics.slice(6).map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>
            <optgroup label="Discount Reclassification">{discMetrics.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>
            <optgroup label="Wages by Role">{wageMetrics.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>
            <optgroup label="OPEX Line Items">{opexMetrics.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>
          </select>
        </div>
        <div><Lbl>View</Lbl>
          <select value={view} onChange={e=>setView(e.target.value)} style={{background:S2,border:"1px solid "+BR,color:TX,padding:"9px 12px",fontFamily:ff,fontSize:13,outline:"none",borderRadius:4}}>
            <option value="monthly">By Month</option>
            <option value="weekly">This Month by Week</option>
          </select>
        </div>
      </div>
      <div style={{fontFamily:ff,fontSize:11,color:A,letterSpacing:1.5,textTransform:"uppercase",marginBottom:16}}>{sel.label} - {view==="weekly"?"Week by Week":"Month by Month"}</div>
      <svg width="100%" viewBox={"0 0 "+W+" "+H} style={{display:"block",overflow:"visible"}}>
        {ticks.map((t,i)=>{const y=yPos(t);return(<g key={i}><line x1={PAD_L} y1={y} x2={W-PAD_R} y2={y} stroke={BR} strokeWidth={0.5}/><text x={PAD_L-8} y={y+4} fill={MU} fontSize={10} textAnchor="end" fontFamily={ff}>{isPct?t.toFixed(1)+"%":Math.abs(t)>=1000?fmtS(t):fmtD(t)}</text></g>);})}
        {minV<0&&maxV>0&&<line x1={PAD_L} y1={yPos(0)} x2={W-PAD_R} y2={yPos(0)} stroke={MU} strokeWidth={1} strokeDasharray="4,3"/>}
        <path d={areaPath} fill={lineColor} opacity={0.07}/>
        <polyline points={ptPath} fill="none" stroke={lineColor} strokeWidth={2.5} strokeLinejoin="round"/>
        {points.map((p,i)=>(
          <g key={i}>
            <circle cx={xPos(i)} cy={yPos(p.value)} r={5} fill={p.value>=0?GR:RD} stroke={BG} strokeWidth={1.5}/>
            <text x={xPos(i)} y={yPos(p.value)-12} fill={p.value>=0?GR:RD} fontSize={9} textAnchor="middle" fontFamily={ff}>{isPct?p.value.toFixed(1)+"%":Math.abs(p.value)>=1000?fmtS(p.value):fmtD(p.value)}</text>
            <text x={xPos(i)} y={H-PAD_B+18} fill={MU} fontSize={9} textAnchor="middle" fontFamily={ff}>{p.label.length>9?p.label.slice(0,9):p.label}</text>
          </g>
        ))}
        <line x1={PAD_L} y1={PAD_T+chartH} x2={W-PAD_R} y2={PAD_T+chartH} stroke={BR} strokeWidth={1}/>
      </svg>
    </div>
  );
}

// ─── Compare Page ─────────────────────────────────────────────────────────────
function ComparePage({allMonthData,fixed,opexKeys,depts,labels}){
  const {A,BR,S2,TX,MU,GR,RD,ff,radius}=useTheme();
  const keys=opexKeys||DEFAULT_OPEX_KEYS;
  const wDepts=depts||DEFAULT_WAGE_DEPTS;
  const allKeys=Object.keys(allMonthData).sort();
  const [mode,setMode]=useState("months");
  const [mA,setMA]=useState(allKeys[0]||"");
  const [mB,setMB]=useState(allKeys[1]||allKeys[0]||"");
  const [wMonthIdx,setWMonthIdx]=useState(0);
  const [wA,setWA]=useState(0);
  const [wB,setWB]=useState(1);
  const [dateA1,setDateA1]=useState(""); const [dateA2,setDateA2]=useState("");
  const [dateB1,setDateB1]=useState(""); const [dateB2,setDateB2]=useState("");
  const [copied,setCopied]=useState(false);

  const getMC=key=>{const md=allMonthData[key];if(!md)return null;return{label:md.label||key,mc:calcMonth(md.weeks||[],fixed,md.extras,keys,wDepts)};};

  let periodA=null,periodB=null;
  if(mode==="months"){periodA=getMC(mA);periodB=getMC(mB);}
  else if(mode==="weeks"){
    const mk=allKeys[wMonthIdx]; const md=allMonthData[mk];
    if(md?.weeks){
      const wkCalc=idx=>{if(!md.weeks[idx])return null;const c=calcWeek(md.weeks[idx],fixed,keys,wDepts);return{label:md.weeks[idx].label+" ("+md.weeks[idx].dateRange+")",mc:{...c,weekCalcs:[c],extraOpex:0}};};
      periodA=wkCalc(wA); periodB=wkCalc(wB);
    }
  }

  const fmt=v=>"$"+Math.abs(v).toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:2});
  const metrics=[
    {label:"Net Revenue",key:"netRevenue",hb:true},{label:"Gross Sales",key:"gross",hb:true},
    {label:"True Promo Discounts",key:"truePromoDisc",hb:false},{label:"Gross Profit",key:"grossProfit",hb:true},
    {label:"Gross Margin %",key:"grossMargin",hb:true,isPct:true},{label:"Total COGS",key:"totalCOGS",hb:false},
    {label:"Total Freight",key:"totalFreight",hb:false},{label:"Total Wages",key:"totalWages",hb:false},
    {label:"Total OPEX",key:"totalOPEX",hb:false},{label:"Total Expenses",key:"totalExpenses",hb:false},
    {label:"Net Profit",key:"netProfit",hb:true},{label:"Net Margin %",key:"netMargin",hb:true,isPct:true},
  ];
  const dc=(a,b,hb)=>{if(a===b)return MU;return (a>b)===hb?GR:RD;};
  const inp={background:S2,border:"1px solid "+BR,color:TX,padding:"7px 10px",fontFamily:ff,fontSize:13,outline:"none",borderRadius:radius};

  if(!allKeys.length)return <div style={{textAlign:"center",padding:"60px 20px",color:MU,fontFamily:ff,fontSize:13}}>Enter data for at least one month to compare.</div>;

  return(
    <div>
      <SH><E value={labels.compare_title} onSave={v=>labels._save("compare_title",v)} style={{color:A,fontFamily:ff,fontSize:10}}/></SH>
      <div style={{fontFamily:ff,fontSize:13,color:MU,marginBottom:20}}>
        <E value={labels.compare_help} onSave={v=>labels._save("compare_help",v)} style={{color:MU,fontFamily:ff,fontSize:13}}/>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:24}}>
        {[["months","By Month"],["weeks","By Week"],["custom","Custom Range"]].map(([val,lbl])=>(
          <button key={val} onClick={()=>setMode(val)}
            style={{padding:"7px 14px",background:mode===val?A:"transparent",border:"1px solid "+(mode===val?A:BR),color:mode===val?"#000":MU,fontFamily:ff,fontSize:11,cursor:"pointer",borderRadius:radius,letterSpacing:1}}>
            {lbl}
          </button>
        ))}
      </div>

      {mode==="months"&&(
        <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:24,alignItems:"flex-end"}}>
          <div><Lbl>Period A</Lbl><select value={mA} onChange={e=>setMA(e.target.value)} style={{...inp,borderColor:A}}>{allKeys.map(k=><option key={k} value={k}>{allMonthData[k]?.label||k}</option>)}</select></div>
          <div style={{fontFamily:ff,fontSize:18,color:MU,paddingBottom:8}}>vs</div>
          <div><Lbl>Period B</Lbl><select value={mB} onChange={e=>setMB(e.target.value)} style={inp}>{allKeys.map(k=><option key={k} value={k}>{allMonthData[k]?.label||k}</option>)}</select></div>
        </div>
      )}
      {mode==="weeks"&&(
        <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:24,alignItems:"flex-end"}}>
          <div><Lbl>Month</Lbl><select value={wMonthIdx} onChange={e=>setWMonthIdx(parseInt(e.target.value))} style={inp}>{allKeys.map((k,i)=><option key={k} value={i}>{allMonthData[k]?.label||k}</option>)}</select></div>
          <div><Lbl>Week A</Lbl><select value={wA} onChange={e=>setWA(parseInt(e.target.value))} style={{...inp,borderColor:A}}>{(allMonthData[allKeys[wMonthIdx]]?.weeks||[]).map((w,i)=><option key={i} value={i}>{w.label} ({w.dateRange})</option>)}</select></div>
          <div style={{fontFamily:ff,fontSize:18,color:MU,paddingBottom:8}}>vs</div>
          <div><Lbl>Week B</Lbl><select value={wB} onChange={e=>setWB(parseInt(e.target.value))} style={inp}>{(allMonthData[allKeys[wMonthIdx]]?.weeks||[]).map((w,i)=><option key={i} value={i}>{w.label} ({w.dateRange})</option>)}</select></div>
        </div>
      )}
      {mode==="custom"&&(
        <div style={{marginBottom:24}}>
          <div style={{fontFamily:ff,fontSize:12,color:MU,marginBottom:16}}>Select any date ranges to compare. All weeks overlapping the range are summed.</div>
          <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>
            <div style={{background:S2,border:"1px solid "+A,borderRadius:radius+2,padding:"14px 16px",flex:1,minWidth:220}}>
              <div style={{fontFamily:ff,fontSize:10,color:A,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10}}>Period A</div>
              <Grid><Fld label="From"><input type="date" value={dateA1} onChange={e=>setDateA1(e.target.value)} style={inp}/></Fld><Fld label="To"><input type="date" value={dateA2} onChange={e=>setDateA2(e.target.value)} style={inp}/></Fld></Grid>
            </div>
            <div style={{background:S2,border:"1px solid "+BR,borderRadius:radius+2,padding:"14px 16px",flex:1,minWidth:220}}>
              <div style={{fontFamily:ff,fontSize:10,color:MU,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10}}>Period B</div>
              <Grid><Fld label="From"><input type="date" value={dateB1} onChange={e=>setDateB1(e.target.value)} style={inp}/></Fld><Fld label="To"><input type="date" value={dateB2} onChange={e=>setDateB2(e.target.value)} style={inp}/></Fld></Grid>
            </div>
          </div>
          <div style={{fontFamily:ff,fontSize:11,color:MU,marginTop:10}}>Custom range comparison sums all weeks whose dates fall within each selected period.</div>
        </div>
      )}

      {periodA&&periodB&&(
        <div>
          <Row>
            <div style={{flex:1,background:S2,border:"1px solid "+A,borderRadius:radius+2,padding:"13px 17px"}}>
              <Lbl c={A}>{periodA.label}</Lbl>
              <div style={{color:periodA.mc.netProfit>=0?GR:RD,fontFamily:ff,fontSize:18,fontWeight:"bold"}}>{fmt(periodA.mc.netProfit)}</div>
              <div style={{fontFamily:ff,fontSize:11,color:MU,marginTop:4}}>{periodA.mc.netMargin.toFixed(1)}% net margin</div>
            </div>
            <div style={{flex:1,background:S2,border:"1px solid "+BR,borderRadius:radius+2,padding:"13px 17px"}}>
              <Lbl c={MU}>{periodB.label}</Lbl>
              <div style={{color:periodB.mc.netProfit>=0?GR:RD,fontFamily:ff,fontSize:18,fontWeight:"bold"}}>{fmt(periodB.mc.netProfit)}</div>
              <div style={{fontFamily:ff,fontSize:11,color:MU,marginTop:4}}>{periodB.mc.netMargin.toFixed(1)}% net margin</div>
            </div>
          </Row>
          <SH>Metric Comparison</SH>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontFamily:ff,fontSize:13}}>
              <thead><tr style={{borderBottom:"1px solid "+BR}}>{["Metric",periodA.label,periodB.label,"Change"].map(h=><th key={h} style={{padding:"8px 12px",color:MU,fontWeight:"normal",fontSize:10,letterSpacing:1,textTransform:"uppercase",textAlign:"right",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
              <tbody>
                {metrics.map(({label,key,hb,isPct})=>{
                  const aVal=periodA.mc[key]||0,bVal=periodB.mc[key]||0,d=aVal-bVal;
                  const col=dc(aVal,bVal,hb);
                  return(
                    <tr key={key} style={{borderBottom:"1px solid "+BR+"22"}}>
                      <td style={{padding:"9px 12px",color:TX}}>{label}</td>
                      <td style={{padding:"9px 12px",color:A,textAlign:"right"}}>{isPct?aVal.toFixed(1)+"%":fmt(aVal)}</td>
                      <td style={{padding:"9px 12px",color:MU,textAlign:"right"}}>{isPct?bVal.toFixed(1)+"%":fmt(bVal)}</td>
                      <td style={{padding:"9px 12px",color:col,textAlign:"right",fontWeight:"bold"}}>{d>=0?"+":""}{isPct?d.toFixed(1)+"%":fmtD(d)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button onClick={()=>{navigator.clipboard.writeText(generateComparativeExport([periodA,periodB]));setCopied(true);setTimeout(()=>setCopied(false),3000);}}
            style={{width:"100%",marginTop:24,padding:"13px 0",background:"transparent",border:"1px solid "+A,color:A,fontFamily:ff,fontSize:12,cursor:"pointer",borderRadius:radius,letterSpacing:1.5,textTransform:"uppercase"}}>
            <E value={labels.btn_compare_export} onSave={v=>labels._save("btn_compare_export",v)} style={{color:A,fontFamily:ff,fontSize:12}}/>{copied?" - Copied!":""}
            <div style={{fontSize:9,color:MU,marginTop:2}}><E value={labels.btn_compare_export_sub} onSave={v=>labels._save("btn_compare_export_sub",v)} style={{color:MU,fontFamily:ff,fontSize:9}}/></div>
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Reports Page ─────────────────────────────────────────────────────────────
function ReportsPage({monthData,fixed,onSave,onExport,opexKeys,depts}){
  const {S,S2,BR,A,MU,TX,GR,RD,ff,radius}=useTheme();
  const keys=opexKeys||DEFAULT_OPEX_KEYS;
  const wDepts=depts||DEFAULT_WAGE_DEPTS;
  const [expanded,setExpanded]=useState(null);
  const [editing,setEditing]=useState(null);
  const [editWeeks,setEditWeeks]=useState(null);
  const [editExtras,setEditExtras]=useState(null);
  const [activeEditWeek,setActiveEditWeek]=useState(0);
  const [menu,setMenu]=useState(null);
  const [saving,setSaving]=useState(false);
  const [copied,setCopied]=useState(null);
  const [delConfirm,setDelConfirm]=useState(null);
  const menuRef=useRef(null);
  useEffect(()=>{
    const close=e=>{if(menuRef.current&&!menuRef.current.contains(e.target))setMenu(null);};
    document.addEventListener("mousedown",close);return()=>document.removeEventListener("mousedown",close);
  },[]);
  const allKeys=Object.keys(monthData).sort().reverse();
  if(!allKeys.length)return(
    <div style={{textAlign:"center",padding:"60px 20px",color:MU,fontFamily:ff}}>
      <div style={{fontSize:28,marginBottom:12,opacity:0.3}}>-</div>
      <div>No saved data yet. Data saves automatically as you enter it.</div>
    </div>
  );
  const startEdit=key=>{const md=monthData[key]||{};setEditWeeks((md.weeks||[]).map(w=>({...w})));setEditExtras(md.extras||emptyExtras(keys));setEditing(key);setActiveEditWeek(0);setExpanded(key);};
  const saveEdit=async key=>{setSaving(true);const updated={...monthData,[key]:{...monthData[key],weeks:editWeeks,extras:editExtras,lastSaved:new Date().toLocaleString("en-AU")}};await onSave(updated);setSaving(false);setEditing(null);setEditWeeks(null);};
  const deleteMonth=async key=>{const updated={...monthData};delete updated[key];await onSave(updated);setDelConfirm(null);setExpanded(null);};
  const stubLabels={...DEFAULT_LABELS,_save:()=>{}};
  return(
    <div>
      <SH>All Saved Months ({allKeys.length})</SH>
      {allKeys.map(key=>{
        const md=monthData[key]||{};
        const weeks=editing===key?editWeeks:(md.weeks||[]);
        const extras=editing===key?editExtras:(md.extras||emptyExtras(keys));
        const mc=calcMonth(weeks,fixed,extras,keys,wDepts);
        const isOpen=expanded===key,isEdit=editing===key,mLabel=md.label||key;
        return(
          <div key={key} style={{border:"1px solid "+BR,borderRadius:radius+2,marginBottom:10,overflow:"visible"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px",background:isOpen?S2:"transparent",borderRadius:isOpen?(radius+2)+"px "+(radius+2)+"px 0 0":radius+2+"px"}}>
              <div onClick={()=>setExpanded(isOpen?null:key)} style={{flex:1,cursor:"pointer"}}>
                <div style={{fontFamily:ff,fontSize:15,color:TX}}>{mLabel}</div>
                <div style={{fontFamily:ff,fontSize:11,color:MU,marginTop:2}}>{weeks.length} weeks | Last saved: {md.lastSaved||"-"}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{fontFamily:ff,fontSize:14,color:mc.netProfit>=0?GR:RD}}>{fmtD(mc.netProfit)}</div>
                <div style={{fontFamily:ff,fontSize:11,color:MU}}>{mc.netMargin.toFixed(1)}% NM</div>
                <div style={{position:"relative"}} ref={menu===key?menuRef:null}>
                  <button onClick={e=>{e.stopPropagation();setMenu(menu===key?null:key);}}
                    style={{background:"transparent",border:"1px solid "+BR,color:MU,padding:"4px 10px",fontFamily:ff,fontSize:16,cursor:"pointer",borderRadius:radius,lineHeight:1}}>...</button>
                  {menu===key&&(
                    <div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:S2,border:"1px solid "+BR,borderRadius:radius+2,zIndex:200,minWidth:190,overflow:"hidden",boxShadow:"0 8px 24px #00000088"}}>
                      {[
                        {label:"Edit Report",action:()=>{startEdit(key);setMenu(null);}},
                        {label:copied===key?"Copied!":"Generate Export",action:()=>{onExport(md.weeks||[],md.extras||emptyExtras(keys),mLabel);setCopied(key);setTimeout(()=>setCopied(null),3000);setMenu(null);}},
                        {label:"Copy Summary",action:()=>{
                          const f=v=>"$"+Math.abs(v).toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:2});
                          let t=mLabel+"\n\nNet Revenue: "+f(mc.netRevenue)+"\nNet Profit: "+f(mc.netProfit)+" ("+mc.netMargin.toFixed(1)+"%)\n";
                          (md.weeks||[]).forEach((w,i)=>{const c=mc.weekCalcs[i];t+=w.label+": "+f(c.netProfit)+" ("+c.netMargin.toFixed(1)+"%)\n";});
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
            {delConfirm===key&&(
              <div style={{padding:"16px 18px",background:"#1a0a0a",border:"1px solid "+RD,margin:"0 0 4px"}}>
                <div style={{fontFamily:ff,fontSize:13,color:RD,marginBottom:12}}>Delete {mLabel}? This cannot be undone.</div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>deleteMonth(key)} style={{padding:"8px 16px",background:RD,border:"none",color:"#000",fontFamily:ff,fontSize:12,cursor:"pointer",borderRadius:radius,fontWeight:"bold"}}>Delete</button>
                  <button onClick={()=>setDelConfirm(null)} style={{padding:"8px 16px",background:"transparent",border:"1px solid "+BR,color:MU,fontFamily:ff,fontSize:12,cursor:"pointer",borderRadius:radius}}>Cancel</button>
                </div>
              </div>
            )}
            {isOpen&&(
              <div style={{padding:"20px 18px",borderTop:"1px solid "+BR,background:S}}>
                {isEdit?(
                  <div>
                    <div style={{fontFamily:ff,fontSize:10,letterSpacing:1.5,color:A,textTransform:"uppercase",marginBottom:12}}>Editing - Select Week</div>
                    <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
                      {editWeeks.map((w,wi)=>(
                        <button key={wi} onClick={()=>setActiveEditWeek(wi)}
                          style={{padding:"9px 14px",background:activeEditWeek===wi?S2:"transparent",border:"1px solid "+(activeEditWeek===wi?A:BR),color:activeEditWeek===wi?A:MU,fontFamily:ff,fontSize:12,cursor:"pointer",borderRadius:radius}}>
                          {w.label||"Week "+(wi+1)}
                        </button>
                      ))}
                    </div>
                    {editWeeks[activeEditWeek]&&(
                      <div style={{background:S2,border:"1px solid "+BR,borderRadius:radius+2,padding:"20px"}}>
                        <WeekForm week={editWeeks[activeEditWeek]} onChange={updated=>{const arr=[...editWeeks];arr[activeEditWeek]=updated;setEditWeeks(arr);}} fixed={fixed} opexKeys={keys} depts={wDepts} labels={stubLabels}/>
                      </div>
                    )}
                    <div style={{display:"flex",gap:10,marginTop:16}}>
                      <button onClick={()=>saveEdit(key)} disabled={saving}
                        style={{flex:1,padding:"11px 0",background:A,border:"none",color:"#000",fontFamily:ff,fontSize:13,cursor:"pointer",borderRadius:radius,fontWeight:"bold",letterSpacing:1}}>
                        {saving?"SAVING...":"SAVE CHANGES"}
                      </button>
                      <button onClick={()=>{setEditing(null);setEditWeeks(null);}}
                        style={{padding:"11px 20px",background:"transparent",border:"1px solid "+BR,color:MU,fontFamily:ff,fontSize:13,cursor:"pointer",borderRadius:radius}}>Cancel</button>
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
                      {(md.weeks||[]).map((w,wi)=>{const c=mc.weekCalcs[wi];return(
                        <div key={wi} style={{display:"flex",justifyContent:"space-between",padding:"9px 12px",background:S2,borderRadius:radius,border:"1px solid "+BR,marginBottom:6}}>
                          <span style={{fontFamily:ff,fontSize:13,color:TX}}>{w.label} - {w.dateRange}</span>
                          <div>
                            <span style={{fontFamily:ff,fontSize:13,color:c.netProfit>=0?GR:RD}}>Net: {fmtD(c.netProfit)}</span>
                            <span style={{fontFamily:ff,fontSize:11,color:MU,marginLeft:12}}>GP: {c.grossMargin.toFixed(1)}%</span>
                          </div>
                        </div>
                      );})}
                    </div>
                    <button onClick={()=>startEdit(key)} style={{marginTop:14,width:"100%",padding:"10px 0",background:"transparent",border:"1px solid "+A,color:A,fontFamily:ff,fontSize:13,cursor:"pointer",borderRadius:radius,letterSpacing:1}}>EDIT REPORT</button>
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

// ─── Password Screen ──────────────────────────────────────────────────────────
function PasswordScreen({onAuth,labels}){
  const {BG,BR,TX,A,MU,RD,ff}=useTheme();
  const [pw,setPw]=useState(""),[ err,setErr]=useState(false);
  const check=()=>{if(!PASSWORD||pw===PASSWORD){onAuth();}else{setErr(true);setTimeout(()=>setErr(false),1400);}};
  return(
    <div style={{minHeight:"100vh",background:BG,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:ff}}>
      <div style={{textAlign:"center",marginBottom:52}}>
        <div style={{fontSize:9,letterSpacing:6,color:MU,textTransform:"uppercase",marginBottom:14}}>{labels.header_brand}</div>
        <div style={{fontSize:30,letterSpacing:5,color:TX,textTransform:"uppercase",fontWeight:"normal"}}>{labels.header_title}</div>
        <div style={{width:36,height:1,background:A,margin:"18px auto 0"}}/>
      </div>
      <div style={{width:290}}>
        <input type="password" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&check()} placeholder="PASSWORD" autoFocus
          style={{width:"100%",boxSizing:"border-box",background:"transparent",border:"1px solid "+(err?RD:BR),color:TX,padding:"14px 16px",fontFamily:ff,fontSize:13,outline:"none",borderRadius:2,letterSpacing:4,textAlign:"center",marginBottom:10,transition:"border-color 0.2s"}}/>
        {err&&<div style={{color:RD,fontSize:10,textAlign:"center",letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Incorrect Password</div>}
        <button onClick={check} style={{width:"100%",padding:"13px 0",background:"transparent",border:"1px solid "+A,color:A,fontFamily:ff,fontSize:11,cursor:"pointer",borderRadius:2,letterSpacing:5,textTransform:"uppercase"}}
          onMouseEnter={e=>{e.target.style.background=A;e.target.style.color="#000";}} onMouseLeave={e=>{e.target.style.background="transparent";e.target.style.color=A;}}>
          Enter
        </button>
      </div>
    </div>
  );
}

// ─── Cog Settings Modal ───────────────────────────────────────────────────────
function CogSettings({settings,onSettingsChange,theme,onThemeChange,onClose}){
  const {BG,S,S2,BR,A,MU,TX,ff,radius}=useTheme();
  return(
    <div style={{position:"fixed",inset:0,zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"flex-end"}}>
      <div onClick={onClose} style={{position:"absolute",inset:0,background:"#000000aa"}}/>
      <div style={{position:"relative",zIndex:1,background:S,border:"1px solid "+BR,borderRadius:radius+4,margin:"20px 20px 20px 0",width:560,maxWidth:"calc(100vw - 40px)",maxHeight:"calc(100vh - 40px)",overflowY:"auto",boxShadow:"0 20px 60px #00000099"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"18px 24px",borderBottom:"1px solid "+BR}}>
          <span style={{fontFamily:ff,fontSize:12,color:A,letterSpacing:2,textTransform:"uppercase"}}>Settings</span>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:MU,fontSize:20,cursor:"pointer",lineHeight:1}}>x</button>
        </div>
        <div style={{padding:"20px 24px"}}>
          <SettingsPage settings={settings} onSettingsChange={onSettingsChange} theme={theme} onThemeChange={onThemeChange}/>
        </div>
      </div>
    </div>
  );
}

// Cog icon SVG
function CogIcon({size=18,color}){
  const {MU}=useTheme();
  const c=color||MU;
  return(
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App(){
  const [authed,setAuthed]=useState(!PASSWORD);
  const [tab,setTab]=useState("input");
  const [loading,setLoading]=useState(false);
  const [saveMsg,setSaveMsg]=useState("");
  const [copied,setCopied]=useState(false);
  const [themeRaw,setThemeRaw]=useState(DEFAULT_THEME);
  const [labelsRaw,setLabelsRaw]=useState(DEFAULT_LABELS);
  const [showSettings,setShowSettings]=useState(false);

  const availableMonths=getAvailableMonths();
  const now=new Date();
  const initIdx=availableMonths.findIndex(m=>m.year===now.getFullYear()&&m.month===now.getMonth());
  const [selIdx,setSelIdx]=useState(initIdx>=0?initIdx:availableMonths.length-1);
  const selMonth=availableMonths[selIdx];

  const [monthData,setMonthData]=useState({});
  const [fixed,setFixed]=useState(null);
  const [settings,setSettings]=useState(null);
  const [activeWeek,setActiveWeek]=useState(0);

  const opexKeys=settings?.opexKeys||DEFAULT_OPEX_KEYS;
  const wageDepts=settings?.wageDepts||DEFAULT_WAGE_DEPTS;
  const staff=settings?.staff||DEFAULT_STAFF;
  const theme=buildTheme(themeRaw);

  // Labels with save callback - saves into settings.labels so it persists
  const labels={...DEFAULT_LABELS,...labelsRaw,_save:(key,val)=>{
    const nl={...labelsRaw,[key]:val};
    setLabelsRaw(nl);
    // immediately save to prevent loss
    const ns={...(settings||{}),labels:nl};
    setSettings(ns);
    saveAll(monthData,fixed,ns);
  }};

  useEffect(()=>{
    if(!authed)return;
    setLoading(true);
    loadAll().then(({monthData:md,fixed:f,settings:s})=>{
      setMonthData(md||{});
      setFixed(f||emptyFixed(s?.opexKeys||DEFAULT_OPEX_KEYS));
      setSettings(s||{});
      if(s?.theme)setThemeRaw({...DEFAULT_THEME,...s.theme});
      if(s?.labels)setLabelsRaw({...DEFAULT_LABELS,...s.labels});
      setLoading(false);
    });
  },[authed]);

  const saveTimer=useRef(null);
  const autoSave=useCallback((md,fx,st)=>{
    if(saveTimer.current)clearTimeout(saveTimer.current);
    saveTimer.current=setTimeout(async()=>{
      await saveAll(md,fx,st);
      setSaveMsg("Saved");setTimeout(()=>setSaveMsg(""),2000);
    },1200);
  },[]);

  const curKey=selMonth?.key;
  const curEntry=monthData[curKey];
  const curWeeks=curEntry?.weeks||(()=>{
    const wd=getMonthWeeks(selMonth.year,selMonth.month);
    return wd.map(d=>emptyWeek(d.weekNum,d.dateRange,d.label,wageDepts,opexKeys));
  })();
  const curExtras=curEntry?.extras||emptyExtras(opexKeys);

  const updateWeeks=nw=>{
    const updated={...monthData,[curKey]:{...curEntry,weeks:nw,label:selMonth.label,lastSaved:new Date().toLocaleString("en-AU"),extras:curExtras}};
    setMonthData(updated);autoSave(updated,fixed,settings);
  };
  const updateExtras=ne=>{
    const updated={...monthData,[curKey]:{...curEntry,weeks:curWeeks,extras:ne,label:selMonth.label,lastSaved:new Date().toLocaleString("en-AU")}};
    setMonthData(updated);autoSave(updated,fixed,settings);
  };
  const updateFixed=async nf=>{setFixed(nf);await saveAll(monthData,nf,settings);setSaveMsg("Saved");setTimeout(()=>setSaveMsg(""),2000);};
  const updateSettings=ns=>{setSettings(ns);autoSave(monthData,fixed,ns);};
  const updateTheme=nt=>{
    setThemeRaw(nt);
    const ns={...(settings||{}),theme:nt};
    setSettings(ns);
    autoSave(monthData,fixed,ns);
  };

  const handleExport=(weeksData=curWeeks,extras=curExtras,label=selMonth?.label)=>{
    navigator.clipboard.writeText(generateExport(weeksData,fixed,extras,label,opexKeys,wageDepts,staff,labels));
    setCopied(true);setTimeout(()=>setCopied(false),3000);
  };
  const handleSaveMonthData=async md=>{setMonthData(md);await saveAll(md,fixed,settings);};

  const calcs=curWeeks.map(w=>calcWeek(w,fixed,opexKeys,wageDepts));
  const mc=calcMonth(curWeeks,fixed,curExtras,opexKeys,wageDepts);

  if(!authed)return(
    <ThemeContext.Provider value={theme}>
      <PasswordScreen onAuth={()=>setAuthed(true)} labels={{...DEFAULT_LABELS,...labelsRaw}}/>
    </ThemeContext.Provider>
  );

  const {A,BG,S,S2,BR,TX,MU,ff,ffTitle,radius,GR,RD}=theme;

  const TABS=[
    {id:"input",key:"tab_input"},{id:"overview",key:"tab_overview"},{id:"visualise",key:"tab_visualise"},
    {id:"compare",key:"tab_compare"},{id:"fixed",key:"tab_fixed"},
    {id:"reports",key:"tab_reports",suffix:" ("+Object.keys(monthData).length+")"},
  ];

  return(
    <ThemeContext.Provider value={theme}>
      <div style={{minHeight:"100vh",background:BG,color:TX,fontFamily:ff}}>
        {/* Header */}
        <div style={{borderBottom:"1px solid "+BR,padding:"0 24px"}}>
          <div style={{maxWidth:1200,margin:"0 auto",padding:"20px 0 0"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",flexWrap:"wrap",gap:12}}>
              <div>
                <div style={{color:A,fontSize:9,letterSpacing:4,textTransform:"uppercase",marginBottom:4}}>
                  <E value={labels.header_brand} onSave={v=>labels._save("header_brand",v)} style={{color:A,fontFamily:ffTitle,fontSize:9}}/>
                </div>
                <h1 style={{margin:0,fontSize:22,fontWeight:"normal",letterSpacing:2,color:TX,textTransform:"uppercase",fontFamily:ffTitle}}>
                  <E value={labels.header_title} onSave={v=>labels._save("header_title",v)} style={{color:TX,fontFamily:ffTitle,fontSize:22}}/>
                </h1>
              </div>
              <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                <select value={selIdx} onChange={e=>{setSelIdx(parseInt(e.target.value));setActiveWeek(0);}}
                  style={{background:S2,border:"1px solid "+BR,color:TX,padding:"7px 12px",fontFamily:ff,fontSize:13,outline:"none",borderRadius:radius,minWidth:170}}>
                  {availableMonths.map((m,i)=><option key={m.key} value={i}>{m.label}</option>)}
                </select>
                <div style={{background:S2,border:"1px solid "+BR,borderRadius:radius,padding:"7px 12px",fontSize:13,color:mc.netProfit>=0?GR:RD,fontFamily:ff}}>
                  MTD: {fmtD(mc.netProfit)}
                </div>
                {saveMsg&&<div style={{fontFamily:ff,fontSize:11,color:GR,letterSpacing:1}}>{saveMsg}</div>}
                {/* COG button */}
                <button onClick={()=>setShowSettings(true)}
                  style={{background:"transparent",border:"1px solid "+BR,borderRadius:radius,padding:"7px 9px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=A} onMouseLeave={e=>e.currentTarget.style.borderColor=BR}>
                  <CogIcon size={16} color={MU}/>
                </button>
              </div>
            </div>
            {/* Tabs */}
            <div style={{display:"flex",gap:0,marginTop:18,flexWrap:"wrap"}}>
              {TABS.map(t=>(
                <button key={t.id} onClick={()=>setTab(t.id)}
                  style={{padding:"10px 14px",background:"transparent",border:"none",borderBottom:tab===t.id?"2px solid "+A:"2px solid transparent",color:tab===t.id?A:MU,fontFamily:ff,fontSize:11,cursor:"pointer",letterSpacing:1.5,marginBottom:-1,textTransform:"uppercase",whiteSpace:"nowrap"}}>
                  <E value={(labels[t.key]||t.id.toUpperCase())+(t.suffix||"")} onSave={v=>labels._save(t.key,v)} style={{color:tab===t.id?A:MU,fontFamily:ff,fontSize:11}}/>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{maxWidth:1200,margin:"0 auto",padding:"28px 24px"}}>
          {loading&&<div style={{textAlign:"center",color:MU,padding:40,fontFamily:ff}}>Loading...</div>}

          {tab==="input"&&!loading&&(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12,marginBottom:20}}>
                <div style={{fontFamily:ff,fontSize:11,color:MU,letterSpacing:1}}>
                  <E value={selMonth?.label+" — "+(labels.header_subtitle||"weeks auto-dated Mon-Sun")} onSave={v=>labels._save("header_subtitle",v.includes("—")?v.split("—").slice(1).join("—").trim():v)} style={{fontFamily:ff,fontSize:11,color:MU}}/>
                </div>
                <button onClick={()=>handleExport()}
                  style={{padding:"9px 16px",background:copied?A:"transparent",border:"1px solid "+A,color:copied?"#000":A,fontFamily:ff,fontSize:11,cursor:"pointer",borderRadius:radius,letterSpacing:1.5,textTransform:"uppercase"}}>
                  <E value={labels.btn_generate_export} onSave={v=>labels._save("btn_generate_export",v)} style={{fontFamily:ff,fontSize:11,color:copied?"#000":A}}/>{copied?" ✓":""}
                </button>
              </div>

              {/* Week tabs */}
              <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
                {curWeeks.map((w,i)=>{
                  const c=calcs[i];
                  return(
                    <button key={i} onClick={()=>setActiveWeek(i)}
                      style={{padding:"10px 16px",background:activeWeek===i?S2:"transparent",border:"1px solid "+(activeWeek===i?A:BR),color:activeWeek===i?A:MU,fontFamily:ff,fontSize:12,cursor:"pointer",borderRadius:radius,textAlign:"left",minWidth:140}}>
                      <div style={{fontWeight:"bold"}}>{w.label}</div>
                      <div style={{fontSize:10,color:MU,marginTop:1}}>{w.dateRange}</div>
                      <div style={{fontSize:11,color:c.netProfit!==0?(c.netProfit>=0?GR:RD):MU,marginTop:2}}>{c.netProfit!==0?fmtS(c.netProfit):"No data"}</div>
                    </button>
                  );
                })}
              </div>

              {curWeeks[activeWeek]&&(
                <div style={{background:S,border:"1px solid "+BR,borderRadius:radius+4,padding:"24px 28px"}}>
                  <div style={{fontFamily:ff,fontSize:10,letterSpacing:2,color:A,textTransform:"uppercase",marginBottom:16}}>
                    {curWeeks[activeWeek].label} — {curWeeks[activeWeek].dateRange}
                  </div>
                  <WeekForm
                    week={curWeeks[activeWeek]}
                    onChange={updated=>{const nw=[...curWeeks];nw[activeWeek]=updated;updateWeeks(nw);}}
                    fixed={fixed} opexKeys={opexKeys} depts={wageDepts}
                    settings={settings} onSettingsChange={updateSettings}
                    labels={labels}
                  />
                </div>
              )}
            </div>
          )}

          {tab==="overview"&&!loading&&(
            <div style={{background:S,border:"1px solid "+BR,borderRadius:radius+4,padding:"24px 28px"}}>
              <MonthlyOverview weeks={curWeeks} fixed={fixed} extras={curExtras} onExtrasChange={updateExtras} onExport={()=>handleExport()} copied={copied} opexKeys={opexKeys} depts={wageDepts} labels={labels}/>
            </div>
          )}

          {tab==="visualise"&&!loading&&(
            <div style={{background:S,border:"1px solid "+BR,borderRadius:radius+4,padding:"24px 28px"}}>
              <VisualisePage weeks={curWeeks} fixed={fixed} allMonthData={monthData} opexKeys={opexKeys} depts={wageDepts}/>
            </div>
          )}

          {tab==="compare"&&!loading&&(
            <div style={{background:S,border:"1px solid "+BR,borderRadius:radius+4,padding:"24px 28px"}}>
              <ComparePage allMonthData={monthData} fixed={fixed} opexKeys={opexKeys} depts={wageDepts} labels={labels}/>
            </div>
          )}

          {tab==="fixed"&&!loading&&(
            <div style={{background:S,border:"1px solid "+BR,borderRadius:radius+4,padding:"24px 28px"}}>
              {fixed&&<FixedCostsPage fixed={fixed} onChange={updateFixed} opexKeys={opexKeys} settings={settings} onSettingsChange={updateSettings} labels={labels}/>}
            </div>
          )}

          {tab==="reports"&&!loading&&(
            <div style={{background:S,border:"1px solid "+BR,borderRadius:radius+4,padding:"24px 28px"}}>
              <ReportsPage monthData={monthData} fixed={fixed} onSave={handleSaveMonthData} onExport={handleExport} opexKeys={opexKeys} depts={wageDepts}/>
            </div>
          )}
        </div>

        {/* Settings modal (cog) */}
        {showSettings&&(
          <ThemeContext.Provider value={theme}>
            <CogSettings
              settings={settings}
              onSettingsChange={st=>{updateSettings({...(settings||{}),...st});}}
              theme={themeRaw}
              onThemeChange={updateTheme}
              onClose={()=>setShowSettings(false)}
            />
          </ThemeContext.Provider>
        )}
      </div>
    </ThemeContext.Provider>
  );
}
