// ─── Rapport-PDF för "Ditt batteri 2026" ────────────────────────────────────
// pdf-lib med inbyggda standardtypsnitt: inga typsnittsfiler på disk som
// Vercels paketering kan missa. Helvetica (WinAnsi) täcker å, ä, ö, € och –.
//
// Medvetet UTELÄMNAT ur den utskrivna versionen:
//  • fördelning per marknad — den avslöjar delar av strategin
//  • vilka kostnader intäkten är räknad efter (elinköp, obalanser, Nord
//    Pool-avgifter) — det kan ändras med regelverket och står i verktyget
//  • framåtblickande siffror och återbetalningstid — det gör BESS Simulation

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { monthName, periodLabel, fmtEur, fmtPct, fmtHours, fmtNum } from "../../src/backtest.mjs";

const A4 = [595.28, 841.89];
const M = 48;
const C = {
  ink: rgb(0.10, 0.10, 0.09),
  mute: rgb(0.40, 0.42, 0.45),
  faint: rgb(0.62, 0.64, 0.67),
  rule: rgb(0.88, 0.89, 0.90),
  panel: rgb(0.965, 0.97, 0.975),
  gv: rgb(0.020, 0.588, 0.412),     // #059669
  gvSoft: rgb(0.40, 0.76, 0.64),
  ch: rgb(0.20, 0.255, 0.333),      // #334155
  chSoft: rgb(0.58, 0.64, 0.72),    // #94a3b8
  ceil: rgb(0.39, 0.45, 0.545),     // #64748b
};

// Kontaktperson i rapporten.
const CONTACT = {
  name: "Patrik Björklund",
  title: "Head of Business Development",
  email: "patrik.bjorklund@greenvoltis.com",
  phone: "+46(0)791 023 675",
};

