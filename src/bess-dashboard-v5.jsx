import { useState, useMemo, useCallback, useEffect } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell, AreaChart, Area
} from "recharts";

/* ═══════════════════════════════════════════════════════════
   CONFIG
   ═══════════════════════════════════════════════════════════ */

const STRATEGIES = {
  fcrn:          { id: "fcrn",          label: "FCR-N",                      color: "#38bdf8", short: "FCR-N" },
  fcrd:          { id: "fcrd",          label: "FCR-D upp+ned",              color: "#fbbf24", short: "FCR-D" },
  mfrr_conv:     { id: "mfrr_conv",     label: "mFRR konventionell",         color: "#fb923c", short: "mFRR conv." },
  mfrr_netting:  { id: "mfrr_netting",  label: "mFRR intradagsnettning",     color: "#34d399", short: "mFRR nett." },
  intraday1:     { id: "intraday1",     label: "Intradag 1 cykel",           color: "#c084fc", short: "ID 1c" },
  intraday2:     { id: "intraday2",     label: "Intradag 2 cykler",          color: "#a78bfa", short: "ID 2c" },
  dayahead:      { id: "dayahead",      label: "Day-ahead arbitrage",        color: "#f472b6", short: "DA arb." },
};
const SIDS = Object.keys(STRATEGIES);
const DURATIONS = [1, 2, 4];

/* ═══════════════════════════════════════════════════════════
   DATA — synthetic generation matching pipeline structure
   ═══════════════════════════════════════════════════════════ */

const FCRN_H = { 1: 16, 2: 20, 4: 24 };
const NETTING_EAM = { 1: 3, 2: 5, 4: 8 };
const CONV_H = { 1: 12, 2: 16, 4: 20 };
const CONV_BF = { 1: 12, 2: 8, 4: 4 };
const CONV_EAM_N = { 1: 2, 2: 3, 4: 5 };

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function mn(a, b) { return a < b ? a : b; }

function generateSynthetic() {
  // Seasonal amplitude per month (winter high, summer low)
  const S = [18, 15, 12, 8, 6, 5, 5, 6, 10, 14, 17, 20];
  const months = [];
  let d = new Date(2024, 0);
  const end = new Date(2026, 5);

  while (d < end) {
    const m = d.getMonth(), y = d.getFullYear();
    const days = new Date(y, m + 1, 0).getDate();
    const hours = days * 24;
    const rte = 0.85;

    // Market prices (EUR/MW or EUR/MWh)
    const fcrn = 22 + S[m] + Math.sin(y * 7 + m * 3) * 3;
    const fcrdU = 4 + S[m] * 0.35 + Math.sin(y * 5 + m * 2) * 1.2;
    const fcrdD = 3 + S[m] * 0.3 + Math.cos(y * 4 + m * 5) * 0.8;
    const cmU = 3 + S[m] * 0.35 + Math.sin(y * 3 + m * 7) * 1;
    const cmD = 2 + S[m] * 0.25 + Math.cos(y * 6 + m * 3) * 0.8;
    const hasEAM = d >= new Date(2025, 2);
    const eamU = hasEAM ? 40 + Math.sin(y * 11 + m * 4) * 18 : 0;
    const eamD = hasEAM ? 30 + Math.cos(y * 8 + m * 6) * 12 : 0;
    const spread = 8 + S[m] * 0.6 + Math.cos(y * 6 + m * 9) * 2.5;
    const range = spread * 3;

    // Day-ahead price stats for DA arbitrage
    const daAvg = 35 + S[m] * 2.2 + Math.sin(y * 9 + m * 5) * 8;
    const daRange = 15 + S[m] * 1.8 + Math.sin(y * 4 + m * 8) * 5;
    const daImbalancePct = 0.08 + Math.cos(y * 3 + m * 11) * 0.03; // 5-11% imbalance cost

    // mFRR direction selection
    const bestUp = cmU + eamU * 0.3 >= cmD + eamD * 0.3;
    const bestCM = bestUp ? cmU : cmD;
    const bestEAM = bestUp ? eamU : eamD;

    const row = {
      year_month: `${y}-${String(m + 1).padStart(2, "0")}`,
      days, hours,
      // Raw market prices for breakdown view
      fcr_n_price: Math.round(fcrn * 100) / 100,
      fcr_d_up_price: Math.round(fcrdU * 100) / 100,
      fcr_d_down_price: Math.round(fcrdD * 100) / 100,
      mfrr_cm_up_price: Math.round(cmU * 100) / 100,
      mfrr_cm_down_price: Math.round(cmD * 100) / 100,
      mfrr_cm_best_direction: bestUp ? "upp" : "ned",
      mfrr_eam_up_price: Math.round(eamU * 100) / 100,
      mfrr_eam_down_price: Math.round(eamD * 100) / 100,
      intraday_spread: Math.round(spread * 100) / 100,
      intraday_range: Math.round(range * 100) / 100,
      da_avg_price: Math.round(daAvg * 100) / 100,
      da_range: Math.round(daRange * 100) / 100,
      da_imbalance_pct: Math.round(daImbalancePct * 1000) / 1000,
    };

    DURATIONS.forEach(dur => {
      const mwh = dur;

      // 1. FCR-N: symmetric → 0.5 MW effective, duration limits hours
      const fcrn_rev = fcrn * 0.5 * FCRN_H[dur] * days;

      // 2. FCR-D upp+ned: 24/7 all durations
      const fcrd_rev = (fcrdU + fcrdD) * 0.87 * hours;

      // 3. mFRR conventional: limited hours + retailer restore + FCR-D backfill
      const conv_mh = CONV_H[dur] * days;
      const conv_cm = bestCM * conv_mh;
      const conv_act_mwh = mn(dur, 0.25);
      const conv_eam = bestEAM > 0 ? CONV_EAM_N[dur] * conv_act_mwh * bestEAM * days * rte : 0;
      const conv_imb = (conv_cm + conv_eam) * 0.06;
      const conv_fcrd = (fcrdU + fcrdD) * 0.87 * CONV_BF[dur] * days;
      const conv_rev = conv_cm + conv_eam - conv_imb + conv_fcrd;

      // 4. mFRR intradagsnettning: 24/7 CM + intraday restore
      const nett_cm = bestCM * hours;
      const nett_act_mwh = mn(dur, 0.25);
      const nett_eam = bestEAM > 0 ? NETTING_EAM[dur] * nett_act_mwh * bestEAM * days * rte : 0;
      const nett_id_cost = bestEAM > 0 ? NETTING_EAM[dur] * nett_act_mwh * spread * days * 0.5 : 0;
      const nett_rev = nett_cm + nett_eam - nett_id_cost;

      // 5. Intraday 1 cycle
      const id1_rev = mwh * range * rte * days * 0.7;

      // 6. Intraday 2 cycles
      const id2_rev = mwh * range * rte * days * (0.7 + 0.45);

      // 7. Day-ahead arbitrage: buy low / sell high on spot
      const da_gross = mwh * daRange * rte * days * 0.55; // lower capture than intraday (committed day-ahead)
      const da_imb_cost = da_gross * daImbalancePct;
      const da_rev = da_gross - da_imb_cost;

      // Revenue breakdown components for service view
      row[`fcrn_${dur}h`] = Math.round(fcrn_rev);
      row[`fcrd_${dur}h`] = Math.round(fcrd_rev);
      row[`mfrr_conv_${dur}h`] = Math.round(conv_rev);
      row[`mfrr_netting_${dur}h`] = Math.round(nett_rev);
      row[`intraday1_${dur}h`] = Math.round(id1_rev);
      row[`intraday2_${dur}h`] = Math.round(id2_rev);
      row[`dayahead_${dur}h`] = Math.round(da_rev);

      // Breakdown components for mFRR strategies
      row[`conv_cm_${dur}h`] = Math.round(conv_cm);
      row[`conv_eam_${dur}h`] = Math.round(conv_eam);
      row[`conv_imb_${dur}h`] = Math.round(conv_imb);
      row[`conv_fcrd_${dur}h`] = Math.round(conv_fcrd);
      row[`nett_cm_${dur}h`] = Math.round(nett_cm);
      row[`nett_eam_${dur}h`] = Math.round(nett_eam);
      row[`nett_id_cost_${dur}h`] = Math.round(nett_id_cost);
      row[`da_gross_${dur}h`] = Math.round(da_gross);
      row[`da_imb_${dur}h`] = Math.round(da_imb_cost);

      // mFRR up vs down breakdown
      const cmU_rev_dur = cmU * hours;
      const cmD_rev_dur = cmD * hours;
      const eamU_rev_dur = eamU > 0 ? NETTING_EAM[dur] * mn(dur, 0.25) * eamU * days * rte : 0;
      const eamD_rev_dur = eamD > 0 ? NETTING_EAM[dur] * mn(dur, 0.25) * eamD * days * rte : 0;
      row[`mfrr_up_total_${dur}h`] = Math.round(cmU_rev_dur + eamU_rev_dur);
      row[`mfrr_down_total_${dur}h`] = Math.round(cmD_rev_dur + eamD_rev_dur);

      // Optimal
      const strats = {
        fcrn: fcrn_rev, fcrd: fcrd_rev, mfrr_conv: conv_rev,
        mfrr_netting: nett_rev, intraday1: id1_rev, intraday2: id2_rev, dayahead: da_rev,
      };
      let bestV = -Infinity, bestS = "fcrn";
      Object.entries(strats).forEach(([s, v]) => { if (v > bestV) { bestV = v; bestS = s; } });
      row[`optimal_${dur}h`] = Math.round(bestV);
      row[`optimal_strategy_${dur}h`] = bestS;
    });

    months.push(row);
    d = new Date(y, m + 1);
  }
  return { SE1: months, SE2: months, SE3: months, SE4: months };
}

