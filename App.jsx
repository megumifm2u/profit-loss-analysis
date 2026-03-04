import { useState, useEffect, useCallback } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const ACCENT = "#d8b9ff";
const ACCENT_DIM = "#b08de0";
const BG = "#0a0a0e";
const SURFACE = "#12111a";
const SURFACE2 = "#1a1826";
const BORDER = "#2a2540";
const TEXT = "#e0e0e0";
const MUTED = "#888";
const RED = "#ff6b6b";
const GREEN = "#6bffb8";

const JSONBIN_ID = import.meta.env.VITE_JSONBIN_ID;
const JSONBIN_KEY = import.meta.env.VITE_JSONBIN_KEY;
const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY;
const PASSWORD = import.meta.env.VITE_PASSWORD;

// ─── P&L STRUCTURE ────────────────────────────────────────────────────────────
const COGS_ITEMS = [
  { key: "manufacturing", label: "Manufacturing" },
  { key: "packaging", label: "Packaging" },
];
const OPEX_ITEMS = [
  { key: "shipping_ops", label: "Shipping Operations" },
  { key: "customer_shipping", label: "Customer Shipping / Freight" },
  { key: "customs_duties", label: "Customer Customs & Duties" },
  { key: "fulfilment_pp", label: "Fulfilment Pick & Pack" },
  { key: "staff_wages", label: "Staff Wages" },
  { key: "office_costs", label: "Office Costs" },
  { key: "google_ms_admin", label: "Google, Microsoft Admin Software" },
  { key: "meta_tiktok_ads", label: "Meta, TikTok, Google Paid Ads" },
  { key: "collabs_influencers", label: "Collaborations / Influencers" },
  { key: "model_wages", label: "Model Wages" },
  { key: "shopify", label: "Shopify" },
  { key: "shopify_apps", label: "Shopify Apps" },
  { key: "general_apps", label: "General Apps" },
  { key: "accounting_xero", label: "Accounting (Xero)" },
  { key: "rostering_deputy", label: "Rostering (Deputy)" },
  { key: "customer_service", label: "Customer Service (Repliai)" },
  { key: "rent_utilities", label: "Rent + Utilities" },
  { key: "internet_phone", label: "Internet + Telephone" },
  { key: "insurance", label: "Insurance" },
  { key: "bank_accounting", label: "Bank / Accounting" },
  { key: "legal", label: "Legal" },
];

const REVENUE_ITEMS = [
  { key: "gross_sales", label: "Gross Sales" },
  { key: "refunds_returns", label: "Refunds / Returns" },
  { key: "discounts", label: "Discounts" },
  { key: "shipping_income", label: "Shipping Income" },
  { key: "paypal_fees", label: "PayPal Fees" },
  { key: "starshipit_aus", label: "Starshipit / AusPost Shipping" },
  { key: "uppromote", label: "Uppromote (Affiliate Deductions)" },
];

function emptyWeek() {
  const rev = {};
  REVENUE_ITEMS.forEach(i => { rev[i.key] = ""; });
  const cogs = {};
  COGS_ITEMS.forEach(i => { cogs[i.key] = ""; });
  const opex = {};
  OPEX_ITEMS.forEach(i => { opex[i.key] = ""; });
  return { label: "", dateRange: "", notes: "", revenue: rev, cogs, opex };
}

function calcWeek(week) {
  const n = v => parseFloat(v) || 0;
  const gross = n(week.revenue.gross_sales);
  const refunds = n(week.revenue.refunds_returns);
  const discounts = n(week.revenue.discounts);
  const shippingIncome = n(week.revenue.shipping_income);
  const paypal = n(week.revenue.paypal_fees);
  const starshipit = n(week.revenue.starshipit_aus);
  const uppromote = n(week.revenue.uppromote);

  const netRevenue = gross - refunds - discounts + shippingIncome - paypal - starshipit - uppromote;

  const totalCOGS = COGS_ITEMS.reduce((s, i) => s + n(week.cogs[i.key]), 0);
  const grossProfit = netRevenue - totalCOGS;
  const grossMargin = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;

  const totalOPEX = OPEX_ITEMS.reduce((s, i) => s + n(week.opex[i.key]), 0);
  const totalExpenses = totalCOGS + totalOPEX;
  const netProfit = netRevenue - totalExpenses;
  const netMargin = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;

  return { netRevenue, totalCOGS, grossProfit, grossMargin, totalOPEX, totalExpenses, netProfit, netMargin };
}

