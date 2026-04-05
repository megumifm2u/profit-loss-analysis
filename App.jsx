import React, { useState, useEffect, useRef, useCallback, createContext, useContext, useMemo, Component } from "react";

// ─── Error Boundary ───────────────────────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("Dashboard error:", error, info); }
  render() {
    if (this.state.error) {
      const reset = () => this.setState({ error: null });
      return (
        <div style={{ padding: "40px 24px", fontFamily: "monospace", color: "#ff6b6b", background: "#0a0a0e", minHeight: "100vh" }}>
          <div style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", marginBottom: 16, color: "#777" }}>Dashboard Error</div>
          <div style={{ fontSize: 14, marginBottom: 24, color: "#e0e0e0", lineHeight: 1.6 }}>
            Something went wrong rendering this section. Your data is safe.
          </div>
          <div style={{ fontSize: 11, color: "#ff6b6b", marginBottom: 24, background: "#1a1826", padding: "12px 16px", borderRadius: 4, border: "1px solid #2a2540" }}>
            {this.state.error?.message || String(this.state.error)}
          </div>
          <button onClick={reset} style={{ padding: "10px 20px", background: "transparent", border: "1px solid #d8b9ff", color: "#d8b9ff", fontFamily: "monospace", fontSize: 12, cursor: "pointer", letterSpacing: 2, textTransform: "uppercase" }}>
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Input Validation & Sanitization ─────────────────────────────────────────
const sanitize = {
  // Sanitize text to prevent XSS — strips HTML tags and control chars
  text: (v) => {
    if (typeof v !== "string") return String(v || "");
    return v.replace(/<[^>]*>/g, "").replace(/[^\x20-\x7E\x09\x0A\x0D\u00A0-\uFFFF]/g, "").slice(0, 2000);
  },
  // Validate monetary input — returns empty string or valid number string
  money: (v) => {
    if (v === "" || v === null || v === undefined) return "";
    const parsed = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
    if (isNaN(parsed)) return "";
    if (parsed < 0) return "0"; // Monetary values should not be negative in most fields
    if (parsed > 10_000_000) return "10000000"; // Guard against accidental data entry (>$10M per week)
    return String(v); // Return original string to preserve input UX
  },
  // Validate integer (order counts etc)
  int: (v) => {
    if (v === "" || v === null || v === undefined) return "";
    const parsed = parseInt(String(v).replace(/[^0-9]/g, ""));
    if (isNaN(parsed)) return "";
    if (parsed < 0) return "0";
    if (parsed > 100_000) return "100000"; // Max 100k orders per week
    return String(v);
  },
};

// Validate an entire week object — returns { valid: bool, warnings: string[] }
function validateWeek(week) {
  const warnings = [];
  const gross = parseFloat(week?.revenue?.gross_sales) || 0;
  const refunds = parseFloat(week?.revenue?.refunds) || 0;
  const discounts = parseFloat(week?.revenue?.discounts) || 0;

  if (refunds > gross && gross > 0) warnings.push(`Week ${week.label}: Refunds ($${refunds.toFixed(0)}) exceed gross sales ($${gross.toFixed(0)})`);
  if (discounts > gross * 0.8 && gross > 0) warnings.push(`Week ${week.label}: Discounts appear unusually high (>${(discounts/gross*100).toFixed(0)}% of gross)`);
  if (gross > 500_000) warnings.push(`Week ${week.label}: Gross sales over $500k — verify this is not a data entry error`);

  const mfg = parseFloat(week?.cogs?.manufacturing_product) || 0;
  if (gross > 0 && mfg > gross * 0.9) warnings.push(`Week ${week.label}: Manufacturing COGS exceeds 90% of gross — check figures`);

  return { valid: warnings.length === 0, warnings };
}

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
// Returns black or white depending on which has better contrast against bg
function contrastColor(hex){
  try{
    const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
    const lum=0.2126*(r/255)**2.2+0.7152*(g/255)**2.2+0.0722*(b/255)**2.2;
    return lum>0.179?"#111111":"#ffffff";
  }catch(e){return "#ffffff";}
}

function buildTheme(t) {
  const l=t.lightness??50, ap=hex=>applyLightness(hex,l);
  const accent=ap(t.accent);
  return {
    A:accent, BG:ap(t.bg), S:ap(t.surface), S2:ap(t.surface2),
    BR:ap(t.border), TX:ap(t.text), MU:ap(t.muted),
    RD:ap(t.red), GR:ap(t.green), YL:ap(t.yellow),
    "#ffffff":contrastColor(accent), // on-accent: text color to use on accent background
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
  btn_generate_export:"WEEKLY ANALYSIS EXPORT", btn_generate_export_sub:"surgical week review — paste into claude",
  btn_monthly_export:"MONTHLY ANALYSIS EXPORT", btn_monthly_export_sub:"trend & strategy review — paste into claude",
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
  { id:"COLLAB2026",     category:"marketing",        useCase:"Marketing / Influencer collaboration", plCategory:"Customer Acquisition Cost (Marketing)", hasCOGS:false, hasShipping:true },
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
  {key:"auspost",label:"AusPost (Total)",group:"freight",computed:true},
  {key:"auspost_domestic",label:"AusPost Domestic",group:"freight",sub:true,parent:"auspost"},
  {key:"auspost_intl",label:"AusPost International",group:"freight",sub:true,parent:"auspost"},
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
  {key:"ops",label:"Operations Department",subs:[
    {key:"ops_operations",label:"Operations"},
    {key:"ops_logistics",label:"Logistics"},
    {key:"ops_retail",label:"Retail"},
    {key:"ops_cs",label:"Customer Service"},
  ]},
  {key:"marketing",label:"Marketing",subs:[{key:"marketing_dept",label:"Marketing"}]},
  {key:"hr",label:"HR & General Management",subs:[{key:"hr_management",label:"HR & General Management"}]},
  {key:"super",label:"Superannuation",subs:[
    {key:"super_ops",label:"Operations"},
    {key:"super_marketing",label:"Marketing"},
    {key:"super_hr",label:"HR & Management"},
  ]},
];

const DEFAULT_STAFF = [
  {id:"s1",name:"Staff Member 1",type:"fulltime",hourlyRate:25,hoursPerWeek:38,dept:"ops_retail"},
  {id:"s2",name:"Staff Member 2",type:"parttime",hourlyRate:25,hoursPerWeek:20,dept:"ops_logistics"},
];

const allWageKeys = depts => (depts||DEFAULT_WAGE_DEPTS).flatMap(d=>d.subs.map(s=>s.key));

// ─── Month / Week helpers ─────────────────────────────────────────────────────
function getMonthWeeks(year,month){
  const first=new Date(year,month,1);
  const lastDay=new Date(year,month+1,0); // last day of month
  const dow=first.getDay(), daysBack=dow===0?6:dow-1;
  const mon0=new Date(first); mon0.setDate(first.getDate()-daysBack);
  const fmt=d=>String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0")+"/"+String(d.getFullYear()).slice(-2);
  const weeks=[];
  for(let w=0;;w++){
    const mon=new Date(mon0); mon.setDate(mon0.getDate()+w*7);
    const sun=new Date(mon); sun.setDate(mon.getDate()+6);
    weeks.push({weekNum:w+1,label:"Week "+(w+1),dateRange:fmt(mon)+" - "+fmt(sun)});
    // stop once this week's Monday is past the last day of the month
    if(sun>=lastDay)break;
  }
  return weeks;
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
function emptyFixed(keys){return {values:emptyOpex(keys),fixedKeys:[],monthlyValues:emptyOpex(keys),monthlyFixedKeys:[],satchelCostDefault:"0.85"};}

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
    marketingCogsValue: n(mkt.cogsValue), // unit COGS of gifted items — mirrors Collab Product COGS
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
    // For computed parent keys (e.g. auspost), sum sub-keys if they exist
    const keyDef=keys.find(kd=>kd.key===k);
    if(keyDef?.computed){
      const subKeys=keys.filter(kd=>kd.parent===k);
      const hasAnySub=subKeys.some(kd=>week.opex?.[kd.key]!==""&&week.opex?.[kd.key]!==undefined);
      if(subKeys.length>0&&hasAnySub){
        const subSum=subKeys.reduce((s,kd)=>{
          if(week.opex?.[kd.key]!==""&&week.opex?.[kd.key]!==undefined)return s+n(week.opex[kd.key]);
          if(fixed?.fixedKeys?.includes(kd.key))return s+n(fixed?.values?.[kd.key]);
          if(fixed?.monthlyFixedKeys?.includes(kd.key))return s+n(fixed?.monthlyValues?.[kd.key])/4;
          return s;
        },0);
        return subSum; // return even if 0 — sub-keys are the source of truth once any is set
      }
    }
    // Week-level override takes priority
    if(week.opex?.[k]!==""&&week.opex?.[k]!==undefined)return n(week.opex[k]);
    // Weekly fixed cost (full amount each week)
    if(fixed?.fixedKeys?.includes(k))return n(fixed?.values?.[k]);
    // Monthly fixed cost (divided by 4 weeks)
    if(fixed?.monthlyFixedKeys?.includes(k))return n(fixed?.monthlyValues?.[k])/4;
    return 0;
  };
  // Exclude sub-keys from totals (they roll up into parent computed key)
  const totalOPEXBase=keys.filter(k=>!k.sub).reduce((s,{key})=>s+getO(key),0);
  // Marketing discount reclassified as marketing expense
  const totalOPEX=totalOPEXBase+dr.marketingDisc;

  const wDepts=depts||DEFAULT_WAGE_DEPTS;
  // Staff discount reclassified as wages/staff benefit
  const totalWages=allWageKeys(wDepts).reduce((s,k)=>s+n(week.wages?.[k]||0),0)+dr.staffDisc;

  const totalFreight=keys.filter(k=>k.group==="freight"&&!k.sub).reduce((s,{key})=>s+getO(key),0);
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

// Memoize cache for calcWeek — keyed by stable JSON fingerprint
const _calcCache = new Map();
const _calcWeekOrig = calcWeek;
// Override calcWeek with memoized version to avoid redundant recalculation
// across multiple consumers (TargetsPanel, WeekForm summary, exports)
(function patchCalcWeek() {
  // Patch happens at module scope post-definition
})();

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
const PASSWORD=import.meta.env.VITE_PASSWORD;
const JSONBIN_ID=import.meta.env.VITE_JSONBIN_ID;
const JSONBIN_KEY=import.meta.env.VITE_JSONBIN_KEY;

// Storage version — bump when schema changes to force migration
const STORAGE_KEY = "pl_v6";
const STORAGE_FALLBACK_KEYS = ["pl_v5","pl_v4"];

// Validate the loaded payload has expected structure
function validatePayload(data) {
  if (!data || typeof data !== "object") return false;
  // Must have at least one of the core keys
  return "monthData" in data || "fixed" in data || "settings" in data;
}

// Safe JSON parse with schema validation
function safeParse(raw) {
  try {
    const parsed = JSON.parse(raw);
    return validatePayload(parsed) ? parsed : null;
  } catch (e) {
    console.warn("Storage parse error:", e);
    return null;
  }
}

// Sanitize payload before saving — trim oversized notes, cap month count
function sanitizePayload(payload) {
  try {
    const md = payload.monthData || {};
    // Trim notes fields to prevent localStorage bloat
    const cleanMd = Object.fromEntries(
      Object.entries(md).map(([key, month]) => [
        key,
        {
          ...month,
          weeks: (month.weeks || []).map(w => ({
            ...w,
            notes: sanitize.text(w.notes || "").slice(0, 500),
          })),
        },
      ])
    );
    return { ...payload, monthData: cleanMd };
  } catch (e) {
    return payload; // Return original if sanitization fails
  }
}

async function loadFromSupabase(){
  try{
    const res=await fetch("/api/data",{signal:AbortSignal.timeout(8000)});
    if(!res.ok)return null;
    const d=await res.json();
    if(d&&validatePayload(d))return d;
    return null;
  }catch(e){console.warn("Supabase load failed",e);return null;}
}

async function saveToSupabase(payload){
  try{
    await fetch("/api/data",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(payload),
      signal:AbortSignal.timeout(10000),
    });
  }catch(e){console.warn("Supabase save failed",e);}
}

async function loadAll(){
  // 1. Try JSONBin (existing data)
  if(JSONBIN_ID&&JSONBIN_KEY){
    try{
      const res=await fetch("https://api.jsonbin.io/v3/b/"+JSONBIN_ID+"/latest",{
        headers:{"X-Master-Key":JSONBIN_KEY},
        signal:AbortSignal.timeout(8000),
      });
      if(res.ok){
        const d=await res.json();
        if(d.record&&validatePayload(d.record)){
          const payload={monthData:d.record.monthData||{},fixed:d.record.fixed||null,settings:d.record.settings||null};
          saveToSupabase(payload);
          try{localStorage.setItem(STORAGE_KEY,JSON.stringify(payload));}catch(e){}
          return payload;
        }
      }
    }catch(e){console.warn("JSONBin load failed",e);}
  }
  // 2. Try Supabase
  const sb=await loadFromSupabase();
  if(sb&&validatePayload(sb)){
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(sb));}catch(e){}
    return sb;
  }
  // 3. Fall back to localStorage (try versioned keys)
  for(const key of[STORAGE_KEY,...STORAGE_FALLBACK_KEYS]){
    try{
      const raw=localStorage.getItem(key);
      if(raw){
        const parsed=safeParse(raw);
        if(parsed)return parsed;
      }
    }catch(e){}
  }
  return{monthData:{},fixed:null,settings:null};
}

async function saveAll(monthData,fixed,settings){
  const raw={monthData,fixed,settings};
  const payload=sanitizePayload(raw);
  // Always save to localStorage first (instant, never fails)
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(payload));}catch(e){
    console.warn("localStorage save failed — may be full",e);
  }
  // Save to Supabase (primary cloud)
  await saveToSupabase(payload);
  // Also try JSONBin while it still works
  if(JSONBIN_ID&&JSONBIN_KEY){
    try{
      await fetch("https://api.jsonbin.io/v3/b/"+JSONBIN_ID,{
        method:"PUT",
        headers:{"Content-Type":"application/json","X-Master-Key":JSONBIN_KEY},
        body:JSON.stringify(payload),
        signal:AbortSignal.timeout(10000),
      });
    }catch(e){}
  }
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

  // Skip section header lines (e.g. "SECTION 1 — REVENUE", "--- COGS ---")
  const isSectionHeader=l=>(/^section\s+\d/i.test(l)||/^-{2,}/.test(l.trim())||(/^[A-Z\s\d—–-]{5,}$/.test(l.trim())&&!l.includes(":")));

  raw.split("\n").forEach(line=>{
    const low=line.toLowerCase().trim();
    if(!low)return;
    if(isSectionHeader(line.trim()))return; // skip headers like "SECTION 2 — COGS"

    // ── Revenue fields ──────────────────────────────────────────────────────
    if(low.includes("gross sale")||low.includes("total sale")||low.includes("total revenue")){
      const v=getNum(line); if(v!==null)revenue.gross_sales=v;
    } else if(low.includes("refund")&&!low.includes("shipping")&&!low.includes("reason")&&!low.includes("number of")&&!low.includes("total number")){
      // Only capture the first clean refund line (e.g. "Refunds: 338.04"), not "Total Refund Amount" or "Refund Reason" lines
      if(revenue.refunds===undefined){const v=getNum(line);if(v!==null)revenue.refunds=v;}
    } else if(low.includes("discount")&&!low.includes("collab")&&!low.includes("staff")&&!low.includes("influencer")&&!low.includes("code breakdown")){
      const v=getNum(line); if(v!==null)revenue.discounts=v;
    } else if(low.includes("shipping")&&(low.includes("income")||low.includes("revenue")||low.includes("collected")||low.includes("charged"))){
      const v=getNum(line); if(v!==null)revenue.shipping_income=v;
    } else if(low.includes("paypal")||low.includes("pay pal")){
      const v=getNum(line); if(v!==null)revenue.paypal_fees=v;

    // ── COGS fields ─────────────────────────────────────────────────────────
    // "Manufacturing:" alone maps to manufacturing_product (the main COGS line)
    } else if(low.includes("manufactur")&&!low.includes("ship")&&!low.includes("inbound")&&!low.includes("freight")){
      const v=getNum(line); if(v!==null)cogs.manufacturing_product=v;
    } else if((low.includes("manufactur")&&(low.includes("ship")||low.includes("inbound")||low.includes("freight")))||low.includes("inbound freight")||low.includes("mfg shipping")){
      const v=getNum(line); if(v!==null)cogs.manufacturing_shipping=v;
    } else if(low.includes("number of order")||low.includes("order count")||(low.includes("order")&&low.includes("satchel"))){
      // "Number of Orders" → satchel count. Exclude "total order" to avoid confusing with revenue
      const v=getInt(line); if(v!==null&&v>0)cogs.satchel_count=v;
    } else if(low.includes("other packaging")||low.includes("packaging cost")){
      const v=getNum(line); if(v!==null)cogs.other_packaging=v;

    // ── OPEX: Freight ───────────────────────────────────────────────────────
    } else if(low.includes("auspost domestic")||low.includes("aus post domestic")||low.includes("australia post domestic")||(low.includes("auspost")&&low.includes("domestic"))){
      const v=getNum(line); if(v!==null)opex.auspost_domestic=v;
    } else if(low.includes("auspost intl")||low.includes("auspost international")||low.includes("aus post international")||low.includes("australia post international")||(low.includes("auspost")&&low.includes("intl"))){
      const v=getNum(line); if(v!==null)opex.auspost_intl=v;
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
function generateWeeklyExport(week,fixed,opexKeys,depts,staff,labels){
  const fmt=v=>"$"+Math.abs(v).toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:2});
  const pct=(v,b)=>b>0?((v/b)*100).toFixed(1)+"%":"0.0%";
  const keys=opexKeys||DEFAULT_OPEX_KEYS;
  const wDepts=depts||DEFAULT_WAGE_DEPTS;
  const c=calcWeek(week,fixed,keys,wDepts);
  const targets=week.weekTargets||DEFAULT_TARGETS;
  const gross=n(week.revenue.gross_sales);
  const dr=c.discReclass||{};
  const promoRate=gross>0?(c.truePromoDisc/gross)*100:0;
  const refundRate=gross>0?(n(week.revenue.refunds)/gross)*100:0;
  const srOrders=dr.serviceRecoveryOrders||0;
  const srCost=dr.serviceRecoveryCOGS||0;
  const srCostPerOrder=srOrders>0?srCost/srOrders:0;
  const cogsPct=c.netRevenue>0?(c.totalCOGS/c.netRevenue)*100:0;
  const opexPct=c.netRevenue>0?(c.totalOPEX/c.netRevenue)*100:0;
  const wagesPct=c.netRevenue>0?(c.totalWages/c.netRevenue)*100:0;
  const netYield=gross>0?(c.netRevenue/gross)*100:0;
  const satchelCount=n(week.cogs.satchel_count);
  const adSpend=n(week.opex?.meta_tiktok_ads||0);
  const adROAS=adSpend>0?c.netRevenue/adSpend:0;
  const shipSubsidy=n(week.revenue.shipping_income)-c.totalFreight;
  const costPerOrder=satchelCount>0?c.totalFreight/satchelCount:0;
  let tier="B",tierName="Standard Week (Tier B — $24K–$30K)";
  if(gross<24000){tier="A";tierName="Quiet Week (Tier A — <$24K)";}
  else if(gross>=30000){tier="C";tierName="Strong Week (Tier C — >$30K)";}
  const tierAdCap=tier==="A"?6570:tier==="C"?11169:9330;
  const tierROASFloor=tier==="A"?3.3:tier==="C"?2.9:3.0;
  let o="=== WEEKLY P&L — "+week.label+" | "+week.dateRange+" ===\nGenerated: "+new Date().toLocaleDateString("en-AU")+"\n\n";
  o+="--- RAW DATA ---\n";
  o+="Gross Sales: "+fmt(gross)+"\n";
  o+="Refunds: -"+fmt(n(week.revenue.refunds))+" ("+refundRate.toFixed(1)+"% of gross)\n";
  o+="Total Discounts (all codes): -"+fmt(n(week.revenue.discounts))+"\n";
  o+="  → Service Recovery (reclassified to COGS): "+fmt(srCost)+" | "+srOrders+" orders\n";
  o+="  → Marketing / Influencer gifting (reclassified to OPEX): "+fmt(dr.marketingDisc||0)+"\n";
  o+="  → Staff discounts (reclassified to wages): "+fmt(dr.staffDisc||0)+"\n";
  o+="  → True promotional (stays as revenue deduction): "+fmt(c.truePromoDisc)+" ("+promoRate.toFixed(1)+"% of gross)\n";
  o+="Shipping Income: +"+fmt(n(week.revenue.shipping_income))+"\n";
  o+="PayPal Fees: -"+fmt(n(week.revenue.paypal_fees))+"\n";
  o+="NET REVENUE: "+fmt(c.netRevenue)+" (net yield: "+netYield.toFixed(1)+"% of gross)\n\n";
  o+="COGS Breakdown:\n";
  o+="  Manufacturing Product: "+fmt(c.mfgP)+"\n";
  o+="  Manufacturing Shipping (Inbound): "+fmt(c.mfgS)+"\n";
  o+="  Satchels: "+satchelCount+" orders × $"+(week.cogs.satchel_cost_each||fixed?.satchelCostDefault||"0.85")+" = "+fmt(c.satchel)+"\n";
  o+="  Other Packaging: "+fmt(c.otherPkg)+"\n";
  o+="  Service Recovery COGS (reclassified from discounts): "+fmt(srCost)+"\n";
  o+="  TOTAL COGS: "+fmt(c.totalCOGS)+" ("+cogsPct.toFixed(1)+"% of net rev) | Target: ≤"+targets.cogs_pct_target+"%\n\n";
  o+="GROSS PROFIT: "+fmt(c.grossProfit)+" | GROSS MARGIN: "+c.grossMargin.toFixed(1)+"% | Target: "+targets.gross_margin_target+"%\n\n";
  o+="OPEX Breakdown:\n";
  o+="  Freight Total: "+fmt(c.totalFreight)+" | Net Shipping Subsidy: "+fmt(shipSubsidy)+(satchelCount>0?" | Cost/order shipped: "+fmt(costPerOrder):"")+"\n";
  keys.filter(k=>k.group==="freight"&&!k.sub).forEach(k=>{const v=week.opex?.[k.key]!==""?n(week.opex[k.key]):(fixed?.fixedKeys?.includes(k.key)?n(fixed?.values?.[k.key]):0);if(v>0)o+="    "+k.label+": "+fmt(v)+"\n";});
  o+="  Collabs Total: "+fmt(c.totalCollabs)+"\n";
  keys.filter(k=>k.group==="collabs").forEach(k=>{const v=week.opex?.[k.key]!==""?n(week.opex[k.key]):(fixed?.fixedKeys?.includes(k.key)?n(fixed?.values?.[k.key]):0);if(v>0)o+="    "+k.label+": "+fmt(v)+"\n";});
  o+="  Influencer Gifting (reclassified): "+fmt(dr.marketingDisc||0)+"\n";
  o+="  General OPEX:\n";
  keys.filter(k=>k.group==="general").forEach(k=>{const v=week.opex?.[k.key]!==""?n(week.opex[k.key]):(fixed?.fixedKeys?.includes(k.key)?n(fixed?.values?.[k.key]):(fixed?.monthlyFixedKeys?.includes(k.key)?n(fixed?.monthlyValues?.[k.key])/4:0));if(v>0)o+="    "+k.label+": "+fmt(v)+"\n";});
  o+="  TOTAL OPEX: "+fmt(c.totalOPEX)+" ("+opexPct.toFixed(1)+"% of net rev) | Target: ≤"+targets.opex_pct_target+"%\n\n";
  o+="WAGES Breakdown:\n";
  wDepts.forEach(dept=>{dept.subs.forEach(sub=>{const v=n(week.wages?.[sub.key]||0);if(v>0)o+="  "+sub.label+" ("+dept.label+"): "+fmt(v)+"\n";});});
  o+="  Staff Discounts (reclassified): "+fmt(dr.staffDisc||0)+"\n";
  o+="  TOTAL WAGES: "+fmt(c.totalWages)+" ("+wagesPct.toFixed(1)+"% of net rev) | Target: ≤"+targets.wages_pct_target+"%\n\n";
  o+="TOTAL EXPENSES: "+fmt(c.totalExpenses)+(satchelCount>0?" | Total cost/order: "+fmt(c.totalExpenses/satchelCount):"")+"\n";
  o+="NET PROFIT: "+fmt(c.netProfit)+" | NET MARGIN: "+c.netMargin.toFixed(1)+"% | Target: "+targets.net_margin_target+"%\n\n";
  o+="--- OPERATIONAL CONTEXT ---\n";
  o+="Revenue Tier This Week: "+tierName+"\n";
  o+="Orders Processed: "+satchelCount+(satchelCount>0?" | Avg gross/order: "+fmt(gross/satchelCount)+" | Avg net/order: "+fmt(c.netRevenue/satchelCount):"")+"\n";
  o+="Net Shipping Subsidy: "+fmt(shipSubsidy)+" (shipping income minus outbound freight"+(shipSubsidy<0?" — business is subsidising delivery":"")+")"+"\n";
  if(adSpend>0){o+="Paid Ads: "+fmt(adSpend)+" | ROAS: "+adROAS.toFixed(2)+"x | Ad spend % of net rev: "+(c.netRevenue>0?(adSpend/c.netRevenue*100).toFixed(1):0)+"%\n";o+="Tier Ad Cap: "+fmt(tierAdCap)+" | Headroom: "+fmt(tierAdCap-adSpend)+" | ROAS Floor: "+tierROASFloor+"x"+(adROAS<tierROASFloor?" ⚠ BELOW FLOOR":"")+"\n";}
  else{o+="Paid Ads: not entered | Tier Ad Cap: "+fmt(tierAdCap)+" (ROAS floor: "+tierROASFloor+"x)\n";}
  o+="\n";
  if(srOrders>0){
    o+="--- SERVICE RECOVERY ---\n";
    o+=srOrders+" orders | Total cost: "+fmt(srCost)+" | Per order: "+fmt(srCostPerOrder)+" | Annualised: "+fmt(srCost*52)+"\n";
    const codeData=week.codeData||{};
    DISCOUNT_CODE_REGISTRY.filter(rc=>rc.category==="service_recovery").forEach(code=>{const d=codeData[code.id];if(d&&(n(d.orders)>0||n(d.retailValue)>0)){o+="  "+code.id+": "+n(d.orders)+" orders | retail: "+fmt(n(d.retailValue))+" | COGS: "+fmt(n(d.cogsValue))+" | ship: "+fmt(n(d.shippingValue))+"\n";o+="    → "+code.useCase+"\n";}});
    o+="\n";
  }
  if(staff&&staff.length>0){
    const budgeted=staff.reduce((s,m)=>s+n(m.hourlyRate)*n(m.hoursPerWeek),0);const variance=c.totalWages-budgeted;
    o+="--- WAGES VS ROSTER BUDGET ---\n";
    staff.forEach(s=>{o+="  "+s.name+" ("+s.type+"): "+n(s.hoursPerWeek)+"hrs × $"+n(s.hourlyRate).toFixed(2)+" = "+fmt(n(s.hourlyRate)*n(s.hoursPerWeek))+"\n";});
    o+="  Budgeted: "+fmt(budgeted)+" | Actual: "+fmt(c.totalWages)+" | Variance: "+(variance>=0?"+":"")+fmt(variance)+"\n\n";
  }
  if(week.notes)o+="--- OPERATOR NOTES ---\n"+week.notes+"\n\n";
  const alerts=generateAlerts(week,c.netRevenue,dr,gross,targets);
  if(alerts.length){o+="--- TRIGGERED ALERTS ---\n";alerts.forEach(a=>{o+="⚠ "+a.title+": "+a.metric+"\n  → "+a.action+"\n";});o+="\n";}
  o+="=== END DATA ===\n\n";
  // ── SYSTEM CONTEXT ──────────────────────────────────────────────────────────
  o+="You are a COO-level financial advisor and operational director for a direct-to-consumer fashion brand.\n\n";
  o+="STANDING RULES:\n";
  o+="Discount classification: Manual adjustments (replacement/exchange orders, goodwill credits, staff discounts applied manually) are operational costs — never count toward the "+targets.promo_disc_rate_max+"% promotional discount target. Only true promotional codes count. If the split is provided, use it. If not, flag the headline figure as potentially misleading.\n";
  o+="Wages: Analyse wages by department proportionate to revenue tier and workload. Do not call out any individual staff member's hours as protected or non-negotiable. Assess all departments on the same basis.\n";
  o+="Product margin: Some discount figures at variant level may reflect exchange orders or manual adjustments rather than promotional codes. Flag low-margin variants for investigation before recommending any discount code action. Do not recommend blocking codes until root cause is confirmed.\n";
  o+="Tone: Part A is unfiltered — written for the business owner, commercially direct, no softening. Part B is forward-ready — written for department heads, plain English, financial terms defined inline. Part C is COO-level surgical detail. Do not conflate the three.\n\n";
  o+="Produce a Word document (.docx) using the docx npm library with this exact structure:\n\n";

  // ── PART A ───────────────────────────────────────────────────────────────────
  o+="══ PART A — OWNER SUMMARY ══\n";
  o+="Unfiltered. Read this first.\n\n";
  o+="WEEK VERDICT (2–3 sentences max): Was this a good or bad week? Single biggest driver. Exact net profit/loss, net margin, and cause.\n\n";
  o+="THE FIVE THINGS YOU NEED TO KNOW: Five bullet points, each a complete actionable statement with exact dollars. Cover: net result, ad efficiency, refund rate, discount classification, wages position.\n\n";
  o+="OWNER ACTION LIST — THIS WEEK: Table — # | Action | Owner | By | Dollar impact. Three rows max. Each action names the platform/vendor/department/SKU, has a day of week, and a specific dollar figure.\n\n";
  o+="NEXT WEEK'S HARD CEILINGS: Table — Category | This week | Ceiling | Basis. Rows: Total wages, Paid ads (all platforms), Outbound freight, Collabs & gifting, Rent + utilities, Total OPEX. Callout box below: break-even gross sales at current cost structure, and revenue required to hit "+targets.net_margin_target+"% net margin.\n\n";

  // ── PART B ───────────────────────────────────────────────────────────────────
  o+="══ PART B — DEPARTMENT BRIEFING ══\n";
  o+="Plain-English summary by department. Forward-ready. Financial terms defined where they appear.\n\n";
  o+="ALL DEPARTMENTS — THE WEEK IN ONE PARAGRAPH: 2–3 sentences. No jargon. What happened, why it matters, what is being done.\n\n";
  o+="MARKETING — ADS, ROAS & COLLABS: Define ROAS inline. Table — Metric | This week | Target | Status. Rows: Total ad spend, ROAS, Revenue shortfall vs floor (if applicable), Collab spend, Daily budget cap next week. Two paragraphs: one on ad platform action naming Meta/TikTok/Google specifically, one on collab status with dollar justification for go or no-go.\n\n";
  o+="CUSTOMER SERVICE — REFUNDS: Define refund rate inline. Alert box with this week's rate, acceptable rate, dollar excess. One action paragraph naming the categorisation task, owner, and threshold for escalation to ops.\n\n";
  o+="OPERATIONS — THIS WEEK'S PICTURE: Opening paragraph on execution quality.\n";
  o+="  Sub-section FREIGHT & SHIPPING: Define shipping subsidy inline. Table — Metric | This week | Signal. Rows: Orders dispatched, Freight cost per order, Total shipping subsidy absorbed, Customs & duties, Service recovery orders, Satchel stock needed next week. Two action paragraphs: threshold modelling, customs & duties.\n";
  o+="  Sub-section REFUNDS — OPS INVOLVEMENT: One paragraph on parallel ops root cause check separate from CS categorisation.\n";
  o+="  Sub-section STOCK & REORDER DECISIONS: Opening sentence, then bullet points per high-velocity or near-zero SKU. Include lead time logic.\n";
  o+="  Sub-section DISPATCH INTEGRITY — STANDING WEEKLY CHECK: Three bullet points. Same every week.\n";
  o+="  Sub-section WHAT OPS SHOULD SURFACE TO THE OWNER THIS WEEK: Table — Item | Priority | Recommended action. Flag threshold items only.\n\n";
  o+="STAFFING — WAGES VS TARGET: Define wages as % of net revenue inline. Alert box with actual, target, overage/underage, roster budget variance. Table — Department | This week | Next week target | Guidance. Every department. Total row.\n\n";

  // ── PART C ───────────────────────────────────────────────────────────────────
  o+="══ PART C — FULL COO ANALYSIS ══\n";
  o+="Surgical detail. Every figure from this week's data. Define financial terms inline the first time they appear. Flag structural problems explicitly.\n\n";
  o+="1. NET REVENUE QUALITY: Table — Metric | This week | Target | Variance | Dollar impact. Rows: Gross sales, Net revenue, True promo discount (promo codes only — "+targets.promo_disc_rate_max+"% target), Manual adjustments (excluded from promo metric), Total discount line, Refund rate ("+targets.refund_rate_max+"% target), Net yield per gross dollar. Footnote explaining the manual adjustment split.\n\n";
  o+="2. GROSS MARGIN DIAGNOSIS: Define gross margin inline. Alert box (hit or missed "+targets.gross_margin_target+"% target). Table — Line | Amount | % of net rev | Target | Status. Rows: Net revenue, Total COGS, Gross profit, OPEX, Wages, Net profit.\n\n";
  o+="3. COGS LINE BY LINE: Table — Line | Amount | Per order | Status. Every COGS line. Total row.\n\n";
  o+="4. OPEX EFFICIENCY: Define OPEX inline. Table — Line | Amount | % of net rev | Target | Verdict. Every non-zero OPEX line. Total row. One paragraph on highest-leverage line.\n\n";
  o+="5. AD SPEND & ROAS DETAIL: Table — Metric | Value | Threshold | Verdict. Rows: Total ad spend, ROAS, Revenue at floor ROAS (if below floor), Ad spend % of net revenue, Recommended daily cap next week. One paragraph on whether ads are working and the specific platform instruction.\n\n";
  o+="6. PRODUCT MARGIN — VARIANT LEVEL (SHOPIFY DATA): Define gross margin by product inline. Note on manual adjustment verification. Table — Product / Variant | Units | Net Sales | COGS | Margin | Flag. Every SKU. Flag low-margin variants amber, very low red, gifted with unrecovered COGS amber/red. Alert box for total gifted COGS with dollar impact.\n\n";
  o+="7. WAGES EFFICIENCY: Table — Department | Actual | % of net rev | Target | Note. Every department. Total row. Structural note paragraph on dominant line and addressable vs non-addressable reduction.\n\n";
  o+="8. FREIGHT DEEP DIVE: Table — Metric | Value (all freight figures). Recovery options paragraph with two modelled scenarios — specific $ fee, specific order threshold, estimated weekly recovery.\n\n";
  o+="9. ORDER VOLUME & LOGISTICS OUTLOOK: Table — Scenario | Orders | Satchels needed | Freight budget | Logistics note. Three rows: Low / Base / High.\n\n";

  // ── OPS DEEP DIVE ────────────────────────────────────────────────────────────
  o+="══ OPERATIONS DEEP DIVE — STRATEGIC REVIEW ══\n";
  o+="Written for the Operations Manager. Synthesises the week's P&L data into operational decisions, flags, and priorities. Not a task list — a weekly read on where ops has the most leverage.\n\n";
  o+="HOW TO READ THIS SECTION: One paragraph.\n\n";
  o+="1. FREIGHT COST MANAGEMENT: Table — Metric | Value | Context (all freight figures). Structural problem paragraph. What ops should do — bullet list: threshold modelling across $100/$120/$150 net order value, two fee scenarios ($12 vs $15), bring recommendation to owner by Wednesday, customs & duties confirmation.\n\n";
  o+="2. REFUND RATE — OPS' ROLE IN ROOT CAUSE: Alert box. Explanation paragraph. Ops root cause checklist — four bullet points covering: order numbers vs pick records, dispatch timing, pattern identification, split report to owner. Why this matters financially — paragraph with annualised dollar figure (refund reduction from current rate to "+targets.refund_rate_max+"% annualised).\n\n";
  o+="3. STOCK MANAGEMENT & REORDER DECISIONS: Opening paragraph. Priority SKUs to check this week — table: SKU | Units sold | Signal | Action. Flag high-velocity SKUs and final restock lines. Reorder lead time management paragraph (4–8 week lead times, cost of zero availability at avg order value). Inbound freight planning paragraph.\n\n";
  o+="4. SERVICE RECOVERY MANAGEMENT: Alert box (clean or flagged — this week: "+srOrders+" events). Cost per event explanation ($65–$80 per reship). What prevents service recovery events — four bullet points: pick accuracy, packaging integrity, address verification, dispatch timing. If events start appearing — paragraph on logging protocol.\n\n";
  o+="5. PACKAGING & SATCHEL COST CONTROL: Opening sentence with this week's figure. What to watch as volume grows — three bullet points: size selection, buffer stock levels (reorder at 100 units), branded insert cost at scale.\n\n";
  o+="6. OPS' WEEKLY STANDING AGENDA: Table — Standing item | Data source | Flag threshold. Nine rows: freight cost per order (flag >$32), shipping subsidy (flag >$1,500/week), service recovery orders & cost (flag any event), refund rate (flag >5%), orders dispatched vs prior week (flag drop >20%), satchel & packaging cost per order (flag >$1.20), inbound freight & stock arrivals (flag delay >3 days), reorder decisions pending (flag any SKU below 3 weeks cover), customs & duties (flag >$100 any week).\n\n";
  o+="7. MARGIN IMPACT OF OPS DECISIONS: Table — Decision area | This week cost | If improved | Annual impact. Rows: Shipping subsidy, Service recovery, Refund rate (ops-caused), Customs & duties, Satchel cost, Inbound freight timing. Closing paragraph on the two highest-leverage decisions and why they require no additional headcount or capital.\n\n";

  // ── COLLAB & STRUCTURAL ───────────────────────────────────────────────────────
  o+="10. COLLAB & INFLUENCER DECISIONS: "+(tier==="A"?"TIER A — all collabs on hold.":tier==="C"?"TIER C — gifting permitted with justification.":"TIER B — collabs permitted if ROAS justifies.")+" Alert box with go/no-go and dollar justification. Minimum revenue uplift paragraph (calculate: collab cost ÷ gross margin % = minimum attributable net revenue to break even; true breakeven with OPEX overhead is $800–$1,200). Gifted COGS paragraph with net profit impact.\n\n";
  o+="11. STRUCTURAL NOTE: Alert box identifying whether the cost base is calibrated to the current revenue tier (Tier "+tier+", gross "+fmt(gross)+"). Two bullet points on highest-impact structural changes requiring zero revenue increase with exact dollar savings. Closing paragraph on combined dollar impact and what it means for net margin this week.\n\n";
  o+="End of report. Questions to weekly standup.\n\n";
  o+="DOCUMENT DESIGN SPEC (for docx generation):\n";
  o+="Fonts: Arial throughout. Body 10pt. H1 15pt bold navy #1A1A2E with bottom border. H2 12pt bold navy. H3 11pt bold dark gray #555555.\n";
  o+="Colours: Navy #1A1A2E, Red #C0392B, Amber #B7770D, Green #1A6B3C, Blue definition boxes #EBF4FF with blue left border, Red alert boxes #FFF0F0 with red left border, Amber alert boxes #FFFBEC with amber left border, Green alert boxes #EDFAF4 with green left border.\n";
  o+="Tables: Navy header row white text. Alternating white/#F8F8F8 rows. 0.5pt gray borders. Cell padding 80/80/140/140 DXA.\n";
  o+="Document: A4. 1.26cm margins. Header with report title week CONFIDENTIAL. Footer with generated date. Page breaks before Part B, Part C, Ops Deep Dive.\n";
  o+="Use definition boxes (blue left border, light blue fill) the first time each financial term appears in each Part. Use colour-coded alert boxes (red/amber/green) for all key metrics that are off-target, on-target, or require immediate attention.";
  return o;
}

function generateMonthlyExport(weeks,fixed,extras,mLabel,opexKeys,depts,staff,labels,factors){
  const fmt=v=>"$"+Math.abs(v).toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:2});
  const pct=(v,b)=>b>0?((v/b)*100).toFixed(1)+"%":"0.0%";
  const keys=opexKeys||DEFAULT_OPEX_KEYS;
  const wDepts=depts||DEFAULT_WAGE_DEPTS;
  const mc=calcMonth(weeks,fixed,extras,keys,wDepts);
  const wFactors=factors||weeks.map(()=>1);
  const pRate=(wc,i)=>{const f=wFactors[i];return{netRevenue:wc.netRevenue*f,totalCOGS:wc.totalCOGS*f,grossProfit:wc.grossProfit*f,grossMargin:wc.grossMargin,netMargin:wc.netMargin,totalFreight:wc.totalFreight*f,totalCollabs:wc.totalCollabs*f,totalWages:wc.totalWages*f,totalOPEX:wc.totalOPEX*f,totalExpenses:wc.totalExpenses*f,netProfit:wc.netProfit*f,gross:wc.gross*f,truePromoDisc:(wc.truePromoDisc||0)*f,satchel:(wc.satchel||0)*f,discReclass:{serviceRecoveryCOGS:(wc.discReclass?.serviceRecoveryCOGS||0)*f,serviceRecoveryOrders:Math.round((wc.discReclass?.serviceRecoveryOrders||0)*f),marketingDisc:(wc.discReclass?.marketingDisc||0)*f,staffDisc:(wc.discReclass?.staffDisc||0)*f,promoDisc:(wc.discReclass?.promoDisc||0)*f}};};
  const rCalcsE=mc.weekCalcs.map((wc,i)=>pRate(wc,i));
  const rSumE=k=>rCalcsE.filter((_,i)=>wFactors[i]>0).reduce((s,c)=>s+(c[k]||0),0);
  const rNetRevE=rSumE("netRevenue"),rGrossProfitE=rSumE("grossProfit"),rTotalCOGSE=rSumE("totalCOGS");
  const rTotalExpensesE=rSumE("totalExpenses"),rNetProfitE=rSumE("netProfit");
  const rGrossMarginE=rNetRevE>0?(rGrossProfitE/rNetRevE)*100:0,rNetMarginE=rNetRevE>0?(rNetProfitE/rNetRevE)*100:0;
  const rTotalFreightE=rSumE("totalFreight"),rTotalCollabsE=rSumE("totalCollabs"),rTotalWagesE=rSumE("totalWages"),rTotalOPEXE=rSumE("totalOPEX");
  const gSales=weeks.reduce((s,w,i)=>s+n(w.revenue.gross_sales)*wFactors[i],0);
  const tDisc=weeks.reduce((s,w,i)=>s+n(w.revenue.discounts)*wFactors[i],0);
  const hasRange=factors&&factors.some(f=>f<1||f===0);
  const totalDR=rCalcsE.filter((_,i)=>wFactors[i]>0).reduce((s,c)=>({serviceRecoveryCOGS:s.serviceRecoveryCOGS+(c.discReclass?.serviceRecoveryCOGS||0),serviceRecoveryOrders:s.serviceRecoveryOrders+(c.discReclass?.serviceRecoveryOrders||0),marketingDisc:s.marketingDisc+(c.discReclass?.marketingDisc||0),staffDisc:s.staffDisc+(c.discReclass?.staffDisc||0),promoDisc:s.promoDisc+(c.discReclass?.promoDisc||0)}),{serviceRecoveryCOGS:0,serviceRecoveryOrders:0,marketingDisc:0,staffDisc:0,promoDisc:0});
  const activeWeeks=weeks.filter((_,i)=>wFactors[i]>0);
  let o="=== MONTHLY P&L — "+mLabel+(hasRange?" [DATE RANGE REPORT]":"")+" ===\nGenerated: "+new Date().toLocaleDateString("en-AU")+"\n\n";
  o+="--- "+(hasRange?"DATE RANGE":"MONTHLY")+" SUMMARY ---\n";
  o+="Gross Sales: "+fmt(gSales)+" | Total Discounts (all codes): "+fmt(tDisc)+" ("+pct(tDisc,gSales)+" of gross)\n";
  o+="Net Revenue (after true promo discounts only): "+fmt(rNetRevE)+"\n";
  o+="Total COGS (incl. service recovery): "+fmt(rTotalCOGSE)+" | Gross Profit: "+fmt(rGrossProfitE)+" ("+rGrossMarginE.toFixed(1)+"%)\n";
  o+="Freight: "+fmt(rTotalFreightE)+" | Collabs: "+fmt(rTotalCollabsE)+" | Wages (incl. staff discounts): "+fmt(rTotalWagesE)+" | OPEX (incl. influencer gifting): "+fmt(rTotalOPEXE)+"\n";
  o+="Total Expenses: "+fmt(rTotalExpensesE)+" | NET PROFIT: "+fmt(rNetProfitE)+" ("+rNetMarginE.toFixed(1)+"%)\n\n";
  o+="--- DISCOUNT RECLASSIFICATION ---\n";
  o+="Service Recovery → COGS: "+fmt(totalDR.serviceRecoveryCOGS)+" | "+totalDR.serviceRecoveryOrders+" orders | Annualised: "+fmt(totalDR.serviceRecoveryCOGS*12)+"\n";
  o+="Influencer / Marketing gifting: "+fmt(totalDR.marketingDisc)+"\n";
  o+="Staff discounts (staff benefit): "+fmt(totalDR.staffDisc)+"\n";
  o+="True promotional discounts: "+fmt(totalDR.promoDisc)+" ("+pct(totalDR.promoDisc,gSales)+" of gross — this is the ONLY bucket affecting Net Revenue)\n\n";
  weeks.forEach((w,i)=>{
    if(wFactors[i]===0)return;const f=wFactors[i];const c=rCalcsE[i];const wTargets=w.weekTargets||DEFAULT_TARGETS;
    const satchelCount=n(w.cogs?.satchel_count)||0;const adSpend=n(w.opex?.meta_tiktok_ads||0);
    const wGross=n(w.revenue?.gross_sales)*f;const wTier=wGross<24000?"A":wGross>=30000?"C":"B";
    o+="--- "+w.label+(f<1?" ("+Math.round(f*7)+"d pro-rated)":"")+" | "+w.dateRange+" ---\n";
    o+="  Gross: "+fmt(n(w.revenue.gross_sales))+" | Tier: "+wTier+" | True Promo Disc: -"+fmt(c.truePromoDisc)+" | Refunds: -"+fmt(n(w.revenue.refunds))+" | ShipIncome: +"+fmt(n(w.revenue.shipping_income))+" | PayPal: -"+fmt(n(w.revenue.paypal_fees))+" => NET: "+fmt(c.netRevenue)+"\n";
    o+="  COGS: MfgProduct "+fmt(n(w.cogs.manufacturing_product))+" | Inbound "+fmt(n(w.cogs.manufacturing_shipping))+" | Satchels "+n(w.cogs.satchel_count)+"@$"+(w.cogs.satchel_cost_each||fixed?.satchelCostDefault||"0.85")+"="+fmt(c.satchel)+" | ServiceRecovery "+fmt(c.discReclass.serviceRecoveryCOGS)+" => TOTAL: "+fmt(c.totalCOGS)+" | GP: "+fmt(c.grossProfit)+" ("+c.grossMargin.toFixed(1)+"%)\n";
    const fLines=keys.filter(k=>k.group==="freight").map(k=>{const v=w.opex?.[k.key]!==""?n(w.opex[k.key]):(fixed?.fixedKeys?.includes(k.key)?n(fixed?.values?.[k.key]):0);return k.label+": "+fmt(v);});
    o+="  Freight: "+fLines.join(" | ")+" => "+fmt(c.totalFreight)+"\n";
    const cLines=keys.filter(k=>k.group==="collabs").map(k=>{const v=w.opex?.[k.key]!==""?n(w.opex[k.key]):(fixed?.fixedKeys?.includes(k.key)?n(fixed?.values?.[k.key]):0);return k.label+": "+fmt(v);});
    o+="  Collabs: "+cLines.join(" | ")+" | InfluencerGifting: "+fmt(c.discReclass.marketingDisc)+" => "+fmt(c.totalCollabs)+(adSpend>0?" | Ads: "+fmt(adSpend)+" (ROAS: "+(c.netRevenue>0?(c.netRevenue/adSpend).toFixed(2):0)+"x, Tier "+wTier+" cap: $"+(wTier==="A"?"6,570":wTier==="C"?"11,169":"9,330")+")":"")+"\n";
    const wLines=wDepts.flatMap(d=>d.subs.map(s=>s.label+": "+fmt(n(w.wages?.[s.key]||0))));
    o+="  Wages: "+wLines.join(" | ")+" | StaffBenefits: "+fmt(c.discReclass.staffDisc)+" => "+fmt(c.totalWages)+"\n";
    const gLines=keys.filter(k=>k.group==="general").map(k=>{const v=w.opex?.[k.key]!==""?n(w.opex[k.key]):(fixed?.fixedKeys?.includes(k.key)?n(fixed?.values?.[k.key]):0);return v>0?k.label+": "+fmt(v):null;}).filter(Boolean);
    o+="  OPEX: "+(gLines.join(" | ")||"none")+" => "+fmt(c.totalOPEX)+"\n";
    o+="  NET PROFIT: "+fmt(c.netProfit)+" ("+c.netMargin.toFixed(1)+"%)"+(w.notes?" | Notes: "+w.notes:"")+"\n";
    const wAlerts=generateAlerts(w,c.netRevenue,c.discReclass||{},n(w.revenue.gross_sales),wTargets);
    if(wAlerts.length){o+="  ACTIONS REQUIRED:\n";wAlerts.forEach(a=>{o+="  "+a.title+": "+a.action+"\n";});}
    o+="\n";
  });
  if(extras&&mc.extraOpex>0){o+="--- MONTHLY ADJUSTMENTS ---\n";keys.forEach(({key,label})=>{if(n(extras.opex?.[key])>0)o+="  "+label+": "+fmt(n(extras.opex[key]))+"\n";});o+="  Extra OPEX Total: "+fmt(mc.extraOpex)+"\n\n";}
  if(staff&&staff.length>0){o+="--- STAFF ROSTER ---\n";staff.forEach(s=>{const wc=n(s.hourlyRate)*n(s.hoursPerWeek);o+="  "+s.name+" | "+s.type+" | $"+n(s.hourlyRate).toFixed(2)+"/hr | "+n(s.hoursPerWeek)+"hrs/wk | Weekly cost: "+fmt(wc)+"\n";});const total=staff.reduce((s,m)=>s+n(m.hourlyRate)*n(m.hoursPerWeek),0);o+="  Budgeted: "+fmt(total)+" | Actual: "+fmt(mc.totalWages)+" | Variance: "+fmt(mc.totalWages-total)+"\n\n";}
  o+="=== END DATA ===\n\nYou are a COO-level financial advisor reviewing a FULL MONTH of P&L data. Your job is to analyse trends, determine whether week-to-week operational changes worked, and set the strategic direction for next month. Use exact figures. Cite weeks by label when comparing them.\n\n";
  o+="1. MONTHLY VERDICT — 2–3 sentences: good or bad month? Trajectory improving or deteriorating week to week? Single factor with most impact on net profit?\n\n";
  o+="2. WEEK-ON-WEEK TREND ANALYSIS — Walk through net revenue, gross margin, and net margin across all "+activeWeeks.length+" weeks. Identify inflection points. If operator notes describe mid-month changes, did they show up in the following week\'s numbers? Be specific about cause and effect.\n\n";
  o+="3. REVENUE QUALITY TREND — Net yield consistency week to week. Which weeks had degraded yield? Total true promotional discount for the month as % of gross. Sustainable?\n\n";
  o+="4. COGS TREND AND SERVICE RECOVERY — Manufacturing proportionate to volume? Any week where SR blew out? Total monthly SR cost, cost per incident, 12-month annualised. SR rate trending up or down?\n\n";
  o+="5. GROSS MARGIN TRAJECTORY — Did margin improve? If recovery: structural or one-off? If deterioration: which week broke and why?\n\n";
  o+="6. OPEX EFFICIENCY — Total OPEX % by week. Fixed bleed vs variable. Top 3 OPEX lines by monthly total — is each proportionate?\n\n";
  o+="7. FREIGHT AND SHIPPING — Monthly net shipping subsidy. Growing or shrinking? At what monthly revenue does freight % become acceptable? What threshold recovers 80% of outbound cost?\n\n";
  o+="8. WAGES EFFICIENCY — Monthly wages % trend. Monthly variance vs roster budget. Which department drove over/underage? Maximum sustainable weekly wages bill at this month\'s average revenue run rate.\n\n";
  o+="9. AD SPEND & TIER ANALYSIS (MONTH VIEW) — For each week, state its revenue tier (A <$24K, B $24–$30K, C >$30K). Was spend within tier cap (A: $6,570, B: $9,330, C: $11,169)? Was ROAS above floor (A: 3.3x, B: 3.0x, C: 2.9x)? Which weeks had unjustified spend? Total monthly ad spend, blended ROAS, dollar cost of below-floor weeks. Is there a visible correlation between this week\'s spend and next week\'s revenue — is it working? Recommend next month\'s weekly ad spend approach by tier.\n\n";
  o+="10. COLLABS AND INFLUENCER ROI — Total monthly collab spend including gifted product. Minimum revenue required at 3x ROAS. Visible revenue lift in high-collab weeks? Which collabs are ROI-positive with evidence? Which should be paused next month?\n\n";
  o+="11. ROSTER EFFICIENCY TREND — Wages % across all weeks. Weeks where wages over-indexed vs revenue? Based on this month\'s actual revenue distribution, ideal roster structure: fixed headcount for base ops vs flex/casual for volume spikes. Maximum weekly wages bill for each tier (A/B/C) to stay under wages % target. Department-level recommendations for next month.\n\n";
  o+="12. ORDER VOLUME & LOGISTICS TREND — Trace order count week by week where available. Volume growing, flat, or declining relative to gross? Average order value trend. SR orders across multiple weeks: increasing rate suggesting systemic issue requiring escalation? Recommend next month\'s logistics staffing and satchel stock based on this month\'s trend.\n\n";
  o+="13. PRODUCT MARGIN — If product data provided: which products drove most gross profit? Which dragged blended margin below target? Dollar cost of keeping below-margin products at current discount rates.\n\n";
  o+="14. TOP 5 ACTIONS — Exact dollar improvement, mechanism, timeline, trade-off.\n\n";
  o+="15. MARGIN EXPANSION — Structural changes over 90 days.\n\n";
  o+="16. NEXT MONTH TARGETS — Exact dollar targets for gross sales, net revenue, COGS, OPEX, wages, net profit. Break-even weekly revenue. Weekly revenue required to hit net margin target. Single change with highest margin leverage requiring no revenue increase.\n\nMake the trend analysis the centrepiece. This is a month review, not a snapshot.";
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
  const handleChange = (v) => {
    // Allow typing freely but warn on obviously bad values
    const num = parseFloat(v);
    if (v !== "" && !isNaN(num) && num > 10_000_000) return; // Block values over $10M
    onChange(v);
  };
  return(
    <div style={{position:"relative"}}>
      <span style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",color:MU,fontFamily:ff,fontSize:13,pointerEvents:"none"}}>$</span>
      <input type="number" value={value} onChange={e=>handleChange(e.target.value)} placeholder={placeholder}
        min="0" max="10000000" step="0.01"
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
      <button onClick={()=>setBold(b=>!b)} style={{background:bold?A:"transparent",border:"1px solid "+(bold?A:BR),color:bold?"#ffffff":TX,fontFamily:ff,fontSize:11,fontWeight:"bold",padding:"3px 8px",cursor:"pointer",borderRadius:2}}>B</button>
      <button onClick={()=>setItalic(i=>!i)} style={{background:italic?A:"transparent",border:"1px solid "+(italic?A:BR),color:italic?"#ffffff":TX,fontFamily:ff,fontSize:11,fontStyle:"italic",padding:"3px 8px",cursor:"pointer",borderRadius:2}}>I</button>
      <input type="number" value={size} min={7} max={32} onChange={e=>setSize(parseInt(e.target.value)||12)}
        style={{width:46,background:"transparent",border:"1px solid "+BR,color:TX,fontFamily:ff,fontSize:11,padding:"3px 6px",outline:"none",borderRadius:2,textAlign:"center"}}/>
      <span style={{fontFamily:ff,fontSize:10,color:MU}}>px</span>
      <button onClick={apply} style={{background:A,border:"none",color:"#ffffff",fontFamily:ff,fontSize:10,padding:"4px 10px",cursor:"pointer",borderRadius:2,fontWeight:"bold"}}>Apply</button>
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
function ShopifyImport({week,onChange,labels,settings}){
  const {S2,BR,A,S,TX,ff,MU,GR,RD,radius}=useTheme();
  const bi=useBI();
  const [raw,setRaw]=useState(week.shopifyRaw||"");
  const [msg,setMsg]=useState("");
  const [detail,setDetail]=useState([]);
  const [pulling,setPulling]=useState(false);
  const [pullMsg,setPullMsg]=useState("");
  const [pullOk,setPullOk]=useState(false);

  // Parse DD/MM/YY date string to ISO with AEST offset
  const toISO=(s,eod=false)=>{
    const [d,m,y]=s.trim().split("/");
    return `20${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}T${eod?"23:59:59":"00:00:00"}+10:00`;
  };

  // Apply discount codes from API response directly to week.codeData
  const applyCodeData=(apiCodes,existing)=>{
    const normalise=s=>s.replace(/[-_\s]/g,"").toUpperCase();
    const newCodeData={...existing};
    apiCodes.forEach(({code,amount,orders})=>{
      const reg=DISCOUNT_CODE_REGISTRY.find(c=>c.id===code||normalise(c.id)===normalise(code));
      if(reg){
        newCodeData[reg.id]={...newCodeData[reg.id],orders:String(orders),retailValue:amount>0?String(amount.toFixed(2)):"",active:true};
      } else if(amount>0||orders>0){
        const ex=newCodeData["__promo__"]||{};
        newCodeData["__promo__"]={
          ...ex,
          orders:String((parseInt(ex.orders)||0)+orders),
          retailValue:String(((parseFloat(ex.retailValue)||0)+amount).toFixed(2)),
          customCodes:((ex.customCodes||"")+", "+code).replace(/^,\s*/,""),
        };
      }
    });
    return newCodeData;
  };

  const pullFromShopify=async()=>{
    const creds=settings?.shopify;
    if(!creds?.accessToken){
      setPullMsg("Connect Shopify in Settings → Shopify first");setPullOk(false);return;
    }
    const parts=week.dateRange?.split(" - ");
    if(!parts||parts.length!==2){setPullMsg("No date range on this week");setPullOk(false);return;}
    setPulling(true);setPullMsg("Pulling from Shopify...");
    try{
      const res=await fetch("/api/shopify",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          accessToken:creds.accessToken,
          startDate:toISO(parts[0]),
          endDate:toISO(parts[1],true),
        }),
      });
      const data=await res.json();
      if(!res.ok){setPullMsg(data.error||"Pull failed");setPullOk(false);setPulling(false);return;}
      const{revenue,orderCount,discountCodes}=data;
      const newCodeData=applyCodeData(discountCodes||[],week.codeData||emptyCodeData());
      onChange({
        ...week,
        revenue:{...week.revenue,
          gross_sales:String(revenue.gross_sales),
          refunds:String(revenue.refunds),
          discounts:String(revenue.discounts),
          shipping_income:String(revenue.shipping_income),
        },
        cogs:{...week.cogs,satchel_count:String(orderCount)},
        codeData:newCodeData,
      });
      const codesFilled=(discountCodes||[]).length;
      setPullMsg(`Filled — ${orderCount} orders · ${codesFilled} discount code${codesFilled!==1?"s":""}  mapped`);
      setPullOk(true);
    }catch(e){setPullMsg("Error: "+e.message);setPullOk(false);}
    setPulling(false);
  };
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
  const hasShopifyCreds=!!settings?.shopify?.accessToken;
  return(
    <div style={{background:S2,border:"1px solid "+BR,borderRadius:radius+2,padding:"16px 18px",marginBottom:20}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div style={{fontFamily:ff,fontSize:10,letterSpacing:2,textTransform:"uppercase",color:A}}>
          <E value={labels.sec_shopify} onSave={v=>labels._save("sec_shopify",v)} style={{fontFamily:ff,fontSize:10,color:A}}/>
        </div>
        {hasShopifyCreds&&(
          <button onClick={pullFromShopify} disabled={pulling}
            style={{padding:"8px 18px",background:pulling?"transparent":A,border:"1px solid "+A,color:pulling?A:"#ffffff",fontFamily:ff,fontSize:11,cursor:pulling?"wait":"pointer",borderRadius:radius,fontWeight:"bold",letterSpacing:1,opacity:pulling?0.7:1,display:"flex",alignItems:"center",gap:7}}>
            {pulling&&<span style={{display:"inline-block",width:10,height:10,border:"2px solid "+A,borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.7s linear infinite"}}/>}
            {pulling?"PULLING...":"PULL FROM SHOPIFY"}
          </button>
        )}
      </div>
      {pullMsg&&<div style={{fontFamily:ff,fontSize:11,color:pullOk?GR:RD,marginBottom:10,padding:"7px 10px",background:(pullOk?GR:RD)+"18",borderRadius:radius,border:"1px solid "+(pullOk?GR:RD)+"44"}}>{pullMsg}</div>}
      {!hasShopifyCreds&&(
        <div style={{fontFamily:ff,fontSize:11,color:MU,marginBottom:10,padding:"7px 10px",background:S,borderRadius:radius,border:"1px solid "+BR}}>
          Add Shopify credentials in <strong style={{color:A}}>Settings → Shopify</strong> to enable one-click data pull.
        </div>
      )}
      <div style={{fontFamily:ff,fontSize:9,color:MU,letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Or paste manually</div>
      <textarea value={raw} onChange={e=>setRaw(e.target.value)} placeholder="Paste Shopify CSV or tab-separated export here..." rows={3}
        style={{width:"100%",boxSizing:"border-box",background:S,border:"1px solid "+BR,color:TX,padding:"10px 12px",fontFamily:"monospace",fontSize:12,outline:"none",borderRadius:radius,resize:"vertical"}}/>
      <div style={{display:"flex",alignItems:"center",gap:12,marginTop:10,flexWrap:"wrap"}}>
        <button onClick={apply} style={{padding:"8px 18px",background:A,border:"none",color:"#ffffff",fontFamily:ff,fontSize:12,cursor:"pointer",borderRadius:radius,fontWeight:"bold",letterSpacing:1}}>
          <E value={labels.sec_shopify_btn} onSave={v=>labels._save("sec_shopify_btn",v)} style={{fontFamily:ff,fontSize:12,color:"#ffffff"}}/>
        </button>
        {msg&&<span style={{fontFamily:ff,fontSize:12,color:msg.includes("No")?RD:GR}}>{msg}{detail.length?<span style={{color:MU,fontSize:11}}> ({detail.join(", ")})</span>:null}</span>}
      </div>
    </div>
  );
}

// ─── Product Margin Import ────────────────────────────────────────────────────
function MetricsGuide({target}){
  const {S2,S,BR,A,MU,TX,ff,GR,RD,radius}=useTheme();
  const [open,setOpen]=useState(false);
  const [active,setActive]=useState(null);
  const metrics=[
    {id:"contribMargin",name:"Contribution Margin",
      what:"After every variable cost — product manufacturing, shipping, pick & pack, tariffs — what % remains to cover fixed costs like wages and rent. The true measure of whether a product is worth selling.",
      good:`Above ${target}% — each unit genuinely contributes toward overhead and profit.`,
      bad:"Low contribution margin means even high volume leaves you barely breaking even.",
      action:"Only scale products with healthy contribution margins. Low contrib means scaling loses more money.",color:GR},
    {id:"actualMargin",name:"Actual Gross Margin",
      what:`The real % of each sale left after paying for the product. ${target}% means you keep ${target}c from every $1 sold to cover all other costs.`,
      good:`Above ${target}% — leaves room to pay wages, freight, rent, and still profit.`,
      bad:`Below ${target}% — not making enough gross profit to cover running costs.`,
      action:"Raise retail price, cut manufacturing cost, or stop discounting this product.",color:GR},
    {id:"modelledMargin",name:"Modelled Margin",
      what:"What the margin should be at full retail price, based on your cost inputs. Your theoretical best-case — if this is already below target, no promotion should ever run.",
      good:"Well above your target — room to discount without going underwater.",
      bad:"Below target even at full price — the product costs are structurally too high.",
      action:"Fix the cost structure first: renegotiate manufacturing, reduce shipping, or raise retail price.",color:"#7dd3fc"},
    {id:"breakEven",name:"Break-even Price",
      what:`The lowest retail price at which this product hits your ${target}% target margin. Calculated from: Variable Cost / (1 - Target%). This is your absolute pricing floor.`,
      good:"Current retail price is well above this number.",
      bad:"Retail price is close to or below break-even — every sale is subsidised.",
      action:"Never run a discount that brings effective price below this number.",color:"#c4b5fd"},
    {id:"discRate",name:"Discount Rate",
      what:"What % of gross sales was given away as discounts. High discount rates erode perceived value and train customers to never pay full price.",
      good:"Under 10% — occasional healthy promotion.",
      bad:"Over 20% — customers are waiting for sales. You're competing with yourself.",
      action:"Audit which codes are hitting this product. Exclude high-margin products from blanket sitewide sales.",color:RD},
    {id:"variance",name:"Variance (Actual vs Modelled)",
      what:"Actual margin minus Modelled margin. Shows how much real-world results deviated from the model — caused by discounts, returns, or a different sales mix.",
      good:"Near 0% — your model is accurate and operations are clean.",
      bad:"Negative variance over 5% means discounts or returns are eating margin more than expected.",
      action:"Dig into which discount codes hit this product. Check return rate.",color:"#f59e0b"},
  ];
  return(
    <div style={{borderTop:"1px solid "+BR+"44"}}>
      <div onClick={()=>setOpen(o=>!o)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 20px",cursor:"pointer",userSelect:"none",background:S2}}>
        <div>
          <div style={{fontFamily:ff,fontSize:12,color:open?A:TX,fontWeight:"bold",letterSpacing:1,textTransform:"uppercase"}}>Metrics Guide</div>
          <div style={{fontFamily:ff,fontSize:10,color:MU,marginTop:1}}>What every number means and what to do about it</div>
        </div>
        <span style={{fontFamily:ff,fontSize:11,color:MU}}>{open?"−":"+"}</span>
      </div>
      {open&&(
        <div style={{padding:"0 20px 20px",background:S2}}>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16,paddingTop:4}}>
            {metrics.map(m=>(
              <button key={m.id} onClick={()=>setActive(active===m.id?null:m.id)}
                style={{padding:"6px 12px",background:active===m.id?m.color+"22":"transparent",border:"1px solid "+(active===m.id?m.color:BR),color:active===m.id?m.color:MU,fontFamily:ff,fontSize:10,cursor:"pointer",borderRadius:20,transition:"all 0.15s"}}>
                {m.name}
              </button>
            ))}
          </div>
          {!active&&(
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:10}}>
              {metrics.map(m=>(
                <div key={m.id} onClick={()=>setActive(m.id)}
                  style={{background:S,border:"1px solid "+BR+"44",borderRadius:radius+2,padding:"14px 16px",cursor:"pointer",borderLeft:"3px solid "+m.color}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=m.color} onMouseLeave={e=>e.currentTarget.style.borderColor=BR+"44"}>
                  <div style={{fontFamily:ff,fontSize:12,color:TX,fontWeight:"bold",marginBottom:6}}>{m.name}</div>
                  <div style={{fontFamily:ff,fontSize:11,color:MU,lineHeight:1.6,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{m.what}</div>
                  <div style={{fontFamily:ff,fontSize:9,color:m.color,marginTop:8,letterSpacing:0.5}}>Click for detail →</div>
                </div>
              ))}
            </div>
          )}
          {active&&(()=>{
            const m=metrics.find(x=>x.id===active);
            if(!m)return null;
            return(
              <div style={{background:S,border:"1px solid "+m.color+"55",borderRadius:radius+2,padding:"20px 24px",borderLeft:"4px solid "+m.color}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
                  <div style={{fontFamily:ff,fontSize:15,color:TX,fontWeight:"bold"}}>{m.name}</div>
                  <button onClick={()=>setActive(null)} style={{background:"transparent",border:"none",color:MU,fontSize:18,cursor:"pointer",lineHeight:1}}>×</button>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:10}}>
                  {[
                    {label:"What it measures",text:m.what,color:A},
                    {label:"Healthy looks like",text:m.good,color:GR},
                    {label:"Warning sign",text:m.bad,color:RD},
                    {label:"What to do",text:m.action,color:"#f59e0b"},
                  ].map(({label,text,color})=>(
                    <div key={label} style={{padding:"12px 14px",background:S2,borderRadius:radius,borderTop:"2px solid "+color+"66"}}>
                      <div style={{fontFamily:ff,fontSize:9,color:color,letterSpacing:0.8,textTransform:"uppercase",marginBottom:6}}>{label}</div>
                      <div style={{fontFamily:ff,fontSize:12,color:TX,lineHeight:1.7}}>{text}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}


// ─── Inline Editable Label ────────────────────────────────────────────────────
function InlineLabel({value,onSave,style={},tag="span"}){
  const {A,BR,TX,ff,radius}=useTheme();
  const [editing,setEditing]=useState(false);
  const [val,setVal]=useState(value);
  const commit=()=>{if(val.trim())onSave(val.trim());setEditing(false);};
  if(editing)return(
    <input autoFocus value={val} onChange={e=>setVal(e.target.value)}
      onBlur={commit} onKeyDown={e=>{if(e.key==="Enter")commit();if(e.key==="Escape"){setVal(value);setEditing(false);}}}
      style={{background:"transparent",border:"none",borderBottom:"1px solid "+A,color:TX,fontFamily:ff,outline:"none",padding:"0 2px",fontSize:"inherit",fontWeight:"inherit",letterSpacing:"inherit",...style}}/>
  );
  return <span onDoubleClick={()=>{setVal(value);setEditing(true);}} title="Double-click to rename" style={{cursor:"text",...style}}>{value}</span>;
}

// ─── Cost Stack Bar ───────────────────────────────────────────────────────────
function CostStackBar({product,catEntry,customCosts,satchelPerOrder,target,ff,MU,TX,BR,A,GR,RD,S,S2,radius}){
  const [showDetail,setShowDetail]=useState(false);
  const c=catEntry(product.product);
  const avgRetail=product.units>0?product.gross/product.units:0;
  if(avgRetail<=0)return null;

  const cogsUnit=product.avgCogsUnit||0;
  const pickPack=c.pickPack||0;
  const satchel=satchelPerOrder||0;
  const avgShipping=(c.shippingAU||8)*0.7+(c.shippingUS||18)*0.2+(c.shippingIntl||22)*0.1;
  const tariff=cogsUnit*((c.tariffPct||0)/100);

  // Custom cost fields — each can be $ or %
  const customTotal=(customCosts||[]).reduce((sum,cf)=>{
    const v=parseFloat(c["custom_"+cf.id])||0;
    return sum+(cf.type==="%"?avgRetail*(v/100):v);
  },0);

  const totalVarCost=cogsUnit+pickPack+satchel+avgShipping+tariff+customTotal;
  const grossProfitUnit=avgRetail-totalVarCost;
  const marginPct=avgRetail>0?(grossProfitUnit/avgRetail)*100:0;

  const COLORS=["#c084fc","#60a5fa","#34d399","#fbbf24","#f87171","#a78bfa","#fb923c","#38bdf8","#4ade80","#facc15"];

  const segments=[
    {label:"Manufacturing COGS",value:cogsUnit,color:"#c084fc"},
    {label:"Outbound Shipping",value:avgShipping,color:"#60a5fa"},
    {label:"Pick & Pack",value:pickPack,color:"#34d399"},
    {label:"Satchel / Packaging",value:satchel,color:"#fbbf24"},
    tariff>0?{label:"US Tariff",value:tariff,color:"#f87171"}:null,
    ...(customCosts||[]).map((cf,i)=>{
      const v=parseFloat(c["custom_"+cf.id])||0;
      const dollar=cf.type==="%"?avgRetail*(v/100):v;
      return dollar>0?{label:cf.name,value:dollar,color:COLORS[(i+5)%COLORS.length]}:null;
    }),
    {label:"Gross Profit",value:Math.max(0,grossProfitUnit),color:marginPct>=target?"#6bffb8":"#ff6b6b"},
  ].filter(Boolean);

  const totalForBar=segments.reduce((s,x)=>s+x.value,0);
  const fmt2=v=>"$"+Math.abs(v).toFixed(2);
  const pct2=v=>avgRetail>0?(v/avgRetail*100).toFixed(1)+"%":"-";

  return(
    <div style={{background:S,border:"1px solid "+BR,borderRadius:radius+2,marginBottom:10,overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderBottom:"1px solid "+BR+"33",cursor:"pointer"}} onClick={()=>setShowDetail(d=>!d)}>
        <div style={{flex:1}}>
          <div style={{fontFamily:ff,fontSize:13,color:TX,fontWeight:"500"}}>{product.product}</div>
          <div style={{fontFamily:ff,fontSize:10,color:MU,marginTop:1}}>{product.units} units · avg retail {fmt2(avgRetail)}</div>
        </div>
        <div style={{textAlign:"right",marginRight:4}}>
          <div style={{fontFamily:ff,fontSize:14,color:marginPct>=target?GR:RD,fontWeight:"bold"}}>{marginPct.toFixed(1)}%</div>
          <div style={{fontFamily:ff,fontSize:9,color:MU}}>margin</div>
        </div>
        <span style={{fontFamily:ff,fontSize:14,color:MU}}>{showDetail?"−":"+"}</span>
      </div>

      <div style={{padding:"14px 16px"}}>
        <div style={{fontFamily:ff,fontSize:8,color:MU,letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Retail price breakdown — per unit avg</div>
        <div style={{display:"flex",height:28,borderRadius:3,overflow:"hidden",marginBottom:8}}>
          {segments.map((seg,i)=>{
            const w=totalForBar>0?(seg.value/totalForBar)*100:0;
            return w>0?<div key={i} title={seg.label+": "+fmt2(seg.value)+" ("+pct2(seg.value)+")"} style={{width:w+"%",background:seg.color}}/>:null;
          })}
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:"6px 16px"}}>
          {segments.map((seg,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:5}}>
              <div style={{width:9,height:9,borderRadius:1,background:seg.color,flexShrink:0}}/>
              <span style={{fontFamily:ff,fontSize:10,color:MU}}>{seg.label}</span>
              <span style={{fontFamily:ff,fontSize:10,color:TX,fontWeight:"500"}}>{fmt2(seg.value)}</span>
              <span style={{fontFamily:ff,fontSize:9,color:MU}}>({pct2(seg.value)})</span>
            </div>
          ))}
        </div>
        <div style={{marginTop:10,display:"flex",alignItems:"center",gap:8}}>
          <div style={{flex:1,height:1,background:BR}}/>
          <div style={{fontFamily:ff,fontSize:9,color:MU,whiteSpace:"nowrap"}}>target {target}% → floor {fmt2(avgRetail*(target/100))} / unit</div>
          <div style={{flex:1,height:1,background:BR}}/>
        </div>
      </div>

      {showDetail&&(
        <div style={{padding:"0 16px 16px",borderTop:"1px solid "+BR+"33"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:8,marginTop:12}}>
            {[
              {l:"Avg Retail Price",v:fmt2(avgRetail),c:A},
              {l:"Total Variable Cost",v:fmt2(totalVarCost),c:MU},
              {l:"Gross Profit/unit",v:fmt2(grossProfitUnit),c:grossProfitUnit>=0?GR:RD},
              {l:"Modelled Margin",v:marginPct.toFixed(1)+"%",c:marginPct>=target?GR:RD},
              {l:"Actual Margin",v:product.netSales>0?product.marginPct.toFixed(1)+"%":"GIFTED",c:(product.netSales>0&&product.marginPct>=target)?GR:RD},
              {l:"Disc Rate",v:product.discRate.toFixed(1)+"%",c:product.discRate>20?RD:MU},
            ].map(({l,v,c})=>(
              <div key={l} style={{background:S2,borderRadius:radius,padding:"8px 10px"}}>
                <div style={{fontFamily:ff,fontSize:8,color:MU,textTransform:"uppercase",letterSpacing:0.5,marginBottom:2}}>{l}</div>
                <div style={{fontFamily:ff,fontSize:13,color:c,fontWeight:"bold"}}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{marginTop:10}}>
            <div style={{fontFamily:ff,fontSize:8,color:MU,letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Discount viability</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {[10,15,20,25].map(d=>{
                const dp=avgRetail*(1-d/100);
                const m=dp>0?((dp-totalVarCost)/dp)*100:0;
                const viable=m>=target;
                return(
                  <div key={d} style={{background:viable?GR+"18":RD+"18",border:"1px solid "+(viable?GR+"44":RD+"44"),borderRadius:radius,padding:"6px 10px",textAlign:"center",minWidth:60}}>
                    <div style={{fontFamily:ff,fontSize:9,color:MU}}>@{d}% off</div>
                    <div style={{fontFamily:ff,fontSize:12,color:viable?GR:RD,fontWeight:"bold"}}>{m.toFixed(1)}%</div>
                    <div style={{fontFamily:ff,fontSize:8,color:viable?GR:RD}}>{viable?"Safe":"Too low"}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────
function ConfirmModal({message,onConfirm,onCancel}){
  const {BG,S2,BR,A,RD,MU,TX,ff,radius}=useTheme();
  return(
    <div style={{position:"fixed",inset:0,zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div onClick={onCancel} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.5)"}}/>
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
    const isMonthly=fixed?.monthlyFixedKeys?.includes(key);
    const hasFixed=isFixed&&n(fixed?.values?.[key])>0;
    const hasMonthly=isMonthly&&n(fixed?.monthlyValues?.[key])>0;
    const weekHasVal=week.opex?.[key]!=="";
    const tint=!weekHasVal&&(hasFixed||hasMonthly)?A+"22":undefined;
    const displayVal=weekHasVal?week.opex[key]:hasFixed?fixed.values[key]:hasMonthly?(n(fixed.monthlyValues[key])/4).toFixed(2):"";
    return(
      <Fld key={key} label={<E value={label} onSave={nl=>renameOpex(key,nl)} style={{fontFamily:ff,fontSize:11,color:MU,textTransform:"uppercase",letterSpacing:0.8}}/>}>
        <CI value={displayVal} onChange={v=>upO(key,v)} tint={tint}/>
        {!weekHasVal&&hasMonthly&&<div style={{fontFamily:ff,fontSize:9,color:MU,marginTop:2}}>÷4 of {fmtD(n(fixed.monthlyValues[key]))}/mo</div>}
      </Fld>
    );
  };

  return(
    <div>
      <ShopifyImport week={week} onChange={onChange} labels={labels} settings={settings}/>

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
          <div style={{marginTop:10,background:RD+"15",border:"1px solid "+RD+"44",borderRadius:radius+1,padding:"10px 14px"}}>
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
        {/* AusPost: domestic + international calculator */}
        {(()=>{
          const dom=n(week.opex?.auspost_domestic||0);
          const intl=n(week.opex?.auspost_intl||0);
          const total=dom+intl||n(week.opex?.auspost||0);
          return(
            <div style={{background:S2,border:"1px solid "+BR+"88",borderRadius:radius+1,padding:"12px 14px",marginBottom:10}}>
              <div style={{fontFamily:ff,fontSize:10,color:A,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10}}>AusPost (Total: {fmtD(total)})</div>
              <Grid>
                <Fld label={<span style={{fontFamily:ff,fontSize:11,color:MU,textTransform:"uppercase",letterSpacing:0.8}}>Domestic</span>}>
                  <CI value={week.opex?.auspost_domestic||""} onChange={v=>{
                    const newDom=n(v); const newIntl=n(week.opex?.auspost_intl||0);
                    onChange({...week,opex:{...week.opex,auspost_domestic:v,auspost_intl:week.opex?.auspost_intl||"",auspost:""}});
                  }}/>
                </Fld>
                <Fld label={<span style={{fontFamily:ff,fontSize:11,color:MU,textTransform:"uppercase",letterSpacing:0.8}}>International</span>}>
                  <CI value={week.opex?.auspost_intl||""} onChange={v=>{
                    onChange({...week,opex:{...week.opex,auspost_intl:v,auspost_domestic:week.opex?.auspost_domestic||"",auspost:""}});
                  }}/>
                </Fld>
              </Grid>
              {(dom>0||intl>0)&&<div style={{fontFamily:ff,fontSize:11,color:A,marginTop:8}}>Total AusPost: {fmtD(dom+intl)}</div>}
            </div>
          );
        })()}
        <Grid>{freightKeys.filter(k=>!k.sub&&!k.computed&&k.key!=="auspost").map(({key,label})=>opexField(key,label))}</Grid>
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
      <textarea value={week.notes} onChange={e=>onChange({...week,notes:sanitize.text(e.target.value)})} placeholder="Unusual costs, one-offs, events..." rows={3}
        style={{width:"100%",boxSizing:"border-box",background:S,border:"1px solid "+BR,color:TX,padding:"10px 12px",fontFamily:ff,fontSize:14,outline:"none",borderRadius:radius,resize:"vertical"}}/>

      {/* Data Validation Warnings */}
      {(()=>{
        const {warnings}=validateWeek(week);
        if(!warnings.length)return null;
        return(
          <div style={{marginTop:12,background:YL+"0f",border:"1px solid "+YL+"44",borderRadius:radius+1,padding:"12px 16px"}}>
            <div style={{fontFamily:ff,fontSize:10,color:YL,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8}}>Data Validation</div>
            {warnings.map((w,i)=>(
              <div key={i} style={{fontFamily:ff,fontSize:12,color:YL+"cc",marginBottom:4,lineHeight:1.5}}>⚠ {w}</div>
            ))}
          </div>
        );
      })()}

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
          <button onClick={applyDiscShopify} style={{padding:"7px 16px",background:A,border:"none",color:"#ffffff",fontFamily:ff,fontSize:11,cursor:"pointer",borderRadius:radius,fontWeight:"bold",letterSpacing:1}}>AUTOFILL FROM DATA</button>
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
                        {code.hasCOGS&&<Fld label={<span style={{fontFamily:ff,fontSize:10,color:MU,textTransform:"uppercase",letterSpacing:0.6}}>Mfg COGS</span>}><CI value={d.cogsValue} onChange={v=>upCode(code.id,"cogsValue",v)}/></Fld>}
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
  const {S,S2,BR,A,MU,TX,GR,BG,ff,radius}=useTheme();
  const keys=opexKeys||DEFAULT_OPEX_KEYS;
  const displayKeys=keys.filter(k=>!k.sub); // hide sub-keys from fixed costs
  const fixedKeys=fixed?.fixedKeys||[];
  const monthlyFixedKeys=fixed?.monthlyFixedKeys||[];
  const toggleWeekly=k=>{
    const nk=fixedKeys.includes(k)?fixedKeys.filter(x=>x!==k):[...fixedKeys,k];
    // remove from monthly if adding to weekly
    const nm=monthlyFixedKeys.filter(x=>x!==k);
    onChange({...fixed,fixedKeys:nk,monthlyFixedKeys:nm});
  };
  const toggleMonthly=k=>{
    const nm=monthlyFixedKeys.includes(k)?monthlyFixedKeys.filter(x=>x!==k):[...monthlyFixedKeys,k];
    // remove from weekly if adding to monthly
    const nk=fixedKeys.filter(x=>x!==k);
    onChange({...fixed,fixedKeys:nk,monthlyFixedKeys:nm});
  };
  const renameKey=(key,nl)=>{if(onSettingsChange){const nk=keys.map(k=>k.key===key?{...k,label:nl}:k);onSettingsChange({...settings,opexKeys:nk});}};

  const weeklyTotal=displayKeys.reduce((s,{key})=>s+n(fixed?.values?.[key]||0),0);
  const monthlyTotal=displayKeys.reduce((s,{key})=>s+n(fixed?.monthlyValues?.[key]||0),0);
  const weeklyFromMonthly=monthlyTotal/4;
  const totalWeeklyImpact=weeklyTotal+weeklyFromMonthly;

  const renderGroup=(groupKeys,titleLabelKey,part)=>(
    <div style={{marginBottom:16}}>
      <SH sub><E value={labels[titleLabelKey]||groupKeys[0]?.group||"Group"} onSave={v=>labels._save(titleLabelKey,v)} style={{color:"inherit",fontFamily:ff}}/></SH>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8}}>
        {groupKeys.filter(k=>!k.sub).map(({key,label})=>{
          const isW=fixedKeys.includes(key);
          const isM=monthlyFixedKeys.includes(key);
          const isActive=part==="weekly"?isW:isM;
          const val=part==="weekly"?(fixed?.values?.[key]||""):(fixed?.monthlyValues?.[key]||"");
          const weeklyAmt=isM?n(fixed?.monthlyValues?.[key]||0)/4:0;
          return(
            <div key={key} style={{background:isActive?A+"22":S2,border:"1px solid "+(isActive?A:BR),borderRadius:radius+1,padding:"10px 12px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <E value={label} onSave={nl=>renameKey(key,nl)} style={{fontFamily:ff,fontSize:11,color:isActive?A:MU,textTransform:"uppercase",letterSpacing:0.8}}/>
                <button
                  onClick={()=>part==="weekly"?toggleWeekly(key):toggleMonthly(key)}
                  style={{background:isActive?A:"transparent",border:"1px solid "+(isActive?A:BR),color:isActive?"#ffffff":MU,padding:"2px 8px",fontFamily:ff,fontSize:9,cursor:"pointer",borderRadius:radius,letterSpacing:1,whiteSpace:"nowrap",marginLeft:8,textTransform:"uppercase"}}>
                  {isActive?"Active":"Set"}
                </button>
              </div>
              <CI value={val} onChange={v=>part==="weekly"
                ?onChange({...fixed,values:{...(fixed.values||{}), [key]:v}})
                :onChange({...fixed,monthlyValues:{...(fixed.monthlyValues||{}), [key]:v}})}/>
              {part==="monthly"&&isM&&weeklyAmt>0&&(
                <div style={{fontFamily:ff,fontSize:9,color:A,marginTop:4}}>= {fmtD(weeklyAmt)}/week</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderPart=(title,subtitle,part,accentColor)=>(
    <div style={{background:S,border:"2px solid "+(accentColor||A)+"44",borderRadius:radius+4,padding:"20px 24px",marginBottom:24}}>
      <div style={{marginBottom:4}}>
        <div style={{fontFamily:ff,fontSize:11,letterSpacing:2,color:accentColor||A,textTransform:"uppercase",fontWeight:"bold",marginBottom:4}}>{title}</div>
        <div style={{fontFamily:ff,fontSize:11,color:MU,marginBottom:16,lineHeight:1.6}}>{subtitle}</div>
      </div>
      {renderGroup(displayKeys.filter(k=>k.group==="freight"),"sec_freight",part)}
      {renderGroup(displayKeys.filter(k=>k.group==="collabs"),"sec_collabs",part)}
      {renderGroup(displayKeys.filter(k=>k.group==="general"),"sec_general",part)}
    </div>
  );

  return(
    <div>
      {/* Satchel cost */}
      <div style={{background:S2,border:"1px solid "+BR,borderRadius:radius+1,padding:"12px 16px",marginBottom:24}}>
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

      {renderPart("Part 1 — Weekly Fixed Costs","Costs that recur every week at the same amount. Each active item auto-fills the weekly input at its full value.","weekly",A)}

      {renderPart("Part 2 — Monthly Fixed Costs","Costs billed monthly. Each active item auto-fills the weekly input at 1/4 of the monthly amount, shown below the field.","monthly","#7dd3fc")}

      {/* Summary */}
      <div style={{padding:"16px 20px",background:S2,border:"1px solid "+BR,borderRadius:radius+2}}>
        <div style={{fontFamily:ff,fontSize:10,letterSpacing:1.5,color:A,textTransform:"uppercase",marginBottom:12}}>Weekly Cost Summary</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}>
          <div style={{background:BG,borderRadius:radius,padding:"10px 14px",borderLeft:"3px solid "+A}}>
            <div style={{fontFamily:ff,fontSize:9,color:MU,textTransform:"uppercase",letterSpacing:0.7,marginBottom:4}}>Weekly Fixed ({fixedKeys.length} items)</div>
            <div style={{fontFamily:ff,fontSize:16,color:A,fontWeight:"bold"}}>{fmtD(weeklyTotal)}</div>
            <div style={{fontFamily:ff,fontSize:10,color:MU,marginTop:2}}>fills at full amount each week</div>
          </div>
          <div style={{background:BG,borderRadius:radius,padding:"10px 14px",borderLeft:"3px solid "+A}}>
            <div style={{fontFamily:ff,fontSize:9,color:MU,textTransform:"uppercase",letterSpacing:0.7,marginBottom:4}}>Monthly Fixed ({monthlyFixedKeys.length} items)</div>
            <div style={{fontFamily:ff,fontSize:16,color:A,fontWeight:"bold"}}>{fmtD(monthlyTotal)}/mo</div>
            <div style={{fontFamily:ff,fontSize:10,color:MU,marginTop:2}}>{fmtD(weeklyFromMonthly)}/week (÷4)</div>
          </div>
          <div style={{background:BG,borderRadius:radius,padding:"10px 14px",borderLeft:"3px solid "+GR}}>
            <div style={{fontFamily:ff,fontSize:9,color:MU,textTransform:"uppercase",letterSpacing:0.7,marginBottom:4}}>Total Weekly Auto-Fill</div>
            <div style={{fontFamily:ff,fontSize:16,color:GR,fontWeight:"bold"}}>{fmtD(totalWeeklyImpact)}</div>
            <div style={{fontFamily:ff,fontSize:10,color:MU,marginTop:2}}>auto-applied to every week</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Settings Page ────────────────────────────────────────────────────────────
const FONT_OPTIONS=["Times New Roman","Georgia","Garamond","Palatino","Helvetica","Arial","Inter","system-ui","monospace","Courier New"];
const COLOR_PRESETS=[
  {name:"Default",theme:{accent:"#d8b9ff",bg:"#0a0a0e",surface:"#12111a",surface2:"#1a1826",border:"#2a2540",text:"#e0e0e0",muted:"#777777",red:"#ff6b6b",green:"#6bffb8",yellow:"#ffd97d",lightness:50}},
  {name:"Notion Light",theme:{accent:"#2383e2",bg:"#ffffff",surface:"#f7f7f5",surface2:"#efefef",border:"#e3e2e0",text:"#191919",muted:"#9b9b9b",red:"#eb5757",green:"#0f9153",yellow:"#d9730d",lightness:50,bodyFont:"Inter",titleFont:"Inter",borderRadius:6}},
  {name:"Deep Ocean",theme:{accent:"#7dd3fc",bg:"#020617",surface:"#0f172a",surface2:"#1e293b",border:"#334155",text:"#e2e8f0",muted:"#64748b",red:"#f87171",green:"#34d399",yellow:"#fbbf24",lightness:50}},
  {name:"Forest",theme:{accent:"#86efac",bg:"#030712",surface:"#0f1b12",surface2:"#172018",border:"#2d4a32",text:"#dcfce7",muted:"#6b7280",red:"#fca5a5",green:"#86efac",yellow:"#fde68a",lightness:50}},
  {name:"Rose",theme:{accent:"#fda4af",bg:"#0c0a0b",surface:"#1a1016",surface2:"#231520",border:"#4a2030",text:"#fce7f3",muted:"#9d8090",red:"#fb7185",green:"#6ee7b7",yellow:"#fde68a",lightness:50}},
  {name:"Slate",theme:{accent:"#94a3b8",bg:"#0f0f0f",surface:"#161616",surface2:"#1e1e1e",border:"#2a2a2a",text:"#d4d4d4",muted:"#737373",red:"#f87171",green:"#86efac",yellow:"#fcd34d",lightness:50}},
];

function SettingsPage({settings,onSettingsChange,theme,onThemeChange,labels,onLabelsSave}){
  const {S2,BR,A,MU,TX,GR,RD,YL,ff,radius}=useTheme();
  const [themeEdit,setThemeEdit]=useState({...DEFAULT_THEME,...theme});
  const [activeTab,setActiveTab]=useState("appearance");
  const [staff,setStaff]=useState(settings?.staff||DEFAULT_STAFF);
  const [targets,setTargets]=useState(labels?._targets||DEFAULT_TARGETS);
  const [saved,setSaved]=useState(false);
  const [shopCreds,setShopCreds]=useState({accessToken:settings?.shopify?.accessToken||""});
  const [shopMsg,setShopMsg]=useState(settings?.shopify?.accessToken?"Connected — Shopify is ready":"");
  const [shopMsgOk,setShopMsgOk]=useState(!!settings?.shopify?.accessToken);
  const [shopTesting,setShopTesting]=useState(false);
  // Keep targets in sync when labels (loaded from storage) update
  useEffect(()=>{if(labels?._targets)setTargets({...DEFAULT_TARGETS,...labels._targets});},[labels?._targets]);
  const apply=()=>{onThemeChange(themeEdit);setSaved(true);setTimeout(()=>setSaved(false),2000);};
  const reset=()=>{setThemeEdit({...DEFAULT_THEME});onThemeChange({...DEFAULT_THEME});};
  const updateStaff=ns=>{setStaff(ns);onSettingsChange({...settings,staff:ns});};
  const addStaff=()=>updateStaff([...staff,{id:"s"+Date.now(),name:"New Staff",type:"casual",hourlyRate:25,hoursPerWeek:20,dept:"ops_retail"}]);
  const removeStaff=id=>updateStaff(staff.filter(s=>s.id!==id));
  const editStaff=(id,f,v)=>updateStaff(staff.map(s=>s.id===id?{...s,[f]:v}:s));
  const saveTargets=nt=>{setTargets(nt);if(onLabelsSave)onLabelsSave("_targets",nt);};
  const saveShopify=()=>{onSettingsChange({...settings,shopify:shopCreds});setShopMsg("Saved");setShopMsgOk(true);setTimeout(()=>setShopMsg(""),2500);};
  const disconnectShopify=()=>{const nc={...shopCreds,accessToken:""};setShopCreds(nc);onSettingsChange({...settings,shopify:nc});setShopMsg("Disconnected");setShopMsgOk(false);setTimeout(()=>setShopMsg(""),2500);};
  const testShopify=async()=>{
    const hasToken=shopCreds.accessToken?.trim();
    if(!hasToken){setShopMsg("No token — connect Shopify first");setShopMsgOk(false);return;}
    setShopTesting(true);setShopMsg("Testing...");
    try{
      const now=new Date(); const d=now.toISOString().split("T")[0];
      const r=await fetch("/api/shopify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accessToken:shopCreds.accessToken.trim(),startDate:d+"T00:00:00+10:00",endDate:d+"T01:00:00+10:00"})});
      const j=await r.json();
      if(!r.ok){setShopMsg(j.error||"Connection failed");setShopMsgOk(false);}
      else{setShopMsg("Connected — Shopify is ready");setShopMsgOk(true);}
    }catch(e){setShopMsg("Connection error: "+e.message);setShopMsgOk(false);}
    setShopTesting(false);
  };
  const inp={background:S2,border:"1px solid "+BR,color:TX,padding:"7px 10px",fontFamily:ff,fontSize:13,outline:"none",borderRadius:radius,width:"100%",boxSizing:"border-box"};
  const numInp={...inp,width:90,textAlign:"right"};
  return(
    <div>
      <div style={{display:"flex",gap:8,marginBottom:24,flexWrap:"wrap"}}>
        {["appearance","colours","targets","staff","shopify"].map(t=>(
          <button key={t} onClick={()=>setActiveTab(t)}
            style={{padding:"8px 16px",background:activeTab===t?A:"transparent",border:"1px solid "+(activeTab===t?A:BR),color:activeTab===t?"#ffffff":MU,fontFamily:ff,fontSize:11,cursor:"pointer",borderRadius:radius,letterSpacing:1,textTransform:"uppercase"}}>
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
            <button onClick={apply} style={{flex:1,padding:"11px 0",background:A,border:"none",color:"#ffffff",fontFamily:ff,fontSize:12,cursor:"pointer",borderRadius:radius,fontWeight:"bold",letterSpacing:1}}>{saved?"APPLIED!":"APPLY"}</button>
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
          <button onClick={apply} style={{marginTop:16,width:"100%",padding:"11px 0",background:A,border:"none",color:"#ffffff",fontFamily:ff,fontSize:12,cursor:"pointer",borderRadius:radius,fontWeight:"bold",letterSpacing:1}}>{saved?"APPLIED!":"APPLY COLOURS"}</button>
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
      {activeTab==="shopify"&&(
        <div>
          <SH>Shopify Integration</SH>
          <div style={{fontFamily:ff,fontSize:12,color:MU,marginBottom:20,lineHeight:1.8}}>
            Connect your Shopify store so you can pull weekly revenue, orders, and discount code data with one click — no manual copy-paste needed.
          </div>
          <div style={{background:S2,border:"1px solid "+BR,borderRadius:radius+2,padding:"16px 18px",marginBottom:16}}>
            <div style={{fontFamily:ff,fontSize:9,color:A,letterSpacing:2,textTransform:"uppercase",marginBottom:14}}>Store</div>
            <div style={{fontFamily:ff,fontSize:13,color:TX,padding:"7px 10px",background:S2,border:"1px solid "+BR,borderRadius:radius,opacity:0.6}}>fm2uclothing.myshopify.com</div>
          </div>
          <div style={{background:S2,border:"1px solid "+BR,borderRadius:radius+2,padding:"16px 18px",marginBottom:16}}>
            <div style={{fontFamily:ff,fontSize:9,color:A,letterSpacing:2,textTransform:"uppercase",marginBottom:14}}>Connection</div>
            {shopCreds.accessToken?(
              <div>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:GR,flexShrink:0}}/>
                  <span style={{fontFamily:ff,fontSize:13,color:GR,fontWeight:"bold"}}>Connected</span>
                  <span style={{fontFamily:ff,fontSize:11,color:MU}}>fm2uclothing.myshopify.com</span>
                </div>
                <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                  <button onClick={testShopify} disabled={shopTesting} style={{padding:"9px 18px",background:"transparent",border:"1px solid "+A,color:A,fontFamily:ff,fontSize:11,cursor:shopTesting?"wait":"pointer",borderRadius:radius,letterSpacing:1,opacity:shopTesting?0.6:1}}>
                    {shopTesting?"TESTING...":"TEST CONNECTION"}
                  </button>
                  <button onClick={disconnectShopify} style={{padding:"9px 18px",background:"transparent",border:"1px solid "+RD,color:RD,fontFamily:ff,fontSize:11,cursor:"pointer",borderRadius:radius,letterSpacing:1}}>DISCONNECT</button>
                  {shopMsg&&<span style={{fontFamily:ff,fontSize:12,color:shopMsgOk?GR:RD,alignSelf:"center"}}>{shopMsg}</span>}
                </div>
              </div>
            ):(
              <div>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:MU,flexShrink:0}}/>
                  <span style={{fontFamily:ff,fontSize:13,color:MU}}>Not connected</span>
                </div>
                <a href="/api/shopify-auth" style={{display:"inline-block",padding:"9px 22px",background:A,color:"#ffffff",fontFamily:ff,fontSize:11,textDecoration:"none",borderRadius:radius,fontWeight:"bold",letterSpacing:1}}>CONNECT WITH SHOPIFY</a>
                <div style={{fontFamily:ff,fontSize:11,color:MU,marginTop:10,lineHeight:1.6}}>
                  Clicking connect will open Shopify for you to approve access. You'll be redirected back automatically.
                </div>
                {shopMsg&&<div style={{fontFamily:ff,fontSize:12,color:RD,marginTop:8}}>{shopMsg}</div>}
              </div>
            )}
          </div>
          <div style={{background:S2,border:"1px solid "+BR,borderRadius:radius+2,padding:"14px 18px"}}>
            <div style={{fontFamily:ff,fontSize:9,color:MU,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>What gets pulled automatically</div>
            {[
              ["Revenue","Gross Sales, Refunds, Total Discounts, Shipping Income"],
              ["COGS","Order count (→ Satchel Count)"],
              ["Discount Codes","All codes used — mapped to your registry automatically"],
            ].map(([cat,desc])=>(
              <div key={cat} style={{display:"flex",gap:12,paddingBottom:8,borderBottom:"1px solid "+BR+"44",marginBottom:8}}>
                <div style={{fontFamily:ff,fontSize:11,color:A,minWidth:100,fontWeight:"bold"}}>{cat}</div>
                <div style={{fontFamily:ff,fontSize:11,color:MU}}>{desc}</div>
              </div>
            ))}
            <div style={{fontFamily:ff,fontSize:10,color:MU,marginTop:8,lineHeight:1.7}}>
              Tokens expire after 24 hours — a fresh one is fetched automatically every time you pull. Your credentials are stored locally and never shared.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Monthly Overview ─────────────────────────────────────────────────────────
function MonthlyOverview({weeks,fixed,extras,onExtrasChange,onExport,copied,opexKeys,depts,labels,monthKey,allMonthData}){
  const {S,S2,BR,A,MU,TX,ff,RD,GR,radius}=useTheme();
  const keys=opexKeys||DEFAULT_OPEX_KEYS;
  const wDepts=depts||DEFAULT_WAGE_DEPTS;
  const mc=calcMonth(weeks,fixed,extras,keys,wDepts);
  const monthDateRange=weeks.length>0?weeks[0].dateRange.split(" - ")[0]+" — "+weeks[weeks.length-1].dateRange.split(" - ")[1]:"";
  const [part2,setPart2]=useState(false);
  const [sumCopied,setSumCopied]=useState(false);
  const [rangeFrom,setRangeFrom]=useState("");
  const [rangeTo,setRangeTo]=useState("");
  const [useRange,setUseRange]=useState(false);

  // Parse dd/mm/yy date string to Date object
  const parseWkDate=s=>{if(!s)return null;const[d,m,y]=s.split("/");return new Date(2000+parseInt(y),parseInt(m)-1,parseInt(d));};

  // Collect all weeks across ALL saved months, sorted chronologically
  const getAllWeeks=()=>{
    if(!allMonthData)return weeks;
    const allKeys=Object.keys(allMonthData).sort();
    const out=[];
    allKeys.forEach(k=>{const md=allMonthData[k];if(md?.weeks)md.weeks.forEach(w=>out.push(w));});
    const seen=new Set();
    return out.filter(w=>{if(seen.has(w.dateRange))return false;seen.add(w.dateRange);return true;});
  };

  // Pro-rate weeks based on date range overlap -- searches ALL months when range active
  const calcFactor=(w,from,to)=>{
    const wStart=parseWkDate(w.dateRange.split(" - ")[0]);
    const wEnd=parseWkDate(w.dateRange.split(" - ")[1]);
    if(!wStart||!wEnd)return 0;
    wEnd.setHours(23,59,59);
    if(wEnd<from||wStart>to)return 0;
    if(wStart>=from&&wEnd<=to)return 1;
    const overlapStart=wStart<from?from:wStart;
    const overlapEnd=wEnd>to?to:wEnd;
    const overlapDays=Math.round((overlapEnd-overlapStart)/(1000*60*60*24));
    return Math.min(1,Math.max(0,overlapDays/7));
  };

  const getProRatedWeeks=()=>{
    if(!useRange||!rangeFrom||!rangeTo)return{weeks,factors:weeks.map(()=>1)};
    const from=new Date(rangeFrom),to=new Date(rangeTo);
    to.setHours(23,59,59);
    const sourceWeeks=getAllWeeks();
    const rangeWeeks=sourceWeeks.filter(w=>calcFactor(w,from,to)>0);
    const rangeFactors=rangeWeeks.map(w=>calcFactor(w,from,to));
    return{weeks:rangeWeeks,factors:rangeFactors};
  };

  const {weeks:rWeeks,factors}=getProRatedWeeks();
  const activeWeeks=useRange&&rangeFrom&&rangeTo?rWeeks:weeks;

  // Build pro-rated week calcs
  const proRatedCalc=(wc,factor)=>({
    netRevenue:wc.netRevenue*factor, totalCOGS:wc.totalCOGS*factor,
    grossProfit:wc.grossProfit*factor, totalOPEX:wc.totalOPEX*factor,
    totalWages:wc.totalWages*factor, totalFreight:wc.totalFreight*factor,
    totalCollabs:wc.totalCollabs*factor, totalExpenses:wc.totalExpenses*factor,
    netProfit:wc.netProfit*factor, totalDiscounts:wc.totalDiscounts*factor,
    truePromoDisc:wc.truePromoDisc*factor,
    grossMargin:wc.grossMargin, netMargin:wc.netMargin, // margins don't scale
    discReclass:{
      serviceRecoveryCOGS:(wc.discReclass?.serviceRecoveryCOGS||0)*factor,
      serviceRecoveryOrders:Math.round((wc.discReclass?.serviceRecoveryOrders||0)*factor),
      marketingDisc:(wc.discReclass?.marketingDisc||0)*factor,
      staffDisc:(wc.discReclass?.staffDisc||0)*factor,
      promoDisc:(wc.discReclass?.promoDisc||0)*factor,
      totalDiscounts:(wc.discReclass?.totalDiscounts||0)*factor,
    },
  });

  // When range spans multiple months, recalculate from activeWeeks
  const activeMc=useRange&&rangeFrom&&rangeTo
    ?calcMonth(activeWeeks,fixed,extras,keys,wDepts)
    :mc;
  const rCalcs=activeMc.weekCalcs.map((wc,i)=>proRatedCalc(wc,factors[i]));
  const rSum=f=>rCalcs.reduce((s,c)=>s+(c[f]||0),0);
  const rNetRev=rSum("netRevenue"),rGrossProfit=rSum("grossProfit"),rTotalCOGS=rSum("totalCOGS");
  const rTotalExpenses=rSum("totalExpenses"),rNetProfit=rSum("netProfit");
  const rGrossMargin=rNetRev>0?(rGrossProfit/rNetRev)*100:0;
  const rNetMargin=rNetRev>0?(rNetProfit/rNetRev)*100:0;
  const rTotalFreight=rSum("totalFreight"),rTotalCollabs=rSum("totalCollabs"),rTotalWages=rSum("totalWages"),rTotalOPEX=rSum("totalOPEX");

  // Monthly discount reclassification totals
  const totalDR=rCalcs.reduce((s,c)=>({
    serviceRecoveryCOGS:s.serviceRecoveryCOGS+(c.discReclass?.serviceRecoveryCOGS||0),
    serviceRecoveryOrders:s.serviceRecoveryOrders+(c.discReclass?.serviceRecoveryOrders||0),
    marketingDisc:s.marketingDisc+(c.discReclass?.marketingDisc||0),
    staffDisc:s.staffDisc+(c.discReclass?.staffDisc||0),
    promoDisc:s.promoDisc+(c.discReclass?.promoDisc||0),
    totalDisc:s.totalDisc+(c.totalDiscounts||0),
  }),{serviceRecoveryCOGS:0,serviceRecoveryOrders:0,marketingDisc:0,staffDisc:0,promoDisc:0,totalDisc:0});

  const rangeLabel=useRange&&rangeFrom&&rangeTo?new Date(rangeFrom).toLocaleDateString("en-AU")+" to "+new Date(rangeTo).toLocaleDateString("en-AU"):null;
  const copySummary=()=>{
    const fmt=v=>"$"+Math.abs(v).toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:2});
    const heading=rangeLabel?"Date Range Report: "+rangeLabel:"Monthly P&L Summary";
    let t="## "+heading+"\n\n**Net Revenue:** "+fmt(rNetRev)+"\n**Gross Profit:** "+fmt(rGrossProfit)+" ("+rGrossMargin.toFixed(1)+"%)\n**Total Expenses:** "+fmt(rTotalExpenses)+"\n**Net Profit:** "+fmt(rNetProfit)+" ("+rNetMargin.toFixed(1)+"%)\n\n";
    t+="### Discount Reclassification\n";
    t+="Service Recovery: "+fmt(totalDR.serviceRecoveryCOGS)+" | Marketing: "+fmt(totalDR.marketingDisc)+" | Staff: "+fmt(totalDR.staffDisc)+" | True Promo: "+fmt(totalDR.promoDisc)+"\n\n";
    t+="### Week Breakdown\n";
    activeWeeks.forEach((w,i)=>{const c=rCalcs[i];const f=factors[i];if(f===0)return;t+="**"+w.label+(f<1?" ("+Math.round(f*7)+"d pro-rated)":"")+"** ("+w.dateRange+") - Rev: "+fmt(c.netRevenue)+" | GP: "+c.grossMargin.toFixed(1)+"% | Net: "+fmt(c.netProfit)+" ("+c.netMargin.toFixed(1)+"%)\n";});
    navigator.clipboard.writeText(t);setSumCopied(true);setTimeout(()=>setSumCopied(false),3000);
  };

  return(
    <div>
      <div style={{display:"flex",gap:8,marginBottom:20}}>
        {[{key:"overview_part1",label:labels.overview_part1,i:0},{key:"overview_part2",label:labels.overview_part2,i:1}].map(({key,label,i})=>(
          <button key={i} onClick={()=>setPart2(i===1)}
            style={{padding:"8px 16px",background:part2===(i===1)?A:"transparent",border:"1px solid "+(part2===(i===1)?A:BR),color:part2===(i===1)?"#ffffff":MU,fontFamily:ff,fontSize:11,cursor:"pointer",borderRadius:radius,letterSpacing:1}}>
            <E value={label} onSave={v=>labels._save(key,v)} style={{fontFamily:ff,fontSize:11,color:part2===(i===1)?"#ffffff":MU}}/>
          </button>
        ))}
      </div>

      {!part2&&(
        <div>
          <SH>Monthly P&L Summary</SH>
          {/* Date range filter */}
          <div style={{display:"flex",gap:10,alignItems:"flex-end",flexWrap:"wrap",marginBottom:16,padding:"12px 14px",background:S2,borderRadius:radius+1,border:"1px solid "+(useRange?A:BR)}}>
            <div style={{fontFamily:ff,fontSize:10,color:useRange?A:MU,letterSpacing:1,textTransform:"uppercase",alignSelf:"center",minWidth:80}}>Date Range</div>
            <div><div style={{fontFamily:ff,fontSize:9,color:MU,marginBottom:4,textTransform:"uppercase",letterSpacing:0.7}}>From</div>
              <input type="date" value={rangeFrom} onChange={e=>{setRangeFrom(e.target.value);setUseRange(true);}} style={{background:S,border:"1px solid "+BR,color:TX,padding:"6px 10px",fontFamily:ff,fontSize:12,outline:"none",borderRadius:radius}}/></div>
            <div><div style={{fontFamily:ff,fontSize:9,color:MU,marginBottom:4,textTransform:"uppercase",letterSpacing:0.7}}>To</div>
              <input type="date" value={rangeTo} onChange={e=>{setRangeTo(e.target.value);setUseRange(true);}} style={{background:S,border:"1px solid "+BR,color:TX,padding:"6px 10px",fontFamily:ff,fontSize:12,outline:"none",borderRadius:radius}}/></div>
            {useRange&&<button onClick={()=>{setUseRange(false);setRangeFrom("");setRangeTo("");}} style={{padding:"6px 12px",background:"transparent",border:"1px solid "+BR,color:MU,fontFamily:ff,fontSize:10,cursor:"pointer",borderRadius:radius,alignSelf:"flex-end"}}>Clear</button>}
            {useRange&&<div style={{fontFamily:ff,fontSize:10,color:A,alignSelf:"center"}}>{factors.filter(f=>f>0&&f<1).length} weeks pro-rated · {factors.filter(f=>f===0).length} excluded</div>} {useRange&&rangeFrom&&rangeTo&&<div style={{fontFamily:ff,fontSize:10,color:MU,alignSelf:"center",marginLeft:4}}>· all months</div>}
          </div>
          {!useRange&&monthDateRange&&<div style={{fontFamily:ff,fontSize:12,color:MU,marginBottom:16,marginTop:-8}}>{monthDateRange}</div>}
          <Row>
            <Badge label="Net Revenue" value={rNetRev} color={A}/>
            <Badge label="Gross Profit" value={rGrossProfit}/>
            <Badge label="Total Expenses" value={-rTotalExpenses} color={RD}/>
            <Badge label="Net Profit" value={rNetProfit}/>
          </Row>
          <Row><Pct label="Gross Margin" value={rGrossMargin}/><Pct label="Net Margin" value={rNetMargin}/></Row>

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
                <div key={label} style={{background:S2,border:"1px solid "+col+"44",borderRadius:radius+1,padding:"12px 14px"}}>
                  <div style={{fontFamily:ff,fontSize:10,color:col,letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>{label}</div>
                  <div style={{fontFamily:ff,fontSize:18,color:col,fontWeight:"bold"}}>{fmtD(val)}</div>
                  <div style={{fontFamily:ff,fontSize:11,color:MU,marginTop:4}}>{sub}</div>
                </div>
              ))}
            </div>
            <div style={{fontFamily:ff,fontSize:12,color:MU,padding:"10px 14px",background:S2,borderRadius:radius+1,borderLeft:"3px solid "+A}}>
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
                {activeWeeks.map((w,i)=>{const c=rCalcs[i];const f=factors[i];if(f===0)return null;return(
                  <tr key={i} style={{borderBottom:"1px solid "+BR+"22",opacity:f<1?0.7:1}}>
                    <td style={{padding:"10px",color:TX}}>{w.label}{f<1&&f>0?<span style={{fontFamily:ff,fontSize:9,color:MU,marginLeft:4}}>({Math.round(f*7)}d)</span>:null}</td>
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
                  <td style={{padding:"10px",color:A,fontWeight:"bold",textAlign:"right"}}>{fmtD(rNetRev)}</td>
                  <td style={{padding:"10px",color:RD,fontWeight:"bold",textAlign:"right"}}>{fmtD(-rTotalCOGS)}</td>
                  <td style={{padding:"10px",color:rGrossProfit>=0?GR:RD,fontWeight:"bold",textAlign:"right"}}>{fmtD(rGrossProfit)}</td>
                  <td style={{padding:"10px",color:rGrossMargin>=0?GR:RD,fontWeight:"bold",textAlign:"right"}}>{rGrossMargin.toFixed(1)}%</td>
                  <td style={{padding:"10px",color:RD,fontWeight:"bold",textAlign:"right"}}>{fmtD(-rTotalFreight)}</td>
                  <td style={{padding:"10px",color:RD,fontWeight:"bold",textAlign:"right"}}>{fmtD(-rTotalWages)}</td>
                  <td style={{padding:"10px",color:RD,fontWeight:"bold",textAlign:"right"}}>{fmtD(-rTotalOPEX)}</td>
                  <td style={{padding:"10px",color:rNetProfit>=0?GR:RD,fontWeight:"bold",textAlign:"right"}}>{fmtD(rNetProfit)}</td>
                  <td style={{padding:"10px",color:rNetMargin>=0?GR:RD,fontWeight:"bold",textAlign:"right"}}>{rNetMargin.toFixed(1)}%</td>
                </tr>
              </tbody>
            </table>
          </div>

          <SH>Expense Breakdown</SH>
          {[["COGS (incl. service recovery)",mc.totalCOGS,"#ff9ecd"],["Freight",mc.totalFreight,RD],["Collabs",mc.totalCollabs,"#ffd97d"],["Wages (incl. staff disc)",mc.totalWages,"#e0a0ff"],["OPEX (incl. influencer gifting)",mc.totalOPEX,A]].map(([lbl,val,col])=>(
            <div key={lbl} style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",fontFamily:ff,fontSize:12,marginBottom:4}}>
                <span style={{color:TX}}>{lbl}</span>
                <span style={{color:RD}}>{fmtD(-val)} ({rTotalExpenses>0?((val/rTotalExpenses)*100).toFixed(1):0}%)</span>
              </div>
              <div style={{background:S2,borderRadius:3,height:7,overflow:"hidden"}}>
                <div style={{background:col,height:"100%",width:(rTotalExpenses>0?Math.min((val/rTotalExpenses)*100,100):0)+"%",borderRadius:3}}/>
              </div>
            </div>
          ))}

          <div style={{display:"flex",gap:10,marginTop:24}}>
            <button onClick={()=>onExport(activeWeeks,extras,rangeLabel,factors)}
              style={{flex:1,padding:"13px 0",background:"transparent",border:"1px solid "+A,color:A,fontFamily:ff,fontSize:12,cursor:"pointer",borderRadius:radius,letterSpacing:1.5,textTransform:"uppercase"}}>
              <div><E value={labels.btn_monthly_export} onSave={v=>labels._save("btn_monthly_export",v)} style={{color:A,fontFamily:ff,fontSize:12}}/>{copied?" - Copied!":""}</div>
              <div style={{fontSize:9,color:MU,marginTop:2}}><E value={labels.btn_monthly_export_sub} onSave={v=>labels._save("btn_monthly_export_sub",v)} style={{color:MU,fontFamily:ff,fontSize:9}}/></div>
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
            style={{width:"100%",boxSizing:"border-box",background:S2,border:"1px solid "+BR,color:TX,padding:"10px 12px",fontFamily:ff,fontSize:14,outline:"none",borderRadius:radius,resize:"vertical"}}/>
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

  // Parse dd/mm/yy from week dateRange strings
  const parseWkDate2=s=>{if(!s)return null;const[d,m,y]=s.split("/");if(!d||!m||!y)return null;return new Date(2000+parseInt(y),parseInt(m)-1,parseInt(d));};
  // Parse yyyy-mm-dd from HTML date input
  const parseDateInput=s=>{if(!s)return null;const[y,m,d]=s.split("-");return new Date(parseInt(y),parseInt(m)-1,parseInt(d));};

  const calcFactor2=(w,from,to)=>{
    const parts=w.dateRange.split(" - ");
    const wStart=parseWkDate2(parts[0]);
    const wEnd=parseWkDate2(parts[1]);
    if(!wStart||!wEnd)return 0;
    wEnd.setHours(23,59,59);
    if(wEnd<from||wStart>to)return 0;
    if(wStart>=from&&wEnd<=to)return 1;
    const overlapStart=wStart<from?from:wStart;
    const overlapEnd=wEnd>to?to:wEnd;
    const days=Math.round((overlapEnd-overlapStart)/(1000*60*60*24));
    return Math.min(1,Math.max(0,days/7));
  };

  const buildCustomPeriod=(d1,d2,label)=>{
    if(!d1||!d2)return null;
    const from=parseDateInput(d1);
    const to=parseDateInput(d2);
    if(!from||!to||from>to)return null;
    to.setHours(23,59,59);
    // Collect ALL weeks from all months
    const allW=[];
    allKeys.forEach(k=>{const md=allMonthData[k];if(md?.weeks)md.weeks.forEach(w=>allW.push(w));});
    const seen=new Set();
    const uniqueW=allW.filter(w=>{if(seen.has(w.dateRange))return false;seen.add(w.dateRange);return true;});
    const matched=uniqueW.filter(w=>calcFactor2(w,from,to)>0);
    if(!matched.length)return{label,mc:null,empty:true};
    const factors=matched.map(w=>calcFactor2(w,from,to));
    // Pro-rate each week calc then sum
    const wCalcs=matched.map(w=>calcWeek(w,fixed,keys,wDepts));
    const proRate=(wc,f)=>({
      netRevenue:wc.netRevenue*f, totalCOGS:wc.totalCOGS*f,
      totalOPEX:wc.totalOPEX*f, totalWages:wc.totalWages*f,
      totalFreight:wc.totalFreight*f, grossProfit:wc.grossProfit*f,
      gross:wc.gross*f, truePromoDisc:wc.truePromoDisc*f,
      totalExpenses:wc.totalExpenses*f, netProfit:wc.netProfit*f,
    });
    const sum=wCalcs.reduce((acc,wc,i)=>{
      const pr=proRate(wc,factors[i]);
      Object.keys(pr).forEach(k=>{acc[k]=(acc[k]||0)+pr[k];});
      return acc;
    },{});
    const rev=sum.netRevenue||0;
    const gross=sum.gross||0;
    sum.grossMargin=rev>0?((sum.grossProfit||0)/rev)*100:0;
    sum.netMargin=rev>0?((sum.netProfit||0)/rev)*100:0;
    sum.weekCalcs=wCalcs; sum.extraOpex=0;
    return{label,mc:sum,empty:false,weekCount:matched.length};
  };

  let periodA=null,periodB=null;
  if(mode==="months"){periodA=getMC(mA);periodB=getMC(mB);}
  else if(mode==="weeks"){
    const mk=allKeys[wMonthIdx]; const md=allMonthData[mk];
    if(md?.weeks){
      const wkCalc=idx=>{if(!md.weeks[idx])return null;const c=calcWeek(md.weeks[idx],fixed,keys,wDepts);return{label:md.weeks[idx].label+" ("+md.weeks[idx].dateRange+")",mc:{...c,weekCalcs:[c],extraOpex:0}};};
      periodA=wkCalc(wA); periodB=wkCalc(wB);
    }
  } else if(mode==="custom"){
    const fmtDateLabel=(d1,d2)=>{if(!d1||!d2)return "—";const fmt=s=>{const[y,m,d]=s.split("-");return d+"/"+m+"/"+y.slice(2);};return fmt(d1)+" – "+fmt(d2);};
    const pA=buildCustomPeriod(dateA1,dateA2,"Period A: "+fmtDateLabel(dateA1,dateA2));
    const pB=buildCustomPeriod(dateB1,dateB2,"Period B: "+fmtDateLabel(dateB1,dateB2));
    if(pA&&!pA.empty)periodA=pA;
    if(pB&&!pB.empty)periodB=pB;
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
            style={{padding:"7px 14px",background:mode===val?A:"transparent",border:"1px solid "+(mode===val?A:BR),color:mode===val?"#ffffff":MU,fontFamily:ff,fontSize:11,cursor:"pointer",borderRadius:radius,letterSpacing:1}}>
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
          <div style={{fontFamily:ff,fontSize:11,color:MU,marginTop:10}}>
            Results appear automatically once both Period A and Period B dates are filled in. All weeks overlapping each date range are summed and pro-rated.
          </div>
          {/* Show empty state warnings when dates are set but no weeks matched */}
          {(()=>{
            const parseDI=s=>{if(!s)return null;const[y,m,d]=s.split("-");return new Date(parseInt(y),parseInt(m)-1,parseInt(d));};
            const aReady=dateA1&&dateA2&&parseDI(dateA1)<=parseDI(dateA2);
            const bReady=dateB1&&dateB2&&parseDI(dateB1)<=parseDI(dateB2);
            const pAEmpty=aReady&&!periodA;
            const pBEmpty=bReady&&!periodB;
            if(!aReady&&!bReady)return null;
            return(
              <div style={{marginTop:10,display:"flex",gap:8,flexWrap:"wrap"}}>
                {aReady&&<div style={{fontFamily:ff,fontSize:11,padding:"6px 12px",borderRadius:radius,background:periodA?GR+"15":RD+"15",border:"1px solid "+(periodA?GR+"44":RD+"44"),color:periodA?GR:RD}}>
                  Period A: {periodA?"found "+periodA.weekCount+" week"+(periodA.weekCount===1?"":"s"):"no weeks found in this range — check your data dates"}
                </div>}
                {bReady&&<div style={{fontFamily:ff,fontSize:11,padding:"6px 12px",borderRadius:radius,background:periodB?GR+"15":RD+"15",border:"1px solid "+(periodB?GR+"44":RD+"44"),color:periodB?GR:RD}}>
                  Period B: {periodB?"found "+periodB.weekCount+" week"+(periodB.weekCount===1?"":"s"):"no weeks found in this range — check your data dates"}
                </div>}
              </div>
            );
          })()}
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
function ReportsPage({monthData,fixed,onSave,onExport,opexKeys,depts,rosterSaves,onDeleteRosterSave}){
  const {S,S2,BR,A,MU,TX,GR,RD,YL,ff,radius}=useTheme();
  const keys=opexKeys||DEFAULT_OPEX_KEYS;
  const wDepts=depts||DEFAULT_WAGE_DEPTS;
  const [expanded,setExpanded]=useState(null);
  const [rosterOpen,setRosterOpen]=useState(false);
  const [rosterExpanded,setRosterExpanded]=useState(null);
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
  if(!allKeys.length&&!(rosterSaves||[]).length)return(
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
        if(md.type==="margin_analysis") return null;
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
              <div style={{padding:"16px 18px",background:RD+"15",border:"1px solid "+RD,margin:"0 0 4px"}}>
                <div style={{fontFamily:ff,fontSize:13,color:RD,marginBottom:12}}>Delete {mLabel}? This cannot be undone.</div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>deleteMonth(key)} style={{padding:"8px 16px",background:RD,border:"none",color:"#ffffff",fontFamily:ff,fontSize:12,cursor:"pointer",borderRadius:radius,fontWeight:"bold"}}>Delete</button>
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
                        style={{flex:1,padding:"11px 0",background:A,border:"none",color:"#ffffff",fontFamily:ff,fontSize:13,cursor:"pointer",borderRadius:radius,fontWeight:"bold",letterSpacing:1}}>
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
      {/* Roster Calculator Saves */}
{/* Roster Calculator Saves */}
      {(rosterSaves||[]).length>0&&(
        <div style={{border:"1px solid "+A+"44",borderRadius:radius+2,marginBottom:20,overflow:"visible"}}>
          <div onClick={()=>setRosterOpen(o=>!o)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px",background:rosterOpen?S2:"transparent",borderRadius:rosterOpen?(radius+2)+"px "+(radius+2)+"px 0 0":radius+2+"px",cursor:"pointer"}}>
            <div>
              <div style={{fontFamily:ff,fontSize:13,color:A,letterSpacing:1.5,textTransform:"uppercase"}}>Roster Calculator — Saved Plans</div>
              <div style={{fontFamily:ff,fontSize:11,color:MU,marginTop:2}}>{(rosterSaves||[]).length} saved roster plan{(rosterSaves||[]).length!==1?"s":""}</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={A} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="9" x2="9" y2="21"/><line x1="15" y1="9" x2="15" y2="21"/>
              </svg>
              <span style={{fontFamily:ff,fontSize:20,color:MU,lineHeight:1}}>{rosterOpen?"-":"+"}</span>
            </div>
          </div>
          {rosterOpen&&(
            <div style={{padding:"16px",borderTop:"1px solid "+BR,background:S}}>
              {(rosterSaves||[]).slice().reverse().map((entry,ri)=>{
                const idx=(rosterSaves.length-1)-ri;
                const isOpen=rosterExpanded===idx;
                return(
                  <div key={idx} style={{border:"1px solid "+BR,borderRadius:radius+2,marginBottom:8,overflow:"hidden"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 14px",background:isOpen?S2:"transparent",cursor:"pointer"}} onClick={()=>setRosterExpanded(isOpen?null:idx)}>
                      <div>
                        <div style={{fontFamily:ff,fontSize:13,color:TX}}>{entry.weekLabel||"Untitled Roster"}</div>
                        <div style={{fontFamily:ff,fontSize:10,color:MU,marginTop:2}}>Saved {entry.savedAt||"—"} · Tier {entry.tier||"—"} · {entry.totalStaff||0} staff</div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{textAlign:"right"}}>
                          <div style={{fontFamily:ff,fontSize:13,color:GR}}>{entry.totalWages||"—"}</div>
                          <div style={{fontFamily:ff,fontSize:10,color:MU}}>wages + {entry.adCap||"—"} ad cap</div>
                        </div>
                        <button onClick={e=>{e.stopPropagation();if(window.confirm("Delete this roster plan?"))onDeleteRosterSave(idx);}}
                          style={{background:"transparent",border:"1px solid "+BR,color:MU,padding:"3px 8px",fontFamily:ff,fontSize:11,cursor:"pointer",borderRadius:radius}}
                          onMouseEnter={e=>e.currentTarget.style.borderColor=RD} onMouseLeave={e=>e.currentTarget.style.borderColor=BR}>×</button>
                        <span style={{fontFamily:ff,fontSize:18,color:MU,lineHeight:1}}>{isOpen?"-":"+"}</span>
                      </div>
                    </div>
                    {isOpen&&(
                      <div style={{padding:"14px 16px",borderTop:"1px solid "+BR,background:S}}>
                        {/* Revenue context */}
                        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
                          {[["Last Week Gross",entry.rev1],["Week Before",entry.rev2],["Forecast",entry.forecast]].map(([l,v])=>(
                            <div key={l} style={{background:S2,border:"1px solid "+BR,borderRadius:radius,padding:"8px 10px"}}>
                              <div style={{fontFamily:ff,fontSize:9,color:MU,textTransform:"uppercase",letterSpacing:0.7,marginBottom:2}}>{l}</div>
                              <div style={{fontFamily:ff,fontSize:13,color:TX}}>{v||"—"}</div>
                            </div>
                          ))}
                        </div>
                        {/* Tier & ad cap */}
                        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:12}}>
                          {[["Tier",entry.tier],["Ad Spend Cap",entry.adCap],["Total Hours",entry.totalHours],["Wages % Net Rev",entry.wagesPct]].map(([l,v])=>(
                            <div key={l} style={{background:S2,border:"1px solid "+BR,borderRadius:radius,padding:"8px 10px"}}>
                              <div style={{fontFamily:ff,fontSize:9,color:MU,textTransform:"uppercase",letterSpacing:0.7,marginBottom:2}}>{l}</div>
                              <div style={{fontFamily:ff,fontSize:13,color:l==="Tier"?A:TX}}>{v||"—"}</div>
                            </div>
                          ))}
                        </div>
                        {/* Staff breakdown */}
                        {entry.staffLines&&entry.staffLines.length>0&&(
                          <div>
                            <div style={{fontFamily:ff,fontSize:9,color:MU,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Staff</div>
                            {entry.staffLines.map((s,si)=>(
                              <div key={si} style={{display:"flex",justifyContent:"space-between",padding:"7px 10px",background:si%2===0?S2:"transparent",borderRadius:radius,marginBottom:2}}>
                                <div>
                                  <span style={{fontFamily:ff,fontSize:12,color:TX,marginRight:8}}>{s.name}</span>
                                  <span style={{fontFamily:ff,fontSize:10,color:MU}}>{s.role} · {s.depts}</span>
                                </div>
                                <div style={{textAlign:"right"}}>
                                  <span style={{fontFamily:ff,fontSize:12,color:TX}}>{s.finalHrs}hrs</span>
                                  <span style={{fontFamily:ff,fontSize:11,color:MU,marginLeft:8}}>{s.cost}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Tasks */}
                        {entry.taskLines&&entry.taskLines.length>0&&(
                          <div style={{marginTop:10}}>
                            <div style={{fontFamily:ff,fontSize:9,color:MU,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Special Tasks</div>
                            {entry.taskLines.map((t,ti)=>(
                              <div key={ti} style={{fontFamily:ff,fontSize:11,color:MU,padding:"4px 0"}}>{t.name} — {t.hrs}hrs ({t.dept1}{t.dept2?"+"+t.dept2:""})</div>
                            ))}
                          </div>
                        )}
                        {entry.notes&&(
                          <div style={{marginTop:10,padding:"10px 12px",background:A+"0f",border:"1px solid "+A+"33",borderRadius:radius,fontFamily:ff,fontSize:11,color:TX,lineHeight:1.7}} dangerouslySetInnerHTML={{__html:entry.notes}}/>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

    </div>
  );
}

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
    const goal=parseFloat(monthlyGoal);
    if(!goal||goal<=0)return;
    const wkly=goal/4.33;
    // Use current global targets for percentages, falling back to defaults
    const gt=globalTargets;
    const grossM=gt.gross_margin_target||55;
    const netM=gt.net_margin_target||15;
    const cogsP=gt.cogs_pct_target||35;
    const opexP=gt.opex_pct_target||25;
    const wagesP=gt.wages_pct_target||20;
    const nt={
      ...gt,
      monthly_sales_goal:goal,
      weekly_revenue_target:Math.round(wkly),
      gross_margin_target:grossM,
      net_margin_target:netM,
      cogs_pct_target:cogsP,
      opex_pct_target:opexP,
      wages_pct_target:wagesP,
      promo_disc_rate_max:gt.promo_disc_rate_max||12,
      refund_rate_max:gt.refund_rate_max||3,
      service_recovery_max_orders:gt.service_recovery_max_orders||5,
      service_recovery_cost_alert:gt.service_recovery_cost_alert||50,
      weekly_cogs_max:Math.round(wkly*cogsP/100),
      weekly_opex_max:Math.round(wkly*opexP/100),
      weekly_wages_max:Math.round(wkly*wagesP/100),
      weekly_profit_target:Math.round(wkly*netM/100),
    };
    // Save to every week so targets show immediately across all weeks
    const nw=curWeeks.map(w=>({...w,weekTargets:nt}));
    onUpdateWeeks(nw);
    saveGlobalTargets(nt);
  };

  // Current week actuals
  const fixed=null; // not available here, pass via prop if needed
  const inp={background:S2,border:"1px solid "+BR,color:TX,padding:"7px 10px",fontFamily:ff,fontSize:13,outline:"none",borderRadius:radius,width:"100%",boxSizing:"border-box"};

  const renderTRow=(label,key_,unit="%",hint)=>{
    const val=wt[key_]??globalTargets[key_]??"";
    const isOverride=week?.weekTargets?.[key_]!==undefined;
    return(
      <div key={key_} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:"1px solid "+BR+"33"}}>
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
            style={{padding:"9px 20px",background:weeklyGoal?A:"transparent",border:"1px solid "+(weeklyGoal?A:BR),color:weeklyGoal?"#ffffff":MU,fontFamily:ff,fontSize:11,cursor:weeklyGoal?"pointer":"not-allowed",borderRadius:radius,fontWeight:"bold",letterSpacing:1,textTransform:"uppercase"}}>
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
          {renderTRow("Gross Margin Target","gross_margin_target","%","Industry benchmark: 50–65%")}
          {renderTRow("Net Margin Target","net_margin_target","%","Healthy range: 12–20%")}
          {renderTRow("Max COGS % of Revenue","cogs_pct_target","%","Keep under 35–45%")}
          {renderTRow("Max OPEX % of Revenue","opex_pct_target","%","Target: ≤25%")}
          {renderTRow("Max Wages % of Revenue","wages_pct_target","%","Target: ≤20%")}
          {renderTRow("Max Promo Discount Rate","promo_disc_rate_max","%","% of gross sales — above this hurts margin")}
          {renderTRow("Max Refund Rate","refund_rate_max","%","% of gross sales")}
          {renderTRow("Service Recovery Alert (orders/wk)","service_recovery_max_orders","orders","Fires alert when exceeded")}
          {renderTRow("Service Recovery Cost Alert ($/order)","service_recovery_cost_alert","$","Average cost before alert fires")}
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
    alerts.push({sev:"alert",title:"Revenue below target",action:`You are ${fmtD(gap)} short of your weekly revenue goal. Review your marketing spend and conversion — are ads running? Any pending campaigns to push?`,metric:`${fmtD(gross)} of ${fmtD(weeklyRevenueTarget)} target`});
  }
  if(promoRate>t.promo_disc_rate_max){
    const excess=promoDisc-gross*(t.promo_disc_rate_max/100);
    alerts.push({sev:"alert",title:"Discounting too aggressively",action:`Your promo discount rate is ${promoRate.toFixed(1)}% of gross sales — ${(promoRate-t.promo_disc_rate_max).toFixed(1)}% over the ${t.promo_disc_rate_max}% limit. You gave away an extra ${fmtD(excess)} that came straight off your margin. Reduce sale frequency or cut discount depth by 5%.`,metric:`${promoRate.toFixed(1)}% vs ${t.promo_disc_rate_max}% target`});
  }
  if(refundRate>t.refund_rate_max){
    const excess=refunds-gross*(t.refund_rate_max/100);
    alerts.push({sev:"warn",title:"Refund rate elevated",action:`Refunds are ${refundRate.toFixed(1)}% of sales — ${fmtD(excess)} above normal. Check for product issues, sizing complaints, or delayed orders causing refund requests.`,metric:`${refundRate.toFixed(1)}% vs ${t.refund_rate_max}% target`});
  }
  if(srOrders>0&&srOrders>=t.service_recovery_max_orders){
    alerts.push({sev:"warn",title:"Too many service recovery orders",action:`${srOrders} orders required service recovery this week (threshold: ${t.service_recovery_max_orders}). Check which codes are firing most — RESHIP-FAULTY or CS-ERROR suggest a packing/QC issue that ops should review immediately.`,metric:`${srOrders} orders`});
  }
  if(srCostPerOrder>0&&srCostPerOrder>=t.service_recovery_cost_alert){
    alerts.push({sev:"warn",title:"Service recovery cost per order is high",action:`Each service recovery order is costing you ${fmtD(srCostPerOrder)} on average. At this rate you'd spend ${fmtD(srCostPerOrder*52)} per year on errors. Identify the most frequent failure mode and fix the root cause.`,metric:`${fmtD(srCostPerOrder)}/order vs ${fmtD(t.service_recovery_cost_alert)} threshold`});
  }
  return alerts;
}

function AlertCard({alert}){
  const {S2,BR,RD,YL,GR,ff,radius}=useTheme();
  const col=alert.sev==="alert"?RD:YL;
  return(
    <div style={{background:col+"0f",border:"1px solid "+col+"44",borderRadius:radius+1,padding:"12px 14px",marginBottom:8}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
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
          onMouseEnter={e=>{e.target.style.background=A;e.target.style.color="#ffffff";}} onMouseLeave={e=>{e.target.style.background="transparent";e.target.style.color=A;}}>
          Enter
        </button>
      </div>
    </div>
  );
}

// ─── Generic Full-Page Modal (Margin Analysis, Targets) ─────────────────────
function FullPageModal({title,icon,onClose,children}){
  const {BG,BR,A,MU,TX,ff,radius}=useTheme();
  return(
    <div style={{position:"fixed",inset:0,zIndex:1100,background:BG,overflowY:"auto"}}>
      <div style={{borderBottom:"1px solid "+BR,padding:"0 24px",position:"sticky",top:0,background:BG,zIndex:10}}>
        <div style={{maxWidth:1200,margin:"0 auto",padding:"18px 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{color:A,fontSize:18,fontWeight:"bold",fontFamily:ff}}>{icon}</span>
            <div>
              <div style={{fontFamily:ff,fontSize:9,letterSpacing:4,color:A,textTransform:"uppercase",marginBottom:3}}>Finance Operations</div>
              <h1 style={{margin:0,fontFamily:ff,fontSize:20,fontWeight:"normal",letterSpacing:2,color:TX,textTransform:"uppercase"}}>{title}</h1>
            </div>
          </div>
          <button onClick={onClose}
            style={{background:"transparent",border:"1px solid "+BR,color:MU,padding:"8px 14px",fontFamily:ff,fontSize:11,cursor:"pointer",borderRadius:radius,letterSpacing:1.5,textTransform:"uppercase"}}
            onMouseEnter={e=>e.currentTarget.style.borderColor=A} onMouseLeave={e=>e.currentTarget.style.borderColor=BR}>
            ← Back to P&L
          </button>
        </div>
      </div>
      <div style={{maxWidth:1200,margin:"0 auto",padding:"28px 24px"}}>
        {children}
      </div>
    </div>
  );
}

// ─── Roster Calculator Modal ──────────────────────────────────────────────────
function RosterCalculatorModal({onClose,curWeeks,monthData,settings,onSaveRosterEntry}){
  const {BG,S,S2,BR,A,MU,TX,GR,RD,YL,ff,radius}=useTheme();

  // ── Date helpers ──
  function getWeekLabel(){
    const now=new Date();
    const day=now.getDay();
    const diffToMon=day===0?-6:1-day;
    const mon=new Date(now);mon.setDate(now.getDate()+diffToMon+7);
    const sun=new Date(mon);sun.setDate(mon.getDate()+6);
    const fmt=d=>d.toLocaleDateString("en-AU",{day:"numeric",month:"short"});
    return fmt(mon)+" – "+fmt(sun);
  }

  // Get last 2 weeks gross from P&L data
  function getRecentGross(){
    // Collect weeks from ALL saved months sorted by month key (chronological)
    const allWeeks=[];
    const sortedMonthKeys=Object.keys(monthData||{}).sort();
    sortedMonthKeys.forEach(mk=>{
      const md=monthData[mk];
      (md?.weeks||[]).forEach(w=>{
        const g=parseFloat(w?.revenue?.gross_sales)||0;
        if(g>0)allWeeks.push({label:w.label,gross:g,mk});
      });
    });
    // Also include curWeeks that have data and aren't already captured by their month key
    (curWeeks||[]).forEach(w=>{
      const g=parseFloat(w?.revenue?.gross_sales)||0;
      if(g>0&&!allWeeks.find(x=>x.label===w.label))
        allWeeks.push({label:w.label,gross:g,mk:"current"});
    });
    // The last 2 entries are the most recent completed weeks
    const last=allWeeks[allWeeks.length-1];
    const prev=allWeeks[allWeeks.length-2];
    return {rev1:last?.gross||"", rev2:prev?.gross||"", rev1Label:last?.label||"", rev2Label:prev?.label||""};
  }

  const {rev1:initRev1,rev2:initRev2,rev1Label:initRev1Label,rev2Label:initRev2Label}=getRecentGross();

  // ── Constants ──
  const DEPTS=['operations','marketing','logistics','retail','custsvc','hr'];
  const DEPT_LABELS={operations:'Operations',marketing:'Marketing',logistics:'Logistics',retail:'Retail',custsvc:'Customer Svc',hr:'HR'};
  const TIERS={
    A:{name:'Tier A — Quiet Week',   desc:'Forecast below $24K. Hold costs. No new collabs.',    adCap:6570, roas:'3.3x',color:RD},
    B:{name:'Tier B — Standard Week',desc:'Forecast $24K–$30K. Standard operations.',            adCap:9330, roas:'3.0x',color:YL},
    C:{name:'Tier C — Strong Week',  desc:'Forecast above $30K. Collabs and gifting permitted.', adCap:11169,roas:'2.9x',color:GR},
  };

  function uid(){return '_'+Math.random().toString(36).slice(2,9);}
  function fmt(v){return '$'+Math.round(v).toLocaleString('en-AU');}
  function fmtD(v){return '$'+Number(v).toLocaleString('en-AU',{minimumFractionDigits:2,maximumFractionDigits:2});}

  const [rev1,setRev1]=useState(String(initRev1));
  const [rev2,setRev2]=useState(String(initRev2));
  const [rev1Label]=useState(initRev1Label);
  const [rev2Label]=useState(initRev2Label);
  const [revForecast,setRevForecast]=useState("");
  const [confidence,setConfidence]=useState("medium");
  const [tierOverride,setTierOverride]=useState("auto");
  const [weekDate,setWeekDate]=useState(getWeekLabel());
  const [hrOverrides,setHrOverrides]=useState({});
  const [saveDone,setSaveDone]=useState(false);

  const [tasks,setTasks]=useState([
    {id:uid(),name:'Stock take',hrs:6,dept1:'logistics',dept2:''},
    {id:uid(),name:'Photoshoot',hrs:4,dept1:'marketing',dept2:'operations'},
    {id:uid(),name:'Product launch',hrs:5,dept1:'custsvc',dept2:'marketing'},
  ]);

  const [staff,setStaff]=useState([
    {id:uid(),name:'Bella', role:'Operations',  rate:30.00,fixed:true, depts:['operations'],        hrs:{A:35,B:35,C:35}},
    {id:uid(),name:'Meg',   role:'Admin / Ops', rate:37.13,fixed:false,depts:['operations'],        hrs:{A:18,B:20,C:24}},
    {id:uid(),name:'Jimmy', role:'Specialist',  rate:34.90,fixed:false,depts:['operations'],        hrs:{A:5, B:5, C:8 }},
    {id:uid(),name:'Lila M',role:'Logistics',   rate:26.55,fixed:false,depts:['logistics'],         hrs:{A:8, B:10,C:13}},
    {id:uid(),name:'Lila E',role:'Support',     rate:19.91,fixed:false,depts:['logistics','retail'],hrs:{A:3, B:3, C:5 }},
    {id:uid(),name:'Amy',   role:'Support',     rate:16.60,fixed:false,depts:['retail'],            hrs:{A:4, B:4, C:6 }},
    {id:uid(),name:'Rhea',  role:'Customer Svc',rate:30.00,fixed:false,depts:['custsvc'],           hrs:{A:6, B:8, C:10}},
    {id:uid(),name:'Chloe', role:'Customer Svc',rate:30.00,fixed:false,depts:['custsvc'],           hrs:{A:5, B:5, C:5 }},
  ]);

  // New staff form
  const [newName,setNewName]=useState(""); const [newRole,setNewRole]=useState("");
  const [newDept1,setNewDept1]=useState("operations"); const [newDept2,setNewDept2]=useState("");
  const [newRate,setNewRate]=useState(""); const [newHrsB,setNewHrsB]=useState("");

  // ── Tier calc ──
  function getTier(){
    if(tierOverride!=='auto')return tierOverride;
    const fc=parseFloat(revForecast)||0;
    const r1=parseFloat(rev1)||0;
    const r2=parseFloat(rev2)||0;
    if(!fc&&!r1)return null;
    const avg=(r1&&r2)?(r1+r2)/2:r1||r2;
    let bl=fc>0?fc*.65+avg*.35:avg;
    if(confidence==='low')bl*=.88;
    if(bl>=30000)return 'C';
    if(bl>=24000)return 'B';
    return 'A';
  }

  function getTaskAdjForStaff(s){
    let extra=0;
    tasks.forEach(t=>{
      if(!t.name||!t.hrs)return;
      if(s.depts.includes(t.dept1))extra+=Number(t.hrs);
      else if(t.dept2&&s.depts.includes(t.dept2))extra+=Math.ceil(Number(t.hrs)/2);
    });
    return extra;
  }

  const tier=getTier();
  const t=tier?TIERS[tier]:null;
  const tierColor=tier?TIERS[tier].color:MU;

  // ── Staff calcs ──
  const staffCalc=staff.map(s=>{
    const base=s.hrs[tier||'B']||s.hrs['B']||0;
    const adj=getTaskAdjForStaff(s);
    const ovr=hrOverrides[s.id];
    const final=ovr!==undefined?ovr:base+adj;
    const cost=final*s.rate;
    return{...s,base,adj,final,cost};
  });
  const tHrs=staffCalc.reduce((s,x)=>s+x.final,0);
  const tCost=staffCalc.reduce((s,x)=>s+x.cost,0);
  const fc=parseFloat(revForecast)||0;
  const r1p=parseFloat(rev1)||0;
  const netRev=fc>0?fc*.888:(r1p>0?r1p*.888:0);
  const wPct=netRev>0?tCost/netRev*100:null;
  const adCap=t?t.adCap:0;

  // ── Notes ──
  const notes=[];
  if(!tier)notes.push('Enter a revenue forecast to get your tier and ad spend cap.');
  tasks.forEach(tk=>{if(!tk.name||!tk.hrs)return;let line=`<strong>${tk.name}</strong>: ${tk.hrs} hrs → ${DEPT_LABELS[tk.dept1]}`;if(tk.dept2)line+=` + ${DEPT_LABELS[tk.dept2]} (split)`;notes.push(line);});
  if(wPct!==null&&wPct>15)notes.push(`<strong>⚠ Wages at ${wPct.toFixed(1)}%</strong> — above 15% benchmark.`);
  if(tier==='A')notes.push('<strong>Tier A:</strong> No new collab activations. Hold all discretionary spend.');
  if(tier==='C')notes.push('<strong>Tier C:</strong> Gifting and collab activation permitted. Monitor ROAS daily.');
  if(confidence==='low'&&tier)notes.push('<strong>Low confidence:</strong> Upgrade tier mid-week if revenue tracks ahead of plan.');

  // ── Forecast note ──
  const r1v=parseFloat(rev1)||0; const r2v=parseFloat(rev2)||0; const fcv=parseFloat(revForecast)||0;
  let forecastNote='Enter revenue figures to get a tier recommendation.';
  if(r1v||r2v||fcv){
    const avg=(r1v&&r2v)?(r1v+r2v)/2:r1v||r2v;
    let p=[];
    if(avg>0)p.push('Recent avg: '+fmt(avg));
    if(fcv>0)p.push('Forecast: '+fmt(fcv));
    if(confidence==='low')p.push('Low confidence → conservative');
    forecastNote=p.join(' · ')+(tier?' → Tier '+tier+' recommended':'');
  }

  // ── Actions ──
  function addTask(){setTasks(prev=>[...prev,{id:uid(),name:'',hrs:0,dept1:'operations',dept2:''}]);}
  function removeTask(i){setTasks(prev=>prev.filter((_,idx)=>idx!==i));}
  function updateTask(i,field,val){setTasks(prev=>{const n=[...prev];n[i]={...n[i],[field]:val};return n;});}

  function addStaff(){
    if(!newName.trim()){return;}
    const hrsB=parseInt(newHrsB)||0;
    const s={id:uid(),name:newName.trim(),role:newRole||'Staff',rate:parseFloat(newRate)||0,fixed:false,depts:newDept2?[newDept1,newDept2]:[newDept1],hrs:{A:Math.max(0,hrsB-3),B:hrsB,C:Math.min(hrsB+4,Math.round(hrsB*1.2))}};
    setStaff(prev=>[...prev,s]);
    setNewName("");setNewRole("");setNewRate("");setNewHrsB("");setNewDept1("operations");setNewDept2("");
  }
  function removeStaff(i){if(!window.confirm(`Remove ${staff[i].name} from the roster?`))return;setHrOverrides(prev=>{const n={...prev};delete n[staff[i].id];return n;});setStaff(prev=>prev.filter((_,idx)=>idx!==i));}
  function setHrOverride(id,val){setHrOverrides(prev=>({...prev,[id]:parseInt(val)||0}));}
  function resetOverrides(){setHrOverrides({});}

  function saveToReports(){
    const entry={
      weekLabel:weekDate||'Untitled',
      savedAt:new Date().toLocaleDateString("en-AU"),
      tier:tier||"—",
      rev1:rev1?fmt(parseFloat(rev1)):"—",
      rev2:rev2?fmt(parseFloat(rev2)):"—",
      forecast:revForecast?fmt(parseFloat(revForecast)):"—",
      totalHours:tHrs+"hrs",
      totalWages:fmtD(tCost),
      adCap:adCap?fmt(adCap):"—",
      wagesPct:wPct!==null?wPct.toFixed(1)+"%":"—",
      totalStaff:staff.length,
      staffLines:staffCalc.map(s=>({name:s.name,role:s.role,depts:s.depts.map(d=>DEPT_LABELS[d]).join('+'),finalHrs:s.final,cost:fmtD(s.cost)})),
      taskLines:tasks.filter(t=>t.name).map(t=>({name:t.name,hrs:t.hrs,dept1:DEPT_LABELS[t.dept1],dept2:t.dept2?DEPT_LABELS[t.dept2]:""})),
      notes:notes.join('<br>'),
    };
    onSaveRosterEntry(entry);
    setSaveDone(true);
    setTimeout(()=>setSaveDone(false),2500);
  }

  // ── Styles ──
  const inp={background:S2,border:"1px solid "+BR,color:TX,padding:"8px 10px",fontFamily:ff,fontSize:13,outline:"none",borderRadius:radius,width:"100%",boxSizing:"border-box"};
  const lbl={fontFamily:ff,fontSize:10,color:MU,letterSpacing:0.5,marginBottom:4,display:"block"};
  const card={background:S,border:"1px solid "+BR,borderRadius:radius+2,padding:"20px 22px",marginBottom:16};
  const sectionLabel={fontFamily:ff,fontSize:9,letterSpacing:2,color:A,textTransform:"uppercase",marginBottom:14,display:"flex",alignItems:"center",gap:8};

  const DEPT_COLORS={operations:"#2D6A9F",marketing:"#7B5EA7",logistics:YL,retail:GR,custsvc:RD,hr:MU};

  return(
    <div style={{position:"fixed",inset:0,zIndex:1100,background:BG,overflowY:"auto"}}>
      {/* Header */}
      <div style={{borderBottom:"1px solid "+BR,padding:"0 24px",position:"sticky",top:0,background:BG,zIndex:10}}>
        <div style={{maxWidth:1200,margin:"0 auto",padding:"18px 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontFamily:ff,fontSize:9,letterSpacing:4,color:A,textTransform:"uppercase",marginBottom:3}}>Finance Operations</div>
            <h1 style={{margin:0,fontFamily:ff,fontSize:20,fontWeight:"normal",letterSpacing:2,color:TX,textTransform:"uppercase"}}>Roster & Ad Spend Calculator</h1>
          </div>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <button onClick={saveToReports} style={{padding:"8px 16px",background:saveDone?GR:A,border:"none",color:"#ffffff",fontFamily:ff,fontSize:11,cursor:"pointer",borderRadius:radius,letterSpacing:1.5,textTransform:"uppercase",transition:"background 0.3s"}}>
              {saveDone?"✓ Saved to Reports":"Save to Reports"}
            </button>
            <button onClick={onClose} style={{background:"transparent",border:"1px solid "+BR,color:MU,padding:"8px 14px",fontFamily:ff,fontSize:11,cursor:"pointer",borderRadius:radius,letterSpacing:1.5,textTransform:"uppercase"}}
              onMouseEnter={e=>e.currentTarget.style.borderColor=A} onMouseLeave={e=>e.currentTarget.style.borderColor=BR}>
              ← Back to P&L
            </button>
          </div>
        </div>
      </div>

      <div style={{maxWidth:1200,margin:"0 auto",padding:"28px 24px"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>

          {/* Revenue Context */}
          <div style={card}>
            <div style={sectionLabel}>Revenue Context</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div>
                <label style={lbl}>{rev1Label?"Last week gross — "+rev1Label+" ($)":"Last week gross ($)"}</label>
                <input type="number" value={rev1} onChange={e=>setRev1(e.target.value)} style={inp} placeholder="32000"/>
              </div>
              <div>
                <label style={lbl}>{rev2Label?"Week before — "+rev2Label+" ($)":"Week before that ($)"}</label>
                <input type="number" value={rev2} onChange={e=>setRev2(e.target.value)} style={inp} placeholder="28000"/>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div>
                <label style={lbl}>Forecast for roster week ($)</label>
                <input type="number" value={revForecast} onChange={e=>setRevForecast(e.target.value)} style={inp} placeholder="e.g. 30000"/>
              </div>
              <div>
                <label style={lbl}>Forecast confidence</label>
                <select value={confidence} onChange={e=>setConfidence(e.target.value)} style={{...inp,appearance:"none"}}>
                  <option value="high">High — strong pipeline</option>
                  <option value="medium">Medium — typical</option>
                  <option value="low">Low — uncertain</option>
                </select>
              </div>
            </div>
            <div style={{padding:"8px 10px",background:S2,border:"1px solid "+BR,borderRadius:radius,fontFamily:ff,fontSize:11,color:MU,lineHeight:1.6}}>
              {forecastNote}
            </div>
          </div>

          {/* Week Plan */}
          <div style={card}>
            <div style={sectionLabel}>Week Plan</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
              <div>
                <label style={lbl}>Roster week — forecasting for <span style={{color:A}}>{weekDate||"next week"}</span></label>
                <input type="text" value={weekDate} onChange={e=>setWeekDate(e.target.value)} style={inp} placeholder="e.g. 10 Mar – 16 Mar"/>
              </div>
              <div>
                <label style={lbl}>Override tier (optional)</label>
                <select value={tierOverride} onChange={e=>setTierOverride(e.target.value)} style={{...inp,appearance:"none"}}>
                  <option value="auto">Auto — use forecast</option>
                  <option value="A">Force Tier A (&lt;$24K)</option>
                  <option value="B">Force Tier B ($24–30K)</option>
                  <option value="C">Force Tier C (&gt;$30K)</option>
                </select>
              </div>
            </div>

            <div style={{fontFamily:ff,fontSize:9,letterSpacing:2,color:A,textTransform:"uppercase",marginBottom:10}}>Special Tasks This Week</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 60px 1fr 1fr 32px",gap:6,marginBottom:4}}>
              {["Task name","Hrs","Primary dept","Secondary dept",""].map((h,i)=>(
                <div key={i} style={{fontFamily:ff,fontSize:9,color:MU,letterSpacing:0.8,textTransform:"uppercase",padding:"0 2px"}}>{h}</div>
              ))}
            </div>
            {tasks.map((tk,i)=>(
              <div key={tk.id} style={{display:"grid",gridTemplateColumns:"1fr 60px 1fr 1fr 32px",gap:6,marginBottom:6,alignItems:"center"}}>
                <input type="text" value={tk.name} onChange={e=>updateTask(i,'name',e.target.value)} style={{...inp,fontSize:12,padding:"6px 8px"}} placeholder="Task name"/>
                <input type="number" value={tk.hrs} onChange={e=>updateTask(i,'hrs',Number(e.target.value)||0)} style={{...inp,fontSize:12,padding:"6px 8px"}} min="0" max="99"/>
                <select value={tk.dept1} onChange={e=>updateTask(i,'dept1',e.target.value)} style={{...inp,fontSize:11,padding:"6px 8px",appearance:"none"}}>
                  {DEPTS.map(d=><option key={d} value={d}>{DEPT_LABELS[d]}</option>)}
                </select>
                <select value={tk.dept2} onChange={e=>updateTask(i,'dept2',e.target.value)} style={{...inp,fontSize:11,padding:"6px 8px",appearance:"none"}}>
                  <option value="">None (½ hrs)</option>
                  {DEPTS.map(d=><option key={d} value={d}>{DEPT_LABELS[d]}</option>)}
                </select>
                <button onClick={()=>removeTask(i)} style={{background:"transparent",border:"1px solid "+BR,color:MU,width:30,height:30,cursor:"pointer",borderRadius:radius,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=RD} onMouseLeave={e=>e.currentTarget.style.borderColor=BR}>×</button>
              </div>
            ))}
            <button onClick={addTask} style={{width:"100%",padding:"7px 0",background:"transparent",border:"1px dashed "+BR,color:MU,fontFamily:ff,fontSize:11,cursor:"pointer",borderRadius:radius,marginTop:4}}
              onMouseEnter={e=>e.currentTarget.style.borderColor=A} onMouseLeave={e=>e.currentTarget.style.borderColor=BR}>
              + Add task
            </button>
          </div>
        </div>

        {/* Tier Display */}
        <div style={{...card,display:"flex",alignItems:"center",gap:20}}>
          <div style={{fontFamily:ff,fontSize:60,fontWeight:"bold",color:tierColor,lineHeight:1,minWidth:56}}>{tier||"—"}</div>
          <div style={{flex:1}}>
            <div style={{fontFamily:ff,fontSize:14,color:TX,marginBottom:4}}>{t?t.name:"Enter revenue figures above"}</div>
            <div style={{fontFamily:ff,fontSize:11,color:MU,lineHeight:1.5}}>{t?t.desc:"Tier calculated from forecast and recent actuals"}</div>
          </div>
          <div style={{textAlign:"right",flexShrink:0}}>
            <div style={{fontFamily:ff,fontSize:9,color:MU,textTransform:"uppercase",letterSpacing:1,marginBottom:3}}>Weekly ad spend cap</div>
            <div style={{fontFamily:ff,fontSize:28,fontWeight:"bold",color:tier?tierColor:MU}}>{adCap>0?fmt(adCap):"—"}</div>
            {t&&<>
              <div style={{fontFamily:ff,fontSize:10,color:MU,marginTop:2}}>ROAS floor: {t.roas} minimum</div>
              <div style={{fontFamily:ff,fontSize:10,color:MU}}>Daily: {fmt(adCap/7)} across all platforms</div>
            </>}
          </div>
        </div>

        {/* Staff Table */}
        <div style={card}>
          <div style={{...sectionLabel,marginBottom:8}}>Staff Hours <span style={{fontFamily:ff,fontSize:9,color:MU,letterSpacing:0,textTransform:"none",marginLeft:6}}>— edit name, role, dept or rate inline</span></div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr style={{borderBottom:"2px solid "+BR}}>
                  {["Name","Role","Departments","Rate/hr","Base","Task adj","Final hrs","Cost"].map((h,i)=>(
                    <th key={h} style={{fontFamily:ff,fontSize:9,letterSpacing:0.8,textTransform:"uppercase",color:MU,padding:"0 8px 10px",textAlign:i>=3?"right":"left",fontWeight:"normal",whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staffCalc.map((s,si)=>(
                  <StaffRow key={s.id} s={s} si={si} tier={tier||'B'} DEPT_LABELS={DEPT_LABELS} DEPT_COLORS={DEPT_COLORS} DEPTS={DEPTS}
                    onNameChange={v=>{setStaff(prev=>{const n=[...prev];n[si]={...n[si],name:v};return n;});}}
                    onRoleChange={v=>{setStaff(prev=>{const n=[...prev];n[si]={...n[si],role:v};return n;});}}
                    onRateChange={v=>{setStaff(prev=>{const n=[...prev];n[si]={...n[si],rate:parseFloat(v)||0};return n;});}}
                    onDeptsChange={v=>{setStaff(prev=>{const n=[...prev];n[si]={...n[si],depts:v};return n;});}}
                    onHrChange={v=>setHrOverride(s.id,v)}
                    onRemove={()=>removeStaff(si)}
                    fmtD={fmtD} inp={inp} ff={ff} MU={MU} TX={TX} BR={BR} A={A} RD={RD} S2={S2} radius={radius}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Add Staff Row */}
          <div style={{borderTop:"2px dashed "+BR,marginTop:10,paddingTop:14,display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
            {[
              {label:"Name",      el:<input type="text"   value={newName}  onChange={e=>setNewName(e.target.value)}  style={inp} placeholder="Name"/>},
              {label:"Role",      el:<input type="text"   value={newRole}  onChange={e=>setNewRole(e.target.value)}  style={inp} placeholder="Role"/>},
              {label:"Primary dept",el:<select value={newDept1} onChange={e=>setNewDept1(e.target.value)} style={{...inp,appearance:"none"}}>{DEPTS.map(d=><option key={d} value={d}>{DEPT_LABELS[d]}</option>)}</select>},
              {label:"Secondary dept",el:<select value={newDept2} onChange={e=>setNewDept2(e.target.value)} style={{...inp,appearance:"none"}}><option value="">None</option>{DEPTS.map(d=><option key={d} value={d}>{DEPT_LABELS[d]}</option>)}</select>},
              {label:"Rate/hr",   el:<input type="number" value={newRate}  onChange={e=>setNewRate(e.target.value)}  style={inp} placeholder="30.00" min="0" step="0.01"/>,narrow:true},
              {label:"Base hrs",  el:<input type="number" value={newHrsB}  onChange={e=>setNewHrsB(e.target.value)}  style={inp} placeholder="20"    min="0"/>,narrow:true},
            ].map(({label,el,narrow})=>(
              <div key={label} style={{flex:narrow?"0 0 80px":"1",minWidth:narrow?80:100}}>
                <label style={lbl}>{label}</label>{el}
              </div>
            ))}
            <div style={{flex:"0 0 auto"}}>
              <label style={lbl}>&nbsp;</label>
              <button onClick={addStaff} style={{padding:"8px 16px",background:A,border:"none",color:"#ffffff",fontFamily:ff,fontSize:11,cursor:"pointer",borderRadius:radius,letterSpacing:1,textTransform:"uppercase"}}>+ Add Staff</button>
            </div>
          </div>

          {/* Totals Bar */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:1,background:BR,border:"1px solid "+BR,marginTop:16}}>
            {[
              {label:"Total Hours",     value:tHrs+"hrs",         sub:staff.length+" staff",           color:TX},
              {label:"Total Wages",     value:fmtD(tCost),        sub:"Tier "+(tier||"B")+" hours",    color:TX},
              {label:"Wages % Net Rev", value:wPct!==null?wPct.toFixed(1)+"%":"—", sub:"benchmark: 8–15%", color:wPct===null?TX:wPct<=13?GR:wPct<=15?YL:RD},
              {label:"Wages + Ad Cap",  value:adCap>0?fmt(tCost+adCap):fmtD(tCost), sub:adCap>0?"wages "+fmtD(tCost)+" + ads "+fmt(adCap):"enter revenue for full calc", color:TX},
            ].map(({label,value,sub,color})=>(
              <div key={label} style={{background:S,padding:"12px 14px"}}>
                <div style={{fontFamily:ff,fontSize:9,color:MU,letterSpacing:0.8,textTransform:"uppercase",marginBottom:3}}>{label}</div>
                <div style={{fontFamily:ff,fontSize:20,fontWeight:"bold",color}}>{value}</div>
                <div style={{fontFamily:ff,fontSize:10,color:MU,marginTop:2,lineHeight:1.4}}>{sub}</div>
              </div>
            ))}
          </div>

          {/* Notes */}
          {notes.length>0&&(
            <div style={{marginTop:14,padding:"12px 14px",background:S2,borderLeft:"3px solid "+A,fontFamily:ff,fontSize:12,color:MU,lineHeight:1.9}}
              dangerouslySetInnerHTML={{__html:notes.join('<br>')}}/>
          )}

          {/* Actions */}
          <div style={{display:"flex",gap:10,marginTop:16,alignItems:"center",flexWrap:"wrap"}}>
            <button onClick={()=>{
              const t2=tier;const ac=adCap;
              let lines=[`ROSTER — ${weekDate}`,"Tier: "+(t2||"—")+"  |  Ad spend cap: "+(ac?fmt(ac):"—")+"  |  Daily: "+(ac?fmt(ac/7):"—"),"","STAFF HOURS:"];
              staffCalc.forEach(s=>{lines.push(`  ${s.name.padEnd(8)} ${String(s.final).padStart(3)} hrs  ${fmtD(s.cost)}  [${s.depts.map(d=>DEPT_LABELS[d]).join("+")}]`);});
              lines.push("","Total wages: "+fmtD(tCost)+"  ("+(wPct!==null?wPct.toFixed(1)+"%":"—")+" of est. net rev)");
              if(ac>0){lines.push("Ad spend cap: "+fmt(ac)+"  (ROAS floor: "+t.roas+")");lines.push("Combined wages + ads: "+fmt(tCost+ac));}
              if(tasks.filter(x=>x.name).length>0){lines.push("","SPECIAL TASKS:");tasks.filter(x=>x.name).forEach(x=>{lines.push(`  ${x.name}: ${x.hrs} hrs (${DEPT_LABELS[x.dept1]}${x.dept2?" + "+DEPT_LABELS[x.dept2]:""})`);});}
              navigator.clipboard.writeText(lines.join("\n"));
            }} style={{padding:"9px 16px",background:"transparent",border:"1px solid "+A,color:A,fontFamily:ff,fontSize:11,cursor:"pointer",borderRadius:radius,letterSpacing:1,textTransform:"uppercase"}}>
              Copy Summary
            </button>
            <button onClick={resetOverrides} style={{padding:"9px 16px",background:"transparent",border:"1px solid "+BR,color:MU,fontFamily:ff,fontSize:11,cursor:"pointer",borderRadius:radius,letterSpacing:1,textTransform:"uppercase"}}>
              Reset Hour Overrides
            </button>
            <button onClick={saveToReports} style={{padding:"9px 16px",background:saveDone?GR:A,border:"none",color:"#ffffff",fontFamily:ff,fontSize:11,cursor:"pointer",borderRadius:radius,letterSpacing:1,textTransform:"uppercase",transition:"background 0.3s"}}>
              {saveDone?"✓ Saved!":"Save to Reports"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Inline-editable StaffRow for RosterCalculator ──────────────────────────
function StaffRow({s,si,DEPTS,DEPT_LABELS,DEPT_COLORS,onNameChange,onRoleChange,onRateChange,onDeptsChange,onHrChange,onRemove,fmtD,inp,ff,MU,TX,BR,A,RD,S2,radius}){
  const [editingField,setEditingField]=useState(null);
  const [val,setVal]=useState("");
  const [editDepts,setEditDepts]=useState(null); // null = not editing, else [d1, d2|""]
  const startEdit=(field,current)=>{setEditingField(field);setVal(String(current));};
  const commit=(field)=>{
    if(field==="name")onNameChange(val);
    else if(field==="role")onRoleChange(val);
    else if(field==="rate")onRateChange(val);
    setEditingField(null);
  };
  const startDeptEdit=()=>setEditDepts([s.depts[0]||"operations", s.depts[1]||""]);
  const commitDepts=()=>{
    const d=editDepts[1]?[editDepts[0],editDepts[1]]:[editDepts[0]];
    onDeptsChange(d);
    setEditDepts(null);
  };
  const cellStyle={borderBottom:"1px solid "+BR+"44",padding:"7px 8px",fontFamily:ff,fontSize:12,color:TX,verticalAlign:"middle"};
  const selStyle={...inp,fontSize:11,padding:"4px 6px",appearance:"none",width:"auto",flex:1};
  const EditableCell=({field,display,numeric})=>(
    editingField===field
      ?<td style={cellStyle}><input autoFocus type={numeric?"number":"text"} value={val} onChange={e=>setVal(e.target.value)} onBlur={()=>commit(field)} onKeyDown={e=>{if(e.key==="Enter"||e.key==="Escape")commit(field);}} style={{...inp,fontSize:12,padding:"4px 6px"}}/></td>
      :<td onClick={()=>startEdit(field,numeric?s[field]:s[field])} style={{...cellStyle,cursor:"pointer"}} title="Click to edit">
        <span style={{borderBottom:"1px dotted "+MU}}>{display}</span>
      </td>
  );
  return(
    <tr style={{background:s.fixed?S2+"44":"transparent"}} onMouseEnter={e=>e.currentTarget.style.background=S2} onMouseLeave={e=>e.currentTarget.style.background=s.fixed?S2+"44":"transparent"}>
      <EditableCell field="name" display={<span style={{fontWeight:"bold"}}>{s.name}</span>}/>
      <EditableCell field="role" display={s.role}/>
      <td style={cellStyle}>
        {editDepts
          ?<div style={{display:"flex",gap:4,alignItems:"center"}}>
              <select value={editDepts[0]} onChange={e=>setEditDepts([e.target.value,editDepts[1]])} style={selStyle}>
                {DEPTS.map(d=><option key={d} value={d}>{DEPT_LABELS[d]}</option>)}
              </select>
              <select value={editDepts[1]} onChange={e=>setEditDepts([editDepts[0],e.target.value])} style={selStyle}>
                <option value="">+ None</option>
                {DEPTS.map(d=><option key={d} value={d}>{DEPT_LABELS[d]}</option>)}
              </select>
              <button onClick={commitDepts} style={{background:A,border:"none",color:"#fff",padding:"3px 8px",fontFamily:ff,fontSize:11,cursor:"pointer",borderRadius:radius,whiteSpace:"nowrap"}}>✓ Done</button>
            </div>
          :<div onClick={startDeptEdit} style={{display:"flex",gap:3,flexWrap:"wrap",cursor:"pointer"}} title="Click to edit departments">
              {s.depts.map(d=>(
                <span key={d} style={{fontSize:10,padding:"2px 6px",border:"1px solid "+(DEPT_COLORS[d]+"55"),color:DEPT_COLORS[d],background:DEPT_COLORS[d]+"15",borderRadius:2,borderBottom:"1px dotted "+DEPT_COLORS[d]}}>{DEPT_LABELS[d]}</span>
              ))}
              <span style={{fontSize:10,color:MU,alignSelf:"center",marginLeft:2}}>✎</span>
            </div>
        }
      </td>
      <EditableCell field="rate" display={fmtD(s.rate)} numeric/>
      <td style={{...cellStyle,textAlign:"right",color:MU}}>{s.base}</td>
      <td style={{...cellStyle,textAlign:"right"}}>{s.adj>0?<span style={{fontSize:10,padding:"1px 6px",background:A+"1a",color:A,border:"1px solid "+A+"44",borderRadius:2}}>+{s.adj}</span>:<span style={{color:MU}}>—</span>}</td>
      <td style={{...cellStyle,textAlign:"right"}}>
        {s.fixed
          ?<span style={{color:MU,opacity:0.5}}>{s.final}</span>
          :<input type="number" value={s.final} min="0" max="168" onChange={e=>onHrChange(e.target.value)} style={{...inp,width:52,textAlign:"center",fontSize:12,padding:"4px 6px"}}/>
        }
      </td>
      <td style={{...cellStyle,textAlign:"right",fontWeight:"bold"}}>
        <div style={{display:"flex",alignItems:"center",gap:6,justifyContent:"flex-end"}}>
          {fmtD(s.cost)}
          {!s.fixed&&<button onClick={onRemove} style={{background:"transparent",border:"1px solid "+BR,color:MU,width:22,height:22,cursor:"pointer",borderRadius:radius,fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}
            onMouseEnter={e=>e.currentTarget.style.borderColor=RD} onMouseLeave={e=>e.currentTarget.style.borderColor=BR}>×</button>}
        </div>
      </td>
    </tr>
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
function App(){
  const [authed,setAuthed]=useState(!PASSWORD);
  const [tab,setTab]=useState("input");
  const [loading,setLoading]=useState(false);
  const [saveMsg,setSaveMsg]=useState("");
  const [copied,setCopied]=useState(false);
  const [themeRaw,setThemeRaw]=useState(DEFAULT_THEME);
  const [labelsRaw,setLabelsRaw]=useState(DEFAULT_LABELS);
  const [showSettings,setShowSettings]=useState(false);
  const [showRoster,setShowRoster]=useState(false);
  const [showTargets,setShowTargets]=useState(false);

  const availableMonths=getAvailableMonths();
  const now=new Date();
  const initIdx=availableMonths.findIndex(m=>m.year===now.getFullYear()&&m.month===now.getMonth());
  const [selIdx,setSelIdx]=useState(initIdx>=0?initIdx:availableMonths.length-1);
  const selMonth=availableMonths[selIdx];

  const [monthData,setMonthData]=useState({});
  const [fixed,setFixed]=useState(null);
  const [settings,setSettings]=useState(null);
  const [activeWeek,setActiveWeek]=useState(0);

  // Merge DEFAULT_OPEX_KEYS metadata (computed/sub/parent) into stored keys so
  // new structural properties survive even if settings were saved before they existed
  const opexKeys=(settings?.opexKeys||DEFAULT_OPEX_KEYS).map(k=>{
    const def=DEFAULT_OPEX_KEYS.find(d=>d.key===k.key)||{};
    return {...def,...k}; // def first so stored label/group overrides default, but def adds computed/sub/parent
  });
  // Also ensure sub-keys from DEFAULT are present (user may have saved before sub-keys were added)
  const storedKeys=opexKeys.map(k=>k.key);
  DEFAULT_OPEX_KEYS.forEach(dk=>{if(!storedKeys.includes(dk.key))opexKeys.push(dk);});
  // Merge DEFAULT_WAGE_DEPTS so new depts (e.g. Superannuation) always appear
  const storedDepts=settings?.wageDepts||DEFAULT_WAGE_DEPTS;
  const wageDepts=DEFAULT_WAGE_DEPTS.map(def=>{
    const stored=storedDepts.find(d=>d.key===def.key);
    if(!stored)return def;
    const storedSubs=stored.subs||[];
    const storedSubKeys=storedSubs.map(s=>s.key);
    const newSubs=def.subs.filter(s=>!storedSubKeys.includes(s.key));
    return {...stored,subs:[...storedSubs,...newSubs]};
  });
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
      // Check for Shopify OAuth token returned via URL param
      const params=new URLSearchParams(window.location.search);
      const shopifyToken=params.get("shopify_token");
      let finalSettings=s||{};
      if(shopifyToken){
        finalSettings={...finalSettings,shopify:{...(finalSettings.shopify||{}),accessToken:shopifyToken}};
        saveAll(md||{},f||emptyFixed(s?.opexKeys||DEFAULT_OPEX_KEYS),finalSettings);
        // Clean token from URL without reload
        const url=window.location.pathname+(params.get("shopify_error")?"?shopify_error="+params.get("shopify_error"):"");
        window.history.replaceState({},"",url);
      }
      setSettings(finalSettings);
      if(finalSettings?.theme)setThemeRaw({...DEFAULT_THEME,...finalSettings.theme});
      if(finalSettings?.labels)setLabelsRaw({...DEFAULT_LABELS,...finalSettings.labels});
      setLoading(false);
    });
  },[authed]);

  const saveTimer=useRef(null);
  const [saveError,setSaveError]=useState(false);
  const autoSave=useCallback((md,fx,st)=>{
    if(saveTimer.current)clearTimeout(saveTimer.current);
    saveTimer.current=setTimeout(async()=>{
      try{
        await saveAll(md,fx,st);
        setSaveMsg("Saved ✓");setSaveError(false);
      }catch(e){
        console.error("Auto-save failed:",e);
        setSaveError(true);
        setSaveMsg("Save failed — check connection");
      }
      setTimeout(()=>setSaveMsg(""),3000);
    },1200);
  },[]);

  const curKey=selMonth?.key;
  const curEntry=monthData[curKey];
  // Adjacent month keys for border-week sync
  const _prevAdj=selMonth.month===0?{year:selMonth.year-1,month:11}:{year:selMonth.year,month:selMonth.month-1};
  const _nextAdj=selMonth.month===11?{year:selMonth.year+1,month:0}:{year:selMonth.year,month:selMonth.month+1};
  const _prevKey=monthKey(_prevAdj.year,_prevAdj.month);
  const _nextKey=monthKey(_nextAdj.year,_nextAdj.month);
  // Build a dateRange→week lookup from adjacent months so border weeks share data
  const _adjWeekByRange={};
  [...(monthData[_prevKey]?.weeks||[]),...(monthData[_nextKey]?.weeks||[])].forEach(w=>{_adjWeekByRange[w.dateRange]=w;});
  const curWeeks=(()=>{
    const wd=getMonthWeeks(selMonth.year,selMonth.month);
    const saved=curEntry?.weeks||[];
    return wd.map((d,i)=>{
      if(saved[i]) return saved[i];
      // No local data — pull from adjacent month if same week spans this boundary
      const adj=_adjWeekByRange[d.dateRange];
      if(adj) return{...adj,weekNum:d.weekNum,label:d.label};
      return emptyWeek(d.weekNum,d.dateRange,d.label,wageDepts,opexKeys);
    });
  })();
  const curExtras=curEntry?.extras||emptyExtras(opexKeys);

  const updateWeeks=nw=>{
    let updated={...monthData,[curKey]:{...curEntry,weeks:nw,label:selMonth.label,lastSaved:new Date().toLocaleString("en-AU"),extras:curExtras}};
    // Sync border weeks (same dateRange) back to adjacent months that already have saved data
    [_prevKey,_nextKey].forEach(adjKey=>{
      const adjEntry=updated[adjKey];
      if(!adjEntry?.weeks?.length) return;
      let changed=false;
      const adjWeeks=adjEntry.weeks.map(aw=>{
        const match=nw.find(w=>w.dateRange===aw.dateRange);
        if(!match) return aw;
        changed=true;
        return{...match,weekNum:aw.weekNum,label:aw.label};
      });
      if(changed) updated={...updated,[adjKey]:{...adjEntry,weeks:adjWeeks}};
    });
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

  const handleWeeklyExport=useCallback(()=>{
    const week=curWeeks[activeWeek];if(!week)return;
    navigator.clipboard.writeText(generateWeeklyExport(week,fixed,opexKeys,wageDepts,staff,labels));
    setCopied(true);setTimeout(()=>setCopied(false),3000);
  },[curWeeks,activeWeek,fixed,opexKeys,wageDepts,staff,labels]);

  const handleExport=(weeksData=curWeeks,extras=curExtras,label=selMonth?.label,factors=null)=>{
    navigator.clipboard.writeText(generateMonthlyExport(weeksData,fixed,extras,label,opexKeys,wageDepts,staff,labels,factors));
    setCopied(true);setTimeout(()=>setCopied(false),3000);
  };
  const handleSaveMonthData=async md=>{setMonthData(md);await saveAll(md,fixed,settings);};

  const calcs=useMemo(()=>curWeeks.map(w=>calcWeek(w,fixed,opexKeys,wageDepts)),[curWeeks,fixed,opexKeys,wageDepts]);
  const mc=useMemo(()=>calcMonth(curWeeks,fixed,curExtras,opexKeys,wageDepts),[curWeeks,fixed,curExtras,opexKeys,wageDepts]);

  // Data validation across all weeks in current month
  const dataWarnings=useMemo(()=>{
    return curWeeks.flatMap(w=>validateWeek(w).warnings);
  },[curWeeks]);

  // Keyboard shortcut: Ctrl+E to export
  useEffect(()=>{
    const handler=(e)=>{
      if((e.ctrlKey||e.metaKey)&&e.key==="e"&&tab==="input"){
        e.preventDefault();
        handleWeeklyExport();
      }
    };
    window.addEventListener("keydown",handler);
    return()=>window.removeEventListener("keydown",handler);
  },[tab,curWeeks,activeWeek,fixed,opexKeys,wageDepts,staff,labels,curEntry]);

  if(!authed)return(
    <ThemeContext.Provider value={theme}>
      <PasswordScreen onAuth={()=>setAuthed(true)} labels={{...DEFAULT_LABELS,...labelsRaw}}/>
    </ThemeContext.Provider>
  );

  const {A,BG,S,S2,BR,TX,MU,ff,ffTitle,radius,GR,RD,szHeaderTitle,szHeaderBrand}=theme;

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
                {saveMsg&&<div style={{fontFamily:ff,fontSize:11,color:saveError?RD:GR,letterSpacing:1}}>{saveMsg}</div>}
                {dataWarnings.length>0&&(
                  <div title={dataWarnings.join("\n")} style={{background:YL+"15",border:"1px solid "+YL+"44",borderRadius:radius,padding:"5px 10px",fontFamily:ff,fontSize:10,color:YL,letterSpacing:1,cursor:"help",textTransform:"uppercase"}}>
                    ⚠ {dataWarnings.length} data warning{dataWarnings.length>1?"s":""}
                  </div>
                )}
                {/* Targets button */}
                <button onClick={()=>setShowTargets(true)}
                  title="Targets & Alerts"
                  style={{background:"transparent",border:"1px solid "+BR,borderRadius:radius,padding:"7px 9px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=A} onMouseLeave={e=>e.currentTarget.style.borderColor=BR}>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={MU} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
                  </svg>
                </button>
                {/* Roster Calculator button */}
                <button onClick={()=>setShowRoster(true)}
                  title="Roster & Ad Spend Calculator"
                  style={{background:"transparent",border:"1px solid "+BR,borderRadius:radius,padding:"7px 9px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=A} onMouseLeave={e=>e.currentTarget.style.borderColor=BR}>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={MU} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="9" x2="9" y2="21"/><line x1="15" y1="9" x2="15" y2="21"/>
                  </svg>
                </button>
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
                <button onClick={handleWeeklyExport}
                  title="Weekly export for Claude analysis (Ctrl+E)"
                  style={{padding:"9px 16px",background:copied?A:"transparent",border:"1px solid "+A,color:copied?"#ffffff":A,fontFamily:ff,fontSize:11,cursor:"pointer",borderRadius:radius,letterSpacing:1.5,textTransform:"uppercase"}}>
                  <E value={labels.btn_generate_export} onSave={v=>labels._save("btn_generate_export",v)} style={{fontFamily:ff,fontSize:11,color:copied?"#ffffff":A}}/>{copied?" ✓":""}
                </button>
              </div>

              {/* Week tabs */}
              <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
                {curWeeks.map((w,i)=>{
                  const c=calcs[i];
                  return(
                    <button key={i} onClick={()=>setActiveWeek(i)}
                      aria-label={`${w.label}: ${w.dateRange}, Net profit ${c.netProfit!==0?fmtS(c.netProfit):"no data"}`}
                      aria-pressed={activeWeek===i}
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
              <MonthlyOverview weeks={curWeeks} fixed={fixed} extras={curExtras} onExtrasChange={updateExtras} onExport={(w,e,rl,f)=>handleExport(w,e,rl||selMonth?.label,f)} copied={copied} opexKeys={opexKeys} depts={wageDepts} labels={labels} monthKey={curKey} allMonthData={monthData}/>
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
              <ReportsPage monthData={monthData} fixed={fixed} onSave={handleSaveMonthData} onExport={handleExport} opexKeys={opexKeys} depts={wageDepts} rosterSaves={settings?.rosterSaves||[]} onDeleteRosterSave={idx=>{const ns={...(settings||{}),rosterSaves:((settings||{}).rosterSaves||[]).filter((_,i)=>i!==idx)};updateSettings(ns);}}/>
            </div>
          )}
        </div>

        {/* Targets Modal */}
        {showTargets&&(
          <ThemeContext.Provider value={theme}>
            <FullPageModal title="Targets & Alerts" icon={<svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>} onClose={()=>setShowTargets(false)}>
              <TargetsPage
                curWeeks={curWeeks}
                onUpdateWeeks={updateWeeks}
                activeWeek={activeWeek}
                labels={labels}
                monthData={monthData}
                selMonthKey={curKey}
              />
            </FullPageModal>
          </ThemeContext.Provider>
        )}

        {/* Roster Calculator Modal */}
        {showRoster&&(
          <ThemeContext.Provider value={theme}>
            <RosterCalculatorModal
              onClose={()=>setShowRoster(false)}
              curWeeks={curWeeks}
              monthData={monthData}
              settings={settings}
              onSaveRosterEntry={(entry)=>{
                const ns={...(settings||{}),rosterSaves:[...((settings||{}).rosterSaves||[]),entry]};
                updateSettings(ns);
              }}
            />
          </ThemeContext.Provider>
        )}

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

// ─── Root Export (wrapped in ErrorBoundary) ───────────────────────────────────
const _AppInner = App;
export default function AppWithBoundary(props) {
  return (
    <ErrorBoundary>
      <_AppInner {...props} />
    </ErrorBoundary>
  );
}