/* ═══════════════════════════════════════════════════════════
   TRANSFORM pipeline → dashboard row
   ═══════════════════════════════════════════════════════════ */

function transformRow(raw, dur, mw) {
  const label = (() => {
    try {
      const [y, m] = raw.year_month.split("-");
      return new Date(+y, +m - 1).toLocaleString("sv-SE", { year: "numeric", month: "short" });
    } catch { return raw.year_month; }
  })();

  const row = { label, ym: raw.year_month };
  SIDS.forEach(sid => {
    row[sid] = Math.round((raw[`${sid}_${dur}h`] || 0) * mw);
  });
  row.optimal = Math.round((raw[`optimal_${dur}h`] || 0) * mw);
  row.optimalStrategy = raw[`optimal_strategy_${dur}h`] || "fcrn";
  row.mfrr_direction = raw.mfrr_cm_best_direction || "";

  // mFRR up vs down
  row.mfrr_up = Math.round((raw[`mfrr_up_total_${dur}h`] || 0) * mw);
  row.mfrr_down = Math.round((raw[`mfrr_down_total_${dur}h`] || 0) * mw);

  // Revenue breakdown
  row.conv_cm = Math.round((raw[`conv_cm_${dur}h`] || 0) * mw);
  row.conv_eam = Math.round((raw[`conv_eam_${dur}h`] || 0) * mw);
  row.conv_imb = Math.round((raw[`conv_imb_${dur}h`] || 0) * mw);
  row.conv_fcrd = Math.round((raw[`conv_fcrd_${dur}h`] || 0) * mw);
  row.nett_cm = Math.round((raw[`nett_cm_${dur}h`] || 0) * mw);
  row.nett_eam = Math.round((raw[`nett_eam_${dur}h`] || 0) * mw);
  row.nett_id_cost = Math.round((raw[`nett_id_cost_${dur}h`] || 0) * mw);
  row.da_gross = Math.round((raw[`da_gross_${dur}h`] || 0) * mw);
  row.da_imb = Math.round((raw[`da_imb_${dur}h`] || 0) * mw);

  // Market prices
  row.fcr_n_price = raw.fcr_n_price || 0;
  row.fcr_d_up_price = raw.fcr_d_up_price || 0;
  row.fcr_d_down_price = raw.fcr_d_down_price || 0;
  row.mfrr_cm_up_price = raw.mfrr_cm_up_price || 0;
  row.mfrr_cm_down_price = raw.mfrr_cm_down_price || 0;
  row.mfrr_eam_up_price = raw.mfrr_eam_up_price || 0;
  row.mfrr_eam_down_price = raw.mfrr_eam_down_price || 0;
  row.intraday_spread = raw.intraday_spread || 0;
  row.da_avg_price = raw.da_avg_price || 0;
  row.da_imbalance_pct = raw.da_imbalance_pct || 0;

  return row;
}