function getWeekDates(weekOffset = 0) {
  const today = new Date();
  const day = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1) - weekOffset * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = d => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getFullYear()).slice(-2)}`;
  const weekNum = Math.ceil((monday.getDate() + new Date(monday.getFullYear(), monday.getMonth(), 1).getDay()) / 7);
  return { range: `${fmt(monday)} - ${fmt(sunday)}`, label: `Week ${weekNum}, ${monday.toLocaleString('default',{month:'long'})} ${monday.getFullYear()}` };
}

// ─── STORAGE ─────────────────────────────────────────────────────────────────
async function loadReports() {
  if (!JSONBIN_ID || !JSONBIN_KEY) return [];
  try {
    const r = await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}/latest`, {
      headers: { "X-Master-Key": JSONBIN_KEY }
    });
    const d = await r.json();
    return d.record?.reports || [];
  } catch { return []; }
}

async function saveReports(reports) {
  if (!JSONBIN_ID || !JSONBIN_KEY) return;
  try {
    await fetch(`https://api.jsonbin.io/v3/b/${JSONBIN_ID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Master-Key": JSONBIN_KEY },
      body: JSON.stringify({ reports })
    });
  } catch {}
}

// ─── COMPONENTS ───────────────────────────────────────────────────────────────
function CurrencyInput({ value, onChange, placeholder = "0.00" }) {
  return (
    <div style={{ position: "relative" }}>
      <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: MUTED, fontFamily: "Times New Roman", fontSize: 14 }}>$</span>
      <input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%", boxSizing: "border-box",
          background: SURFACE, border: `1px solid ${BORDER}`,
          color: TEXT, padding: "8px 10px 8px 22px",
          fontFamily: "Times New Roman", fontSize: 14,
          outline: "none", borderRadius: 4,
        }}
        onFocus={e => e.target.style.borderColor = ACCENT}
        onBlur={e => e.target.style.borderColor = BORDER}
      />
    </div>
  );
}

function StatBadge({ label, value, color, small }) {
  const isNeg = typeof value === 'number' && value < 0;
  const col = color || (isNeg ? RED : GREEN);
  return (
    <div style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 6, padding: small ? "10px 14px" : "14px 18px", flex: 1, minWidth: 120 }}>
      <div style={{ color: MUTED, fontFamily: "Times New Roman", fontSize: small ? 10 : 11, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ color: col, fontFamily: "Times New Roman", fontSize: small ? 15 : 20, fontWeight: "bold" }}>
        {typeof value === 'number' ? `${value < 0 ? '-' : ''}$${Math.abs(value).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : value}
      </div>
    </div>
  );
}

function PctBadge({ label, value }) {
  const col = value >= 0 ? GREEN : RED;
  return (
    <div style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 6, padding: "14px 18px", flex: 1, minWidth: 100 }}>
      <div style={{ color: MUTED, fontFamily: "Times New Roman", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ color: col, fontFamily: "Times New Roman", fontSize: 20, fontWeight: "bold" }}>{value.toFixed(1)}%</div>
    </div>
  );
}

function SectionHeader({ children }) {
  return (
    <div style={{ fontFamily: "Times New Roman", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: ACCENT, borderBottom: `1px solid ${BORDER}`, paddingBottom: 8, marginBottom: 16, marginTop: 28 }}>
      {children}
    </div>
  );
}

