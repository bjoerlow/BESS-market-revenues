// ─── report.mjs ─────────────────────────────────────────────────────────────
// "Ditt batteri 2026"-rapporten som PDF för nedladdning, plus en
// leadavisering till GreenVoltis om vem som tog fram den.
//
// Flöde
//  1. Webbläsaren loggar in med magic link (Supabase, samma projekt som BESS
//     Simulation) och anropar POST /api/report med sin access-token och
//     { area, mw, mwh, lang }.
//  2. Funktionen verifierar token mot Supabase och tar e-postadressen därifrån
//     — aldrig från anropet — så leadet är en adress användaren bevisat att
//     den äger.
//  3. Siffrorna räknas om här från samma JSON-filer som dashboarden visar,
//     med samma kod (src/backtest.mjs). Webbläsaren skickar bara indata.
//  4. PDF:en returneras för nedladdning. Samtidigt skickas ett leadmejl
//     (utan bilaga) via EmailJS till LEAD_EMAIL. EmailJS gratisnivå tillåter
//     inte bilagor, därför laddas PDF:en ned i stället för att mejlas.
//
// Miljövariabler (Vercel → Settings → Environment Variables)
//   REACT_APP_SB_URL     Config. Supabase → Project Settings → Data API: Project URL
//   REACT_APP_SB_KEY     Config. Supabase → Project Settings → API Keys: publishable key
//                        (sb_publishable_…; legacy anon-nyckeln fungerar tills den fasas ut).
//                        Skickas bara i apikey-headern, aldrig som Bearer.
//   EMAILJS_TEMPLATE_ID  Secret. Mallen för leadmejlet (se README)
//   EMAILJS_PRIVATE_KEY  Secret. EmailJS → Account → General: Private Key
//   EMAILJS_SERVICE_ID   valfri, standard samma tjänst som BESS Simulation
//   EMAILJS_PUBLIC_KEY   valfri, standard samma publika nyckel som BESS Simulation
//   LEAD_EMAIL           valfri, vem som får leadmejlet (standard nedan)
//
// Utan Supabase-värdena svarar funktionen 503 och dashboarden döljer rutan.
// Utan EmailJS-värdena fungerar nedladdningen, men inget leadmejl skickas —
// då loggas leadet bara i Vercels funktionslogg.

import { createRequire } from "module";
import { computeBacktest, periodLabel, monthName, fmtEur, fmtPct, fmtHours, fmtNum } from "../src/backtest.mjs";
import { buildReportPdf } from "./_lib/report-pdf.mjs";

const require = createRequire(import.meta.url);
const revenue = require("../public/monthly_revenue_all.json");
const benchmark = require("../public/benchmark.json");
const ceiling = require("../public/theoretical_max_all.json");

const DEFAULT_LEAD = "patrik.bjorklund@greenvoltis.com"; // samma som BESS Simulations admin

// Enkel spärr mot upprepade utskick per adress. Gäller per varm instans —
// inte vattentät, men stoppar en dubbelklickande eller loopande klient.
const recent = new Map();
const LIMIT = 10, WINDOW_MS = 60 * 60 * 1000;
function allowed(email) {
  const now = Date.now();
  const list = (recent.get(email) || []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= LIMIT) { recent.set(email, list); return false; }
  list.push(now); recent.set(email, list);
  return true;
}

function cleanSbUrl(u) {
  const s = String(u || "").trim().replace(/\/+$/, "");
  const m = s.match(/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)/i);
  return m ? m[0] : "";
}

function config() {
  return {
    sbUrl: cleanSbUrl(process.env.REACT_APP_SB_URL),
    // En secret key (sb_secret_…) kringgår RLS och hör inte hemma här.
    sbKey: (k => (k.startsWith("sb_secret_") ? "" : k))(String(process.env.REACT_APP_SB_KEY || "").trim()),
    ejsService: String(process.env.EMAILJS_SERVICE_ID || "service_47yayo1").trim(),
    ejsPublic: String(process.env.EMAILJS_PUBLIC_KEY || "dytz55eqSJLyofT-K").trim(),
    ejsTemplate: String(process.env.EMAILJS_TEMPLATE_ID || "").trim(),
    ejsPrivate: String(process.env.EMAILJS_PRIVATE_KEY || "").trim(),
    lead: String(process.env.LEAD_EMAIL || DEFAULT_LEAD).trim(),
  };
}