/* ═══════════════════════════════════════════════════════════
   THEME
   ═══════════════════════════════════════════════════════════ */

const T = {
  bg: "#06090f",
  card: "#0d1520",
  cardAlt: "#0a1018",
  border: "#182438",
  borderLight: "#243352",
  text: "#dfe6f0",
  textMuted: "#6b7d9a",
  textDim: "#3d4f6a",
  accent: "#38bdf8",
  red: "#ef4444",
  green: "#34d399",
  amber: "#fbbf24",
  pink: "#f472b6",
};

const fmt = v => v != null ? Math.round(v).toLocaleString("sv-SE") : "—";
const fmtE = v => v != null ? `€${Math.round(v).toLocaleString("sv-SE")}` : "—";
const fmtP = v => v != null ? `€${v.toFixed(2)}` : "—";

/* ═══════════════════════════════════════════════════════════
   SMALL COMPONENTS
   ═══════════════════════════════════════════════════════════ */

const CTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`, borderRadius: 8,
      padding: "10px 14px", fontSize: 12, fontFamily: "'DM Mono', monospace",
      boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
    }}>
      <div style={{ color: T.text, fontWeight: 700, marginBottom: 6, fontSize: 11, fontFamily: "'Outfit', sans-serif" }}>{label}</div>
      {payload.filter(p => p.value != null && p.value !== 0).map((p, i) => (
        <div key={i} style={{ color: p.color || T.text, margin: "3px 0", display: "flex", justifyContent: "space-between", gap: 20 }}>
          <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 11, opacity: 0.85 }}>{p.name}</span>
          <span style={{ fontWeight: 600 }}>{fmtE(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

const Pill = ({ active, onClick, children, color }) => (
  <button onClick={onClick} style={{
    background: active ? (color || T.accent) + "18" : "transparent",
    color: active ? (color || T.accent) : T.textMuted,
    border: `1px solid ${active ? (color || T.accent) + "40" : T.border}`,
    borderRadius: 6, padding: "5px 12px", fontSize: 11.5, cursor: "pointer",
    fontWeight: active ? 600 : 400, fontFamily: "'Outfit', sans-serif",
    whiteSpace: "nowrap", transition: "all 0.15s ease",
  }}>{children}</button>
);

const KPI = ({ label, value, sub, color, warn }) => (
  <div style={{
    background: T.card, border: `1px solid ${T.border}`, borderRadius: 10,
    padding: "12px 14px", flex: 1, minWidth: 140, position: "relative",
  }}>
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: color, borderRadius: "10px 10px 0 0", opacity: 0.8 }} />
    <div style={{ color: T.textMuted, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3, fontFamily: "'Outfit', sans-serif" }}>{label}</div>
    <div style={{ color: T.text, fontSize: 18, fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>{value}</div>
    {sub && <div style={{ color: warn ? T.red : color, fontSize: 10, marginTop: 2, fontFamily: "'Outfit', sans-serif" }}>{sub}</div>}
  </div>
);

function Card({ title, sub, children, style }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 18, ...style }}>
      {title && <h3 style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 600, fontFamily: "'Outfit', sans-serif" }}>{title}</h3>}
      {sub && <div style={{ color: T.textMuted, fontSize: 10, marginBottom: 10, fontFamily: "'Outfit', sans-serif" }}>{sub}</div>}
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN DASHBOARD
   ═══════════════════════════════════════════════════════════ */

export default function Dashboard() {
  const [area, setArea] = useState("SE3");
  const [duration, setDuration] = useState(2);
  const [mw, setMw] = useState(1);
  const [view, setView] = useState("comparison");
  const [selected, setSelected] = useState(new Set(SIDS));
  const [rawData, setRawData] = useState(null);
  const [dataSource, setDataSource] = useState("syntetisk");

  useEffect(() => {
    fetch("/monthly_revenue_all.json")
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { setRawData(d.areas); setDataSource("pipeline"); })
      .catch(() => {
        Promise.all(["SE1", "SE2", "SE3", "SE4"].map(a =>
          fetch(`/monthly_revenue_${a}.json`)
            .then(r => { if (!r.ok) throw new Error(); return r.json(); })
            .then(d => [a, d.months]).catch(() => [a, null])
        )).then(results => {
          const areas = {};
          let found = false;
          results.forEach(([a, months]) => { if (months) { areas[a] = months; found = true; } });
          if (found) { setRawData(areas); setDataSource("pipeline"); }
          else { setRawData(generateSynthetic()); setDataSource("syntetisk"); }
        });
      });
  }, []);

  const toggle = useCallback((id) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) { if (n.size > 1) n.delete(id); } else n.add(id);
      return n;
    });
  }, []);

  const areaData = useMemo(() => {
    if (!rawData) return null;
    return rawData[area] || rawData["SE3"] || Object.values(rawData)[0] || [];
  }, [rawData, area]);

  const months = useMemo(() => {
    if (!areaData) return [];
    return areaData.map(r => transformRow(r, duration, mw));
  }, [areaData, duration, mw]);

  const last12 = months.slice(-12);

  const annuals = useMemo(() => {
    const r = {};
    SIDS.forEach(sid => { r[sid] = last12.reduce((s, m) => s + (m[sid] || 0), 0); });
    r.optimal = last12.reduce((s, m) => s + (m.optimal || 0), 0);
    return r;
  }, [last12]);

  const optCounts = useMemo(() => {
    const c = {};
    last12.forEach(m => { c[m.optimalStrategy] = (c[m.optimalStrategy] || 0) + 1; });
    return c;
  }, [last12]);

  // Duration comparison data
  const durComp = useMemo(() => {
    if (!areaData) return [];
    return areaData.map(r => {
      const label = transformRow(r, 2, 1).label;
      const row = { label };
      DURATIONS.forEach(dur => { row[`opt_${dur}h`] = Math.round((r[`optimal_${dur}h`] || 0) * mw); });
      return row;
    });
  }, [areaData, mw]);

  // Market prices for breakdown view
  const priceData = useMemo(() => {
    return months.map(m => ({
      label: m.label,
      "FCR-N": m.fcr_n_price,
      "FCR-D upp": m.fcr_d_up_price,
      "FCR-D ned": m.fcr_d_down_price,
      "mFRR CM upp": m.mfrr_cm_up_price,
      "mFRR CM ned": m.mfrr_cm_down_price,
      "mFRR EAM upp": m.mfrr_eam_up_price,
      "mFRR EAM ned": m.mfrr_eam_down_price,
      "ID spread": m.intraday_spread,
      "DA snitt": m.da_avg_price,
    }));
  }, [months]);

  if (!rawData) return (
    <div style={{ background: T.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: T.textMuted, fontFamily: "'Outfit', sans-serif" }}>
      Laddar data…
    </div>
  );

  const thS = {
    padding: "5px 6px", textAlign: "right", fontSize: 8,
    textTransform: "uppercase", letterSpacing: "0.05em", color: T.textMuted,
    fontFamily: "'Outfit', sans-serif",
  };

  return (
    <div style={{ background: T.bg, minHeight: "100vh", fontFamily: "'Outfit', sans-serif", color: T.text }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* ── HEADER ── */}
      <header style={{ borderBottom: `1px solid ${T.border}`, padding: "14px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: "-0.03em" }}>
              BESS Revenue Intelligence
            </h1>
            <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>
              Batterilagring — intäktsanalys per tjänst och strategi · {area}
              {dataSource === "syntetisk" && <span style={{ color: T.red }}> · ⚠ Syntetisk data</span>}
              {dataSource === "pipeline" && <span style={{ color: T.green }}> · ✓ Pipeline-data</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase" }}>Elområde</span>
            {["SE1", "SE2", "SE3", "SE4"].map(a => <Pill key={a} active={area === a} onClick={() => setArea(a)}>{a}</Pill>)}
            <div style={{ width: 1, height: 16, background: T.border, margin: "0 4px" }} />
            <span style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase" }}>MW</span>
            <input type="number" min={0.5} max={200} step={0.5} value={mw}
              onChange={e => setMw(Number(e.target.value) || 1)}
              style={{
                width: 52, background: T.card, border: `1px solid ${T.border}`,
                borderRadius: 5, color: T.text, padding: "3px 6px", fontSize: 13,
                fontFamily: "'DM Mono', monospace", textAlign: "center",
              }}
            />
          </div>
        </div>
      </header>

      <div style={{ padding: "14px 20px", maxWidth: 1440, margin: "0 auto" }}>

        {/* ── DURATION SELECTOR ── */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
          <span style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase", letterSpacing: "0.08em" }}>Uthållighet</span>
          {DURATIONS.map(dur => (
            <button key={dur} onClick={() => setDuration(dur)} style={{
              background: duration === dur ? T.accent : T.card,
              color: duration === dur ? "#000" : T.textMuted,
              border: `1px solid ${duration === dur ? T.accent : T.border}`,
              borderRadius: 7, padding: "6px 18px", fontSize: 14,
              cursor: "pointer", fontWeight: 700, fontFamily: "'DM Mono', monospace",
              transition: "all 0.15s ease",
            }}>{dur}h</button>
          ))}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: T.textMuted, fontFamily: "'DM Mono', monospace" }}>
            {mw} MW · {mw * duration} MWh · C/{duration}
          </span>
        </div>

        {/* ── KPIs ── */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          <KPI label={`Optimal 12 mån (${duration}h)`} value={fmtE(annuals.optimal)} sub="bästa strategi/mån" color={T.red} />
          <KPI label="FCR-N" value={fmtE(annuals.fcrn)} sub={`${optCounts.fcrn || 0}/12 optimal`} color={STRATEGIES.fcrn.color} />
          <KPI label="FCR-D" value={fmtE(annuals.fcrd)} sub={`${optCounts.fcrd || 0}/12 optimal`} color={STRATEGIES.fcrd.color} />
          <KPI label="mFRR nettning" value={fmtE(annuals.mfrr_netting)} sub={`${optCounts.mfrr_netting || 0}/12 optimal`} color={STRATEGIES.mfrr_netting.color} />
          <KPI label="Day-ahead" value={fmtE(annuals.dayahead)}
            sub={`${optCounts.dayahead || 0}/12 · inkl. obalanskostnad`}
            color={STRATEGIES.dayahead.color} warn={true} />
        </div>

        {/* ── TABS ── */}
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {[
            { k: "comparison", l: "Strategijämförelse" },
            { k: "services",   l: "Intäkt per tjänst" },
            { k: "mfrr",       l: "mFRR upp vs ned" },
            { k: "dayahead",   l: "Day-ahead & obalans" },
            { k: "duration",   l: "1h / 2h / 4h" },
            { k: "optimal",    l: "Optimal strategi" },
            { k: "table",      l: "Månadstabell" },
          ].map(v => <Pill key={v.k} active={view === v.k} onClick={() => setView(v.k)}>{v.l}</Pill>)}
        </div>

        {/* Strategy filter (for comparison + table views) */}
        {(view === "comparison" || view === "table") && (
          <div style={{ display: "flex", gap: 5, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase" }}>Visa</span>
            {Object.entries(STRATEGIES).map(([sid, s]) => (
              <Pill key={sid} active={selected.has(sid)} color={s.color} onClick={() => toggle(sid)}>{s.label}</Pill>
            ))}
          </div>
        )}

        {/* ════════════════════════ VIEWS ════════════════════════ */}

        {/* ── COMPARISON ── */}
        {view === "comparison" && (
          <Card title={`Strategijämförelse — ${duration}h (${mw * duration} MWh)`} sub="EUR/mån per strategi · Optimal markerad med röd linje">
            <ResponsiveContainer width="100%" height={380}>
              <ComposedChart data={months} margin={{ top: 8, right: 12, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                <XAxis dataKey="label" tick={{ fill: T.textMuted, fontSize: 9, fontFamily: "'Outfit', sans-serif" }} angle={-45} textAnchor="end" height={50} />
                <YAxis tick={{ fill: T.textMuted, fontSize: 10 }} tickFormatter={v => `€${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10, fontFamily: "'Outfit', sans-serif" }} />
                {SIDS.filter(sid => selected.has(sid)).map(sid => (
                  <Bar key={sid} dataKey={sid} name={STRATEGIES[sid].label} fill={STRATEGIES[sid].color} opacity={0.55} radius={[2, 2, 0, 0]} />
                ))}
                <Line dataKey="optimal" name="Optimal" stroke={T.red} strokeWidth={2.5} dot={{ r: 2, fill: T.red }} />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* ── INTÄKT PER TJÄNST (service breakdown) ── */}
        {view === "services" && (() => {
          const serviceData = months.map(m => ({
            label: m.label,
            "FCR-N kapacitet": Math.round(m.fcr_n_price * 0.5 * FCRN_H[duration] * (m.ym ? new Date(+m.ym.slice(0, 4), +m.ym.slice(5, 7), 0).getDate() : 30) * mw),
            "FCR-D upp": Math.round(m.fcr_d_up_price * 0.87 * (m.ym ? new Date(+m.ym.slice(0, 4), +m.ym.slice(5, 7), 0).getDate() * 24 : 720) * mw),
            "FCR-D ned": Math.round(m.fcr_d_down_price * 0.87 * (m.ym ? new Date(+m.ym.slice(0, 4), +m.ym.slice(5, 7), 0).getDate() * 24 : 720) * mw),
            "mFRR CM": Math.round(m.nett_cm),
            "mFRR EAM": Math.round(m.nett_eam),
            "Intradag": Math.round(m.intraday2),
            "Day-ahead": Math.round(m.dayahead),
          }));
          const svcColors = {
            "FCR-N kapacitet": "#38bdf8",
            "FCR-D upp": "#fbbf24",
            "FCR-D ned": "#f59e0b",
            "mFRR CM": "#34d399",
            "mFRR EAM": "#10b981",
            "Intradag": "#a78bfa",
            "Day-ahead": "#f472b6",
          };
          return (
            <Card title={`Intäkt per tjänst — ${duration}h (${mw} MW)`} sub="Uppdelat per intäktsström/marknadsprodukt · EUR/mån">
              <ResponsiveContainer width="100%" height={380}>
                <ComposedChart data={serviceData} margin={{ top: 8, right: 12, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                  <XAxis dataKey="label" tick={{ fill: T.textMuted, fontSize: 9 }} angle={-45} textAnchor="end" height={50} />
                  <YAxis tick={{ fill: T.textMuted, fontSize: 10 }} tickFormatter={v => `€${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<CTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 10, fontFamily: "'Outfit', sans-serif" }} />
                  {Object.entries(svcColors).map(([name, color]) => (
                    <Bar key={name} dataKey={name} stackId="svc" fill={color} opacity={0.7} radius={name === "Day-ahead" ? [2, 2, 0, 0] : [0, 0, 0, 0]} />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>

              {/* Price table */}
              <div style={{ marginTop: 16, overflowX: "auto" }}>
                <div style={{ color: T.text, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Marknadspriser — senaste 6 månader</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, fontFamily: "'DM Mono', monospace" }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                      <th style={{ ...thS, textAlign: "left" }}>Mån</th>
                      <th style={{ ...thS, color: "#38bdf8" }}>FCR-N</th>
                      <th style={{ ...thS, color: "#fbbf24" }}>FCR-D upp</th>
                      <th style={{ ...thS, color: "#f59e0b" }}>FCR-D ned</th>
                      <th style={{ ...thS, color: "#34d399" }}>mFRR CM upp</th>
                      <th style={{ ...thS, color: "#10b981" }}>mFRR CM ned</th>
                      <th style={{ ...thS, color: "#6ee7b7" }}>EAM upp</th>
                      <th style={{ ...thS, color: "#a7f3d0" }}>EAM ned</th>
                      <th style={{ ...thS, color: "#a78bfa" }}>ID spread</th>
                      <th style={{ ...thS, color: "#f472b6" }}>DA snitt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {months.slice(-6).map((m, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${T.border}` }}>
                        <td style={{ padding: "4px 6px", fontWeight: 500, fontSize: 10, fontFamily: "'Outfit', sans-serif" }}>{m.label}</td>
                        <td style={{ padding: "4px 6px", textAlign: "right" }}>{fmtP(m.fcr_n_price)}</td>
                        <td style={{ padding: "4px 6px", textAlign: "right" }}>{fmtP(m.fcr_d_up_price)}</td>
                        <td style={{ padding: "4px 6px", textAlign: "right" }}>{fmtP(m.fcr_d_down_price)}</td>
                        <td style={{ padding: "4px 6px", textAlign: "right" }}>{fmtP(m.mfrr_cm_up_price)}</td>
                        <td style={{ padding: "4px 6px", textAlign: "right" }}>{fmtP(m.mfrr_cm_down_price)}</td>
                        <td style={{ padding: "4px 6px", textAlign: "right" }}>{fmtP(m.mfrr_eam_up_price)}</td>
                        <td style={{ padding: "4px 6px", textAlign: "right" }}>{fmtP(m.mfrr_eam_down_price)}</td>
                        <td style={{ padding: "4px 6px", textAlign: "right" }}>{fmtP(m.intraday_spread)}</td>
                        <td style={{ padding: "4px 6px", textAlign: "right" }}>{fmtP(m.da_avg_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          );
        })()}

        {/* ── mFRR UPP vs NED ── */}
        {view === "mfrr" && (() => {
          const mfrrData = months.map(m => ({
            label: m.label,
            "mFRR upp (CM+EAM)": m.mfrr_up,
            "mFRR ned (CM+EAM)": m.mfrr_down,
            delta: m.mfrr_up - m.mfrr_down,
            dir: m.mfrr_direction,
            cm_up: m.mfrr_cm_up_price,
            cm_down: m.mfrr_cm_down_price,
            eam_up: m.mfrr_eam_up_price,
            eam_down: m.mfrr_eam_down_price,
          }));
          const t12 = mfrrData.slice(-12);
          const sumUp = t12.reduce((s, d) => s + d["mFRR upp (CM+EAM)"], 0);
          const sumDown = t12.reduce((s, d) => s + d["mFRR ned (CM+EAM)"], 0);
          const dirCounts = {};
          months.forEach(m => { dirCounts[m.mfrr_direction] = (dirCounts[m.mfrr_direction] || 0) + 1; });

          // mFRR conv vs netting comparison
          const convVsNett = months.map(m => ({
            label: m.label,
            "Konventionell": m.mfrr_conv,
            "Intradagsnettning": m.mfrr_netting,
            delta: m.mfrr_netting - m.mfrr_conv,
          }));
          const cvn12 = convVsNett.slice(-12);
          const sumConv = cvn12.reduce((s, d) => s + d["Konventionell"], 0);
          const sumNett = cvn12.reduce((s, d) => s + d["Intradagsnettning"], 0);

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Card title={`mFRR upp vs ned — ${area} · ${duration}h`}
                sub={`Jämför total CM+EAM-intäkt per riktning · ${Object.entries(dirCounts).map(([d, c]) => `${d} ${c} mån`).join(", ")}`}>
                <ResponsiveContainer width="100%" height={320}>
                  <ComposedChart data={mfrrData} margin={{ top: 8, right: 12, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                    <XAxis dataKey="label" tick={{ fill: T.textMuted, fontSize: 9 }} angle={-45} textAnchor="end" height={50} />
                    <YAxis tick={{ fill: T.textMuted, fontSize: 10 }} tickFormatter={v => `€${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<CTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="mFRR upp (CM+EAM)" fill="#34d399" opacity={0.7} radius={[2, 2, 0, 0]} />
                    <Bar dataKey="mFRR ned (CM+EAM)" fill="#fbbf24" opacity={0.7} radius={[2, 2, 0, 0]} />
                    <Line dataKey="delta" name="Δ (upp−ned)" stroke="#fff" strokeWidth={1.5} strokeDasharray="4 2" dot={{ r: 2, fill: "#fff" }} />
                  </ComposedChart>
                </ResponsiveContainer>
                <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {[
                    { l: "mFRR upp 12m", v: fmtE(sumUp), c: T.green },
                    { l: "mFRR ned 12m", v: fmtE(sumDown), c: T.amber },
                    { l: "Bäst", v: sumUp > sumDown ? "UPP" : "NED", c: sumUp > sumDown ? T.green : T.amber },
                  ].map((x, i) => (
                    <div key={i} style={{ background: T.cardAlt, border: `1px solid ${T.border}`, borderRadius: 7, padding: 10, textAlign: "center" }}>
                      <div style={{ fontSize: 9, color: T.textMuted, marginBottom: 3 }}>{x.l}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: x.c }}>{x.v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 12, padding: 12, background: T.cardAlt, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 11, lineHeight: 1.7, color: T.textMuted }}>
                  <strong style={{ color: T.text }}>Riktningslogik:</strong> SE1/SE2 (norr) har typiskt överskottsproduktion → mFRR ned efterfrågas mer. SE3/SE4 (söder) har underskott → mFRR upp efterfrågas mer.
                  Auto-vald per månad baserat på CM-pris + EAM-pris × 0.3.
                </div>
              </Card>

              <Card title={`Konventionell vs intradagsnettning — ${duration}h`}
                sub="Samma riktning, olika återställningsmetod">
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={convVsNett} margin={{ top: 8, right: 12, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                    <XAxis dataKey="label" tick={{ fill: T.textMuted, fontSize: 9 }} angle={-45} textAnchor="end" height={50} />
                    <YAxis tick={{ fill: T.textMuted, fontSize: 10 }} tickFormatter={v => `€${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<CTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="Konventionell" fill={STRATEGIES.mfrr_conv.color} opacity={0.7} radius={[2, 2, 0, 0]} />
                    <Bar dataKey="Intradagsnettning" fill={STRATEGIES.mfrr_netting.color} opacity={0.7} radius={[2, 2, 0, 0]} />
                    <Line dataKey="delta" name="Δ nettning−konv." stroke="#fff" strokeWidth={1.5} strokeDasharray="4 2" dot={{ r: 2, fill: "#fff" }} />
                  </ComposedChart>
                </ResponsiveContainer>
                <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {[
                    { l: "Konventionell 12m", v: fmtE(sumConv), c: STRATEGIES.mfrr_conv.color },
                    { l: "Intradagsnettning 12m", v: fmtE(sumNett), c: STRATEGIES.mfrr_netting.color },
                    { l: "Skillnad", v: sumConv > 0 ? `+${((sumNett - sumConv) / sumConv * 100).toFixed(0)}%` : "—", c: "#fff" },
                  ].map((x, i) => (
                    <div key={i} style={{ background: T.cardAlt, border: `1px solid ${T.border}`, borderRadius: 7, padding: 10, textAlign: "center" }}>
                      <div style={{ fontSize: 9, color: T.textMuted, marginBottom: 3 }}>{x.l}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: x.c }}>{x.v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 12, padding: 12, background: T.cardAlt, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 11, lineHeight: 1.7, color: T.textMuted }}>
                  <strong style={{ color: T.text }}>Konventionell:</strong> Deltar {({ 1: 12, 2: 16, 4: 20 })[duration]}h/dygn på mFRR CM. SoC-återställning via elhandlare → begränsad tillgänglighet, ~6% obalanskostnad. Resterande timmar på FCR-D.
                  <br /><br /><strong style={{ color: T.text }}>Intradagsnettning:</strong> 24/7 CM-deltagande. SoC-återställning via intradagsmarknaden → inga pauser, fler EAM-aktiveringar möjliga ({NETTING_EAM[duration]}/dag vs {CONV_EAM_N[duration]}/dag).
                </div>
              </Card>
            </div>
          );
        })()}

        {/* ── DAY-AHEAD & OBALANS ── */}
        {view === "dayahead" && (() => {
          const daData = months.map(m => ({
            label: m.label,
            "Bruttoarbitrage": m.da_gross,
            "Obalanskostnad": -m.da_imb,
            "Nettointäkt": m.dayahead,
            "Intradag 2c (jmf)": m.intraday2,
          }));
          const t12 = daData.slice(-12);
          const totDA = t12.reduce((s, d) => s + d["Nettointäkt"], 0);
          const totImb = t12.reduce((s, d) => s + Math.abs(d["Obalanskostnad"]), 0);
          const totGross = t12.reduce((s, d) => s + d["Bruttoarbitrage"], 0);
          const totID = t12.reduce((s, d) => s + d["Intradag 2c (jmf)"], 0);
          return (
            <Card title={`Day-ahead arbitrage — ${duration}h (${mw * duration} MWh)`}
              sub="Köp vid dagslägsta, sälj vid dagshögsta på day-ahead-marknaden · Obalanskostnad highlightad">
              <ResponsiveContainer width="100%" height={350}>
                <ComposedChart data={daData} margin={{ top: 8, right: 12, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                  <XAxis dataKey="label" tick={{ fill: T.textMuted, fontSize: 9 }} angle={-45} textAnchor="end" height={50} />
                  <YAxis tick={{ fill: T.textMuted, fontSize: 10 }} tickFormatter={v => `€${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<CTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="Bruttoarbitrage" fill={T.pink} opacity={0.5} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="Obalanskostnad" fill={T.red} opacity={0.7} radius={[0, 0, 2, 2]} />
                  <Line dataKey="Nettointäkt" name="DA netto" stroke={T.pink} strokeWidth={2.5} dot={{ r: 3, fill: T.pink }} />
                  <Line dataKey="Intradag 2c (jmf)" stroke={STRATEGIES.intraday2.color} strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>

              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                {[
                  { l: "DA brutto 12m", v: fmtE(totGross), c: T.pink },
                  { l: "Obalanskostnad", v: `−${fmtE(totImb)}`, c: T.red },
                  { l: "DA netto 12m", v: fmtE(totDA), c: T.pink },
                  { l: "Intradag 2c (jmf)", v: fmtE(totID), c: STRATEGIES.intraday2.color },
                ].map((x, i) => (
                  <div key={i} style={{ background: T.cardAlt, border: `1px solid ${T.border}`, borderRadius: 7, padding: 10, textAlign: "center" }}>
                    <div style={{ fontSize: 9, color: T.textMuted, marginBottom: 3 }}>{x.l}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: x.c }}>{x.v}</div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 14, padding: 12, background: T.red + "0a", border: `1px solid ${T.red}22`, borderRadius: 8, fontSize: 11, lineHeight: 1.7, color: T.textMuted }}>
                <strong style={{ color: T.red }}>⚠ Obalanskostnad:</strong> Day-ahead-budgivning sker dagen innan leverans.
                Avvikelser mellan planerad och faktisk produktion/konsumtion leder till obalanser som regleras av SVK.
                Obalanskostnaden uppskattas till ~{(months.slice(-1)[0]?.da_imbalance_pct * 100 || 8).toFixed(0)}% av bruttointäkten — den faktiska kostnaden beror på
                budprecision, prognosmodell och marknadsvillkor.
                <br /><br />
                <strong style={{ color: T.text }}>Jämförelse med intradagshandel:</strong> Intradagsmarknaden handlas närmare leverans och har lägre obalansrisk,
                men typiskt högre spread. Streckad linje ovan visar intradagsreferens med 2 cykler/dag.
              </div>
            </Card>
          );
        })()}

        {/* ── DURATION ── */}
        {view === "duration" && (
          <Card title="Optimal intäkt: 1h vs 2h vs 4h BESS" sub="EUR/mån · Bästa strategi per uthållighet">
            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart data={durComp} margin={{ top: 8, right: 12, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                <XAxis dataKey="label" tick={{ fill: T.textMuted, fontSize: 9 }} angle={-45} textAnchor="end" height={50} />
                <YAxis tick={{ fill: T.textMuted, fontSize: 10 }} tickFormatter={v => `€${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line dataKey="opt_1h" name="1h optimal" stroke="#38bdf8" strokeWidth={2} dot={{ r: 3, fill: "#38bdf8" }} />
                <Line dataKey="opt_2h" name="2h optimal" stroke="#f472b6" strokeWidth={2.5} dot={{ r: 3, fill: "#f472b6" }} />
                <Line dataKey="opt_4h" name="4h optimal" stroke="#a3e635" strokeWidth={2} dot={{ r: 3, fill: "#a3e635" }} />
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {DURATIONS.map(dur => {
                const ann = durComp.slice(-12).reduce((s, r) => s + (r[`opt_${dur}h`] || 0), 0);
                return (
                  <div key={dur} style={{ background: T.cardAlt, border: `1px solid ${T.border}`, borderRadius: 8, padding: 12, textAlign: "center" }}>
                    <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "'DM Mono', monospace", color: dur === duration ? T.accent : T.text }}>{dur}h</div>
                    <div style={{ fontSize: 10, color: T.textMuted }}>{mw} MW / {mw * dur} MWh</div>
                    <div style={{ fontSize: 17, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: T.green, marginTop: 6 }}>{fmtE(ann)}</div>
                    <div style={{ fontSize: 10, color: T.textMuted }}>Optimal 12 mån</div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* ── OPTIMAL ── */}
        {view === "optimal" && (
          <Card title={`Optimal strategi per månad — ${duration}h`} sub="Färg = vinnande strategi den månaden">
            <ResponsiveContainer width="100%" height={360}>
              <ComposedChart data={months} margin={{ top: 8, right: 12, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                <XAxis dataKey="label" tick={{ fill: T.textMuted, fontSize: 9 }} angle={-45} textAnchor="end" height={50} />
                <YAxis tick={{ fill: T.textMuted, fontSize: 10 }} tickFormatter={v => `€${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CTooltip />} />
                <Bar dataKey="optimal" name="Optimal intäkt">
                  {months.map((m, i) => <Cell key={i} fill={STRATEGIES[m.optimalStrategy]?.color || T.accent} opacity={0.8} />)}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
              {SIDS.map(sid => {
                const cnt = months.filter(m => m.optimalStrategy === sid).length;
                if (!cnt) return null;
                return (
                  <div key={sid} style={{
                    background: STRATEGIES[sid].color + "12", border: `1px solid ${STRATEGIES[sid].color}30`,
                    borderRadius: 6, padding: "5px 10px", display: "flex", alignItems: "center", gap: 6, fontSize: 11,
                  }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: STRATEGIES[sid].color }} />
                    <span>{STRATEGIES[sid].label}</span>
                    <span style={{ fontWeight: 700, fontFamily: "'DM Mono', monospace", color: STRATEGIES[sid].color }}>{cnt} mån</span>
                  </div>
                );
              })}
            </div>
            {/* Heatmap strip */}
            <div style={{ marginTop: 10, display: "flex", gap: 2, flexWrap: "wrap" }}>
              {months.map((m, i) => (
                <div key={i}
                  title={`${m.label}: ${STRATEGIES[m.optimalStrategy]?.label} — ${fmtE(m.optimal)}`}
                  style={{
                    flex: 1, minWidth: 18, height: 28, borderRadius: 3,
                    background: STRATEGIES[m.optimalStrategy]?.color, opacity: 0.7,
                    display: "flex", alignItems: "flex-end", justifyContent: "center",
                    fontSize: 6, color: "#000", fontWeight: 700, paddingBottom: 2,
                  }}>
                  {m.label.split(" ")[1]?.substring(0, 3)}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── TABLE ── */}
        {view === "table" && (
          <Card title={`Månadstabell — ${duration}h · ${mw} MW / ${mw * duration} MWh`}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "'DM Mono', monospace" }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                    <th style={{ ...thS, textAlign: "left" }}>Mån</th>
                    {SIDS.filter(sid => selected.has(sid)).map(sid => (
                      <th key={sid} style={{ ...thS, color: STRATEGIES[sid].color }}>
                        {STRATEGIES[sid].short}
                      </th>
                    ))}
                    <th style={{ ...thS, color: T.red }}>Optimal</th>
                    <th style={{ ...thS, textAlign: "left" }}>Bäst</th>
                    <th style={{ ...thS, textAlign: "left" }}>mFRR</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((m, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${T.border}`, background: i % 2 ? T.bg + "66" : "transparent" }}>
                      <td style={{ padding: "4px 6px", fontWeight: 500, fontSize: 10, fontFamily: "'Outfit', sans-serif" }}>{m.label}</td>
                      {SIDS.filter(sid => selected.has(sid)).map(sid => (
                        <td key={sid} style={{
                          padding: "4px 6px", textAlign: "right",
                          color: m.optimalStrategy === sid ? STRATEGIES[sid].color : T.textDim,
                          fontWeight: m.optimalStrategy === sid ? 700 : 400,
                        }}>{fmt(m[sid])}</td>
                      ))}
                      <td style={{ padding: "4px 6px", textAlign: "right", color: T.red, fontWeight: 700 }}>{fmt(m.optimal)}</td>
                      <td style={{ padding: "4px 6px", color: STRATEGIES[m.optimalStrategy]?.color, fontSize: 9, fontWeight: 600 }}>
                        {STRATEGIES[m.optimalStrategy]?.short}
                      </td>
                      <td style={{ padding: "4px 6px", fontSize: 9, color: T.textMuted }}>
                        {m.mfrr_direction}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${T.borderLight}` }}>
                    <td style={{ padding: "5px 6px", fontWeight: 700, fontFamily: "'Outfit', sans-serif" }}>SUMMA</td>
                    {SIDS.filter(sid => selected.has(sid)).map(sid => (
                      <td key={sid} style={{ padding: "5px 6px", textAlign: "right", fontWeight: 700 }}>
                        {fmt(months.reduce((s, m) => s + (m[sid] || 0), 0))}
                      </td>
                    ))}
                    <td style={{ padding: "5px 6px", textAlign: "right", fontWeight: 700, color: T.red }}>
                      {fmt(months.reduce((s, m) => s + (m.optimal || 0), 0))}
                    </td>
                    <td /><td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        )}

        {/* ── FOOTER ── */}
        <div style={{
          marginTop: 16, padding: 14, background: T.card, border: `1px solid ${T.border}`,
          borderRadius: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 14, fontSize: 10, color: T.textMuted, lineHeight: 1.7,
        }}>
          <div>
            <div style={{ color: T.text, fontWeight: 600, marginBottom: 3 }}>Uthållighetsfysik</div>
            FCR-N: 1h→16h/dag, 2h→20h, 4h→24h (kontinuerlig cykling kräver SoC-buffert)<br />
            FCR-D: uthållighetsoberoende (sällan, kort aktivering)<br />
            mFRR EAM: mer MWh = fler aktiveringar/dag utan SoC-problem
          </div>
          <div>
            <div style={{ color: T.text, fontWeight: 600, marginBottom: 3 }}>mFRR riktning</div>
            SE1/SE2: ned ofta bättre (överproduktion norr)<br />
            SE3/SE4: upp ofta bättre (produktionsbrist söder)<br />
            Auto-valt per månad baserat på faktiska priser
          </div>
          <div>
            <div style={{ color: T.text, fontWeight: 600, marginBottom: 3 }}>Datakällor</div>
            FCR-N/D, mFRR CM: Mimer (SVK)<br />
            mFRR EAM: Mimer + ENTSO-E TP<br />
            Intraday: Nord Pool / ENTSO-E DA-proxy<br />
            Day-ahead: ENTSO-E TP / Nord Pool
          </div>
          <div>
            <div style={{ color: T.text, fontWeight: 600, marginBottom: 3 }}>Strategier</div>
            7 strategier × 3 uthålligheter = 21 beräkningar/mån<br />
            RTE: 85% · FCR-D dual: 87%<br />
            Day-ahead: 55% capture, ~8% obalanskostnad
          </div>
        </div>
      </div>
    </div>
  );
}
