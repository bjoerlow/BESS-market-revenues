import { useState, useMemo, useCallback, useEffect } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell
} from "recharts";

/* ═══════════════════════════════════════════════════════════
   CONFIG
   ═══════════════════════════════════════════════════════════ */

const STRATEGIES = {
  fcrn:       { id: "fcrn",       label: "FCR-N 24/7",                 color: "#38bdf8" },
  fcrd:       { id: "fcrd",       label: "FCR-D upp+ned",              color: "#fbbf24" },
  mfrr_comp:  { id: "mfrr_comp",  label: "mFRR+FCR-D (konventionell)", color: "#fb923c" },
  mfrr_gv:    { id: "mfrr_gv",    label: "mFRR CM+EAM (GreenVoltis)",  color: "#34d399" },
  intraday1:  { id: "intraday1",  label: "Intradag 1 cykel",          color: "#c084fc" },
  intraday2:  { id: "intraday2",  label: "Intradag 2 cykler",         color: "#a78bfa" },
  intradayHF: { id: "intradayHF", label: "Intradag 2c + HF",          color: "#818cf8" },
};
const SIDS = Object.keys(STRATEGIES);
const DURATIONS = [1, 2, 4];

/* ═══════════════════════════════════════════════════════════
   DATA LOADER — reads pipeline JSON, falls back to synthetic
   ═══════════════════════════════════════════════════════════ */

// Transform pipeline row to dashboard format for a given duration
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
  row.mfrr_cm_up = raw.mfrr_cm_up_price || 0;
  row.mfrr_cm_down = raw.mfrr_cm_down_price || 0;
  return row;
}

// Synthetic fallback (identical structure to pipeline output)
function generateSynthetic() {
  const FCRN_H = { 1: 16, 2: 20, 4: 24 };
  const GV_EAM = { 1: 3, 2: 5, 4: 8 };
  const COMP_H = { 1: 12, 2: 16, 4: 20 };
  const COMP_BF = { 1: 12, 2: 8, 4: 4 };
  const COMP_EAM_N = { 1: 2, 2: 3, 4: 5 };
  const months = [];
  let d = new Date(2024, 0);
  const end = new Date(2026, 5);
  while (d < end) {
    const m = d.getMonth(), y = d.getFullYear();
    const days = new Date(y, m + 1, 0).getDate(), hours = days * 24;
    const S = [18,15,12,8,6,5,5,6,10,14,17,20];
    const fcrn = 22 + S[m] + Math.sin(y*7+m*3)*3;
    const fcrdU = 4 + S[m]*0.35 + Math.sin(y*5+m*2)*1.2;
    const fcrdD = 3 + S[m]*0.3 + Math.cos(y*4+m*5)*0.8;
    const cmU = 3 + S[m]*0.35 + Math.sin(y*3+m*7)*1;
    const cmD = 2 + S[m]*0.25 + Math.cos(y*6+m*3)*0.8;
    const hasEAM = d >= new Date(2025, 2);
    const eamU = hasEAM ? 40 + Math.sin(y*11+m*4)*18 : 0;
    const eamD = hasEAM ? 30 + Math.cos(y*8+m*6)*12 : 0;
    const spread = 8 + S[m]*0.6 + Math.cos(y*6+m*9)*2.5;
    const range = spread * 3;
    const rte = 0.85;

    const bestUp = cmU + eamU*0.3 >= cmD + eamD*0.3;
    const bestCM = bestUp ? cmU : cmD;
    const bestEAM = bestUp ? eamU : eamD;

    const row = {
      year_month: `${y}-${String(m+1).padStart(2,"0")}`,
      mfrr_cm_best_direction: bestUp ? "upp" : "ned",
      mfrr_cm_up_price: Math.round(cmU*100)/100,
      mfrr_cm_down_price: Math.round(cmD*100)/100,
    };

    DURATIONS.forEach(dur => {
      const mwh = dur;
      const fcrn_r = fcrn * FCRN_H[dur] * days;
      const fcrd_r = (fcrdU+fcrdD)*0.87*hours;
      const comp_mh = COMP_H[dur]*days;
      const comp_cm = bestCM*comp_mh;
      const comp_act = min(dur,0.25);
      const comp_eam = bestEAM>0 ? COMP_EAM_N[dur]*comp_act*bestEAM*days*rte : 0;
      const comp_imb = (comp_cm+comp_eam)*0.06;
      const comp_fcrd = (fcrdU+fcrdD)*0.87*COMP_BF[dur]*days;
      const comp_r = comp_cm+comp_eam-comp_imb+comp_fcrd;
      const gv_cm = bestCM*hours;
      const gv_act = min(dur,0.25);
      const gv_eam = bestEAM>0 ? GV_EAM[dur]*gv_act*bestEAM*days*rte : 0;
      const gv_id = bestEAM>0 ? GV_EAM[dur]*gv_act*spread*days*0.5 : 0;
      const gv_r = gv_cm+gv_eam-gv_id;
      const id1 = mwh*range*rte*days*0.7;
      const id2 = mwh*range*rte*days*(0.7+0.45);
      const idHF = id2*1.12;

      const strats = { fcrn: fcrn_r, fcrd: fcrd_r, mfrr_comp: comp_r, mfrr_gv: gv_r, intraday1: id1, intraday2: id2, intradayHF: idHF };
      let bestV=-Infinity, bestS="fcrn";
      Object.entries(strats).forEach(([s,v]) => { row[`${s}_${dur}h`]=Math.round(v); if(v>bestV){bestV=v;bestS=s;} });
      row[`optimal_${dur}h`] = Math.round(bestV);
      row[`optimal_strategy_${dur}h`] = bestS;
    });
    months.push(row);
    d = new Date(y, m+1);
  }
  return { SE1: months, SE2: months, SE3: months, SE4: months };
}
function min(a,b){ return a < b ? a : b; }