// Verifierad användare: e-post från inloggningen, namn och telefon från
// profilen (user_metadata, satt av användaren efter inloggning). Allt hämtas
// från Supabase med användarens token — inget av det tas från anropet.
const clip = (v, n) => String(v || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
async function verifiedUser(cfg, token) {
  if (!token) return null;
  const r = await fetch(`${cfg.sbUrl}/auth/v1/user`, {
    headers: { apikey: cfg.sbKey, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const u = await r.json().catch(() => null);
  if (!(u && typeof u.email === "string" && u.email.includes("@"))) return null;
  const m = u.user_metadata || {};
  return { email: u.email.toLowerCase(), name: clip(m.full_name, 80),
           phone: clip(m.phone_number, 30), company: clip(m.company, 80) };
}

// Ett utskick via EmailJS. Mallen har mottagare, svarsadress, ämne och
// HTML-innehåll som variabler. Ingen bilaga (kräver betald nivå).
async function sendMail(cfg, { to, replyTo, subject, html }) {
  const r = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: cfg.ejsService,
      template_id: cfg.ejsTemplate,
      user_id: cfg.ejsPublic,
      accessToken: cfg.ejsPrivate,
      template_params: {
        to_email: to,
        reply_to: replyTo,
        subject,
        message_html: html,
      },
    }),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    throw new Error(`EmailJS ${r.status}: ${detail.slice(0, 300)}`);
  }
  return true;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function leadMail(r, who, project, link) {
  const email = who.email;
  const p = periodLabel(r.first, r.last, "sv");
  const rows = [
    ["Namn", who.name || "—"],
    ["Telefon", who.phone || "—"],
    ["Företag", who.company || "—"],
    ["E-post", email],
    ["Projekt", project || "—"],
    ["System", `${fmtNum(r.mw, "sv")} MW / ${fmtNum(r.mwh, "sv")} MWh (${fmtHours(r.c, "sv")})`],
    ["Elprisområde", r.area],
    [`Intäkt ${p}`, fmtEur(r.total, "sv")],
    ["Per MW", fmtEur(r.perMw, "sv")],
    ["Per MW och år (årstakt)", fmtEur(r.perMwYear, "sv")],
    ["Mot Clean Horizon", r.ch ? `${fmtPct(r.ch.ratio - 1, "sv", true)} (${r.ch.n} mån)` : "—"],
    ["Av marknadstaket", r.ceil ? fmtPct(r.ceil.share, "sv") : "—"],
    ["Starkaste månad", `${monthName(r.best.ym, "sv")} · ${fmtEur(r.best.rev, "sv")}`],
  ];
  return {
    subject: `Nytt lead från Revenue Intelligence: ${who.name || email}${who.company ? ` (${who.company})` : ""} – ${fmtNum(r.mw, "sv")} MW/${fmtNum(r.mwh, "sv")} MWh ${r.area}`,
    html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a18">
<p>En användare har laddat ner sin Ditt batteri-rapport. E-postadressen är verifierad via inloggningslänk.</p>
<table style="border-collapse:collapse">${rows.map(([k, v]) =>
      `<tr><td style="padding:3px 14px 3px 0;color:#64748b">${esc(k)}</td><td style="padding:3px 0"><strong>${esc(v)}</strong></td></tr>`).join("")}</table>
${link ? `<p><a href="${esc(link)}">Öppna samma vy i Revenue Intelligence</a></p>` : ""}
<p>Svara på det här mejlet för att skriva direkt till användaren.</p></div>`,
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const cfg = config();
  const enabled = Boolean(cfg.sbUrl && cfg.sbKey);
  const notify = Boolean(cfg.ejsTemplate && cfg.ejsPrivate && cfg.lead);
  // GET säger bara OM utskicket är aktiverat, så att dashboarden kan dölja
  // knappen i stället för att visa något som inte fungerar. Inga värden läcker.
  if (req.method === "GET") return res.status(200).json({ enabled });
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method" });
  }
  if (!enabled) return res.status(503).json({ error: "not_configured" });

  const auth = String(req.headers.authorization || "");
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  let who;
  try { who = await verifiedUser(cfg, token); }
  catch (e) { console.error("report: verify", e); return res.status(502).json({ error: "auth_unavailable" }); }
  if (!who) return res.status(401).json({ error: "unauthorized" });
  // Namn och telefon krävs innan rapporten lämnas ut — det är leadets värde.
  if (!who.name || !who.phone) return res.status(400).json({ error: "profile" });
  const email = who.email;

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
  const { area, mw, mwh } = body || {};
  const lang = body && body.lang === "en" ? "en" : "sv";
  const project = clip(body && body.name, 80);
  const MW = Number(mw), MWH = Number(mwh);
  if (!(MW > 0 && MW <= 1000 && MWH > 0 && MWH <= 2500)) return res.status(400).json({ error: "input" });

  const r = computeBacktest({ revenue, benchmark, ceiling, area, mw: MW, mwh: MWH });
  if (r.error) return res.status(400).json({ error: r.error });

  if (!allowed(email)) return res.status(429).json({ error: "rate_limited" });

  let pdf;
  try { pdf = await buildReportPdf(r, { lang, email, name: who.name, project }); }
  catch (e) { console.error("report: pdf", e); return res.status(500).json({ error: "pdf_failed" }); }
  const slug = project.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  const filename = `GreenVoltis-${slug ? slug + "-" : "batteri-2026-"}${r.area}-${fmtNum(MW, "en")}MW-${fmtNum(MWH, "en")}MWh.pdf`;

  // Leadet loggas alltid, så att det finns kvar i Vercels logg även om
  // mejlet inte går fram.
  console.log("ri-lead", JSON.stringify({ email, name: who.name, phone: who.phone,
    company: who.company, project, area: r.area, mw: MW, mwh: MWH,
    total: Math.round(r.total), lang, at: new Date().toISOString() }));

  if (notify) {
    const host = String(req.headers["x-forwarded-host"] || req.headers.host || "");
    const link = host ? `https://${host}/?vy=batteri&zon=${r.area}&mw=${MW}&mwh=${MWH}` : "";
    const lm = leadMail(r, who, project, link);
    try {
      await sendMail(cfg, { to: cfg.lead, replyTo: email, subject: lm.subject, html: lm.html });
    } catch (e) { console.error("report: lead mail", e); }
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.status(200).send(Buffer.from(pdf));
}