const TXT = {
  sv: {
    brand: "GreenVoltis", product: "Revenue Intelligence",
    title: "Ditt batteris intäkter 2026",
    prepared: (d, e) => `Framtagen ${d} för ${e}`,
    k1: (p) => `Intäkt ${p}`, k2: "Per MW", k3: "Mot Clean Horizon", k4: "Av marknadstaket",
    k3sub: (n) => `${n} månader med index`, k4sub: "perfekt framförhållning",
    k2sub: (v) => `${v}/MW/år (årstakt)`,
    summary: "Sammanfattning",
    b1: (p, t, pm) => `Under ${p} hade batteriet tjänat ${t}, eller ${pm} per MW.`,
    b2: (b, bv, w, wv) => `Starkaste månaden var ${b} (${bv}), svagaste ${w} (${wv}).`,
    b3: (n, r, up) => `Under de ${n} månader där Clean Horizons index finns för batteriets uthållighet ligger resultatet ${r} ${up ? "över" : "under"} indexet.`,
    b4: (k, s) => `Med perfekt kännedom om alla priser i förväg hade marknaden erbjudit ${k}. Resultatet motsvarar ${s} av det taket.`,
    chart: "Intäkt per månad", legGv: "Ditt batteri", legCh: "Clean Horizon Index", legCeil: "Marknadstak",
    table: "Månad för månad",
    th: ["Månad", "Intäkt", "Per MW", "Clean Horizon", "Skillnad"],
    total: "Totalt",
    noIdx: "—",
    methodH: "Så har vi räknat",
    method: [
      "Beräkningen bygger på GreenVoltis intäktsmodell, kalibrerad mot faktiskt utfall från batterier vi optimerar, och på publicerade marknadspriser för varje månad i perioden.",
      "Siffrorna visar vad batteriet hade tjänat under perioden med GreenVoltis optimering. De är inte en prognos för framtida intäkter.",
      "Intäkterna redovisas före GreenVoltis optimeringsavgift. Elnätsavgifter, skatter och eventuella driftstopp ingår inte.",
    ],
    yearTxt: "Årstakten är periodens intäkt omräknad till 365 dagar, för jämförelse med årsangivelser. Intäkterna varierar över året, så den är inte en prognos.",
    upH: "Där nästa intäktsökning finns",
    upIntro: (gap) => `Skillnaden mellan marknadstaket och ditt batteris resultat, ${gap}, visar hur mycket mer marknaderna erbjöd under perioden. Vi utvecklar optimeringen hela tiden för att ta en allt större del av det värdet, och förbättringarna kommer alla batterier vi optimerar till del.`,
    upMixH: "Marknadstaket för ditt batteri",
    upMix: { energy: "Energihandel och aktivering", reserve: "Reservkapacitet (mFRR)", fcr: "FCR" },
    upMost: "Här ligger den största delen av marknadens värde för ditt batteri.",
    upLevers: [
      ["energy", "Energihandel", "Bättre prognoser för day-ahead- och intradagspriser, och handel allt närmare leverans."],
      ["reserve", "Reservkapacitet", "Budgivning timme för timme, så att varje timme går till den marknad som betalar bäst."],
      ["act", "Aktivering och redispatch", "Budpriser på aktiveringsmarknaden som träffar de kvartar där regleringen behövs mest."],
      ["fcr", "FCR", "Snabbare växling till FCR när kapacitetspriserna skiftar."],
      ["abt", "Asset-backed trading", "Handel med batteriet som grund, som vi utvecklar och testkör nu. När den tas i drift lyfter den intäkterna ytterligare för de batterier vi optimerar."],
    ],
    upFoot: "Siffrorna i den här rapporten bygger på hur vi optimerar i dag och räknar inte med någon av förbättringarna ovan. Marknadstaket förutsätter perfekt kännedom om alla priser i förväg och är ett mått, inte ett mål.",
    contactH: "Kontakt",
    refH: "Jämförelserna",
    ref: [
      "Clean Horizon Storage Index © Clean Horizon, levererat av Nord Pool. Indexet bygger på delvis andra antaganden, bland annat 85 % verkningsgrad och 1,5 cykler per dygn, så en viss skillnad är väntad. Månader där indexet saknas för batteriets uthållighet ingår inte i jämförelsen.",
      "Marknadstaket är vad samma batteri hade kunnat tjäna med perfekt kännedom om alla priser i förväg. Ingen operatör når dit; det är ett mått på vad marknaden erbjöd, inte ett mål.",
    ],
    page: (i, n) => `Sida ${i} av ${n}`,
    foot: "GreenVoltis AB · greenvoltis.com",
  },
  en: {
    brand: "GreenVoltis", product: "Revenue Intelligence",
    title: "Your battery's revenue in 2026",
    prepared: (d, e) => `Prepared ${d} for ${e}`,
    k1: (p) => `Revenue ${p}`, k2: "Per MW", k3: "Versus Clean Horizon", k4: "Of market ceiling",
    k3sub: (n) => `${n} months with index`, k4sub: "perfect foresight",
    k2sub: (v) => `${v}/MW/yr annualised`,
    summary: "Summary",
    b1: (p, t, pm) => `Over ${p} the battery would have earned ${t}, or ${pm} per MW.`,
    b2: (b, bv, w, wv) => `The strongest month was ${b} (${bv}), the weakest ${w} (${wv}).`,
    b3: (n, r, up) => `Over the ${n} months where the Clean Horizon index exists for this duration, the result is ${r} ${up ? "above" : "below"} the index.`,
    b4: (k, s) => `With perfect knowledge of all prices in advance the markets offered ${k}. The result reaches ${s} of that ceiling.`,
    chart: "Revenue per month", legGv: "Your battery", legCh: "Clean Horizon Index", legCeil: "Market ceiling",
    table: "Month by month",
    th: ["Month", "Revenue", "Per MW", "Clean Horizon", "Difference"],
    total: "Total",
    noIdx: "—",
    methodH: "How this was calculated",
    method: [
      "The calculation uses the GreenVoltis revenue model, calibrated against actual results from batteries we optimise, and published market prices for every month of the period.",
      "The figures show what the battery would have earned over the period with GreenVoltis optimisation. They are not a forecast of future revenue.",
      "Revenue is shown before the GreenVoltis optimisation fee. Grid tariffs, taxes and any outages are not included.",
    ],
    yearTxt: "The annualised figure scales the period's revenue to 365 days, for comparison with annual figures. Revenue varies over the year, so it is not a forecast.",
    upH: "Where further upside sits",
    upIntro: (gap) => `The difference between the market ceiling and your battery's result, ${gap}, shows how much more the markets offered over the period. We develop the optimisation continuously to capture a growing share of that value, and every improvement benefits all the batteries we optimise.`,
    upMixH: "The market ceiling for your battery",
    upMix: { energy: "Energy trading and activation", reserve: "Reserve capacity (mFRR)", fcr: "FCR" },
    upMost: "This is where most of the market value for your battery sits.",
    upLevers: [
      ["energy", "Energy trading", "Better day-ahead and intraday price forecasts, and trading ever closer to delivery."],
      ["reserve", "Reserve capacity", "Hour-by-hour bidding, so every hour goes to the market that pays best."],
      ["act", "Activation and redispatch", "Activation bids priced to hit the quarter-hours where regulation is needed most."],
      ["fcr", "FCR", "Faster switching to FCR when capacity prices shift."],
      ["abt", "Asset-backed trading", "Trading backed by the battery itself, which we are developing and test-running now. Once live, it lifts revenue further for the batteries we optimise."],
    ],
    upFoot: "The figures in this report reflect how we optimise today and include none of the improvements above. The market ceiling assumes perfect knowledge of all prices in advance; it is a measure, not a target.",
    contactH: "Contact",
    refH: "The comparisons",
    ref: [
      "Clean Horizon Storage Index © Clean Horizon, delivered by Nord Pool. The index uses partly different assumptions, including 85% round-trip efficiency and 1.5 cycles a day, so some difference is expected. Months without an index value for this duration are left out of the comparison.",
      "The market ceiling is what the same battery could have earned with perfect knowledge of all prices in advance. No operator reaches it; it measures what the markets offered, not a target.",
    ],
    page: (i, n) => `Page ${i} of ${n}`,
    foot: "GreenVoltis AB · greenvoltis.com",
  },
};

