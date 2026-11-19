// ─── send-report.mjs ────────────────────────────────────────────────────────
// Skickar "Ditt batteri 2026"-rapporten som PDF till den INLOGGADE användaren.
//
// Flöde
//  1. Webbläsaren loggar in med magic link (Supabase, samma projekt som BESS
//     Simulation) och anropar POST /api/send-report med sin access-token och
//     { area, mw, mwh, lang }.
//  2. Funktionen verifierar token mot Supabase och tar e-postadressen därifrån
//     — aldrig från anropet — så att rapporten bara kan skickas till en adress
//     som användaren bevisat att den äger.
//  3. Siffrorna räknas om här från samma JSON-filer som dashboarden visar,
//     med samma kod (src/backtest.mjs). Webbläsaren skickar bara indata.
//  4. PDF:en skickas via Resend till användaren, och en leadavisering med
//     samma PDF går till LEAD_EMAIL.
//
// Miljövariabler (Vercel → Settings → Environment Variables)
//   REACT_APP_SB_URL   samma värde som i BESS Simulation (används även här)
//   REACT_APP_SB_KEY   samma anon-nyckel som i BESS Simulation
//   RESEND_API_KEY     från resend.com → API Keys
//   REPORT_FROM        avsändare på verifierad domän, t.ex.
//                      "GreenVoltis <rapport@greenvoltis.com>"
//   LEAD_EMAIL         vem som får leadaviseringen (valfri; se standard nedan)
//
// Saknas något av de fyra första svarar funktionen 503 och dashboarden döljer
// utskicket i stället för att visa en knapp som inte fungerar.

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
const LIMIT = 5, WINDOW_MS = 60 * 60 * 1000;
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
    sbKey: String(process.env.REACT_APP_SB_KEY || "").trim(),
    resendKey: String(process.env.RESEND_API_KEY || "").trim(),
    from: String(process.env.REPORT_FROM || "").trim(),
    lead: String(process.env.LEAD_EMAIL || DEFAULT_LEAD).trim(),
  };
}

async function verifiedEmail(cfg, token) {
  if (!token) return null;
  const r = await fetch(`${cfg.sbUrl}/auth/v1/user`, {
    headers: { apikey: cfg.sbKey, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const u = await r.json().catch(() => null);
  return u && typeof u.email === "string" && u.email.includes("@") ? u.email.toLowerCase() : null;
}

async function sendMail(cfg, payload) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    throw new Error(`Resend ${r.status}: ${detail.slice(0, 300)}`);
  }
  return r.json().catch(() => ({}));
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function userMail(r, lang, email) {
  const p = periodLabel(r.first, r.last, lang);
  const spec = `${fmtNum(r.mw, lang)} MW / ${fmtNum(r.mwh, lang)} MWh, ${r.area}`;
  if (lang === "en") {
    return {
      subject: `Your battery's revenue in 2026 – ${spec}`,
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a18;line-height:1.6">
<p>Hello,</p>
<p>Attached is the report for your battery (${esc(spec)}). Over ${esc(p)} it would have earned
<strong>${esc(fmtEur(r.total, lang))}</strong> with GreenVoltis optimisation, or ${esc(fmtEur(r.perMw, lang))} per MW.</p>
<p>Questions, or want to discuss your battery? Just reply to this email.</p>
<p>Kind regards,<br>GreenVoltis</p></div>`,
    };
  }
  return {
    subject: `Ditt batteris intäkter 2026 – ${spec}`,
    html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a18;line-height:1.6">
<p>Hej,</p>
<p>Här kommer rapporten för ditt batteri (${esc(spec)}). Under ${esc(p)} hade det tjänat
<strong>${esc(fmtEur(r.total, lang))}</strong> med GreenVoltis optimering, eller ${esc(fmtEur(r.perMw, lang))} per MW.</p>
<p>Har du frågor eller vill prata om ditt batteri? Svara på det här mejlet.</p>
<p>Vänliga hälsningar,<br>GreenVoltis</p></div>`,
  };
}

function leadMail(r, email) {
  const p = periodLabel(r.first, r.last, "sv");
  const rows = [
    ["E-post", email],
    ["System", `${fmtNum(r.mw, "sv")} MW / ${fmtNum(r.mwh, "sv")} MWh (${fmtHours(r.c, "sv")})`],
    ["Elprisområde", r.area],
    [`Intäkt ${p}`, fmtEur(r.total, "sv")],
    ["Per MW", fmtEur(r.perMw, "sv")],
    ["Mot Clean Horizon", r.ch ? `${fmtPct(r.ch.ratio - 1, "sv", true)} (${r.ch.n} mån)` : "—"],
    ["Av marknadstaket", r.ceil ? fmtPct(r.ceil.share, "sv") : "—"],
    ["Starkaste månad", `${monthName(r.best.ym, "sv")} · ${fmtEur(r.best.rev, "sv")}`],
  ];
  return {
    subject: `Ny rapport från Revenue Intelligence: ${email} – ${fmtNum(r.mw, "sv")} MW/${fmtNum(r.mwh, "sv")} MWh ${r.area}`,
    html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a18">
<p>En användare har skickat sin Ditt batteri-rapport till sig själv. PDF:en är bifogad.</p>
<table style="border-collapse:collapse">${rows.map(([k, v]) =>
      `<tr><td style="padding:3px 14px 3px 0;color:#64748b">${esc(k)}</td><td style="padding:3px 0"><strong>${esc(v)}</strong></td></tr>`).join("")}</table></div>`,
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const cfg = config();
  const enabled = Boolean(cfg.sbUrl && cfg.sbKey && cfg.resendKey && cfg.from);
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
  let email;
  try { email = await verifiedEmail(cfg, token); }
  catch (e) { console.error("send-report: verify", e); return res.status(502).json({ error: "auth_unavailable" }); }
  if (!email) return res.status(401).json({ error: "unauthorized" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
  const { area, mw, mwh } = body || {};
  const lang = body && body.lang === "en" ? "en" : "sv";
  const MW = Number(mw), MWH = Number(mwh);
  if (!(MW > 0 && MW <= 1000 && MWH > 0 && MWH <= 2500)) return res.status(400).json({ error: "input" });

  const r = computeBacktest({ revenue, benchmark, ceiling, area, mw: MW, mwh: MWH });
  if (r.error) return res.status(400).json({ error: r.error });

  if (!allowed(email)) return res.status(429).json({ error: "rate_limited" });

  let pdf;
  try { pdf = await buildReportPdf(r, { lang, email }); }
  catch (e) { console.error("send-report: pdf", e); return res.status(500).json({ error: "pdf_failed" }); }
  const content = Buffer.from(pdf).toString("base64");
  const filename = `GreenVoltis-batteri-2026-${r.area}-${fmtNum(MW, "en")}MW-${fmtNum(MWH, "en")}MWh.pdf`;

  const um = userMail(r, lang, email);
  try {
    await sendMail(cfg, {
      from: cfg.from, to: [email], reply_to: cfg.lead,
      subject: um.subject, html: um.html,
      attachments: [{ filename, content }],
    });
  } catch (e) {
    console.error("send-report: user mail", e);
    return res.status(502).json({ error: "send_failed" });
  }

  // Leadaviseringen får inte fälla kundens utskick.
  if (cfg.lead) {
    const lm = leadMail(r, email);
    try {
      await sendMail(cfg, { from: cfg.from, to: [cfg.lead], reply_to: email,
        subject: lm.subject, html: lm.html, attachments: [{ filename, content }] });
    } catch (e) { console.error("send-report: lead mail", e); }
  }

  return res.status(200).json({ ok: true, email });
}