// ─── WEEK INPUT FORM ──────────────────────────────────────────────────────────
function WeekForm({ week, onChange }) {
  const updateRev = (key, val) => onChange({ ...week, revenue: { ...week.revenue, [key]: val } });
  const updateCogs = (key, val) => onChange({ ...week, cogs: { ...week.cogs, [key]: val } });
  const updateOpex = (key, val) => onChange({ ...week, opex: { ...week.opex, [key]: val } });

  const calc = calcWeek(week);

  return (
    <div>
      {/* Revenue */}
      <SectionHeader>Revenue & Deductions</SectionHeader>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {REVENUE_ITEMS.map(item => (
          <div key={item.key}>
            <label style={{ display: "block", color: MUTED, fontFamily: "Times New Roman", fontSize: 12, marginBottom: 4 }}>{item.label}</label>
            <CurrencyInput value={week.revenue[item.key]} onChange={v => updateRev(item.key, v)} />
          </div>
        ))}
      </div>

      {/* Gross Revenue Summary */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
        <StatBadge small label="Net Revenue" value={calc.netRevenue} color={ACCENT} />
      </div>

      {/* COGS */}
      <SectionHeader>COGS — Cost of Goods Sold</SectionHeader>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {COGS_ITEMS.map(item => (
          <div key={item.key}>
            <label style={{ display: "block", color: MUTED, fontFamily: "Times New Roman", fontSize: 12, marginBottom: 4 }}>{item.label}</label>
            <CurrencyInput value={week.cogs[item.key]} onChange={v => updateCogs(item.key, v)} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
        <StatBadge small label="Total COGS" value={-calc.totalCOGS} color={RED} />
        <StatBadge small label="Gross Profit" value={calc.grossProfit} />
        <PctBadge label="Gross Margin" value={calc.grossMargin} />
      </div>

      {/* OPEX */}
      <SectionHeader>OPEX — Operating Expenses</SectionHeader>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {OPEX_ITEMS.map(item => (
          <div key={item.key}>
            <label style={{ display: "block", color: MUTED, fontFamily: "Times New Roman", fontSize: 12, marginBottom: 4 }}>{item.label}</label>
            <CurrencyInput value={week.opex[item.key]} onChange={v => updateOpex(item.key, v)} />
          </div>
        ))}
      </div>

      {/* Net Summary */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16, marginBottom: 8 }}>
        <StatBadge small label="Total OPEX" value={-calc.totalOPEX} color={RED} />
        <StatBadge small label="Total Expenses" value={-calc.totalExpenses} color={RED} />
        <StatBadge small label="Net Profit" value={calc.netProfit} />
        <PctBadge label="Net Margin" value={calc.netMargin} />
      </div>

      {/* Notes */}
      <SectionHeader>Notes / Context</SectionHeader>
      <textarea
        value={week.notes}
        onChange={e => onChange({ ...week, notes: e.target.value })}
        placeholder="Add any context, unusual items, one-off costs, events affecting this week..."
        rows={3}
        style={{ width: "100%", boxSizing: "border-box", background: SURFACE, border: `1px solid ${BORDER}`, color: TEXT, padding: "10px 12px", fontFamily: "Times New Roman", fontSize: 14, outline: "none", borderRadius: 4, resize: "vertical" }}
      />
    </div>
  );
}

// ─── MONTHLY OVERVIEW ─────────────────────────────────────────────────────────
function MonthlyOverview({ weeks }) {
  const calcs = weeks.map(calcWeek);
  const total = field => calcs.reduce((s, c) => s + c[field], 0);
  const n = v => parseFloat(v) || 0;

  const totalRev = total('netRevenue');
  const totalCOGS = total('totalCOGS');
  const totalGross = total('grossProfit');
  const totalOPEX = total('totalOPEX');
  const totalExp = total('totalExpenses');
  const totalNet = total('netProfit');
  const avgNetMargin = totalRev > 0 ? (totalNet / totalRev) * 100 : 0;
  const avgGrossMargin = totalRev > 0 ? (totalGross / totalRev) * 100 : 0;

  const fmt = v => `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Per-category totals for OPEX
  const opexTotals = OPEX_ITEMS.map(item => ({
    label: item.label,
    total: weeks.reduce((s, w) => s + n(w.opex[item.key]), 0),
    pct: totalExp > 0 ? (weeks.reduce((s, w) => s + n(w.opex[item.key]), 0) / totalExp) * 100 : 0
  })).sort((a, b) => b.total - a.total);

  return (
    <div>
      <SectionHeader>Monthly Summary</SectionHeader>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        <StatBadge label="Total Revenue" value={totalRev} color={ACCENT} />
        <StatBadge label="Gross Profit" value={totalGross} />
        <StatBadge label="Total Expenses" value={-totalExp} color={RED} />
        <StatBadge label="Net Profit" value={totalNet} />
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 28 }}>
        <PctBadge label="Avg Gross Margin" value={avgGrossMargin} />
        <PctBadge label="Avg Net Margin" value={avgNetMargin} />
        <StatBadge label="Total COGS" value={-totalCOGS} color={RED} />
        <StatBadge label="Total OPEX" value={-totalOPEX} color={RED} />
      </div>

      {/* Week-by-week table */}
      <SectionHeader>Week by Week</SectionHeader>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "Times New Roman", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
              {["Period", "Net Revenue", "COGS", "Gross Profit", "GP%", "OPEX", "Net Profit", "NP%"].map(h => (
                <th key={h} style={{ textAlign: "right", padding: "8px 12px", color: MUTED, fontWeight: "normal", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((w, i) => {
              const c = calcs[i];
              return (
                <tr key={i} style={{ borderBottom: `1px solid ${BORDER}20` }}>
                  <td style={{ padding: "10px 12px", color: TEXT, textAlign: "left" }}>{w.label || `Week ${i+1}`}</td>
                  <td style={{ padding: "10px 12px", color: ACCENT, textAlign: "right" }}>{fmt(c.netRevenue)}</td>
                  <td style={{ padding: "10px 12px", color: RED, textAlign: "right" }}>{fmt(-c.totalCOGS)}</td>
                  <td style={{ padding: "10px 12px", color: c.grossProfit >= 0 ? GREEN : RED, textAlign: "right" }}>{fmt(c.grossProfit)}</td>
                  <td style={{ padding: "10px 12px", color: c.grossMargin >= 0 ? GREEN : RED, textAlign: "right" }}>{c.grossMargin.toFixed(1)}%</td>
                  <td style={{ padding: "10px 12px", color: RED, textAlign: "right" }}>{fmt(-c.totalOPEX)}</td>
                  <td style={{ padding: "10px 12px", color: c.netProfit >= 0 ? GREEN : RED, textAlign: "right", fontWeight: "bold" }}>{fmt(c.netProfit)}</td>
                  <td style={{ padding: "10px 12px", color: c.netMargin >= 0 ? GREEN : RED, textAlign: "right" }}>{c.netMargin.toFixed(1)}%</td>
                </tr>
              );
            })}
            {/* Totals row */}
            <tr style={{ borderTop: `2px solid ${BORDER}`, background: SURFACE2 }}>
              <td style={{ padding: "10px 12px", color: ACCENT, fontWeight: "bold", textAlign: "left" }}>MONTHLY TOTAL</td>
              <td style={{ padding: "10px 12px", color: ACCENT, fontWeight: "bold", textAlign: "right" }}>{fmt(totalRev)}</td>
              <td style={{ padding: "10px 12px", color: RED, fontWeight: "bold", textAlign: "right" }}>{fmt(-totalCOGS)}</td>
              <td style={{ padding: "10px 12px", color: totalGross >= 0 ? GREEN : RED, fontWeight: "bold", textAlign: "right" }}>{fmt(totalGross)}</td>
              <td style={{ padding: "10px 12px", color: avgGrossMargin >= 0 ? GREEN : RED, fontWeight: "bold", textAlign: "right" }}>{avgGrossMargin.toFixed(1)}%</td>
              <td style={{ padding: "10px 12px", color: RED, fontWeight: "bold", textAlign: "right" }}>{fmt(-totalOPEX)}</td>
              <td style={{ padding: "10px 12px", color: totalNet >= 0 ? GREEN : RED, fontWeight: "bold", textAlign: "right" }}>{fmt(totalNet)}</td>
              <td style={{ padding: "10px 12px", color: avgNetMargin >= 0 ? GREEN : RED, fontWeight: "bold", textAlign: "right" }}>{avgNetMargin.toFixed(1)}%</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* OPEX Breakdown */}
      <SectionHeader>OPEX Breakdown — Biggest Cost Drivers</SectionHeader>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {opexTotals.filter(o => o.total > 0).map(o => (
          <div key={o.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: SURFACE2, borderRadius: 4, border: `1px solid ${BORDER}` }}>
            <span style={{ fontFamily: "Times New Roman", fontSize: 13, color: TEXT }}>{o.label}</span>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "Times New Roman", fontSize: 13, color: RED }}>{fmt(-o.total)}</div>
              <div style={{ fontFamily: "Times New Roman", fontSize: 11, color: MUTED }}>{o.pct.toFixed(1)}% of exp</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── GENERATE DATA FOR CLAUDE ─────────────────────────────────────────────────
function generateClaudeData(weeks, monthLabel) {
  const calcs = weeks.map(calcWeek);
  const fmt = v => `$${Math.abs(v).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const n = v => parseFloat(v) || 0;
  const totalRev = calcs.reduce((s, c) => s + c.netRevenue, 0);
  const totalCOGS = calcs.reduce((s, c) => s + c.totalCOGS, 0);
  const totalGross = calcs.reduce((s, c) => s + c.grossProfit, 0);
  const totalOPEX = calcs.reduce((s, c) => s + c.totalOPEX, 0);
  const totalExp = calcs.reduce((s, c) => s + c.totalExpenses, 0);
  const totalNet = calcs.reduce((s, c) => s + c.netProfit, 0);

  let out = `=== P&L WEEKLY ANALYSIS — ${monthLabel || "Monthly Report"} ===\nGenerated: ${new Date().toLocaleDateString('en-AU')}\n\n`;

  out += `--- MONTHLY OVERVIEW ---\nNet Revenue: ${fmt(totalRev)}\nTotal COGS: ${fmt(-totalCOGS)}\nGross Profit: ${fmt(totalGross)} (${totalRev > 0 ? ((totalGross/totalRev)*100).toFixed(1) : 0}% margin)\nTotal OPEX: ${fmt(-totalOPEX)}\nTotal Expenses: ${fmt(-totalExp)}\nNET PROFIT: ${fmt(totalNet)} (${totalRev > 0 ? ((totalNet/totalRev)*100).toFixed(1) : 0}% margin)\n\n`;

  out += `--- WEEK BY WEEK BREAKDOWN ---\n`;
  weeks.forEach((w, i) => {
    const c = calcs[i];
    out += `\n[${w.label || `Week ${i+1}`}] ${w.dateRange}\n`;
    out += `  Net Revenue: ${fmt(c.netRevenue)}\n`;

    // Revenue details
    REVENUE_ITEMS.forEach(item => {
      if (n(w.revenue[item.key]) !== 0) {
        out += `    ${item.label}: ${fmt(n(w.revenue[item.key]))}\n`;
      }
    });

    out += `  COGS: ${fmt(-c.totalCOGS)}\n`;
    COGS_ITEMS.forEach(item => {
      if (n(w.cogs[item.key]) !== 0) {
        out += `    ${item.label}: ${fmt(n(w.cogs[item.key]))}\n`;
      }
    });

    out += `  Gross Profit: ${fmt(c.grossProfit)} (${c.grossMargin.toFixed(1)}% margin)\n`;
    out += `  OPEX: ${fmt(-c.totalOPEX)}\n`;
    OPEX_ITEMS.forEach(item => {
      if (n(w.opex[item.key]) !== 0) {
        out += `    ${item.label}: ${fmt(n(w.opex[item.key]))}\n`;
      }
    });
    out += `  NET PROFIT: ${fmt(c.netProfit)} (${c.netMargin.toFixed(1)}% net margin)\n`;
    if (w.notes) out += `  Notes: ${w.notes}\n`;
  });

  out += `\n--- OPEX CATEGORY TOTALS (across all weeks) ---\n`;
  OPEX_ITEMS.forEach(item => {
    const total = weeks.reduce((s, w) => s + n(w.opex[item.key]), 0);
    if (total > 0) {
      out += `  ${item.label}: ${fmt(-total)} (${totalExp > 0 ? ((total/totalExp)*100).toFixed(1) : 0}% of total expenses)\n`;
    }
  });

  out += `\n=== END OF DATA ===\n\n`;
  out += `Please provide a comprehensive P&L analysis in dot-point form covering:\n`;
  out += `1. Overall profitability assessment and trend\n`;
  out += `2. Key money bleed areas identified with specific dollar amounts\n`;
  out += `3. Week-on-week variance and what it signals\n`;
  out += `4. COGS efficiency and gross margin health\n`;
  out += `5. OPEX breakdown — which categories are overspent and by how much\n`;
  out += `6. Revenue quality (refunds, discounts, fees as % of gross)\n`;
  out += `7. Specific, actionable strategies to cut costs and improve margins — prioritised by impact\n`;
  out += `8. Marketing spend ROI assessment (paid ads vs revenue)\n`;
  out += `9. Staffing cost efficiency\n`;
  out += `10. Forecasting: what needs to change to reach profitability next month\n`;
  out += `Be data-specific, evidence-based, and commercially direct. Flag any figures that look anomalous.`;

  return out;
}

// ─── REPORTS PAGE ─────────────────────────────────────────────────────────────
function ReportsPage({ reports, onDelete, onEdit }) {
  const [expanded, setExpanded] = useState(null);
  const fmt = v => `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (reports.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px", color: MUTED, fontFamily: "Times New Roman" }}>
        <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>—</div>
        <div style={{ fontSize: 16 }}>No saved reports yet.</div>
        <div style={{ fontSize: 13, marginTop: 8 }}>Complete a weekly P&L and it will auto-save here.</div>
      </div>
    );
  }

  return (
    <div>
      <SectionHeader>Saved Reports ({reports.length})</SectionHeader>
      {reports.slice().reverse().map((r, ri) => {
        const idx = reports.length - 1 - ri;
        const isOpen = expanded === idx;
        return (
          <div key={r.id} style={{ border: `1px solid ${BORDER}`, borderRadius: 6, marginBottom: 10, overflow: "hidden" }}>
            <div
              onClick={() => setExpanded(isOpen ? null : idx)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", cursor: "pointer", background: isOpen ? SURFACE2 : "transparent" }}
            >
              <div>
                <div style={{ fontFamily: "Times New Roman", fontSize: 15, color: TEXT }}>{r.title}</div>
                <div style={{ fontFamily: "Times New Roman", fontSize: 12, color: MUTED, marginTop: 2 }}>Saved: {r.savedAt}</div>
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ fontFamily: "Times New Roman", fontSize: 14, color: r.netProfit >= 0 ? GREEN : RED }}>{fmt(r.netProfit)}</div>
                <span style={{ color: MUTED, fontSize: 18 }}>{isOpen ? "−" : "+"}</span>
              </div>
            </div>
            {isOpen && (
              <div style={{ padding: "18px 18px", borderTop: `1px solid ${BORDER}`, background: SURFACE }}>
                {/* Summary stats */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                  <StatBadge small label="Revenue" value={r.netRevenue} color={ACCENT} />
                  <StatBadge small label="Gross Profit" value={r.grossProfit} />
                  <StatBadge small label="Total Expenses" value={-r.totalExpenses} color={RED} />
                  <StatBadge small label="Net Profit" value={r.netProfit} />
                </div>
                {/* Weeks summary */}
                {r.weeks && r.weeks.map((w, i) => {
                  const c = calcWeek(w);
                  return (
                    <div key={i} style={{ marginBottom: 8, padding: "10px 12px", background: SURFACE2, borderRadius: 4, border: `1px solid ${BORDER}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontFamily: "Times New Roman", fontSize: 13, color: TEXT }}>{w.label || `Week ${i+1}`}</span>
                        <span style={{ fontFamily: "Times New Roman", fontSize: 13, color: c.netProfit >= 0 ? GREEN : RED }}>{fmt(c.netProfit)} ({c.netMargin.toFixed(1)}%)</span>
                      </div>
                    </div>
                  );
                })}
                <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                  <button
                    onClick={() => onDelete(idx)}
                    style={{ flex: 1, padding: "8px 0", background: "transparent", border: `1px solid ${RED}40`, color: RED, fontFamily: "Times New Roman", fontSize: 13, cursor: "pointer", borderRadius: 4 }}
                  >Delete</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [authed, setAuthed] = useState(!PASSWORD);
  const [pw, setPw] = useState("");
  const [pwErr, setPwErr] = useState(false);

  const [tab, setTab] = useState("input");
  const [monthLabel, setMonthLabel] = useState("");
  const [numWeeks, setNumWeeks] = useState(4);
  const [weeks, setWeeks] = useState(() => {
    const arr = [];
    for (let i = 0; i < 4; i++) {
      const d = getWeekDates(3 - i);
      arr.push({ ...emptyWeek(), label: d.label, dateRange: d.range });
    }
    return arr;
  });
  const [activeWeek, setActiveWeek] = useState(0);
  const [copied, setCopied] = useState(false);
  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // Month label default
  useEffect(() => {
    const now = new Date();
    setMonthLabel(`${now.toLocaleString('default', { month: 'long' })} ${now.getFullYear()}`);
  }, []);

  // Load reports
  useEffect(() => {
    if (!authed) return;
    setLoadingReports(true);
    loadReports().then(r => { setReports(r); setLoadingReports(false); });
  }, [authed]);

  // Adjust weeks count
  useEffect(() => {
    setWeeks(prev => {
      const arr = [...prev];
      while (arr.length < numWeeks) {
        const d = getWeekDates(numWeeks - 1 - arr.length);
        arr.push({ ...emptyWeek(), label: d.label, dateRange: d.range });
      }
      return arr.slice(0, numWeeks);
    });
    if (activeWeek >= numWeeks) setActiveWeek(numWeeks - 1);
  }, [numWeeks]);

  const updateWeek = (i, data) => {
    const arr = [...weeks];
    arr[i] = data;
    setWeeks(arr);
  };

  const handleSaveReport = async () => {
    setSaving(true);
    const calcs = weeks.map(calcWeek);
    const totalRev = calcs.reduce((s, c) => s + c.netRevenue, 0);
    const totalGross = calcs.reduce((s, c) => s + c.grossProfit, 0);
    const totalExp = calcs.reduce((s, c) => s + c.totalExpenses, 0);
    const totalNet = calcs.reduce((s, c) => s + c.netProfit, 0);

    const report = {
      id: Date.now(),
      title: monthLabel || `Report ${new Date().toLocaleDateString('en-AU')}`,
      savedAt: new Date().toLocaleString('en-AU'),
      netRevenue: totalRev,
      grossProfit: totalGross,
      totalExpenses: totalExp,
      netProfit: totalNet,
      weeks: weeks,
    };

    const updated = [...reports, report];
    await saveReports(updated);
    setReports(updated);
    setSaving(false);
    setSaveMsg("· Saved to Reports");
    setTimeout(() => setSaveMsg(""), 3000);
  };

  const handleDeleteReport = async (idx) => {
    const updated = reports.filter((_, i) => i !== idx);
    await saveReports(updated);
    setReports(updated);
  };

  const handleCopyForClaude = () => {
    const data = generateClaudeData(weeks, monthLabel);
    navigator.clipboard.writeText(data);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  // Password screen
  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Times New Roman" }}>
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "48px 40px", width: 340, textAlign: "center" }}>
          <div style={{ color: ACCENT, fontSize: 11, letterSpacing: 3, textTransform: "uppercase", marginBottom: 8 }}>P&L Dashboard</div>
          <div style={{ color: TEXT, fontSize: 22, marginBottom: 32 }}>Weekly Finance Analysis</div>
          <input
            type="password"
            value={pw}
            onChange={e => { setPw(e.target.value); setPwErr(false); }}
            onKeyDown={e => { if (e.key === "Enter") { if (pw === PASSWORD) setAuthed(true); else setPwErr(true); }}}
            placeholder="Enter password"
            style={{ width: "100%", boxSizing: "border-box", background: BG, border: `1px solid ${pwErr ? RED : BORDER}`, color: TEXT, padding: "12px 14px", fontFamily: "Times New Roman", fontSize: 15, outline: "none", borderRadius: 4, marginBottom: 12 }}
          />
          {pwErr && <div style={{ color: RED, fontSize: 13, marginBottom: 12 }}>Incorrect password</div>}
          <button
            onClick={() => { if (pw === PASSWORD) setAuthed(true); else setPwErr(true); }}
            style={{ width: "100%", padding: "12px 0", background: ACCENT, color: BG, border: "none", fontFamily: "Times New Roman", fontSize: 15, cursor: "pointer", borderRadius: 4, fontWeight: "bold", letterSpacing: 1 }}
          >
            ENTER
          </button>
        </div>
      </div>
    );
  }

  const calcs = weeks.map(calcWeek);
  const totalNet = calcs.reduce((s, c) => s + c.netProfit, 0);
  const totalRev = calcs.reduce((s, c) => s + c.netRevenue, 0);

  const TABS = [
    { id: "input", label: "Weekly P&L Input" },
    { id: "overview", label: "Monthly Overview" },
    { id: "reports", label: `Saved Reports (${reports.length})` },
  ];

  return (
    <div style={{ minHeight: "100vh", background: BG, color: TEXT, fontFamily: "Times New Roman" }}>
      {/* Header */}
      <div style={{ borderBottom: `1px solid ${BORDER}`, padding: "0 32px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 0 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ color: ACCENT, fontSize: 11, letterSpacing: 3, textTransform: "uppercase", marginBottom: 4 }}>Finance Operations</div>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: "normal", letterSpacing: 1, color: TEXT }}>WEEKLY P&L DASHBOARD</h1>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                value={monthLabel}
                onChange={e => setMonthLabel(e.target.value)}
                style={{ background: SURFACE, border: `1px solid ${BORDER}`, color: TEXT, padding: "6px 12px", fontFamily: "Times New Roman", fontSize: 14, outline: "none", borderRadius: 4, width: 220 }}
                placeholder="Report Label (e.g. March 2025)"
              />
              <div style={{ background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 4, padding: "6px 12px", fontSize: 13, color: totalNet >= 0 ? GREEN : RED }}>
                MTD Net: {totalNet < 0 ? "-" : ""}${Math.abs(totalNet).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {/* Nav tabs */}
          <div style={{ display: "flex", gap: 0, marginTop: 20 }}>
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  padding: "10px 20px", background: "transparent", border: "none",
                  borderBottom: tab === t.id ? `2px solid ${ACCENT}` : "2px solid transparent",
                  color: tab === t.id ? ACCENT : MUTED, fontFamily: "Times New Roman",
                  fontSize: 13, cursor: "pointer", letterSpacing: 0.5, marginBottom: -1
                }}
              >{t.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 32px" }}>

        {/* ─── INPUT TAB ── */}
        {tab === "input" && (
          <div>
            {/* Controls */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: MUTED, fontSize: 13 }}>Number of weeks:</span>
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    onClick={() => setNumWeeks(n)}
                    style={{ width: 32, height: 32, background: numWeeks === n ? ACCENT : SURFACE2, border: `1px solid ${numWeeks === n ? ACCENT : BORDER}`, color: numWeeks === n ? BG : TEXT, fontFamily: "Times New Roman", fontSize: 13, cursor: "pointer", borderRadius: 4 }}
                  >{n}</button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={handleCopyForClaude}
                  style={{ padding: "10px 18px", background: "transparent", border: `1px solid ${ACCENT}`, color: ACCENT, fontFamily: "Times New Roman", fontSize: 13, cursor: "pointer", borderRadius: 4, letterSpacing: 0.5 }}
                >
                  {copied ? "Copied!" : "COPY FOR CLAUDE"}<br/>
                  <span style={{ fontSize: 10, color: MUTED }}>for Claude analysis</span>
                </button>
                <button
                  onClick={handleSaveReport}
                  disabled={saving}
                  style={{ padding: "10px 18px", background: ACCENT, border: "none", color: BG, fontFamily: "Times New Roman", fontSize: 13, cursor: "pointer", borderRadius: 4, fontWeight: "bold", letterSpacing: 0.5 }}
                >
                  {saving ? "Saving..." : "SAVE REPORT"}{saveMsg && <span style={{ fontSize: 10, color: BG, marginLeft: 6 }}>{saveMsg}</span>}
                </button>
              </div>
            </div>

            {/* Week selector tabs */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
              {weeks.map((w, i) => {
                const c = calcs[i];
                return (
                  <button
                    key={i}
                    onClick={() => setActiveWeek(i)}
                    style={{
                      padding: "10px 16px", background: activeWeek === i ? SURFACE2 : "transparent",
                      border: `1px solid ${activeWeek === i ? ACCENT : BORDER}`,
                      color: activeWeek === i ? ACCENT : MUTED,
                      fontFamily: "Times New Roman", fontSize: 13, cursor: "pointer", borderRadius: 4, textAlign: "left"
                    }}
                  >
                    <div>{w.label || `Week ${i + 1}`}</div>
                    <div style={{ fontSize: 11, color: c.netProfit !== 0 ? (c.netProfit >= 0 ? GREEN : RED) : MUTED }}>
                      {c.netProfit !== 0 ? `${c.netProfit >= 0 ? "+" : ""}$${c.netProfit.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "No data"}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Active week */}
            {weeks[activeWeek] && (
              <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "24px 28px" }}>
                {/* Week header */}
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <label style={{ display: "block", color: MUTED, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Week Label</label>
                    <input
                      value={weeks[activeWeek].label}
                      onChange={e => updateWeek(activeWeek, { ...weeks[activeWeek], label: e.target.value })}
                      style={{ width: "100%", boxSizing: "border-box", background: SURFACE2, border: `1px solid ${BORDER}`, color: TEXT, padding: "9px 12px", fontFamily: "Times New Roman", fontSize: 14, outline: "none", borderRadius: 4 }}
                      placeholder="e.g. Week 1, March 2025"
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <label style={{ display: "block", color: MUTED, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Date Range</label>
                    <input
                      value={weeks[activeWeek].dateRange}
                      onChange={e => updateWeek(activeWeek, { ...weeks[activeWeek], dateRange: e.target.value })}
                      style={{ width: "100%", boxSizing: "border-box", background: SURFACE2, border: `1px solid ${BORDER}`, color: TEXT, padding: "9px 12px", fontFamily: "Times New Roman", fontSize: 14, outline: "none", borderRadius: 4 }}
                      placeholder="e.g. 01/03/25 - 07/03/25"
                    />
                  </div>
                </div>

                <WeekForm week={weeks[activeWeek]} onChange={d => updateWeek(activeWeek, d)} />
              </div>
            )}
          </div>
        )}

        {/* ─── OVERVIEW TAB ── */}
        {tab === "overview" && (
          <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "24px 28px" }}>
            <MonthlyOverview weeks={weeks} />
            <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
              <button
                onClick={handleCopyForClaude}
                style={{ flex: 1, padding: "14px 0", background: "transparent", border: `1px solid ${ACCENT}`, color: ACCENT, fontFamily: "Times New Roman", fontSize: 14, cursor: "pointer", borderRadius: 4, letterSpacing: 1 }}
              >
                {copied ? "Copied to Clipboard!" : "COPY FOR CLAUDE ANALYSIS"}
                <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>Paste into Claude for deep analysis</div>
              </button>
              <button
                onClick={handleSaveReport}
                disabled={saving}
                style={{ flex: 1, padding: "14px 0", background: ACCENT, border: "none", color: BG, fontFamily: "Times New Roman", fontSize: 14, cursor: "pointer", borderRadius: 4, fontWeight: "bold", letterSpacing: 1 }}
              >
                {saving ? "Saving..." : "SAVE REPORT"}
                {saveMsg && <div style={{ fontSize: 11, color: BG, opacity: 0.7 }}>{saveMsg}</div>}
              </button>
            </div>
          </div>
        )}

        {/* ─── REPORTS TAB ── */}
        {tab === "reports" && (
          <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "24px 28px" }}>
            {loadingReports ? (
              <div style={{ textAlign: "center", color: MUTED, padding: 40, fontFamily: "Times New Roman" }}>Loading reports...</div>
            ) : (
              <ReportsPage reports={reports} onDelete={handleDeleteReport} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
