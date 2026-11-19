// ─── Ditt batteri 2026 — delad beräkning ────────────────────────────────────
// Används av dashboarden (fliken "Ditt batteri") OCH av api/send-report.mjs.
// Servern räknar om allt från zon, MW och MWh i stället för att ta emot
// färdiga siffror från webbläsaren. Annars skulle vem som helst kunna skicka
// sig själv en GreenVoltis-märkt PDF med påhittade intäkter.
//
// Inga beroenden och inget JSX: filen måste gå att importera både av Create
// React App och av en Node-funktion på Vercel.

export const YEAR = "2026";
export const AREAS = ["SE1", "SE2", "SE3", "SE4"];

// Kortaste uthållighet med data (pipelinens C-nät börjar på 1h) och längsta
// med kalibreringsunderlag (Skynet, 2,5 MWh per MW). Utanför det intervallet
// visas ingenting hellre än en extrapolation.
export const C_MIN = 1.0;
export const C_MAX = 2.5;

const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);

function gridKeys(row) {
  return Object.keys(row)
    .filter((k) => /^c\d+(\.\d+)?$/.test(k))
    .map((k) => ({ k, c: parseFloat(k.slice(1)) }))
    .sort((a, b) => a.c - b.c);
}

// GreenVoltis strategi per MW vid uthållighet c, linjärt mellan punkterna i
// pipelinens C-nät (c1, c1.25, c1.5 … c2.5).
export function interpGrid(row, c) {
  const ks = gridKeys(row);
  if (!ks.length) return null;
  for (let i = 0; i < ks.length - 1; i++) {
    const a = ks[i], b = ks[i + 1];
    if (c >= a.c - 1e-9 && c <= b.c + 1e-9) {
      const va = num(row[a.k]), vb = num(row[b.k]);
      if (va == null || vb == null) return null;
      const w = b.c === a.c ? 0 : (c - a.c) / (b.c - a.c);
      return va * (1 - w) + vb * w;
    }
  }
  return null;
}

// Clean Horizon (h1, h2, h4) och marknadstaket (tmax_1h, tmax_2h, tmax_4h)
// finns bara i hela timmar. Linjärt mellan närmaste punkter. Saknas en punkt
// som behövs blir svaret null — en interpolation mot en påhittad punkt vore
// värre än ingen jämförelse alls (samma princip som för maj 2026).
export function interpHours(points, c) {
  const hs = [1, 2, 4];
  for (let i = 0; i < hs.length - 1; i++) {
    const a = hs[i], b = hs[i + 1];
    if (c >= a - 1e-9 && c <= b + 1e-9) {
      if (Math.abs(c - a) < 1e-9) return num(points[a]);
      if (Math.abs(c - b) < 1e-9) return num(points[b]);
      const va = num(points[a]), vb = num(points[b]);
      if (va == null || vb == null) return null;
      const w = (c - a) / (b - a);
      return va * (1 - w) + vb * w;
    }
  }
  return null;
}

