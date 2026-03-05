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
    szHeaderTitle:t.headerTitleSize??22,
    szHeaderBrand:t.headerBrandSize??9,
    szSection:t.sectionHeaderSize??10,
    szSubSection:t.subSectionSize??9,
  };
}

// ─── Text Style Defaults (bold / italic / size per label key) ────────────────
const DEFAULT_TEXT_STYLES = {}; // { [key]: { bold:bool, italic:bool, size:number } }

// ─── Financial Targets Defaults ───────────────────────────────────────────────
const DEFAULT_TARGETS = {
  gross_margin_target: 55,      // %
  net_margin_target: 15,        // %
  cogs_pct_target: 35,          // % of net revenue
  opex_pct_target: 25,          // % of net revenue
  wages_pct_target: 20,         // % of net revenue
  promo_disc_rate_max: 12,      // % of gross sales
  service_recovery_max_orders: 5, // orders per week before alert
  service_recovery_cost_alert: 50, // $ per order before alert
  refund_rate_max: 3,           // % of gross sales
};

// ─── Labels ───────────────────────────────────────────────────────────────────
const DEFAULT_LABELS = {
  header_brand:"Finance Operations", header_title:"P&L Dashboard", header_subtitle:"weeks auto-dated Mon-Sun",
  tab_input:"WEEKLY INPUT", tab_overview:"MONTHLY OVERVIEW", tab_visualise:"VISUALISE",
  tab_compare:"COMPARE", tab_fixed:"FIXED COSTS", tab_targets:"TARGETS", tab_reports:"REPORTS",
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

// ─── Discount Code Registry ───────────────────────────────────────────────────
const DISCOUNT_CODE_REGISTRY = [
  { id:"RESHIP-FAULTY",  category:"service_recovery", useCase:"Replacement for faulty/wrong garment — product at $0, customer pays shipping or free", plCategory:"Warranty / COGS Expense", hasCOGS:true, hasShipping:true },
  { id:"RESHIP-LOST",    category:"service_recovery", useCase:"Replacement for lost parcel (AusPost claim)", plCategory:"Logistics Loss / COGS", hasCOGS:true, hasShipping:true },
  { id:"RESHIP-DAMAGED", category:"service_recovery", useCase:"Garment damaged in transit, replacement sent", plCategory:"Logistics Loss / COGS", hasCOGS:true, hasShipping:true },
  { id:"RESHIP-RTS",     category:"service_recovery", useCase:"Return-to-sender reshipment — customer paid, you're resending", plCategory:"Logistics / Operational", hasCOGS:false, hasShipping:true },
  { id:"RESHIP-CUSTOMS", category:"service_recovery", useCase:"Parcel failed customs, being resent free of charge", plCategory:"Logistics Loss", hasCOGS:true, hasShipping:true },
  { id:"EXCHANGE-SE",    category:"service_recovery", useCase:"Size exchange — customer paid, you're sending correct size", plCategory:"Customer Retention Cost / COGS", hasCOGS:true, hasShipping:true },
  { id:"EXCHANGE-GIFT",  category:"service_recovery", useCase:"Exchange absorbed as goodwill gesture", plCategory:"CS Goodwill Expense", hasCOGS:true, hasShipping:true },
  { id:"CS-ERROR",       category:"service_recovery", useCase:"We packed wrong item — replacement sent at our cost", plCategory:"Operational Error / COGS", hasCOGS:true, hasShipping:true },
  { id:"FM2USTAFF",      category:"staff",            useCase:"Staff purchases", plCategory:"Staff Benefit / COGS", hasCOGS:false, hasShipping:false },
  { id:"COLLAB2026",     category:"marketing",        useCase:"Marketing / Influencer collaboration", plCategory:"Customer Acquisition Cost (Marketing)", hasCOGS:true, hasShipping:true },
];

const DISC_CATEGORIES = [
  { id:"service_recovery", label:"Service Recovery",      badge:"Reclassified: COGS / Operational", colorKey:"RD" },
  { id:"marketing",        label:"Marketing / Influencer",badge:"Reclassified: Marketing Expense",  colorKey:"YL" },
  { id:"staff",            label:"Staff Discounts",        badge:"Reclassified: Staff Benefits",     colorKey:"A"  },
  { id:"promotional",      label:"Promotional / Sale",     badge:"Stays: Revenue Deduction",         colorKey:"GR" },
];

// ─── Discount Bucket Defaults ─────────────────────────────────────────────────
const DEFAULT_DISC_BUCKETS = [
  { id:"service_recovery", labelKey:"disc_service_recovery", subKey:"disc_service_recovery_sub", reclassAs:"cogs",        defaultCodes:"RESHIP-FAULTY,RESHIP-LOST,RESHIP-DAMAGED,RESHIP-RTS,RESHIP-CUSTOMS,EXCHANGE-SE,EXCHANGE-GIFT,CS-WARRANTY,CS-ERROR", hasCOGS:true },
  { id:"marketing",        labelKey:"disc_marketing",        subKey:"disc_marketing_sub",        reclassAs:"marketing",   defaultCodes:"COLLAB2026", hasCOGS:false },
  { id:"staff",            labelKey:"disc_staff",            subKey:"disc_staff_sub",            reclassAs:"wages",        defaultCodes:"FM2USTAFF", hasCOGS:false },
  { id:"promotional",      labelKey:"disc_promotional",      subKey:"disc_promotional_sub",      reclassAs:"promotional", defaultCodes:"", hasCOGS:false },
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
  DEFAULT_DISC_BUCKETS.forEach(b=>{out[b.id]={retailValue:"",orders:"",cogsValue:"",codes:b.defaultCodes};});
  return out;
}

function emptyCodeData(){
  const out={};
  DISCOUNT_CODE_REGISTRY.forEach(c=>{out[c.id]={orders:"",retailValue:"",cogsValue:"",shippingValue:"",active:true};});
  // promotional slot (user-entered codes)
  out["__promo__"]={orders:"",retailValue:"",cogsValue:"",shippingValue:"",active:true,customCodes:""};
  return out;
}

function codeDataToDiscBuckets(codeData){
  const tot={service_recovery:{rv:0,ord:0,cogs:0},marketing:{rv:0,ord:0,cogs:0},staff:{rv:0,ord:0,cogs:0},promotional:{rv:0,ord:0,cogs:0}};
  DISCOUNT_CODE_REGISTRY.forEach(c=>{
    const d=codeData?.[c.id]; if(!d||d.active===false)return;
    const t=tot[c.category]; if(!t)return;
    t.rv+=n(d.retailValue); t.ord+=n(d.orders); t.cogs+=n(d.cogsValue)+n(d.shippingValue);
  });
  // promo slot
  const p=codeData?.["__promo__"]; if(p&&p.active!==false){ tot.promotional.rv+=n(p.retailValue); tot.promotional.ord+=n(p.orders); }
  const out={};
  DEFAULT_DISC_BUCKETS.forEach(b=>{const t=tot[b.id]||{}; out[b.id]={retailValue:t.rv||"",orders:t.ord||"",cogsValue:t.cogs||"",codes:b.defaultCodes};});
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
    codeData:emptyCodeData(),
    wages:emptyWages(depts),
    opex:emptyOpex(opexKeys),
    weekTargets:null, // per-week targets override, null = use global
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
    marketingDisc: n(mkt.retailValue),
    marketingOrders: n(mkt.orders),
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
  const effectiveBuckets=week.codeData?codeDataToDiscBuckets(week.codeData):(week.discBuckets||emptyDiscBuckets());
  // Reclassify discounts
  const dr=calcDiscReclassification(effectiveBuckets);
  // True promotional discount (stays in revenue deductions)
  const promoDisc = dr.promoDisc || (totalDiscounts - dr.serviceRecoveryRetail - dr.marketingDisc - dr.staffDisc);
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
  // Marketing discount reclassified as marketing expense
  const totalOPEX=totalOPEXBase+dr.marketingDisc;

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
  if(!raw?.trim())return{revenue:{},cogs:{},opex:{}};

  const revenue={};
  const cogs={};
  const opex={};

  const getNum=line=>{
    const nums=line.match(/[\d,]+\.?\d*/g);
    if(!nums)return null;
    return parseFloat(nums[nums.length-1].replace(/,/g,""))||0;
  };
  const getInt=line=>{
    const nums=line.match(/\d+/g);
    if(!nums)return null;
    return parseInt(nums[nums.length-1])||0;
  };

  raw.split("\n").forEach(line=>{
    const low=line.toLowerCase().trim();
    if(!low)return;

    // ── Revenue fields ──────────────────────────────────────────────────────
    if(low.includes("gross sale")||low.includes("total sale")||low.includes("total revenue")){
      const v=getNum(line); if(v!==null)revenue.gross_sales=v;
    } else if((low.includes("refund")||low.includes("return"))&&!low.includes("shipping")){
      const v=getNum(line); if(v!==null)revenue.refunds=v;
    } else if(low.includes("discount")&&!low.includes("collab")&&!low.includes("staff")&&!low.includes("influencer")&&!low.includes("code breakdown")){
      const v=getNum(line); if(v!==null)revenue.discounts=v;
    } else if(low.includes("shipping")&&(low.includes("income")||low.includes("revenue")||low.includes("collected")||low.includes("charged"))){
      const v=getNum(line); if(v!==null)revenue.shipping_income=v;
    } else if(low.includes("paypal")||low.includes("pay pal")){
      const v=getNum(line); if(v!==null)revenue.paypal_fees=v;

    // ── COGS fields ─────────────────────────────────────────────────────────
    } else if((low.includes("manufactur")&&(low.includes("product")||low.includes("cogs")||low.includes("cost of good")))||low.includes("product cogs")||low.includes("mfg product")){
      const v=getNum(line); if(v!==null)cogs.manufacturing_product=v;
    } else if((low.includes("manufactur")&&(low.includes("ship")||low.includes("inbound")||low.includes("freight")))||low.includes("inbound freight")||low.includes("mfg shipping")){
      const v=getNum(line); if(v!==null)cogs.manufacturing_shipping=v;
    } else if(low.includes("number of order")||low.includes("order count")||low.includes("total order")||(low.includes("order")&&low.includes("satchel"))){
      const v=getInt(line); if(v!==null)cogs.satchel_count=v;
    } else if(low.includes("other packaging")||low.includes("packaging cost")){
      const v=getNum(line); if(v!==null)cogs.other_packaging=v;

    // ── OPEX: Freight ───────────────────────────────────────────────────────
    } else if(low.includes("auspost")||low.includes("aus post")||(low.includes("australia post"))){
      const v=getNum(line); if(v!==null)opex.auspost=v;
    } else if(low.includes("fedex")||low.includes("fed ex")||low.includes("international freight")||low.includes("dhl")||low.includes("ups")){
      const v=getNum(line); if(v!==null)opex.fedex=v;
    } else if(low.includes("custom")&&(low.includes("dut")||low.includes("tax")||low.includes("clearance"))){
      const v=getNum(line); if(v!==null)opex.customs_duties=v;

    // ── OPEX: Collabs ───────────────────────────────────────────────────────
    } else if((low.includes("collab")&&low.includes("ship"))||(low.includes("influencer")&&low.includes("ship"))){
      const v=getNum(line); if(v!==null)opex.collab_shipping=v;
    } else if((low.includes("collab")&&(low.includes("product")||low.includes("cogs")))||(low.includes("influencer")&&low.includes("product"))){
      const v=getNum(line); if(v!==null)opex.collab_product_cogs=v;
    } else if(low.includes("uppromote")||low.includes("affiliate commission")||low.includes("referral commission")){
      const v=getNum(line); if(v!==null)opex.uppromote_commission=v;
    } else if(low.includes("paid collab")||low.includes("paid influencer")||(low.includes("collab fee")||low.includes("influencer fee"))){
      const v=getNum(line); if(v!==null)opex.paid_collab_fees=v;

    // ── OPEX: General ───────────────────────────────────────────────────────
    } else if(low.includes("shopify app")){
      const v=getNum(line); if(v!==null)opex.shopify_apps=v;
    } else if(low.includes("shopify")&&!low.includes("app")){
      const v=getNum(line); if(v!==null)opex.shopify=v;
    } else if(low.includes("meta ad")||low.includes("tiktok ad")||low.includes("google ad")||low.includes("facebook ad")||(low.includes("paid ad"))){
      const v=getNum(line); if(v!==null)opex.meta_tiktok_ads=v;
    } else if(low.includes("model wage")||low.includes("model cost")||low.includes("content creator wage")){
      const v=getNum(line); if(v!==null)opex.model_wages=v;
    } else if(low.includes("rent")&&(low.includes("util")||low.includes("electric")||low.includes("water"))){
      const v=getNum(line); if(v!==null)opex.rent_utilities=v;
    } else if(low.includes("insurance")){
      const v=getNum(line); if(v!==null)opex.insurance=v;
    } else if(low.includes("xero")||(low.includes("accounting")&&!low.includes("bank"))){
      const v=getNum(line); if(v!==null)opex.accounting_xero=v;
    } else if(low.includes("deputy")||low.includes("rostering")){
      const v=getNum(line); if(v!==null)opex.rostering_deputy=v;
    } else if(low.includes("repliai")||low.includes("repli ai")||low.includes("customer service platform")){
      const v=getNum(line); if(v!==null)opex.customer_service_repliai=v;
    } else if(low.includes("internet")||low.includes("telephone")||low.includes("phone plan")){
      const v=getNum(line); if(v!==null)opex.internet_phone=v;
    } else if(low.includes("bank fee")||(low.includes("bank")&&low.includes("account"))){
      const v=getNum(line); if(v!==null)opex.bank_accounting=v;
    } else if(low.includes("legal")||low.includes("lawyer")||low.includes("solicitor")){
      const v=getNum(line); if(v!==null)opex.legal=v;
    } else if(low.includes("office cost")||low.includes("office supply")||low.includes("stationery")){
      const v=getNum(line); if(v!==null)opex.office_costs=v;
    } else if(low.includes("google workspace")||low.includes("microsoft 365")||low.includes("google admin")||low.includes("ms admin")){
      const v=getNum(line); if(v!==null)opex.google_ms_admin=v;
    }
  });

  // Strip zeros (leave only fields that were actually found)
  const clean=obj=>Object.fromEntries(Object.entries(obj).filter(([,v])=>v!==""&&v!==null&&v!==0).map(([k,v])=>[k,v]));
  return{revenue:clean(revenue),cogs:clean(cogs),opex:clean(opex)};
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
    serviceRecoveryCOGS:s.serviceRecoveryCOGS+c.discReclass.serviceRecoveryCOGS,
    serviceRecoveryOrders:s.serviceRecoveryOrders+c.discReclass.serviceRecoveryOrders,
    marketingDisc:s.marketingDisc+c.discReclass.marketingDisc,
    staffDisc:s.staffDisc+c.discReclass.staffDisc,
    promoDisc:s.promoDisc+c.discReclass.promoDisc,
  }),{serviceRecoveryCOGS:0,serviceRecoveryOrders:0,marketingDisc:0,staffDisc:0,promoDisc:0});
  o+="--- DISCOUNT RECLASSIFICATION ---\n";
  o+="Service Recovery (ops expense / COGS): "+fmt(totalDR.serviceRecoveryCOGS)+" | "+totalDR.serviceRecoveryOrders+" orders\n";
  o+="Influencer / Marketing gifting: "+fmt(totalDR.marketingDisc)+"\n";
  o+="Staff discounts (staff benefit): "+fmt(totalDR.staffDisc)+"\n";
  o+="True promotional discounts: "+fmt(totalDR.promoDisc)+" ("+pct(totalDR.promoDisc,gSales)+" of gross - this is the ONLY bucket affecting Net Revenue)\n\n";

  weeks.forEach((w,i)=>{
    const c=mc.weekCalcs[i];
    const wTargets=w.weekTargets||DEFAULT_TARGETS;
    o+="--- "+w.label+" | "+w.dateRange+" ---\n";
    o+="  Gross: "+fmt(n(w.revenue.gross_sales))+" | Total Discounts: -"+fmt(n(w.revenue.discounts))+" | True Promo Discount: -"+fmt(c.truePromoDisc)+" | Refunds: -"+fmt(n(w.revenue.refunds))+" | ShipIncome: +"+fmt(n(w.revenue.shipping_income))+" | PayPal: -"+fmt(n(w.revenue.paypal_fees))+" => NET: "+fmt(c.netRevenue)+"\n";
    o+="  COGS: MfgProduct "+fmt(n(w.cogs.manufacturing_product))+" | Inbound "+fmt(n(w.cogs.manufacturing_shipping))+" | Satchels "+n(w.cogs.satchel_count)+"@$"+(w.cogs.satchel_cost_each||fixed?.satchelCostDefault||"0.85")+"="+fmt(c.satchel)+" | ServiceRecovery "+fmt(c.discReclass.serviceRecoveryCOGS)+" => TOTAL: "+fmt(c.totalCOGS)+" | GP: "+fmt(c.grossProfit)+" ("+c.grossMargin.toFixed(1)+"%)\n";
    const fLines=keys.filter(k=>k.group==="freight").map(k=>{const v=w.opex?.[k.key]!==""?n(w.opex[k.key]):(fixed?.fixedKeys?.includes(k.key)?n(fixed?.values?.[k.key]):0);return k.label+": "+fmt(v);});
    o+="  Freight: "+fLines.join(" | ")+" => "+fmt(c.totalFreight)+"\n";
    const cLines=keys.filter(k=>k.group==="collabs").map(k=>{const v=w.opex?.[k.key]!==""?n(w.opex[k.key]):(fixed?.fixedKeys?.includes(k.key)?n(fixed?.values?.[k.key]):0);return k.label+": "+fmt(v);});
    o+="  Collabs: "+cLines.join(" | ")+" | InfluencerGifting: "+fmt(c.discReclass.marketingDisc)+" => "+fmt(c.totalCollabs)+"\n";
    const wLines=wDepts.flatMap(d=>d.subs.map(s=>s.label+": "+fmt(n(w.wages?.[s.key]||0))));
    o+="  Wages: "+wLines.join(" | ")+" | StaffBenefits: "+fmt(c.discReclass.staffDisc)+" => "+fmt(c.totalWages)+"\n";
    const gLines=keys.filter(k=>k.group==="general").map(k=>{const v=w.opex?.[k.key]!==""?n(w.opex[k.key]):(fixed?.fixedKeys?.includes(k.key)?n(fixed?.values?.[k.key]):0);return v>0?k.label+": "+fmt(v):null;}).filter(Boolean);
    o+="  OPEX: "+(gLines.join(" | ")||"none")+" => "+fmt(c.totalOPEX)+"\n";
    o+="  NET PROFIT: "+fmt(c.netProfit)+" ("+c.netMargin.toFixed(1)+"%)"+(w.notes?" | Notes: "+w.notes:"")+"\n";
    // Per-week alerts as action items
    const wAlerts=generateAlerts(w,c.netRevenue,c.discReclass||{},n(w.revenue.gross_sales),wTargets);
    if(wAlerts.length){o+="  ACTIONS REQUIRED:\n";wAlerts.forEach(a=>{o+="  "+a.icon+" "+a.title+": "+a.action+"\n";});}
    o+="\n";
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
  o+="2. DISCOUNT RECLASSIFICATION IMPACT - The total discounts figure includes service recovery (ops cost), influencer gifting (marketing), and staff benefits. Explain how reclassifying these changes the true picture of both revenue quality and operational efficiency. What is the real promotional discount rate? What is the service recovery rate and what does it signal about product quality?\n\n";
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

// Section Header - main (full divider) vs sub (lighter)
function SH({children,sub,divider=true}){
  const {A,BR,MU,ff,szSection,szSubSection}=useTheme();
  if(sub) return(
    <div style={{fontFamily:ff,fontSize:szSubSection||9,letterSpacing:1.5,textTransform:"uppercase",color:MU,marginBottom:12,marginTop:20,paddingLeft:14,borderLeft:"2px solid "+MU+"44"}}>
      {children}
    </div>
  );
  return(
    <div style={{marginTop:28,marginBottom:12}}>
      {divider&&<div style={{height:1,background:"linear-gradient(to right,"+BR+",transparent)",marginBottom:0}}/>}
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0 10px",borderBottom:"2px solid "+A+"66"}}>
        <div style={{width:3,height:16,background:A,borderRadius:2,flexShrink:0}}/>
        <div style={{fontFamily:ff,fontSize:szSection||10,letterSpacing:2.5,textTransform:"uppercase",color:A,fontWeight:"bold"}}>
          {children}
        </div>
      </div>
    </div>
  );
}
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

// E = Editable inline text (hover to reveal edit, right-click for style controls)
function E({value,onSave,style={},multiline=false,styleKey,onStyleSave}){
  const [editing,setEditing]=useState(false);
  const [draft,setDraft]=useState(value);
  const [hover,setHover]=useState(false);
  const [showStyle,setShowStyle]=useState(false);
  const {A}=useTheme();
  useEffect(()=>setDraft(value),[value]);
  const commit=()=>{setEditing(false);if(draft.trim()!==value)onSave(draft.trim()||value);};

  // Build computed style from styleKey overrides
  const ts=style||{};

  const editBtn=(
    <span style={{display:"inline-flex",gap:3,marginLeft:4,opacity:hover?0.55:0,transition:"opacity 0.15s"}}>
      <span onClick={e=>{e.stopPropagation();setEditing(true);}} style={{fontSize:9,color:A,cursor:"text",userSelect:"none",letterSpacing:0.5}}>edit</span>
      {onStyleSave&&<span onClick={e=>{e.stopPropagation();setShowStyle(s=>!s);}} style={{fontSize:9,color:A,cursor:"pointer",userSelect:"none",letterSpacing:0.5,marginLeft:2}}>Aa</span>}
    </span>
  );

  if(editing){
    if(multiline)return <textarea value={draft} onChange={e=>setDraft(e.target.value)} onBlur={commit} autoFocus
      style={{background:"transparent",border:"none",borderBottom:"1px solid "+A,color:"inherit",fontFamily:"inherit",fontSize:"inherit",outline:"none",width:"100%",resize:"none",lineHeight:1.5,...ts}}/>;
    return <input value={draft} onChange={e=>setDraft(e.target.value)} onBlur={commit}
      onKeyDown={e=>{if(e.key==="Enter")commit();if(e.key==="Escape"){setEditing(false);setDraft(value);}}}
      autoFocus style={{background:"transparent",border:"none",borderBottom:"1px solid "+A,color:"inherit",fontFamily:"inherit",fontSize:"inherit",outline:"none",width:"100%",...ts}}/>;
  }
  return(
    <span onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}
      style={{display:"inline-flex",flexDirection:"column",position:"relative"}}>
      <span style={{display:"inline-flex",alignItems:"center",...ts}}>
        <span>{value}</span>
        {editBtn}
      </span>
      {showStyle&&onStyleSave&&(
        <TextStylePanel styleKey={styleKey} onStyleSave={onStyleSave} onClose={()=>setShowStyle(false)} currentStyle={ts}/>
      )}
    </span>
  );
}

function TextStylePanel({onStyleSave,onClose,currentStyle}){
  const {S2,BR,A,MU,TX,ff,radius}=useTheme();
  const [bold,setBold]=useState(currentStyle?.fontWeight==="bold"||currentStyle?.fontWeight===700);
  const [italic,setItalic]=useState(currentStyle?.fontStyle==="italic");
  const [size,setSize]=useState(parseInt(currentStyle?.fontSize)||12);
  const apply=()=>{onStyleSave({bold,italic,size});onClose();};
  return(
    <div style={{position:"absolute",top:"100%",left:0,zIndex:200,background:S2,border:"1px solid "+BR,borderRadius:radius+2,padding:"10px 12px",display:"flex",gap:8,alignItems:"center",whiteSpace:"nowrap",boxShadow:"0 8px 24px #00000088"}}>
      <button onClick={()=>setBold(b=>!b)} style={{background:bold?A:"transparent",border:"1px solid "+(bold?A:BR),color:bold?"#000":TX,fontFamily:ff,fontSize:11,fontWeight:"bold",padding:"3px 8px",cursor:"pointer",borderRadius:2}}>B</button>
      <button onClick={()=>setItalic(i=>!i)} style={{background:italic?A:"transparent",border:"1px solid "+(italic?A:BR),color:italic?"#000":TX,fontFamily:ff,fontSize:11,fontStyle:"italic",padding:"3px 8px",cursor:"pointer",borderRadius:2}}>I</button>
      <input type="number" value={size} min={7} max={32} onChange={e=>setSize(parseInt(e.target.value)||12)}
        style={{width:46,background:"transparent",border:"1px solid "+BR,color:TX,fontFamily:ff,fontSize:11,padding:"3px 6px",outline:"none",borderRadius:2,textAlign:"center"}}/>
      <span style={{fontFamily:ff,fontSize:10,color:MU}}>px</span>
      <button onClick={apply} style={{background:A,border:"none",color:"#000",fontFamily:ff,fontSize:10,padding:"4px 10px",cursor:"pointer",borderRadius:2,fontWeight:"bold"}}>Apply</button>
      <button onClick={onClose} style={{background:"transparent",border:"none",color:MU,fontFamily:ff,fontSize:12,cursor:"pointer",padding:"2px 4px"}}>×</button>
    </div>
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

// ─── Shopify Import ───────────────────────────────────────────────────────────
function ShopifyImport({week,onChange,labels}){
  const {S2,BR,A,S,TX,ff,MU,GR,RD,radius}=useTheme();
  const bi=useBI();
  const [raw,setRaw]=useState(week.shopifyRaw||"");
  const [msg,setMsg]=useState("");
  const [detail,setDetail]=useState([]);
  function apply(){
    const parsed=parseShopify(raw);
    const rCount=Object.keys(parsed.revenue).length;
    const cCount=Object.keys(parsed.cogs).length;
    const oCount=Object.keys(parsed.opex).length;
    const total=rCount+cCount+oCount;
    if(!total){setMsg("No values detected — check format");setDetail([]);return;}
    onChange({
      ...week,
      shopifyRaw:raw,
      revenue:{...week.revenue,...parsed.revenue},
      cogs:{...week.cogs,...parsed.cogs},
      opex:{...week.opex,...parsed.opex},
    });
    const parts=[];
    if(rCount)parts.push(rCount+" revenue");
    if(cCount)parts.push(cCount+" COGS");
    if(oCount)parts.push(oCount+" OPEX");
    setMsg("Auto-filled "+total+" fields");
    setDetail(parts);
    setTimeout(()=>{setMsg("");setDetail([]);},4000);
  }
  return(
    <div style={{background:S2,border:"1px solid "+BR,borderRadius:radius+2,padding:"16px 18px",marginBottom:20}}>
      <div style={{fontFamily:ff,fontSize:10,letterSpacing:2,textTransform:"uppercase",color:A,marginBottom:8}}>
        <E value={labels.sec_shopify} onSave={v=>labels._save("sec_shopify",v)} style={{fontFamily:ff,fontSize:10,color:A}}/>
      </div>
      <textarea value={raw} onChange={e=>setRaw(e.target.value)} placeholder="Paste Shopify CSV or tab-separated export here..." rows={4}
        style={{width:"100%",boxSizing:"border-box",background:S,border:"1px solid "+BR,color:TX,padding:"10px 12px",fontFamily:"monospace",fontSize:12,outline:"none",borderRadius:radius,resize:"vertical"}}/>
      <div style={{display:"flex",alignItems:"center",gap:12,marginTop:10,flexWrap:"wrap"}}>
        <button onClick={apply} style={{padding:"8px 18px",background:A,border:"none",color:"#000",fontFamily:ff,fontSize:12,cursor:"pointer",borderRadius:radius,fontWeight:"bold",letterSpacing:1}}>
          <E value={labels.sec_shopify_btn} onSave={v=>labels._save("sec_shopify_btn",v)} style={{fontFamily:ff,fontSize:12,color:"#000"}}/>
        </button>
        {msg&&<span style={{fontFamily:ff,fontSize:12,color:msg.includes("No")?RD:GR}}>{msg}{detail.length?<span style={{color:MU,fontSize:11}}> ({detail.join(", ")})</span>:null}</span>}
      </div>
    </div>
  );
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────
function ConfirmModal({message,onConfirm,onCancel}){
  const {BG,S2,BR,A,RD,MU,TX,ff,radius}=useTheme();
  return(
    <div style={{position:"fixed",inset:0,zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div onClick={onCancel} style={{position:"absolute",inset:0,background:"#000000bb"}}/>
      <div style={{position:"relative",zIndex:1,background:S2,border:"1px solid "+BR,borderRadius:radius+4,padding:"28px 32px",minWidth:320,maxWidth:420,boxShadow:"0 20px 60px #00000099",textAlign:"center"}}>
        <div style={{fontFamily:ff,fontSize:14,color:TX,marginBottom:20,lineHeight:1.7}}>{message}</div>
        <div style={{display:"flex",gap:10,justifyContent:"center"}}>
          <button onClick={onConfirm}
            style={{padding:"10px 28px",background:RD,border:"none",color:"#fff",fontFamily:ff,fontSize:12,cursor:"pointer",borderRadius:radius,fontWeight:"bold",letterSpacing:1,textTransform:"uppercase"}}>
            Yes, Clear
          </button>
          <button onClick={onCancel}
            style={{padding:"10px 28px",background:"transparent",border:"1px solid "+BR,color:MU,fontFamily:ff,fontSize:12,cursor:"pointer",borderRadius:radius,letterSpacing:1,textTransform:"uppercase"}}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Clear Section Button ─────────────────────────────────────────────────────
function ClearBtn({onClear,label="section"}){
  const {RD,ff,BR,radius}=useTheme();
  const [showModal,setShowModal]=useState(false);
  return(
    <>
      <button onClick={()=>setShowModal(true)}
        style={{background:"transparent",border:"1px solid #ff6b6b44",color:"#ff6b6b88",fontFamily:ff,fontSize:9,padding:"2px 8px",cursor:"pointer",borderRadius:2,letterSpacing:0.5,textTransform:"uppercase",marginLeft:10}}>
        Clear
      </button>
      {showModal&&(
        <ConfirmModal
          message={"Clear " + label + "? This will remove all entered data in this section."}
          onConfirm={()=>{onClear();setShowModal(false);}}
          onCancel={()=>setShowModal(false)}
        />
      )}
    </>
  );
}

// ─── Clear All Button ─────────────────────────────────────────────────────────
function ClearAll({onClear}){
  const {RD,ff,BR,radius}=useTheme();
  const [showModal,setShowModal]=useState(false);
  return(
    <>
      <button onClick={()=>setShowModal(true)}
        style={{padding:"9px 20px",background:"transparent",border:"1px solid "+RD+"66",color:RD+"99",fontFamily:ff,fontSize:11,cursor:"pointer",borderRadius:radius,letterSpacing:1.5,textTransform:"uppercase"}}>
        Clear All Week Data
      </button>
      {showModal&&(
        <ConfirmModal
          message="Clear ALL data for this week? This will wipe every field — revenue, COGS, OPEX, wages, notes, and discounts."
          onConfirm={()=>{onClear();setShowModal(false);}}
          onCancel={()=>setShowModal(false)}
        />
      )}
    </>
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

      <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between"}}>
        <div style={{flex:1}}><SH><E value={labels.sec_revenue} onSave={v=>labels._save("sec_revenue",v)} style={{color:"inherit",fontFamily:ff}}/></SH></div>
        <div style={{paddingBottom:14}}><ClearBtn label="Revenue & Deductions" onClear={()=>onChange({...week,revenue:{gross_sales:"",refunds:"",discounts:"",shipping_income:"",paypal_fees:""}})} /></div>
      </div>
      {/* Indented sub-fields */}
      <div style={{paddingLeft:16,borderLeft:"2px solid "+A+"22",marginTop:14,marginBottom:4}}>
        <Grid>
          <Fld label={<E value={labels.field_gross_sales} onSave={v=>labels._save("field_gross_sales",v)} style={{color:MU,fontFamily:ff,fontSize:11}}/>}><CI value={week.revenue.gross_sales} onChange={v=>upR("gross_sales",v)}/></Fld>
          <Fld label={<E value={labels.field_refunds} onSave={v=>labels._save("field_refunds",v)} style={{color:MU,fontFamily:ff,fontSize:11}}/>}><CI value={week.revenue.refunds} onChange={v=>upR("refunds",v)}/></Fld>
          <Fld label={<E value={labels.field_discounts} onSave={v=>labels._save("field_discounts",v)} style={{color:MU,fontFamily:ff,fontSize:11}}/>}><CI value={week.revenue.discounts} onChange={v=>upR("discounts",v)}/></Fld>
          <Fld label={<E value={labels.field_shipping_income} onSave={v=>labels._save("field_shipping_income",v)} style={{color:MU,fontFamily:ff,fontSize:11}}/>}><CI value={week.revenue.shipping_income} onChange={v=>upR("shipping_income",v)}/></Fld>
          <Fld label={<E value={labels.field_paypal_fees} onSave={v=>labels._save("field_paypal_fees",v)} style={{color:MU,fontFamily:ff,fontSize:11}}/>}><CI value={week.revenue.paypal_fees} onChange={v=>upR("paypal_fees",v)}/></Fld>
        </Grid>
      </div>
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

      <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between"}}>
        <div style={{flex:1}}><SH><E value={labels.sec_cogs} onSave={v=>labels._save("sec_cogs",v)} style={{color:"inherit",fontFamily:ff}}/></SH></div>
        <div style={{paddingBottom:14}}><ClearBtn label="COGS section" onClear={()=>onChange({...week,cogs:{manufacturing_product:"",manufacturing_shipping:"",satchel_count:"",satchel_cost_each:"",other_packaging:""}})} /></div>
      </div>
      <div style={{paddingLeft:16,borderLeft:"2px solid "+A+"22",marginTop:14,marginBottom:4}}>
        <Grid>
          <Fld label={<E value={labels.field_mfg_product} onSave={v=>labels._save("field_mfg_product",v)} style={{color:MU,fontFamily:ff,fontSize:11}}/>}><CI value={week.cogs.manufacturing_product} onChange={v=>upC("manufacturing_product",v)}/></Fld>
          <Fld label={<E value={labels.field_mfg_shipping} onSave={v=>labels._save("field_mfg_shipping",v)} style={{color:MU,fontFamily:ff,fontSize:11}}/>}><CI value={week.cogs.manufacturing_shipping} onChange={v=>upC("manufacturing_shipping",v)}/></Fld>
        </Grid>
      </div>
      <div style={{paddingLeft:16,borderLeft:"2px solid "+A+"22",marginTop:10,marginBottom:4}}>
        <div style={{marginTop:4,background:S2,border:"1px solid "+BR,borderRadius:radius+1,padding:"12px 14px"}}>
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
      </div>
      <Row>
        <Badge small label={<E value={labels.field_total_cogs} onSave={v=>labels._save("field_total_cogs",v)} style={{color:MU,fontFamily:ff,fontSize:11}}/>} value={-c.totalCOGS} color={RD}/>
        <Badge small label={<E value={labels.field_gross_profit} onSave={v=>labels._save("field_gross_profit",v)} style={{color:MU,fontFamily:ff,fontSize:11}}/>} value={c.grossProfit}/>
        <Pct small label={<E value={labels.field_gross_margin} onSave={v=>labels._save("field_gross_margin",v)} style={{color:MU,fontFamily:ff,fontSize:11}}/>} value={c.grossMargin}/>
      </Row>

      <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between"}}>
        <div style={{flex:1}}><SH><E value={labels.sec_opex} onSave={v=>labels._save("sec_opex",v)} style={{color:"inherit",fontFamily:ff}}/></SH></div>
        <div style={{paddingBottom:14}}><ClearBtn label="OPEX section" onClear={()=>onChange({...week,opex:emptyOpex(keys),wages:emptyWages(wDepts)})} /></div>
      </div>
      <div style={{fontFamily:ff,fontSize:11,color:MU,marginBottom:14,paddingLeft:16}}><E value={labels.sec_opex_sub} onSave={v=>labels._save("sec_opex_sub",v)} style={{color:MU,fontFamily:ff,fontSize:11}} multiline/></div>

      <div style={{paddingLeft:16,borderLeft:"2px solid "+A+"22",marginTop:10}}>
        <SH sub><E value={labels.sec_freight} onSave={v=>labels._save("sec_freight",v)} style={{color:"inherit",fontFamily:ff}}/></SH>
        <div style={{fontFamily:ff,fontSize:11,color:MU,marginBottom:10}}><E value={labels.sec_freight_sub} onSave={v=>labels._save("sec_freight_sub",v)} style={{color:MU,fontFamily:ff,fontSize:11}}/></div>
        <Grid>{freightKeys.map(({key,label})=>opexField(key,label))}</Grid>
        <Row><Badge small label="Total Freight" value={-c.totalFreight} color={RD}/></Row>

        <SH sub><E value={labels.sec_collabs} onSave={v=>labels._save("sec_collabs",v)} style={{color:"inherit",fontFamily:ff}}/></SH>
        <div style={{fontFamily:ff,fontSize:11,color:MU,marginBottom:10}}><E value={labels.sec_collabs_sub} onSave={v=>labels._save("sec_collabs_sub",v)} style={{color:MU,fontFamily:ff,fontSize:11}}/></div>
        <Grid>{collabKeys.map(({key,label})=>opexField(key,label))}</Grid>
        <Row><Badge small label="Total Collabs" value={-c.totalCollabs} color={RD}/></Row>

        <SH sub><E value={labels.sec_wages} onSave={v=>labels._save("sec_wages",v)} style={{color:"inherit",fontFamily:ff}}/></SH>
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

        <SH sub><E value={labels.sec_general} onSave={v=>labels._save("sec_general",v)} style={{color:"inherit",fontFamily:ff}}/></SH>
        <Grid>{generalKeys.map(({key,label})=>opexField(key,label))}</Grid>
        <Row><Badge small label="Total OPEX" value={-c.totalOPEX} color={RD}/></Row>
      </div>

      <div style={{borderTop:"2px solid "+A+"44",marginTop:28,paddingTop:20}}>
        <div style={{fontFamily:ff,fontSize:10,letterSpacing:2,textTransform:"uppercase",color:A,marginBottom:14}}>
          <E value={labels.sec_summary} onSave={v=>labels._save("sec_summary",v)} style={{color:A,fontFamily:ff,fontSize:10}}/>
        </div>
        <Row>
          <Badge label={<E value={labels.field_net_revenue} onSave={v=>labels._save("field_net_revenue",v)} style={{color:MU,fontFamily:ff,fontSize:11}}/>} value={c.netRevenue} color={A}/>
          <Badge label={<E value={labels.field_total_expenses} onSave={v=>labels._save("field_total_expenses",v)} style={{color:MU,fontFamily:ff,fontSize:11}}/>} value={-c.totalExpenses} color={RD}/>
          <Badge label={<E value={labels.field_net_profit} onSave={v=>labels._save("field_net_profit",v)} style={{color:MU,fontFamily:ff,fontSize:11}}/>} value={c.netProfit}/>
          <Pct label={<E value={labels.field_net_margin} onSave={v=>labels._save("field_net_margin",v)} style={{color:MU,fontFamily:ff,fontSize:11}}/>} value={c.netMargin}/>
        </Row>
        {/* Targets vs actuals inline */}
        <TargetsPanel calc={c} week={week} labels={labels}/>
      </div>
      <SH><E value={labels.sec_notes} onSave={v=>labels._save("sec_notes",v)} style={{color:"inherit",fontFamily:ff}}/></SH>
      <textarea value={week.notes} onChange={e=>onChange({...week,notes:e.target.value})} placeholder="Unusual costs, one-offs, events..." rows={3}
        style={{width:"100%",boxSizing:"border-box",background:S,border:"1px solid "+BR,color:TX,padding:"10px 12px",fontFamily:ff,fontSize:14,outline:"none",borderRadius:radius,resize:"vertical"}}/>

      {/* Clear All */}
      <div style={{marginTop:28,paddingTop:20,borderTop:"1px solid "+BR+"55",display:"flex",justifyContent:"flex-end"}}>
        <ClearAll onClear={()=>onChange({
          ...week,
          revenue:{gross_sales:"",refunds:"",discounts:"",shipping_income:"",paypal_fees:""},
          cogs:{manufacturing_product:"",manufacturing_shipping:"",satchel_count:"",satchel_cost_each:"",other_packaging:""},
          opex:emptyOpex(keys),
          wages:emptyWages(wDepts),
          notes:"",
          discBuckets:emptyDiscBuckets(),
          codeData:emptyCodeData(),
        })}/>
      </div>
    </div>
  );
}

// ─── Targets Panel (inline in WeekForm summary) ────────────────────────────────
function TargetsPanel({calc,week,labels}){
  const {S2,BR,A,MU,TX,GR,RD,YL,BG,ff,radius}=useTheme();
  const targets=week?.weekTargets||labels._targets||DEFAULT_TARGETS;
  const c=calc;
  const gross=n(week?.revenue?.gross_sales);
  const promoDisc=c.discReclass?.promoDisc||0;
  const refundRate=gross>0?(n(week?.revenue?.refunds)/gross)*100:0;
  const cogsPct=c.netRevenue>0?(c.totalCOGS/c.netRevenue)*100:0;
  const opexPct=c.netRevenue>0?(c.totalOPEX/c.netRevenue)*100:0;
  const wagesPct=c.netRevenue>0?(c.totalWages/c.netRevenue)*100:0;
  const promoRate=gross>0?(promoDisc/gross)*100:0;

  const metrics=[
    {label:"Gross Margin",actual:c.grossMargin,target:targets.gross_margin_target,unit:"%",higherBetter:true},
    {label:"Net Margin",actual:c.netMargin,target:targets.net_margin_target,unit:"%",higherBetter:true},
    {label:"COGS %",actual:cogsPct,target:targets.cogs_pct_target,unit:"%",higherBetter:false},
    {label:"OPEX %",actual:opexPct,target:targets.opex_pct_target,unit:"%",higherBetter:false},
    {label:"Wages %",actual:wagesPct,target:targets.wages_pct_target,unit:"%",higherBetter:false},
    {label:"Promo Rate",actual:promoRate,target:targets.promo_disc_rate_max,unit:"%",higherBetter:false},
  ].filter(m=>m.actual>0||m.target>0);

  const alerts=generateAlerts(week,c.netRevenue,c.discReclass||{},gross,targets);

  if(metrics.every(m=>m.actual===0))return null;
  return(
    <div style={{marginTop:16}}>
      <div style={{fontFamily:ff,fontSize:10,letterSpacing:2,color:A,textTransform:"uppercase",marginBottom:10}}>vs Targets</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:8,marginBottom:alerts.length?14:0}}>
        {metrics.map(m=>{
          const ok=m.higherBetter?m.actual>=m.target:m.actual<=m.target;
          const col=ok?GR:(Math.abs(m.actual-m.target)<m.target*0.1?YL:RD);
          const barPct=Math.min(100,m.target>0?m.higherBetter?(m.actual/m.target)*100:(m.actual<=m.target?100:(m.target/m.actual)*100):0);
          return(
            <div key={m.label} style={{background:BG,border:"1px solid "+BR,borderRadius:radius+1,padding:"8px 10px"}}>
              <div style={{fontFamily:ff,fontSize:9,color:MU,textTransform:"uppercase",letterSpacing:0.6,marginBottom:4}}>{m.label}</div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:5}}>
                <span style={{fontFamily:ff,fontSize:14,color:col,fontWeight:"bold"}}>{m.actual.toFixed(1)}{m.unit}</span>
                <span style={{fontFamily:ff,fontSize:9,color:MU}}>tgt {m.target}{m.unit}</span>
              </div>
              <div style={{height:3,background:BR,borderRadius:2}}>
                <div style={{height:3,width:barPct+"%",background:col,borderRadius:2,transition:"width 0.3s"}}/>
              </div>
            </div>
          );
        })}
      </div>
      {alerts.map((a,i)=><AlertCard key={i} alert={a}/>)}
    </div>
  );
}

// ─── Discount Breakdown (per-code) ────────────────────────────────────────────
function DiscountBreakdown({week,onChange,labels}){
  const {A,MU,BR,S2,S,TX,GR,RD,YL,BG,ff,radius}=useTheme();
  const bi=useBI();
  const totalDiscounts=n(week.revenue.discounts);
  const codeData=week.codeData||emptyCodeData();
  const upCode=(id,field,val)=>onChange({...week,codeData:{...codeData,[id]:{...codeData[id],[field]:val}}});
  const catColors={service_recovery:RD,marketing:YL,staff:A,promotional:GR};

  // Shopify discount autofill for this section
  const [discRaw,setDiscRaw]=useState("");
  const [discMsg,setDiscMsg]=useState("");
  const applyDiscShopify=()=>{
    if(!discRaw.trim()){setDiscMsg("Paste Shopify discount code data above");return;}
    const lines=discRaw.split("\n").map(l=>l.trim()).filter(l=>l.length>0);

    const SKIP_PATTERNS=[
      /^(code[\t\s]|code\s*\|)/i,
      /subtotal/i, /grand.?total/i, /promotional\s*codes?:/i,
      /internal.*codes?:/i, /^discount\s*code\s*usage/i,
      /number\s*of\s*orders/i, /no\s*other\s*codes/i, /^\s*\(no\s*/i,
    ];
    const isSkip=line=>SKIP_PATTERNS.some(r=>r.test(line));

    const splitLine=line=>{
      // Prefer tab split; fallback pipe; fallback 2+ spaces
      if(line.includes("\t")) return line.split("\t").map(p=>p.trim().replace(/[$,]/g,""));
      if(line.includes("|"))  return line.split("|").map(p=>p.trim().replace(/[$,]/g,""));
      // multiple-spaces split: split on 2+ spaces (Shopify AI plain text output)
      return line.split(/\s{2,}/).map(p=>p.trim().replace(/[$,]/g,""));
    };

    const normalise=s=>s.replace(/[-_\s]/g,"").toUpperCase();

    let filled=0;
    const newCodeData={...codeData};

    lines.forEach(line=>{
      if(isSkip(line))return;
      const parts=splitLine(line);
      if(parts.length<2)return;

      const rawCode=parts[0].trim();
      if(!rawCode||rawCode.length<2)return;
      // Skip lines starting with digit or pipe or parenthesis
      if(/^[\d(|]/.test(rawCode))return;

      const code=rawCode.toUpperCase();
      const getNum=idx=>parseFloat((parts[idx]||"").replace(/[^0-9.]/g,""))||0;
      const getInt=idx=>parseInt((parts[idx]||"").replace(/[^0-9]/g,""))||0;

      // columns: Code | Retail | Orders | COGS | Shipping  (default Shopify AI order)
      // but also handle: Code | Orders | Retail | COGS | Shipping
      // Heuristic: if col[1] looks like a large decimal it's retail, if integer it's orders
      let retail,orders,cogs,shipping;
      const col1=parseFloat((parts[1]||"").replace(/[^0-9.]/g,""))||0;
      const col2=parseFloat((parts[2]||"").replace(/[^0-9.]/g,""))||0;
      const col1IsOrders=Number.isInteger(col1)&&col1<10000&&(parts[1]||"").indexOf(".")===-1;
      if(col1IsOrders){
        orders=col1; retail=col2; cogs=getNum(3); shipping=getNum(4);
      } else {
        retail=col1; orders=getInt(2); cogs=getNum(3); shipping=getNum(4);
      }

      const reg=DISCOUNT_CODE_REGISTRY.find(c=>c.id===code||normalise(c.id)===normalise(code));

      if(reg){
        newCodeData[reg.id]={...newCodeData[reg.id],orders:String(orders),retailValue:retail>0?String(retail):"",cogsValue:cogs>0?String(cogs):"",shippingValue:shipping>0?String(shipping):"",active:true};
        filled++;
      } else if(retail>0||orders>0){
        const existing=newCodeData["__promo__"]||{};
        newCodeData["__promo__"]={
          ...existing,
          orders:String((parseInt(existing.orders)||0)+orders),
          retailValue:String(((parseFloat(existing.retailValue)||0)+retail).toFixed(2)),
          customCodes:((existing.customCodes||"")+", "+rawCode).replace(/^,\s*/,""),
        };
        filled++;
      }
    });

    if(filled===0){setDiscMsg("No codes found — check format (CODE  amount  orders)");return;}
    onChange({...week,codeData:newCodeData});
    setDiscMsg(`✓ Filled ${filled} code${filled>1?"s":""}`);setTimeout(()=>setDiscMsg(""),4000);
  };

  // Category totals
  const catTotals={};
  DISC_CATEGORIES.forEach(c=>{catTotals[c.id]={retail:0,orders:0,cogs:0,shipping:0};});
  DISCOUNT_CODE_REGISTRY.forEach(code=>{
    const d=codeData[code.id]||{}; if(d.active===false)return;
    const t=catTotals[code.category]; if(!t)return;
    t.retail+=n(d.retailValue); t.orders+=n(d.orders); t.cogs+=n(d.cogsValue); t.shipping+=n(d.shippingValue);
  });
  const p=codeData["__promo__"]||{}; if(p.active!==false){catTotals.promotional.retail+=n(p.retailValue);catTotals.promotional.orders+=n(p.orders);}
  const totalAllocated=Object.values(catTotals).reduce((s,t)=>s+t.retail,0);
  const unallocated=totalDiscounts-totalAllocated;

  const promoRate=n(week.revenue.gross_sales)>0?(catTotals.promotional.retail/n(week.revenue.gross_sales))*100:0;
  const srOrders=catTotals.service_recovery.orders;
  const srCost=catTotals.service_recovery.cogs+catTotals.service_recovery.shipping;
  const srCostPerOrder=srOrders>0?srCost/srOrders:0;
  const targets=labels._targets||DEFAULT_TARGETS;
  const promoAlert=promoRate>targets.promo_disc_rate_max;

  return(
    <Accordion title={<span style={{fontFamily:ff,fontSize:10,color:A,letterSpacing:2,textTransform:"uppercase"}}><E value={labels.disc_section||"Discount Code Breakdown"} onSave={v=>labels._save("disc_section",v)} style={{fontFamily:ff,fontSize:10,color:A}}/></span>} accent>
      {/* Shopify autofill for discounts */}
      <div style={{background:S2,border:"1px solid "+BR,borderRadius:radius+1,padding:"12px 14px",marginBottom:16}}>
        <div style={{fontFamily:ff,fontSize:9,letterSpacing:1.5,color:A,textTransform:"uppercase",marginBottom:8}}>Shopify Discount Import — paste code usage data below</div>
        <textarea value={discRaw} onChange={e=>setDiscRaw(e.target.value)} rows={3}
          placeholder={"RESHIP-FAULTY\t$120.00\t3\nEXCHANGE-SE\t$85.00\t2\n(code · retail amount · number of orders)"}
          style={{width:"100%",boxSizing:"border-box",background:S,border:"1px solid "+BR,color:TX,padding:"8px 10px",fontFamily:"monospace",fontSize:11,outline:"none",borderRadius:radius,resize:"vertical"}}/>
        <div style={{display:"flex",alignItems:"center",gap:10,marginTop:8}}>
          <button onClick={applyDiscShopify} style={{padding:"7px 16px",background:A,border:"none",color:"#000",fontFamily:ff,fontSize:11,cursor:"pointer",borderRadius:radius,fontWeight:"bold",letterSpacing:1}}>AUTOFILL FROM DATA</button>
          {discMsg&&<span style={{fontFamily:ff,fontSize:11,color:discMsg.includes("No")||discMsg.includes("Paste")?RD:GR}}>{discMsg}</span>}
        </div>
      </div>

      {/* Allocation summary */}
      <div style={{background:S2,borderRadius:radius+1,padding:"12px 14px",marginBottom:18}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
          <span style={{fontFamily:ff,fontSize:11,color:MU,textTransform:"uppercase",letterSpacing:1}}>Total Discounts to Allocate</span>
          <span style={{fontFamily:ff,fontSize:15,color:TX,fontWeight:"bold"}}>{fmtD(totalDiscounts)}</span>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {DISC_CATEGORIES.map(cat=>{
            const col=catColors[cat.id]; const t=catTotals[cat.id]||{};
            return(
              <div key={cat.id} style={{flex:1,minWidth:90,background:BG,borderRadius:3,padding:"7px 10px",borderLeft:"3px solid "+col}}>
                <div style={{fontFamily:ff,fontSize:9,color:MU,textTransform:"uppercase",letterSpacing:0.7,marginBottom:2}}>{cat.label}</div>
                <div style={{fontFamily:ff,fontSize:13,color:col,fontWeight:"bold"}}>{fmtD(t.retail||0)}</div>
                <div style={{fontFamily:ff,fontSize:10,color:MU}}>{t.orders||0} orders</div>
              </div>
            );
          })}
        </div>
        {Math.abs(unallocated)>0.01&&<div style={{marginTop:8,fontFamily:ff,fontSize:11,color:Math.abs(unallocated)>1?RD:MU}}>{Math.abs(unallocated)>1?"⚠ Unallocated: "+fmtD(unallocated):"✓ Fully allocated"}</div>}
      </div>

      {/* Per-category + per-code */}
      {DISC_CATEGORIES.map(cat=>{
        const col=catColors[cat.id]; const codes=DISCOUNT_CODE_REGISTRY.filter(c=>c.category===cat.id); const t=catTotals[cat.id]||{};
        const isPromo=cat.id==="promotional";
        return(
          <div key={cat.id} style={{marginBottom:22}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid "+col+"44",paddingBottom:8,marginBottom:12}}>
              <div>
                <span style={{fontFamily:ff,fontSize:11,color:col,letterSpacing:1.5,textTransform:"uppercase",fontWeight:"bold"}}>
                  <E value={labels["disc_"+cat.id]||cat.label} onSave={v=>labels._save("disc_"+cat.id,v)} style={{fontFamily:ff,fontSize:11,color:col}}/>
                </span>
                <div style={{fontFamily:ff,fontSize:10,color:MU,marginTop:3}}>
                  <E value={labels["disc_"+cat.id+"_sub"]||""} onSave={v=>labels._save("disc_"+cat.id+"_sub",v)} style={{fontFamily:ff,fontSize:10,color:MU}}/>
                </div>
              </div>
              <div style={{background:col+"22",border:"1px solid "+col+"44",borderRadius:3,padding:"3px 8px",fontFamily:ff,fontSize:9,color:col,letterSpacing:0.8,textTransform:"uppercase",whiteSpace:"nowrap",marginLeft:10}}>{cat.badge}</div>
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {codes.map(code=>{
                const d=codeData[code.id]||{orders:"",retailValue:"",cogsValue:"",shippingValue:"",active:true};
                const active=d.active!==false;
                const hasData=n(d.retailValue)>0||n(d.orders)>0;
                const codeCost=n(d.cogsValue)+n(d.shippingValue);
                const codeRetail=n(d.retailValue);
                const totalLoss=codeCost>0?codeCost:codeRetail;
                const orders=n(d.orders);
                const cpp=orders>0&&totalLoss>0?totalLoss/orders:0;
                return(
                  <div key={code.id} style={{background:S2,border:"1px solid "+(hasData?col+"44":BR),borderRadius:radius+1,padding:"12px 14px",opacity:active?1:0.45}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:active?10:0}}>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:3}}>
                          <span style={{fontFamily:"monospace",fontSize:12,color:col,fontWeight:"bold",letterSpacing:0.5}}>{code.id}</span>
                          {hasData&&cpp>0&&<span style={{fontFamily:ff,fontSize:10,color:MU,background:BG,border:"1px solid "+BR,borderRadius:2,padding:"1px 6px"}}>{fmtD(cpp)}/order</span>}
                          {hasData&&totalLoss>0&&<span style={{fontFamily:ff,fontSize:10,color:RD,background:RD+"11",border:"1px solid "+RD+"33",borderRadius:2,padding:"1px 6px"}}>−{fmtD(totalLoss)} total</span>}
                        </div>
                        <div style={{fontFamily:ff,fontSize:10,color:MU,lineHeight:1.5}}>{code.useCase}</div>
                        <div style={{fontFamily:ff,fontSize:9,color:col+"99",marginTop:2,textTransform:"uppercase",letterSpacing:0.5}}>{code.plCategory}</div>
                      </div>
                      <button onClick={()=>onChange({...week,codeData:{...codeData,[code.id]:{...d,active:!active}}})}
                        style={{background:"transparent",border:"1px solid "+BR,borderRadius:2,padding:"3px 8px",fontFamily:ff,fontSize:9,color:active?MU:col,cursor:"pointer",letterSpacing:0.5,textTransform:"uppercase",marginLeft:8,whiteSpace:"nowrap"}}>
                        {active?"Hide":"Show"}
                      </button>
                    </div>
                    {active&&(
                      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:8}}>
                        <Fld label={<span style={{fontFamily:ff,fontSize:10,color:MU,textTransform:"uppercase",letterSpacing:0.6}}>Orders</span>}><NI value={d.orders} onChange={v=>upCode(code.id,"orders",v)}/></Fld>
                        <Fld label={<span style={{fontFamily:ff,fontSize:10,color:MU,textTransform:"uppercase",letterSpacing:0.6}}>Retail Discounted</span>}><CI value={d.retailValue} onChange={v=>upCode(code.id,"retailValue",v)}/></Fld>
                        {(code.hasCOGS||cat.id==="marketing")&&<Fld label={<span style={{fontFamily:ff,fontSize:10,color:MU,textTransform:"uppercase",letterSpacing:0.6}}>Mfg COGS</span>}><CI value={d.cogsValue} onChange={v=>upCode(code.id,"cogsValue",v)}/></Fld>}
                        {(code.hasShipping||cat.id==="marketing")&&<Fld label={<span style={{fontFamily:ff,fontSize:10,color:MU,textTransform:"uppercase",letterSpacing:0.6}}>Shipping Cost</span>}><CI value={d.shippingValue} onChange={v=>upCode(code.id,"shippingValue",v)}/></Fld>}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Promotional: free-entry promo codes */}
              {isPromo&&(
                <div style={{background:S2,border:"1px solid "+col+"44",borderRadius:radius+1,padding:"12px 14px"}}>
                  <div style={{fontFamily:ff,fontSize:10,color:col,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Sale / Promotional Codes</div>
                  <div style={{marginBottom:8}}>
                    <Lbl><span style={{fontFamily:ff,fontSize:10,color:MU,textTransform:"uppercase",letterSpacing:0.6}}>Discount codes used (comma separated)</span></Lbl>
                    <input value={codeData["__promo__"]?.customCodes||""} onChange={e=>onChange({...week,codeData:{...codeData,__promo__:{...codeData["__promo__"],customCodes:e.target.value}}})}
                      placeholder="SALE20, WINTER30, FLASH15 ..."
                      style={{...bi,fontFamily:"monospace",fontSize:12}}
                      onFocus={e=>e.target.style.borderColor=col} onBlur={e=>e.target.style.borderColor=BR}/>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:8}}>
                    <Fld label={<span style={{fontFamily:ff,fontSize:10,color:MU,textTransform:"uppercase",letterSpacing:0.6}}>Orders</span>}><NI value={codeData["__promo__"]?.orders||""} onChange={v=>onChange({...week,codeData:{...codeData,__promo__:{...codeData["__promo__"],orders:v}}})}/></Fld>
                    <Fld label={<span style={{fontFamily:ff,fontSize:10,color:MU,textTransform:"uppercase",letterSpacing:0.6}}>Retail Discounted</span>}><CI value={codeData["__promo__"]?.retailValue||""} onChange={v=>onChange({...week,codeData:{...codeData,__promo__:{...codeData["__promo__"],retailValue:v}}})}/></Fld>
                  </div>
                  {promoRate>0&&(
                    <div style={{marginTop:10,display:"flex",alignItems:"center",gap:8}}>
                      <div style={{height:3,flex:1,background:BR,borderRadius:2}}><div style={{height:3,width:Math.min(100,(promoRate/targets.promo_disc_rate_max)*100)+"%",background:promoAlert?RD:GR,borderRadius:2}}/></div>
                      <span style={{fontFamily:ff,fontSize:11,color:promoAlert?RD:GR,fontWeight:"bold"}}>{promoRate.toFixed(1)}% of gross</span>
                      <span style={{fontFamily:ff,fontSize:10,color:MU}}>target ≤{targets.promo_disc_rate_max}%</span>
                    </div>
                  )}
                  {promoAlert&&<div style={{marginTop:8,fontFamily:ff,fontSize:10,color:RD}}>⚠ Exceeds target — discounting too aggressively. Consider reducing frequency or depth.</div>}
                </div>
              )}
            </div>

            {/* Category subtotal */}
            {(t.retail>0||t.cogs>0||t.shipping>0)&&(
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:10,padding:"8px 12px",background:col+"0d",border:"1px solid "+col+"22",borderRadius:radius}}>
                <span style={{fontFamily:ff,fontSize:10,color:MU,flex:1,textTransform:"uppercase",letterSpacing:0.7}}>{cat.label} total</span>
                <span style={{fontFamily:ff,fontSize:10,color:MU}}>Orders: <b style={{color:TX}}>{t.orders}</b></span>
                <span style={{fontFamily:ff,fontSize:10,color:MU}}>Retail: <b style={{color:col}}>{fmtD(t.retail)}</b></span>
                {(t.cogs+t.shipping)>0&&<span style={{fontFamily:ff,fontSize:10,color:RD,fontWeight:"bold"}}>P&L hit: {fmtD(t.cogs+t.shipping)}</span>}
              </div>
            )}
          </div>
        );
      })}

      {/* Service recovery insight */}
      {srOrders>0&&(
        <div style={{marginTop:16,background:S2,border:"1px solid "+BR,borderRadius:radius+1,padding:"12px 14px"}}>
          <div style={{fontFamily:ff,fontSize:10,color:A,textTransform:"uppercase",letterSpacing:1.5,marginBottom:10}}>Service Recovery Analysis</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:10}}>
            <div style={{background:BG,borderRadius:radius,padding:"10px 12px",borderLeft:"3px solid "+RD}}>
              <div style={{fontFamily:ff,fontSize:10,color:RD,textTransform:"uppercase",letterSpacing:0.7,marginBottom:6}}>This Week</div>
              <div style={{fontFamily:ff,fontSize:11,color:TX}}>{srOrders} orders affected</div>
              {srCostPerOrder>0&&<div style={{fontFamily:ff,fontSize:11,color:MU,marginTop:3}}>Avg cost: <span style={{color:RD,fontWeight:"bold"}}>{fmtD(srCostPerOrder)}/order</span></div>}
              <div style={{fontFamily:ff,fontSize:11,color:MU,marginTop:3}}>Annualised: <span style={{color:RD,fontWeight:"bold"}}>{fmtD(srCost*52)}</span></div>
            </div>
            <div style={{background:BG,borderRadius:radius,padding:"10px 12px",borderLeft:"3px solid "+YL}}>
              <div style={{fontFamily:ff,fontSize:10,color:YL,textTransform:"uppercase",letterSpacing:0.7,marginBottom:6}}>Action Guide</div>
              {srOrders>=targets.service_recovery_max_orders
                ?<div style={{fontFamily:ff,fontSize:10,color:YL,lineHeight:1.6}}>⚠ Exceeds {targets.service_recovery_max_orders} order threshold. Review product QC, packaging, and logistics partner performance.</div>
                :<div style={{fontFamily:ff,fontSize:10,color:GR,lineHeight:1.6}}>✓ Within target ({targets.service_recovery_max_orders} orders/wk). Monitor for sustained increases.</div>}
            </div>
          </div>
        </div>
      )}
    </Accordion>
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
      <SH sub><E value={labels[titleLabelKey]||groupKeys[0]?.group||"Group"} onSave={v=>labels._save(titleLabelKey,v)} style={{color:"inherit",fontFamily:ff}}/></SH>
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

function SettingsPage({settings,onSettingsChange,theme,onThemeChange,labels,onLabelsSave}){
  const {S2,BR,A,MU,TX,GR,RD,YL,ff,radius}=useTheme();
  const [themeEdit,setThemeEdit]=useState({...DEFAULT_THEME,...theme});
  const [activeTab,setActiveTab]=useState("appearance");
  const [staff,setStaff]=useState(settings?.staff||DEFAULT_STAFF);
  const [targets,setTargets]=useState(labels?._targets||DEFAULT_TARGETS);
  const [saved,setSaved]=useState(false);
  const apply=()=>{onThemeChange(themeEdit);setSaved(true);setTimeout(()=>setSaved(false),2000);};
  const reset=()=>{setThemeEdit({...DEFAULT_THEME});onThemeChange({...DEFAULT_THEME});};
  const updateStaff=ns=>{setStaff(ns);onSettingsChange({...settings,staff:ns});};
  const addStaff=()=>updateStaff([...staff,{id:"s"+Date.now(),name:"New Staff",type:"casual",hourlyRate:25,hoursPerWeek:20,dept:"ops_retail"}]);
  const removeStaff=id=>updateStaff(staff.filter(s=>s.id!==id));
  const editStaff=(id,f,v)=>updateStaff(staff.map(s=>s.id===id?{...s,[f]:v}:s));
  const saveTargets=nt=>{setTargets(nt);if(onLabelsSave)onLabelsSave("_targets",nt);};
  const inp={background:S2,border:"1px solid "+BR,color:TX,padding:"7px 10px",fontFamily:ff,fontSize:13,outline:"none",borderRadius:radius,width:"100%",boxSizing:"border-box"};
  const numInp={...inp,width:90,textAlign:"right"};
  return(
    <div>
      <div style={{display:"flex",gap:8,marginBottom:24,flexWrap:"wrap"}}>
        {["appearance","colours","targets","staff"].map(t=>(
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
          <SH>Title Sizes</SH>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:4}}>
            {[
              {key:"headerTitleSize",label:"Dashboard Title",default:22,min:14,max:48},
              {key:"headerBrandSize",label:"Brand Subtitle",default:9,min:7,max:18},
              {key:"sectionHeaderSize",label:"Section Headers",default:10,min:8,max:20},
              {key:"subSectionSize",label:"Sub-Section Headers",default:9,min:7,max:16},
            ].map(({key,label,default:def,min,max})=>(
              <div key={key} style={{marginBottom:8}}>
                <div style={{fontFamily:ff,fontSize:10,color:MU,letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>{label}</div>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <input type="range" min={min} max={max} value={themeEdit[key]??def}
                    onChange={e=>setThemeEdit({...themeEdit,[key]:parseInt(e.target.value)})}
                    style={{flex:1}}/>
                  <span style={{fontFamily:ff,fontSize:12,color:TX,minWidth:32,textAlign:"right"}}>{themeEdit[key]??def}px</span>
                </div>
              </div>
            ))}
          </div>
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
      {activeTab==="targets"&&(
        <div>
          <div style={{fontFamily:ff,fontSize:12,color:MU,marginBottom:20,lineHeight:1.8}}>Set your financial targets. These auto-calculate against actuals every week and month, showing coloured progress bars and alerts.</div>
          <SH>Margin Targets</SH>
          <Grid>
            {[
              {key:"gross_margin_target",label:"Gross Margin Target (%)",hint:"Industry: 50–65%"},
              {key:"net_margin_target",label:"Net Margin Target (%)",hint:"Healthy: 12–20%"},
            ].map(({key,label,hint})=>(
              <div key={key}>
                <Fld label={<span style={{fontFamily:ff,fontSize:11,color:MU,textTransform:"uppercase",letterSpacing:0.7}}>{label}</span>}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <input type="number" value={targets[key]||""} onChange={e=>saveTargets({...targets,[key]:parseFloat(e.target.value)||0})} style={{...inp,width:80,textAlign:"right"}}/>
                    <span style={{fontFamily:ff,fontSize:10,color:MU}}>%</span>
                  </div>
                </Fld>
                <div style={{fontFamily:ff,fontSize:10,color:MU,marginTop:3}}>{hint}</div>
              </div>
            ))}
          </Grid>
          <SH>Cost Targets (% of Net Revenue)</SH>
          <Grid>
            {[
              {key:"cogs_pct_target",label:"Max COGS %",hint:"Target: ≤35–45%"},
              {key:"opex_pct_target",label:"Max OPEX %",hint:"Target: ≤20–30%"},
              {key:"wages_pct_target",label:"Max Wages %",hint:"Target: ≤15–25%"},
            ].map(({key,label,hint})=>(
              <div key={key}>
                <Fld label={<span style={{fontFamily:ff,fontSize:11,color:MU,textTransform:"uppercase",letterSpacing:0.7}}>{label}</span>}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <input type="number" value={targets[key]||""} onChange={e=>saveTargets({...targets,[key]:parseFloat(e.target.value)||0})} style={{...inp,width:80,textAlign:"right"}}/>
                    <span style={{fontFamily:ff,fontSize:10,color:MU}}>%</span>
                  </div>
                </Fld>
                <div style={{fontFamily:ff,fontSize:10,color:MU,marginTop:3}}>{hint}</div>
              </div>
            ))}
          </Grid>
          <SH>Discount Alerts</SH>
          <Grid>
            {[
              {key:"promo_disc_rate_max",label:"Max Promo Discount Rate (%)",hint:"% of gross sales — above this triggers alert"},
              {key:"refund_rate_max",label:"Max Refund Rate (%)",hint:"% of gross sales"},
            ].map(({key,label,hint})=>(
              <div key={key}>
                <Fld label={<span style={{fontFamily:ff,fontSize:11,color:MU,textTransform:"uppercase",letterSpacing:0.7}}>{label}</span>}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <input type="number" value={targets[key]||""} onChange={e=>saveTargets({...targets,[key]:parseFloat(e.target.value)||0})} style={{...inp,width:80,textAlign:"right"}}/>
                    <span style={{fontFamily:ff,fontSize:10,color:MU}}>%</span>
                  </div>
                </Fld>
                <div style={{fontFamily:ff,fontSize:10,color:MU,marginTop:3}}>{hint}</div>
              </div>
            ))}
          </Grid>
          <SH>Service Recovery Thresholds</SH>
          <Grid>
            {[
              {key:"service_recovery_max_orders",label:"Max Service Recovery Orders / Week",hint:"Above this, alert fires"},
              {key:"service_recovery_cost_alert",label:"Alert if Cost Per Order Exceeds ($)",hint:"Average cost per service recovery order"},
            ].map(({key,label,hint})=>(
              <div key={key}>
                <Fld label={<span style={{fontFamily:ff,fontSize:11,color:MU,textTransform:"uppercase",letterSpacing:0.7}}>{label}</span>}>
                  <input type="number" value={targets[key]||""} onChange={e=>saveTargets({...targets,[key]:parseFloat(e.target.value)||0})} style={{...inp,width:100,textAlign:"right"}}/>
                </Fld>
                <div style={{fontFamily:ff,fontSize:10,color:MU,marginTop:3}}>{hint}</div>
              </div>
            ))}
          </Grid>
          <button onClick={()=>saveTargets({...DEFAULT_TARGETS})} style={{marginTop:16,padding:"8px 18px",background:"transparent",border:"1px solid "+MU,color:MU,fontFamily:ff,fontSize:11,cursor:"pointer",borderRadius:radius}}>Reset to defaults</button>
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
    marketingDisc:s.marketingDisc+(c.discReclass?.marketingDisc||0),
    staffDisc:s.staffDisc+(c.discReclass?.staffDisc||0),
    promoDisc:s.promoDisc+(c.discReclass?.promoDisc||0),
    totalDisc:s.totalDisc+c.totalDiscounts,
  }),{serviceRecoveryCOGS:0,serviceRecoveryOrders:0,marketingDisc:0,staffDisc:0,promoDisc:0,totalDisc:0});

  const copySummary=()=>{
    const fmt=v=>"$"+Math.abs(v).toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:2});
    let t="## Monthly P&L Summary\n\n**Net Revenue:** "+fmt(mc.netRevenue)+"\n**Gross Profit:** "+fmt(mc.grossProfit)+" ("+mc.grossMargin.toFixed(1)+"%)\n**Total Expenses:** "+fmt(mc.totalExpenses)+"\n**Net Profit:** "+fmt(mc.netProfit)+" ("+mc.netMargin.toFixed(1)+"%)\n\n";
    t+="### Discount Reclassification\n";
    t+="Service Recovery: "+fmt(totalDR.serviceRecoveryCOGS)+" | Marketing: "+fmt(totalDR.marketingDisc)+" | Staff: "+fmt(totalDR.staffDisc)+" | True Promo: "+fmt(totalDR.promoDisc)+"\n\n";
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

          {/* Discount reclassification summary for the month */}
          <Accordion title="Discount Reclassification Summary" accent>
            <div style={{fontFamily:ff,fontSize:12,color:MU,marginBottom:14,lineHeight:1.7}}>
              Monthly breakdown of how the {fmtD(totalDR.totalDisc)} in total discounts were reclassified across expense categories.
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:12}}>
              {[
                {label:"Service Recovery (→ COGS)",val:totalDR.serviceRecoveryCOGS,col:RD,sub:totalDR.serviceRecoveryOrders+" orders"},
                {label:"Influencer / Marketing (→ OPEX)",val:totalDR.marketingDisc,col:"#ffd97d",sub:"reclassified as marketing expense"},
                {label:"Staff Benefits (→ Wages)",val:totalDR.staffDisc,col:A,sub:"reclassified as staff benefit"},
                {label:"True Promotional (→ Revenue Deduction)",val:totalDR.promoDisc,col:GR,sub:"this is the only bucket reducing Net Revenue"},
              ].map(({label,val,col,sub})=>(
                <div key={label} style={{background:"#12111a",border:"1px solid "+col+"44",borderRadius:radius+1,padding:"12px 14px"}}>
                  <div style={{fontFamily:ff,fontSize:10,color:col,letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>{label}</div>
                  <div style={{fontFamily:ff,fontSize:18,color:col,fontWeight:"bold"}}>{fmtD(val)}</div>
                  <div style={{fontFamily:ff,fontSize:11,color:MU,marginTop:4}}>{sub}</div>
                </div>
              ))}
            </div>
            <div style={{fontFamily:ff,fontSize:12,color:MU,padding:"10px 14px",background:"#1a1826",borderRadius:radius+1,borderLeft:"3px solid "+A}}>
              Without reclassification your Net Revenue would have been reduced by {fmtD(totalDR.serviceRecoveryCOGS+totalDR.marketingDisc+totalDR.staffDisc)} more than it should be. True P&L separates operational failure costs from genuine commercial discounting.
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
          {[["COGS (incl. service recovery)",mc.totalCOGS,"#ff9ecd"],["Freight",mc.totalFreight,RD],["Collabs",mc.totalCollabs,"#ffd97d"],["Wages (incl. staff disc)",mc.totalWages,"#e0a0ff"],["OPEX (incl. influencer gifting)",mc.totalOPEX,A]].map(([lbl,val,col])=>(
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
    {id:"disc_mkt",label:"Marketing / Influencer Gifting",isDR:true,drKey:"marketingDisc"},
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
      <SH><E value={labels.compare_title} onSave={v=>labels._save("compare_title",v)} style={{color:"inherit",fontFamily:ff}}/></SH>
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

// ─── Targets Page ─────────────────────────────────────────────────────────────
function TargetsPage({weeks,curWeeks,onUpdateWeeks,activeWeek,labels,monthData,selMonthKey}){
  const {S,S2,BR,A,MU,TX,GR,RD,YL,BG,ff,radius}=useTheme();

  // Global targets = labels._targets (persisted in settings)
  const globalTargets=labels._targets||DEFAULT_TARGETS;

  // Per-week targets: stored in week.weekTargets, falls back to global
  const week=curWeeks[activeWeek]||curWeeks[0];
  const wt=week?.weekTargets||{...globalTargets};

  const saveWeekTargets=nt=>{
    const nw=[...curWeeks];
    nw[activeWeek]={...nw[activeWeek],weekTargets:nt};
    onUpdateWeeks(nw);
  };
  const saveGlobalTargets=nt=>labels._save("_targets",nt);

  // Monthly sales goal → auto-calculate weekly targets
  const [monthlyGoal,setMonthlyGoal]=useState(wt.monthly_sales_goal||"");
  const weeklyGoal=parseFloat(monthlyGoal)/4.33||0;

  const autoCalc=()=>{
    if(!weeklyGoal)return;
    const nt={
      ...wt,
      monthly_sales_goal:parseFloat(monthlyGoal),
      weekly_revenue_target:Math.round(weeklyGoal),
      gross_margin_target:wt.gross_margin_target||55,
      net_margin_target:wt.net_margin_target||15,
      cogs_pct_target:wt.cogs_pct_target||35,
      opex_pct_target:wt.opex_pct_target||25,
      wages_pct_target:wt.wages_pct_target||20,
      promo_disc_rate_max:wt.promo_disc_rate_max||12,
      refund_rate_max:wt.refund_rate_max||3,
      service_recovery_max_orders:wt.service_recovery_max_orders||5,
      service_recovery_cost_alert:wt.service_recovery_cost_alert||50,
      // dollar targets derived from goal
      weekly_cogs_max:Math.round(weeklyGoal*(wt.cogs_pct_target||35)/100),
      weekly_opex_max:Math.round(weeklyGoal*(wt.opex_pct_target||25)/100),
      weekly_wages_max:Math.round(weeklyGoal*(wt.wages_pct_target||20)/100),
      weekly_profit_target:Math.round(weeklyGoal*(wt.net_margin_target||15)/100),
    };
    saveWeekTargets(nt);
    saveGlobalTargets(nt);
  };

  // Current week actuals
  const fixed=null; // not available here, pass via prop if needed
  const inp={background:S2,border:"1px solid "+BR,color:TX,padding:"7px 10px",fontFamily:ff,fontSize:13,outline:"none",borderRadius:radius,width:"100%",boxSizing:"border-box"};

  const TRow=({label,key_,unit="%",hint})=>{
    const val=wt[key_]??globalTargets[key_]??"";
    const isOverride=week?.weekTargets?.[key_]!==undefined;
    return(
      <div style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:"1px solid "+BR+"33"}}>
        <div style={{flex:1}}>
          <div style={{fontFamily:ff,fontSize:12,color:TX}}>{label}</div>
          {hint&&<div style={{fontFamily:ff,fontSize:10,color:MU,marginTop:2}}>{hint}</div>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          {isOverride&&<span style={{fontFamily:ff,fontSize:9,color:YL,textTransform:"uppercase",letterSpacing:0.5}}>weekly</span>}
          <input type="number" value={val} onChange={e=>{const v=parseFloat(e.target.value)||0;const nt={...wt,[key_]:v};saveWeekTargets(nt);saveGlobalTargets(nt);}}
            style={{...inp,width:80,textAlign:"right"}}/>
          <span style={{fontFamily:ff,fontSize:11,color:MU,minWidth:16}}>{unit}</span>
        </div>
      </div>
    );
  };

  // All-weeks alert summary
  const allAlerts=curWeeks.map((w,i)=>{
    const t=w.weekTargets||globalTargets;
    // Minimal calc — just check key metrics
    const gross=n(w.revenue?.gross_sales);
    const refunds=n(w.revenue?.refunds);
    const disc=n(w.revenue?.discounts);
    const effectiveBuckets=w.codeData?codeDataToDiscBuckets(w.codeData):(w.discBuckets||emptyDiscBuckets());
    const dr=calcDiscReclassification(effectiveBuckets);
    const truePromo=Math.max(0,dr.promoDisc||(disc-dr.serviceRecoveryRetail-dr.marketingDisc-dr.staffDisc));
    const netRev=gross-refunds-truePromo+n(w.revenue?.shipping_income)-n(w.revenue?.paypal_fees);
    if(netRev===0)return null;
    const alerts=generateAlerts(w,netRev,dr,gross,t);
    if(!alerts.length)return null;
    return {weekLabel:w.label,dateRange:w.dateRange,alerts,netRev};
  }).filter(Boolean);

  return(
    <div>
      {/* Monthly Goal → Auto-calculate */}
      <div style={{background:S,border:"1px solid "+A,borderRadius:radius+3,padding:"20px 24px",marginBottom:24}}>
        <div style={{fontFamily:ff,fontSize:10,letterSpacing:2,color:A,textTransform:"uppercase",marginBottom:6}}>Monthly Sales Goal</div>
        <div style={{fontFamily:ff,fontSize:12,color:MU,marginBottom:14,lineHeight:1.7}}>
          Enter your monthly revenue target and click Auto-Calculate — all percentage and dollar targets will be derived from it instantly and saved to every week.
        </div>
        <div style={{display:"flex",gap:10,alignItems:"flex-end",flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:180}}>
            <Fld label={<span style={{fontFamily:ff,fontSize:10,color:MU,textTransform:"uppercase",letterSpacing:0.7}}>Monthly Revenue Target ($)</span>}>
              <div style={{position:"relative"}}>
                <span style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",color:MU,fontFamily:ff,fontSize:13,pointerEvents:"none"}}>$</span>
                <input type="number" value={monthlyGoal} onChange={e=>setMonthlyGoal(e.target.value)}
                  style={{...inp,paddingLeft:22}} placeholder="e.g. 50000"/>
              </div>
            </Fld>
          </div>
          {weeklyGoal>0&&(
            <div style={{background:S2,border:"1px solid "+BR,borderRadius:radius,padding:"10px 14px",fontFamily:ff,fontSize:12,color:MU}}>
              = <span style={{color:A,fontWeight:"bold"}}>${Math.round(weeklyGoal).toLocaleString()}</span>/week
            </div>
          )}
          <button onClick={autoCalc} disabled={!weeklyGoal}
            style={{padding:"9px 20px",background:weeklyGoal?A:"transparent",border:"1px solid "+(weeklyGoal?A:BR),color:weeklyGoal?"#000":MU,fontFamily:ff,fontSize:11,cursor:weeklyGoal?"pointer":"not-allowed",borderRadius:radius,fontWeight:"bold",letterSpacing:1,textTransform:"uppercase"}}>
            Auto-Calculate All Targets
          </button>
        </div>
        {weeklyGoal>0&&wt.net_margin_target&&(
          <div style={{marginTop:12,display:"flex",gap:16,flexWrap:"wrap"}}>
            {[
              ["Weekly profit target",`$${Math.round(weeklyGoal*wt.net_margin_target/100).toLocaleString()}`],
              ["Max weekly COGS",`$${Math.round(weeklyGoal*wt.cogs_pct_target/100).toLocaleString()}`],
              ["Max weekly OPEX",`$${Math.round(weeklyGoal*wt.opex_pct_target/100).toLocaleString()}`],
              ["Max weekly wages",`$${Math.round(weeklyGoal*wt.wages_pct_target/100).toLocaleString()}`],
            ].map(([l,v])=>(
              <div key={l} style={{background:BG,border:"1px solid "+BR,borderRadius:radius,padding:"7px 12px"}}>
                <div style={{fontFamily:ff,fontSize:9,color:MU,textTransform:"uppercase",letterSpacing:0.6,marginBottom:2}}>{l}</div>
                <div style={{fontFamily:ff,fontSize:13,color:GR,fontWeight:"bold"}}>{v}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:24}}>
        {/* Targets editor */}
        <div style={{background:S,border:"1px solid "+BR,borderRadius:radius+3,padding:"20px 24px"}}>
          <div style={{fontFamily:ff,fontSize:10,letterSpacing:2,color:A,textTransform:"uppercase",marginBottom:4}}>Target Values</div>
          <div style={{fontFamily:ff,fontSize:10,color:MU,marginBottom:14}}>Changes apply to current week and save globally. Week-specific overrides marked in yellow.</div>
          <TRow label="Gross Margin Target" key_="gross_margin_target" unit="%" hint="Industry benchmark: 50–65%" />
          <TRow label="Net Margin Target" key_="net_margin_target" unit="%" hint="Healthy range: 12–20%" />
          <TRow label="Max COGS % of Revenue" key_="cogs_pct_target" unit="%" hint="Keep under 35–45%"/>
          <TRow label="Max OPEX % of Revenue" key_="opex_pct_target" unit="%" hint="Target: ≤25%"/>
          <TRow label="Max Wages % of Revenue" key_="wages_pct_target" unit="%" hint="Target: ≤20%"/>
          <TRow label="Max Promo Discount Rate" key_="promo_disc_rate_max" unit="%" hint="% of gross sales — above this hurts margin"/>
          <TRow label="Max Refund Rate" key_="refund_rate_max" unit="%" hint="% of gross sales"/>
          <TRow label="Service Recovery Alert (orders/wk)" key_="service_recovery_max_orders" unit="orders" hint="Fires alert when exceeded"/>
          <TRow label="Service Recovery Cost Alert ($/order)" key_="service_recovery_cost_alert" unit="$" hint="Average cost before alert fires"/>
        </div>

        {/* Live alert feed */}
        <div style={{background:S,border:"1px solid "+BR,borderRadius:radius+3,padding:"20px 24px"}}>
          <div style={{fontFamily:ff,fontSize:10,letterSpacing:2,color:A,textTransform:"uppercase",marginBottom:4}}>This Month's Alerts</div>
          <div style={{fontFamily:ff,fontSize:10,color:MU,marginBottom:14}}>Plain-English actions — what needs to happen this week.</div>
          {allAlerts.length===0&&(
            <div style={{textAlign:"center",padding:"40px 0",color:MU,fontFamily:ff,fontSize:12}}>
              ✓ No alerts — all metrics within target, or no data entered yet.
            </div>
          )}
          {allAlerts.map(({weekLabel,dateRange,alerts},wi)=>(
            <div key={wi} style={{marginBottom:16}}>
              <div style={{fontFamily:ff,fontSize:10,color:A,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>{weekLabel} — {dateRange}</div>
              {alerts.map((a,ai)=>(
                <AlertCard key={ai} alert={a}/>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Generate structured alerts from week data + targets
function generateAlerts(week,netRev,dr,gross,targets){
  const t=targets||DEFAULT_TARGETS;
  const alerts=[];
  const c_netProfit=n(week.cogs?.manufacturing_product)+n(week.cogs?.manufacturing_shipping); // simplified
  const promoDisc=Math.max(0,dr.promoDisc||(n(week.revenue?.discounts)-dr.serviceRecoveryRetail-dr.marketingDisc-dr.staffDisc));
  const refunds=n(week.revenue?.refunds);
  const promoRate=gross>0?(promoDisc/gross)*100:0;
  const refundRate=gross>0?(refunds/gross)*100:0;
  const srOrders=dr.serviceRecoveryOrders||0;
  const srCost=dr.serviceRecoveryCOGS||0;
  const srCostPerOrder=srOrders>0?srCost/srOrders:0;
  const weeklyRevenueTarget=t.weekly_revenue_target||0;

  if(weeklyRevenueTarget>0&&gross<weeklyRevenueTarget){
    const gap=weeklyRevenueTarget-gross;
    alerts.push({sev:"alert",icon:"📉",title:"Revenue below target",action:`You are ${fmtD(gap)} short of your weekly revenue goal. Review your marketing spend and conversion — are ads running? Any pending campaigns to push?`,metric:`${fmtD(gross)} of ${fmtD(weeklyRevenueTarget)} target`});
  }
  if(promoRate>t.promo_disc_rate_max){
    const excess=promoDisc-gross*(t.promo_disc_rate_max/100);
    alerts.push({sev:"alert",icon:"🏷️",title:"Discounting too aggressively",action:`Your promo discount rate is ${promoRate.toFixed(1)}% of gross sales — ${(promoRate-t.promo_disc_rate_max).toFixed(1)}% over the ${t.promo_disc_rate_max}% limit. You gave away an extra ${fmtD(excess)} that came straight off your margin. Reduce sale frequency or cut discount depth by 5%.`,metric:`${promoRate.toFixed(1)}% vs ${t.promo_disc_rate_max}% target`});
  }
  if(refundRate>t.refund_rate_max){
    const excess=refunds-gross*(t.refund_rate_max/100);
    alerts.push({sev:"warn",icon:"↩️",title:"Refund rate elevated",action:`Refunds are ${refundRate.toFixed(1)}% of sales — ${fmtD(excess)} above normal. Check for product issues, sizing complaints, or delayed orders causing refund requests.`,metric:`${refundRate.toFixed(1)}% vs ${t.refund_rate_max}% target`});
  }
  if(srOrders>0&&srOrders>=t.service_recovery_max_orders){
    alerts.push({sev:"warn",icon:"📦",title:"Too many service recovery orders",action:`${srOrders} orders required service recovery this week (threshold: ${t.service_recovery_max_orders}). Check which codes are firing most — RESHIP-FAULTY or CS-ERROR suggest a packing/QC issue that ops should review immediately.`,metric:`${srOrders} orders`});
  }
  if(srCostPerOrder>0&&srCostPerOrder>=t.service_recovery_cost_alert){
    alerts.push({sev:"warn",icon:"💸",title:"Service recovery cost per order is high",action:`Each service recovery order is costing you ${fmtD(srCostPerOrder)} on average. At this rate you'd spend ${fmtD(srCostPerOrder*52)} per year on errors. Identify the most frequent failure mode and fix the root cause.`,metric:`${fmtD(srCostPerOrder)}/order vs ${fmtD(t.service_recovery_cost_alert)} threshold`});
  }
  return alerts;
}

function AlertCard({alert}){
  const {S2,BR,RD,YL,GR,ff,radius}=useTheme();
  const col=alert.sev==="alert"?RD:YL;
  return(
    <div style={{background:col+"0f",border:"1px solid "+col+"44",borderRadius:radius+1,padding:"12px 14px",marginBottom:8}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
        <span style={{fontSize:14,lineHeight:1}}>{alert.icon}</span>
        <span style={{fontFamily:ff,fontSize:12,color:col,fontWeight:"bold"}}>{alert.title}</span>
        <span style={{fontFamily:ff,fontSize:10,color:col+"99",marginLeft:"auto",whiteSpace:"nowrap"}}>{alert.metric}</span>
      </div>
      <div style={{fontFamily:ff,fontSize:11,color:col==="#ff6b6b"?"#ffb3b3":"#ffe8a0",lineHeight:1.65}}>{alert.action}</div>
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
function CogSettings({settings,onSettingsChange,theme,onThemeChange,onClose,labels,onLabelsSave}){
  const {BG,S,S2,BR,A,MU,TX,ff,radius}=useTheme();
  return(
    <div style={{position:"fixed",inset:0,zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"flex-end"}}>
      <div onClick={onClose} style={{position:"absolute",inset:0,background:"#000000aa"}}/>
      <div style={{position:"relative",zIndex:1,background:S,border:"1px solid "+BR,borderRadius:radius+4,margin:"20px 20px 20px 0",width:580,maxWidth:"calc(100vw - 40px)",maxHeight:"calc(100vh - 40px)",overflowY:"auto",boxShadow:"0 20px 60px #00000099"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"18px 24px",borderBottom:"1px solid "+BR}}>
          <span style={{fontFamily:ff,fontSize:12,color:A,letterSpacing:2,textTransform:"uppercase"}}>Settings</span>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:MU,fontSize:20,cursor:"pointer",lineHeight:1}}>x</button>
        </div>
        <div style={{padding:"20px 24px"}}>
          <SettingsPage settings={settings} onSettingsChange={onSettingsChange} theme={theme} onThemeChange={onThemeChange} labels={labels} onLabelsSave={onLabelsSave}/>
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
  const labels={...DEFAULT_LABELS,...labelsRaw,_targets:{...DEFAULT_TARGETS,...(labelsRaw._targets||{})},_save:(key,val)=>{
    const nl={...labelsRaw,[key]:val};
    setLabelsRaw(nl);
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

  const {A,BG,S,S2,BR,TX,MU,ff,ffTitle,radius,GR,RD,szHeaderTitle,szHeaderBrand}=theme;

  const TABS=[
    {id:"input",key:"tab_input"},{id:"overview",key:"tab_overview"},{id:"visualise",key:"tab_visualise"},
    {id:"compare",key:"tab_compare"},{id:"fixed",key:"tab_fixed"},
    {id:"targets",key:"tab_targets"},
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
                <div style={{color:A,fontSize:szHeaderBrand,letterSpacing:4,textTransform:"uppercase",marginBottom:4}}>
                  <E value={labels.header_brand} onSave={v=>labels._save("header_brand",v)} style={{color:A,fontFamily:ffTitle,fontSize:szHeaderBrand}}/>
                </div>
                <h1 style={{margin:0,fontSize:szHeaderTitle,fontWeight:"normal",letterSpacing:2,color:TX,textTransform:"uppercase",fontFamily:ffTitle}}>
                  <E value={labels.header_title} onSave={v=>labels._save("header_title",v)} style={{color:TX,fontFamily:ffTitle,fontSize:szHeaderTitle}}/>
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

          {tab==="targets"&&!loading&&(
            <div style={{background:S,border:"1px solid "+BR,borderRadius:radius+4,padding:"24px 28px"}}>
              <TargetsPage
                curWeeks={curWeeks}
                onUpdateWeeks={updateWeeks}
                activeWeek={activeWeek}
                labels={labels}
                monthData={monthData}
                selMonthKey={curKey}
              />
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
              labels={labels}
              onLabelsSave={(key,val)=>labels._save(key,val)}
            />
          </ThemeContext.Provider>
        )}
      </div>
    </ThemeContext.Provider>
  );
}