/* ═══════════════════════════════════════════════════════════
   THEME + UTILS
   ═══════════════════════════════════════════════════════════ */
const T = {
  bg: "#080e1a", card: "#111d33", cardAlt: "#0f1929",
  border: "#1a2744", borderLight: "#243352",
  text: "#e8edf5", textMuted: "#7a8baa", textDim: "#4a5a78",
  accent: "#38bdf8", red: "#f43f5e", green: "#34d399",
};
const fmt = v => v != null ? Math.round(v).toLocaleString("sv-SE") : "—";
const fmtE = v => v != null ? `€${Math.round(v).toLocaleString("sv-SE")}` : "—";

/* ═══════════════════════════════════════════════════════════
   SMALL COMPONENTS
   ═══════════════════════════════════════════════════════════ */
const CTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 12, fontFamily: "JetBrains Mono, monospace" }}>
      <div style={{ color: T.text, fontWeight: 700, marginBottom: 6 }}>{label}</div>
      {payload.filter(p => p.value != null && p.value !== 0).map((p, i) => (
        <div key={i} style={{ color: p.color, margin: "2px 0", display: "flex", justifyContent: "space-between", gap: 24 }}>
          <span style={{ fontFamily: "Instrument Sans, sans-serif", fontSize: 11 }}>{p.name}</span>
          <span style={{ fontWeight: 600 }}>{fmtE(p.value)}</span>
        </div>
      ))}
    </div>
  );
};
const Pill = ({ active, onClick, children, color }) => (
  <button onClick={onClick} style={{
    background: active ? (color || T.accent) + "22" : "transparent",
    color: active ? (color || T.accent) : T.textMuted,
    border: `1px solid ${active ? (color || T.accent) + "44" : T.border}`,
    borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer",
    fontWeight: active ? 600 : 400, fontFamily: "Instrument Sans, sans-serif",
    whiteSpace: "nowrap",
  }}>{children}</button>
);
const KPI = ({ label, value, sub, color }) => (
  <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 14px", flex: 1, minWidth: 145, position: "relative" }}>
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: color, borderRadius: "10px 10px 0 0" }} />
    <div style={{ color: T.textMuted, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{label}</div>
    <div style={{ color: T.text, fontSize: 18, fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>{value}</div>
    {sub && <div style={{ color, fontSize: 10, marginTop: 2 }}>{sub}</div>}
  </div>
);
function ChartCard({ title, sub, children }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 18 }}>
      {title && <h3 style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 600 }}>{title}</h3>}
      {sub && <div style={{ color: T.textMuted, fontSize: 10, marginBottom: 10 }}>{sub}</div>}
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
  const [selected, setSelected] = useState(new Set(["fcrn","fcrd","mfrr_comp","mfrr_gv","intraday2"]));
  const [rawData, setRawData] = useState(null);
  const [dataSource, setDataSource] = useState("syntetisk");

  // Try to load pipeline JSON
  useEffect(() => {
    fetch("/monthly_revenue_all.json")
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { setRawData(d.areas); setDataSource("pipeline"); })
      .catch(() => {
        // Try single-area files
        Promise.all(["SE1","SE2","SE3","SE4"].map(a =>
          fetch(`/monthly_revenue_${a}.json`)
            .then(r => { if (!r.ok) throw new Error(); return r.json(); })
            .then(d => [a, d.months])
            .catch(() => [a, null])
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

  // Transform data for current area + duration
  const areaData = useMemo(() => {
    if (!rawData) return null;
    return rawData[area] || rawData["SE3"] || Object.values(rawData)[0] || [];
  }, [rawData, area]);

  const allDur = useMemo(() => {
    if (!areaData) return [];
    return DURATIONS.map(dur => ({
      duration: dur,
      months: areaData.map(r => transformRow(r, dur, mw)),
    }));
  }, [areaData, mw]);

  const cur = useMemo(() => allDur.find(d => d.duration === duration), [allDur, duration]);
  const months = cur?.months || [];
  const last12 = months.slice(-12);

  const annuals = useMemo(() => {
    const r = {};
    SIDS.forEach(sid => { r[sid] = last12.reduce((s, m) => s + (m[sid]||0), 0); });
    r.optimal = last12.reduce((s, m) => s + (m.optimal||0), 0);
    return r;
  }, [last12]);

  const optCounts = useMemo(() => {
    const c = {};
    last12.forEach(m => { c[m.optimalStrategy] = (c[m.optimalStrategy] || 0) + 1; });
    return c;
  }, [last12]);

  const durComp = useMemo(() => {
    if (!areaData) return [];
    return areaData.map(r => {
      const label = transformRow(r, 2, 1).label;
      const row = { label };
      DURATIONS.forEach(dur => { row[`opt_${dur}h`] = Math.round((r[`optimal_${dur}h`]||0) * mw); });
      return row;
    });
  }, [areaData, mw]);

  if (!rawData) return (
    <div style={{ background: T.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: T.textMuted, fontFamily: "Instrument Sans, sans-serif" }}>
      Laddar data...
    </div>
  );

  const thS = { padding: "5px 6px", textAlign: "right", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.05em", color: T.textMuted };

  return (
    <div style={{ background: T.bg, minHeight: "100vh", fontFamily: "Instrument Sans, sans-serif", color: T.text }}>
      <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* HEADER */}
      <header style={{ borderBottom: `1px solid ${T.border}`, padding: "14px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: "linear-gradient(135deg,#34d399,#38bdf8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#000" }}>GV</div>
            <div>
              <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em" }}>BESS Revenue Intelligence</h1>
              <div style={{ fontSize: 10, color: T.textMuted }}>
                GreenVoltis · {area}
                {dataSource === "syntetisk" && <span style={{ color: T.red }}> · ⚠ Syntetisk data</span>}
                {dataSource === "pipeline" && <span style={{ color: T.green }}> · ✓ Pipeline-data</span>}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase" }}>Elområde</span>
            {["SE1","SE2","SE3","SE4"].map(a => <Pill key={a} active={area===a} onClick={() => setArea(a)}>{a}</Pill>)}
            <div style={{ width: 1, height: 16, background: T.border, margin: "0 2px" }} />
            <span style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase" }}>MW</span>
            <input type="number" min={0.5} max={200} step={0.5} value={mw}
              onChange={e => setMw(Number(e.target.value) || 1)}
              style={{ width: 52, background: T.card, border: `1px solid ${T.border}`, borderRadius: 5, color: T.text, padding: "3px 6px", fontSize: 13, fontFamily: "JetBrains Mono, monospace", textAlign: "center" }}
            />
          </div>
        </div>
      </header>

      <div style={{ padding: "14px 20px", maxWidth: 1420, margin: "0 auto" }}>
        {/* DURATION */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
          <span style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase", letterSpacing: "0.08em" }}>Duration</span>
          {DURATIONS.map(dur => (
            <button key={dur} onClick={() => setDuration(dur)} style={{
              background: duration === dur ? T.accent : T.card, color: duration === dur ? "#000" : T.textMuted,
              border: `1px solid ${duration === dur ? T.accent : T.border}`, borderRadius: 7, padding: "6px 18px",
              fontSize: 14, cursor: "pointer", fontWeight: 700, fontFamily: "JetBrains Mono, monospace",
            }}>{dur}h</button>
          ))}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: T.textMuted, fontFamily: "JetBrains Mono, monospace" }}>{mw} MW · {mw*duration} MWh · C/{duration}</span>
        </div>

        {/* KPIs */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          <KPI label={`Optimal 12m (${duration}h)`} value={fmtE(annuals.optimal)} sub="bästa strategi/mån" color={T.red} />
          <KPI label="GreenVoltis mFRR" value={fmtE(annuals.mfrr_gv)} sub={`${optCounts.mfrr_gv||0}/12 optimal`} color={STRATEGIES.mfrr_gv.color} />
          <KPI label="Konventionell mFRR" value={fmtE(annuals.mfrr_comp)} sub={`${optCounts.mfrr_comp||0}/12 optimal`} color={STRATEGIES.mfrr_comp.color} />
          <KPI label="FCR-N" value={fmtE(annuals.fcrn)} sub={`${optCounts.fcrn||0}/12 optimal`} color={STRATEGIES.fcrn.color} />
          <KPI label="Intradag 2c+HF" value={fmtE(annuals.intradayHF)} sub={`${optCounts.intradayHF||0}/12 optimal`} color={STRATEGIES.intradayHF.color} />
        </div>

        {/* TABS */}
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {[
            { k: "comparison", l: "Alla strategier" },
            { k: "mfrr_vs",    l: "GV vs konventionell" },
            { k: "duration",   l: "1h / 2h / 4h Index" },
            { k: "intraday",   l: "Intradagshandel" },
            { k: "optimal",    l: "Optimal strategi" },
            { k: "table",      l: "Månadstabell" },
          ].map(v => <Pill key={v.k} active={view===v.k} onClick={() => setView(v.k)}>{v.l}</Pill>)}
        </div>

        {(view === "comparison" || view === "table") && (
          <div style={{ display: "flex", gap: 5, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase" }}>Visa</span>
            {Object.entries(STRATEGIES).map(([sid, s]) => (
              <Pill key={sid} active={selected.has(sid)} color={s.color} onClick={() => toggle(sid)}>{s.label}</Pill>
            ))}
          </div>
        )}

        {/* ══════════ CHARTS ══════════ */}

        {view === "comparison" && (
          <ChartCard title={`Alla strategier — ${duration}h (${mw*duration} MWh)`} sub="EUR · Optimal markerad med röd linje">
            <ResponsiveContainer width="100%" height={370}>
              <ComposedChart data={months} margin={{ top: 8, right: 12, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                <XAxis dataKey="label" tick={{ fill: T.textMuted, fontSize: 9 }} angle={-45} textAnchor="end" height={50} />
                <YAxis tick={{ fill: T.textMuted, fontSize: 10 }} tickFormatter={v => `€${(v/1000).toFixed(0)}k`} />
                <Tooltip content={<CTooltip />} /><Legend wrapperStyle={{ fontSize: 10 }} />
                {SIDS.filter(sid => selected.has(sid)).map(sid => (
                  <Bar key={sid} dataKey={sid} name={STRATEGIES[sid].label} fill={STRATEGIES[sid].color} opacity={0.6} radius={[2,2,0,0]} />
                ))}
                <Line dataKey="optimal" name="Optimal" stroke={T.red} strokeWidth={2.5} dot={{ r: 2, fill: T.red }} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {view === "mfrr_vs" && (() => {
          const vsData = months.map(m => ({ label: m.label, gv: m.mfrr_gv, comp: m.mfrr_comp, delta: m.mfrr_gv - m.mfrr_comp, dir: m.mfrr_direction }));
          const t12 = vsData.slice(-12);
          const tGV = t12.reduce((s,d) => s+d.gv, 0), tC = t12.reduce((s,d) => s+d.comp, 0);
          const pct = tC > 0 ? ((tGV-tC)/tC*100).toFixed(0) : "—";
          const dirCounts = {};
          months.forEach(m => { dirCounts[m.mfrr_direction] = (dirCounts[m.mfrr_direction]||0)+1; });
          return (
            <ChartCard title="GreenVoltis vs konventionell mFRR-optimering"
              sub={`${duration}h · mFRR riktning ${area}: ${Object.entries(dirCounts).map(([d,c])=>`${d} ${c} mån`).join(", ")}`}>
              <ResponsiveContainer width="100%" height={350}>
                <ComposedChart data={vsData} margin={{ top: 8, right: 12, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                  <XAxis dataKey="label" tick={{ fill: T.textMuted, fontSize: 9 }} angle={-45} textAnchor="end" height={50} />
                  <YAxis tick={{ fill: T.textMuted, fontSize: 10 }} tickFormatter={v => `€${(v/1000).toFixed(0)}k`} />
                  <Tooltip content={<CTooltip />} /><Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="gv" name="GreenVoltis mFRR" fill={T.green} opacity={0.75} radius={[2,2,0,0]} />
                  <Bar dataKey="comp" name="Konventionell mFRR" fill={STRATEGIES.mfrr_comp.color} opacity={0.65} radius={[2,2,0,0]} />
                  <Line dataKey="delta" name="GV fördel (Δ)" stroke="#fff" strokeWidth={1.5} strokeDasharray="4 2" dot={{ r: 2, fill: "#fff" }} />
                </ComposedChart>
              </ResponsiveContainer>
              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {[{l:"GreenVoltis 12m",v:fmtE(tGV),c:T.green},{l:"Konventionell 12m",v:fmtE(tC),c:STRATEGIES.mfrr_comp.color},{l:"GV fördel",v:`+${pct}%`,c:"#fff"}].map((x,i) => (
                  <div key={i} style={{ background: T.cardAlt, border: `1px solid ${T.border}`, borderRadius: 7, padding: 10, textAlign: "center" }}>
                    <div style={{ fontSize: 9, color: T.textMuted, marginBottom: 3 }}>{x.l}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "JetBrains Mono, monospace", color: x.c }}>{x.v}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, padding: 12, background: T.green + "0a", border: `1px solid ${T.green}22`, borderRadius: 8, fontSize: 11, lineHeight: 1.7, color: T.textMuted }}>
                <strong style={{ color: T.green }}>Konventionell optimerare:</strong> Deltar ~{({1:12,2:16,4:20})[duration]}h/dygn på mFRR CM. Efter aktivering återställs SoC via elhandlare, vilket begränsar tillgängligheten och medför obalanskostnad (~6%). Ej aktiva timmar allokeras till FCR-D.
                <br/><br/><strong style={{ color: T.green }}>GreenVoltis-fördelen</strong> visualiseras ovan men strategidetaljer delas ej här.
              </div>
            </ChartCard>
          );
        })()}

        {view === "duration" && (
          <ChartCard title="Optimal intäkt: 1h vs 2h vs 4h BESS" sub="EUR/MW/mån · Bästa strategi per duration · Jfr Clean Horizon Storage Index">
            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart data={durComp} margin={{ top: 8, right: 12, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                <XAxis dataKey="label" tick={{ fill: T.textMuted, fontSize: 9 }} angle={-45} textAnchor="end" height={50} />
                <YAxis tick={{ fill: T.textMuted, fontSize: 10 }} tickFormatter={v => `€${(v/1000).toFixed(0)}k`} />
                <Tooltip content={<CTooltip />} /><Legend wrapperStyle={{ fontSize: 10 }} />
                <Line dataKey="opt_1h" name="1h Index" stroke="#38bdf8" strokeWidth={2} dot={{ r: 3, fill: "#38bdf8" }} />
                <Line dataKey="opt_2h" name="2h Index" stroke="#f472b6" strokeWidth={2.5} dot={{ r: 3, fill: "#f472b6" }} />
                <Line dataKey="opt_4h" name="4h Index" stroke="#a3e635" strokeWidth={2} dot={{ r: 3, fill: "#a3e635" }} />
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {DURATIONS.map(dur => {
                const ann = durComp.slice(-12).reduce((s, r) => s + (r[`opt_${dur}h`]||0), 0);
                return (
                  <div key={dur} style={{ background: T.cardAlt, border: `1px solid ${T.border}`, borderRadius: 8, padding: 12, textAlign: "center" }}>
                    <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "JetBrains Mono, monospace", color: dur === duration ? T.accent : T.text }}>{dur}h</div>
                    <div style={{ fontSize: 10, color: T.textMuted }}>{mw} MW / {mw*dur} MWh</div>
                    <div style={{ fontSize: 17, fontWeight: 700, fontFamily: "JetBrains Mono, monospace", color: T.green, marginTop: 6 }}>{fmtE(ann)}</div>
                    <div style={{ fontSize: 10, color: T.textMuted }}>Optimal 12m</div>
                  </div>
                );
              })}
            </div>
          </ChartCard>
        )}

        {view === "intraday" && (() => {
          const idData = months.map(m => ({
            label: m.label,
            cycle1: m.intraday1,
            cycle2: (m.intraday2 || 0) - (m.intraday1 || 0),
            hfBonus: (m.intradayHF || 0) - (m.intraday2 || 0),
            total: m.intradayHF,
          }));
          return (
            <ChartCard title={`Intradagshandel — ${duration}h (${mw*duration} MWh/cykel)`} sub="Köp dagslägsta → sälj dagshögsta. 70% capture C1, 45% C2, +12% HF.">
              <ResponsiveContainer width="100%" height={340}>
                <ComposedChart data={idData} margin={{ top: 8, right: 12, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                  <XAxis dataKey="label" tick={{ fill: T.textMuted, fontSize: 9 }} angle={-45} textAnchor="end" height={50} />
                  <YAxis tick={{ fill: T.textMuted, fontSize: 10 }} tickFormatter={v => `€${(v/1000).toFixed(0)}k`} />
                  <Tooltip content={<CTooltip />} /><Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="cycle1" name="Cykel 1" stackId="s" fill={STRATEGIES.intraday1.color} opacity={0.8} />
                  <Bar dataKey="cycle2" name="Cykel 2" stackId="s" fill={STRATEGIES.intraday2.color} opacity={0.7} />
                  <Bar dataKey="hfBonus" name="HF-bonus" stackId="s" fill={STRATEGIES.intradayHF.color} opacity={0.6} radius={[2,2,0,0]} />
                  <Line dataKey="total" name="Total" stroke="#fff" strokeWidth={2} dot={{ r: 2, fill: "#fff" }} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>
          );
        })()}

        {view === "optimal" && (
          <ChartCard title={`Optimal strategi per månad — ${duration}h`} sub="Färg = vinnande strategi den månaden">
            <ResponsiveContainer width="100%" height={360}>
              <ComposedChart data={months} margin={{ top: 8, right: 12, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                <XAxis dataKey="label" tick={{ fill: T.textMuted, fontSize: 9 }} angle={-45} textAnchor="end" height={50} />
                <YAxis tick={{ fill: T.textMuted, fontSize: 10 }} tickFormatter={v => `€${(v/1000).toFixed(0)}k`} />
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
                  <div key={sid} style={{ background: STRATEGIES[sid].color + "12", border: `1px solid ${STRATEGIES[sid].color}30`, borderRadius: 6, padding: "5px 10px", display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: STRATEGIES[sid].color }} />
                    <span>{STRATEGIES[sid].label}</span>
                    <span style={{ fontWeight: 700, fontFamily: "JetBrains Mono, monospace", color: STRATEGIES[sid].color }}>{cnt} mån</span>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 2, flexWrap: "wrap" }}>
              {months.map((m, i) => (
                <div key={i} title={`${m.label}: ${STRATEGIES[m.optimalStrategy]?.label} — ${fmtE(m.optimal)}`}
                  style={{ flex: 1, minWidth: 18, height: 28, borderRadius: 3, background: STRATEGIES[m.optimalStrategy]?.color, opacity: 0.7,
                    display: "flex", alignItems: "flex-end", justifyContent: "center", fontSize: 6, color: "#000", fontWeight: 700, paddingBottom: 2 }}>
                  {m.label.split(" ")[1]?.substring(0, 3)}
                </div>
              ))}
            </div>
          </ChartCard>
        )}

        {view === "table" && (
          <ChartCard title={`Månadstabell — ${duration}h · ${mw} MW / ${mw*duration} MWh`}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                    <th style={{ ...thS, textAlign: "left" }}>Mån</th>
                    {SIDS.filter(sid => selected.has(sid)).map(sid => (
                      <th key={sid} style={{ ...thS, color: STRATEGIES[sid].color }}>{STRATEGIES[sid].label.length>18 ? STRATEGIES[sid].label.substring(0,16)+"…" : STRATEGIES[sid].label}</th>
                    ))}
                    <th style={{ ...thS, color: T.red }}>Optimal</th>
                    <th style={{ ...thS, textAlign: "left" }}>Bäst</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((m, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${T.border}`, background: i%2 ? T.bg+"66" : "transparent" }}>
                      <td style={{ padding: "4px 6px", fontWeight: 500, fontSize: 10 }}>{m.label}</td>
                      {SIDS.filter(sid => selected.has(sid)).map(sid => (
                        <td key={sid} style={{ padding: "4px 6px", textAlign: "right", color: m.optimalStrategy === sid ? STRATEGIES[sid].color : T.textDim }}>{fmt(m[sid])}</td>
                      ))}
                      <td style={{ padding: "4px 6px", textAlign: "right", color: T.red, fontWeight: 700 }}>{fmt(m.optimal)}</td>
                      <td style={{ padding: "4px 6px", color: STRATEGIES[m.optimalStrategy]?.color, fontSize: 9, fontWeight: 600 }}>
                        {STRATEGIES[m.optimalStrategy]?.label.split(" ").slice(0,2).join(" ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${T.borderLight}` }}>
                    <td style={{ padding: "5px 6px", fontWeight: 700 }}>SUM</td>
                    {SIDS.filter(sid => selected.has(sid)).map(sid => (
                      <td key={sid} style={{ padding: "5px 6px", textAlign: "right", fontWeight: 700 }}>{fmt(months.reduce((s,m) => s+(m[sid]||0), 0))}</td>
                    ))}
                    <td style={{ padding: "5px 6px", textAlign: "right", fontWeight: 700, color: T.red }}>{fmt(months.reduce((s,m) => s+(m.optimal||0), 0))}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </ChartCard>
        )}

        {/* FOOTER */}
        <div style={{ marginTop: 16, padding: 14, background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14, fontSize: 10, color: T.textMuted, lineHeight: 1.7 }}>
          <div>
            <div style={{ color: T.text, fontWeight: 600, marginBottom: 3 }}>Duration-fysik</div>
            FCR-N: 1h→16h/dag, 2h→20h, 4h→24h (kontinuerlig cykling)<br/>
            FCR-D: duration-oberoende (sällan, kort aktivering)<br/>
            mFRR EAM: mer MWh = fler akt/dag utan SoC-problem
          </div>
          <div>
            <div style={{ color: T.text, fontWeight: 600, marginBottom: 3 }}>mFRR riktning</div>
            SE1/SE2: ned ofta bättre (överproduktion)<br/>
            SE3/SE4: upp ofta bättre (produktionsbrist)<br/>
            Auto-valt per månad baserat på priser
          </div>
          <div>
            <div style={{ color: T.text, fontWeight: 600, marginBottom: 3 }}>Datakällor</div>
            FCR-N/D, mFRR CM: Mimer (SVK)<br/>
            mFRR EAM: Mimer + ENTSO-E TP<br/>
            Intraday: Nord Pool / ENTSO-E DA-proxy
          </div>
        </div>
      </div>
    </div>
  );
}