// Standardtypsnitten kodar WinAnsi. Allt annat byts ut i stället för att krascha.
function safe(s) {
  return String(s)
    .replace(/[   ]/g, " ")
    .replace(/[−‐‑]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E -ÿ€–—•·]/g, "");
}

function wrap(text, font, size, width) {
  const words = safe(text).split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (font.widthOfTextAtSize(test, size) > width && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

export async function buildReportPdf(r, { lang = "sv", email = "", name = "", project = "", date = new Date() } = {}) {
  const L = TXT[lang] || TXT.sv;
  const doc = await PDFDocument.create();
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setTitle(safe(`${L.title} – ${r.area} ${fmtNum(r.mw, lang)} MW / ${fmtNum(r.mwh, lang)} MWh`));
  doc.setAuthor("GreenVoltis AB");
  doc.setCreator("GreenVoltis Revenue Intelligence");

  const W = A4[0], H = A4[1], CW = W - 2 * M;
  const period = periodLabel(r.first, r.last, lang);
  const dateStr = date.toLocaleDateString(lang === "en" ? "en-GB" : "sv-SE", { day: "numeric", month: "long", year: "numeric" });
  const pages = [];

  const text = (pg, s, x, y, { font = reg, size = 10, color = C.ink, align = "left" } = {}) => {
    const t = safe(s);
    let xx = x;
    if (align !== "left") {
      const w = font.widthOfTextAtSize(t, size);
      xx = align === "right" ? x - w : x - w / 2;
    }
    pg.drawText(t, { x: xx, y, size, font, color });
  };
  const para = (pg, s, x, y, width, { font = reg, size = 9.5, color = C.mute, lh = 1.45 } = {}) => {
    const lines = wrap(s, font, size, width);
    lines.forEach((ln, i) => pg.drawText(ln, { x, y: y - i * size * lh, size, font, color }));
    return y - lines.length * size * lh;
  };
  const header = (pg) => {
    text(pg, L.brand, M, H - M + 4, { font: bold, size: 11, color: C.gv });
    text(pg, L.product, W - M, H - M + 4, { size: 9, color: C.mute, align: "right" });
    pg.drawLine({ start: { x: M, y: H - M - 6 }, end: { x: W - M, y: H - M - 6 }, thickness: 0.6, color: C.rule });
  };

  // ── Sida 1 ────────────────────────────────────────────────────────────────
  const p1 = doc.addPage(A4); pages.push(p1); header(p1);
  let y = H - M - 46;
  if (project) {
    text(p1, project, M, y, { font: bold, size: 11, color: C.gv });
    y -= 22;
  }
  text(p1, L.title, M, y, { font: bold, size: 22 });
  y -= 22;
  text(p1, `${fmtNum(r.mw, lang)} MW / ${fmtNum(r.mwh, lang)} MWh · ${fmtHours(r.c, lang)} · ${r.area} · ${period}`, M, y, { size: 11.5, color: C.mute });

  y -= 16;
  text(p1, L.prepared(dateStr, name ? `${name} (${email})` : email), M, y, { size: 9, color: C.faint });

  // Nyckeltal
  y -= 26;
  const kpis = [
    [L.k1(period), fmtEur(r.total, lang), null, C.gv],
    [L.k2, fmtEur(r.perMw, lang), r.perMwYear ? L.k2sub(fmtEur(r.perMwYear, lang)) : null, C.ink],
    [L.k3, r.ch ? fmtPct(r.ch.ratio - 1, lang, true) : "—", r.ch ? L.k3sub(r.ch.n) : null, C.ink],
    [L.k4, r.ceil ? fmtPct(r.ceil.share, lang) : "—", L.k4sub, C.ink],
  ];
  const gap = 8, kw = (CW - gap * 3) / 4, kh = 62;
  kpis.forEach(([lab, val, sub, col], i) => {
    const x = M + i * (kw + gap);
    p1.drawRectangle({ x, y: y - kh, width: kw, height: kh, color: C.panel });
    p1.drawRectangle({ x, y: y - 2.5, width: kw, height: 2.5, color: i === 0 ? C.gv : C.rule });
    const labLines = wrap(lab.toUpperCase(), reg, 7, kw - 16);
    labLines.slice(0, 2).forEach((ln, j) => text(p1, ln, x + 8, y - 14 - j * 9, { size: 7, color: C.mute }));
    text(p1, val, x + 8, y - kh + (sub ? 20 : 12), { font: bold, size: 15, color: col });
    if (sub) text(p1, sub, x + 8, y - kh + 8, { size: 7, color: C.faint });
  });
  y -= kh + 26;

  // Sammanfattning
  text(p1, L.summary, M, y, { font: bold, size: 12 });
  y -= 16;
  const bullets = [
    L.b1(period, fmtEur(r.total, lang), fmtEur(r.perMw, lang)),
    L.b2(monthName(r.best.ym, lang), fmtEur(r.best.rev, lang), monthName(r.worst.ym, lang), fmtEur(r.worst.rev, lang)),
  ];
  if (r.ch) bullets.push(L.b3(r.ch.n, fmtPct(Math.abs(r.ch.ratio - 1), lang), r.ch.ratio >= 1));
  if (r.ceil) bullets.push(L.b4(fmtEur(r.ceil.sum, lang), fmtPct(r.ceil.share, lang)));
  for (const b of bullets) {
    p1.drawCircle({ x: M + 3, y: y + 3, size: 1.6, color: C.gv });
    y = para(p1, b, M + 12, y, CW - 12, { size: 10, color: C.ink }) - 5;
  }

  // Diagram
  y -= 14;
  text(p1, L.chart, M, y, { font: bold, size: 12 });
  y -= 12;
  const leg = [[L.legGv, "bar", C.gvSoft], [L.legCh, "bar", C.chSoft], [L.legCeil, "dash", C.ceil]];
  let lx = M;
  for (const [lab, kind, col] of leg) {
    if (kind === "bar") p1.drawRectangle({ x: lx, y: y - 7, width: 9, height: 7, color: col });
    else if (kind === "line") { p1.drawLine({ start: { x: lx, y: y - 3.5 }, end: { x: lx + 12, y: y - 3.5 }, thickness: 1.6, color: col }); p1.drawCircle({ x: lx + 6, y: y - 3.5, size: 2, color: col }); }
    else p1.drawLine({ start: { x: lx, y: y - 3.5 }, end: { x: lx + 12, y: y - 3.5 }, thickness: 1, color: col, dashArray: [3, 2] });
    text(p1, lab, lx + 16, y - 7, { size: 8, color: C.mute });
    lx += 16 + reg.widthOfTextAtSize(safe(lab), 8) + 18;
  }
  const chTop = y - 18, chH = 270, chBot = chTop - chH;
  const axisW = 44, plotX = M + axisW, plotW = CW - axisW;
  const vmax = Math.max(...r.months.map((m) => Math.max(m.rev, m.ch || 0, m.ceil || 0)));
  const step = niceStep(vmax / 4);
  const top = Math.ceil(vmax / step) * step || 1;
  const Y = (v) => chBot + (v / top) * chH;
  for (let v = 0; v <= top + 1e-6; v += step) {
    p1.drawLine({ start: { x: plotX, y: Y(v) }, end: { x: plotX + plotW, y: Y(v) }, thickness: 0.4, color: C.rule });
    text(p1, shortEur(v, lang), plotX - 6, Y(v) - 3, { size: 7, color: C.faint, align: "right" });
  }
  // Ditt batteri och Clean Horizon som staplar bredvid varandra per månad.
  const n = r.months.length, slot = plotW / n, bw = slot * 0.34, gap2 = slot * 0.04;
  const X = (i) => plotX + slot * i + slot / 2;
  r.months.forEach((m, i) => {
    p1.drawRectangle({ x: X(i) - bw - gap2 / 2, y: chBot, width: bw, height: Math.max(0.5, Y(m.rev) - chBot), color: C.gvSoft });
    if (m.ch != null) p1.drawRectangle({ x: X(i) + gap2 / 2, y: chBot, width: bw, height: Math.max(0.5, Y(m.ch) - chBot), color: C.chSoft });
    text(p1, monthName(m.ym, lang, false).slice(0, 3), X(i), chBot - 11, { size: 7, color: C.mute, align: "center" });
  });
  const series = (key, col, dashed) => {
    for (let i = 0; i < n - 1; i++) {
      const a = r.months[i][key], b = r.months[i + 1][key];
      if (a == null || b == null) continue;
      p1.drawLine({ start: { x: X(i), y: Y(a) }, end: { x: X(i + 1), y: Y(b) }, thickness: dashed ? 1 : 1.6, color: col, dashArray: dashed ? [3, 2] : undefined });
    }
    if (!dashed) r.months.forEach((m, i) => { if (m[key] != null) p1.drawCircle({ x: X(i), y: Y(m[key]), size: 2.4, color: col }); });
  };
  series("ceil", C.ceil, true);
  p1.drawLine({ start: { x: plotX, y: chBot }, end: { x: plotX + plotW, y: chBot }, thickness: 0.6, color: C.faint });

  // ── Sida 2 ────────────────────────────────────────────────────────────────
  const p2 = doc.addPage(A4); pages.push(p2); header(p2);
  y = H - M - 40;
  text(p2, L.table, M, y, { font: bold, size: 12 });
  y -= 20;
  // Vänsterkant för månadskolumnen, högerkant för sifferkolumnerna.
  const colX = (j) => [M, M + 222, M + 302, M + 405, W - M][j];
  const right = [false, true, true, true, true];
  L.th.forEach((h, j) => text(p2, h.toUpperCase(), colX(j), y, { size: 7.5, color: C.mute, align: right[j] ? "right" : "left" }));
  y -= 7;
  p2.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: C.faint });
  y -= 15;
  r.months.forEach((m, i) => {
    if (i % 2 === 1) p2.drawRectangle({ x: M, y: y - 5, width: CW, height: 17, color: C.panel });
    const diff = m.ch != null ? fmtPct(m.rev / m.ch - 1, lang, true) : L.noIdx;
    const cells = [cap(monthName(m.ym, lang)), fmtEur(m.rev, lang), fmtEur(m.rev / r.mw, lang), m.ch != null ? fmtEur(m.ch, lang) : L.noIdx, diff];
    cells.forEach((c, j) => text(p2, c, colX(j), y, { size: 9.5, color: j === 0 ? C.ink : (m.ch == null && j >= 3 ? C.faint : C.ink), align: right[j] ? "right" : "left" }));
    y -= 17;
  });
  y += 3;
  p2.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: C.faint });
  y -= 15;
  const totCells = [L.total, fmtEur(r.total, lang), fmtEur(r.perMw, lang), r.ch ? fmtEur(r.ch.idx, lang) : L.noIdx, r.ch ? fmtPct(r.ch.ratio - 1, lang, true) : L.noIdx];
  totCells.forEach((c, j) => text(p2, c, colX(j), y, { font: bold, size: 9.5, align: right[j] ? "right" : "left" }));
  if (r.ch && r.ch.n < r.n) {
    y -= 14;
    y = para(p2, lang === "en"
      ? `Clean Horizon total and difference cover the ${r.ch.n} months with an index value (revenue in those months: ${fmtEur(r.ch.gv, lang)}).`
      : `Clean Horizons summa och skillnaden avser de ${r.ch.n} månader som har ett indexvärde (intäkt de månaderna: ${fmtEur(r.ch.gv, lang)}).`,
      M, y, CW, { size: 8, color: C.faint });
  }

  y -= 26;
  text(p2, L.methodH, M, y, { font: bold, size: 12 });
  y -= 16;
  for (const s of [...L.method, L.yearTxt]) y = para(p2, s, M, y, CW, { size: 9.5 }) - 6;
  y -= 10;
  text(p2, L.refH, M, y, { font: bold, size: 12 });
  y -= 16;
  for (const s of L.ref) y = para(p2, s, M, y, CW, { size: 9.5 }) - 6;

  // ── Sida 3: utvecklingen framåt ───────────────────────────────────────────
  // Visar marknadstakets sammansättning (marknadens värde), aldrig fördelningen
  // av batteriets egen intäkt per marknad.
  const p3 = doc.addPage(A4); pages.push(p3); header(p3);
  y = H - M - 40;
  text(p3, L.upH, M, y, { font: bold, size: 16 });
  y -= 22;
  if (r.ceil) y = para(p3, L.upIntro(fmtEur(r.ceil.gap, lang)), M, y, CW, { size: 10 }) - 10;

  const mix = r.ceil && r.ceil.mix;
  let mostKey = null;
  if (mix) {
    mostKey = ["energy", "reserve", "fcr"].sort((a, b) => mix[b] - mix[a])[0];
    text(p3, L.upMixH.toUpperCase(), M, y, { size: 7.5, color: C.mute });
    y -= 12;
    const cols = { energy: C.gv, reserve: C.ch, fcr: C.chSoft };
    let bx = M;
    const bh = 14;
    for (const k of ["energy", "reserve", "fcr"]) {
      const w = CW * mix[k];
      p3.drawRectangle({ x: bx, y: y - bh, width: Math.max(0, w - 1.5), height: bh, color: cols[k] });
      bx += w;
    }
    y -= bh + 12;
    let lx2 = M;
    for (const k of ["energy", "reserve", "fcr"]) {
      p3.drawRectangle({ x: lx2, y: y - 7, width: 8, height: 8, color: cols[k] });
      const lab = `${L.upMix[k]} ${fmtPct(mix[k], lang)}`;
      text(p3, lab, lx2 + 12, y - 7, { size: 8.5, color: C.ink });
      lx2 += 12 + reg.widthOfTextAtSize(safe(lab), 8.5) + 20;
    }
    y -= 26;
  }

  for (const [key, head, body] of L.upLevers) {
    const isMost = key === mostKey;
    p3.drawRectangle({ x: M, y: y - 3, width: 2.5, height: 12, color: key === "abt" ? C.gv : C.rule });
    text(p3, head, M + 12, y, { font: bold, size: 10.5 });
    y -= 14;
    y = para(p3, isMost ? `${body} ${L.upMost}` : body, M + 12, y, CW - 12, { size: 9.5, color: C.ink }) - 10;
  }
  y -= 4;
  y = para(p3, L.upFoot, M, y, CW, { size: 8.5, color: C.faint });

  // Kontakt: fast ruta ovanför sidfoten.
  const boxH = 64;
  const boxTop = Math.min(y - 18, M + 20 + boxH);
  p3.drawRectangle({ x: M, y: boxTop - boxH, width: CW, height: boxH, color: C.panel });
  p3.drawRectangle({ x: M, y: boxTop - boxH, width: 2.5, height: boxH, color: C.gv });
  text(p3, L.contactH.toUpperCase(), M + 14, boxTop - 16, { size: 7.5, color: C.mute });
  text(p3, CONTACT.name, M + 14, boxTop - 32, { font: bold, size: 11 });
  text(p3, CONTACT.title + " · GreenVoltis AB", M + 14, boxTop - 46, { size: 9, color: C.mute });
  text(p3, CONTACT.email, W - M - 14, boxTop - 32, { size: 9.5, color: C.gv, align: "right" });
  text(p3, CONTACT.phone, W - M - 14, boxTop - 46, { size: 9.5, color: C.ink, align: "right" });

  pages.forEach((pg, i) => {
    pg.drawLine({ start: { x: M, y: M - 8 }, end: { x: W - M, y: M - 8 }, thickness: 0.6, color: C.rule });
    text(pg, L.foot, M, M - 22, { size: 7.5, color: C.faint });
    text(pg, L.page(i + 1, pages.length), W - M, M - 22, { size: 7.5, color: C.faint, align: "right" });
  });

  return doc.save();
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function niceStep(x) {
  if (!(x > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const f = x / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

function shortEur(v, lang) {
  if (v >= 1e6) return "€" + fmtNum(v / 1e6, lang) + "M";
  if (v >= 1e3) return "€" + Math.round(v / 1e3) + "k";
  return "€" + Math.round(v);
}