export function computeBacktest({ revenue, benchmark, ceiling, area, mw, mwh }) {
  if (!AREAS.includes(area)) return { error: "area" };
  mw = Number(mw);
  mwh = Number(mwh);
  if (!(mw > 0) || !(mwh > 0)) return { error: "input" };
  const c = mwh / mw;
  if (c < C_MIN - 1e-9) return { error: "cLow", c };
  if (c > C_MAX + 1e-9) return { error: "cHigh", c };

  const rows = ((revenue && revenue.areas && revenue.areas[area]) || [])
    .filter((r) => String(r.year_month).startsWith(YEAR + "-"))
    .sort((a, b) => (a.year_month < b.year_month ? -1 : 1));
  if (!rows.length) return { error: "noData" };

  const bIdx = {}, kIdx = {};
  ((benchmark && benchmark.index && benchmark.index[area]) || []).forEach((r) => { bIdx[r.year_month] = r; });
  ((ceiling && ceiling.areas && ceiling.areas[area]) || []).forEach((r) => { kIdx[r.year_month] = r; });

  const months = [];
  for (const r of rows) {
    const per = interpGrid(r, c);
    if (per == null) return { error: "noData" };
    const b = bIdx[r.year_month], k = kIdx[r.year_month];
    const chPer = b ? interpHours({ 1: b.h1, 2: b.h2, 4: b.h4 }, c) : null;
    const ceilPer = k ? interpHours({ 1: k.tmax_1h, 2: k.tmax_2h, 4: k.tmax_4h }, c) : null;
    months.push({
      ym: r.year_month,
      rev: per * mw,
      ch: chPer != null && chPer > 0 ? chPer * mw : null,
      ceil: ceilPer != null && ceilPer > 0 ? ceilPer * mw : null,
    });
  }

  const total = months.reduce((a, m) => a + m.rev, 0);
  const withCh = months.filter((m) => m.ch != null);
  const chGv = withCh.reduce((a, m) => a + m.rev, 0);
  const chIdx = withCh.reduce((a, m) => a + m.ch, 0);
  const withCeil = months.filter((m) => m.ceil != null);
  const ceilGv = withCeil.reduce((a, m) => a + m.rev, 0);
  const ceilSum = withCeil.reduce((a, m) => a + m.ceil, 0);
  const sorted = [...months].sort((a, b) => b.rev - a.rev);

  return {
    area, mw, mwh, c, months,
    first: months[0].ym,
    last: months[months.length - 1].ym,
    n: months.length,
    total,
    perMw: total / mw,
    perMwh: total / mwh,
    ch: withCh.length ? { n: withCh.length, gv: chGv, idx: chIdx, ratio: chGv / chIdx } : null,
    ceil: withCeil.length ? { n: withCeil.length, gv: ceilGv, sum: ceilSum, share: ceilGv / ceilSum } : null,
    best: sorted[0],
    worst: sorted[sorted.length - 1],
  };
}

// ── Formatering (delas av skärm, PDF och e-post) ────────────────────────────
const MONTHS = {
  sv: ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

export function monthName(ym, lang = "sv", withYear = true) {
  const [y, m] = String(ym).split("-");
  const n = (MONTHS[lang] || MONTHS.sv)[Number(m) - 1] || ym;
  return withYear ? `${n} ${y}` : n;
}

export function periodLabel(first, last, lang = "sv") {
  const [y1] = String(first).split("-"), [y2] = String(last).split("-");
  if (first === last) return monthName(first, lang);
  if (y1 === y2) return `${monthName(first, lang, false)}–${monthName(last, lang, false)} ${y1}`;
  return `${monthName(first, lang)} – ${monthName(last, lang)}`;
}

// Tusentalsavgränsare som vanligt mellanslag och vanligt minustecken. Intl
// ger annars U+00A0/U+202F och U+2212, som inte finns i PDF:ens standardtypsnitt.
export function fmtEur(v, lang = "sv") {
  if (v == null || !isFinite(v)) return "—";
  const s = Math.round(v).toLocaleString(lang === "en" ? "en-GB" : "sv-SE");
  return "€" + s.replace(/[  ]/g, " ").replace(/−/g, "-");
}

export function fmtPct(r, lang = "sv", signed = false) {
  if (r == null || !isFinite(r)) return "—";
  const p = Math.round(r * 100);
  const s = (signed && p > 0 ? "+" : "") + String(p);
  return lang === "en" ? `${s}%` : `${s} %`;
}

export function fmtHours(c, lang = "sv") {
  const v = Math.round(c * 100) / 100;
  const s = Number.isInteger(v) ? String(v) : String(v).replace(".", lang === "en" ? "." : ",");
  return `${s} h`;
}

export function fmtNum(v, lang = "sv") {
  const r = Math.round(v * 100) / 100;
  const s = String(r);
  return lang === "en" ? s : s.replace(".", ",");
}
