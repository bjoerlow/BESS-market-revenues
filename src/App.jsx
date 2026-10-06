// ─── COPYRIGHT ──────────────────────────────────────────────────────────────
// Copyright (c) 2024-2025 GreenVoltis AB. All rights reserved.
// This software and its source code are proprietary and confidential.
// Unauthorized copying, modification, or distribution is strictly prohibited.
// For licensing inquiries: patrik.bjorklund@greenvoltis.com
// ────────────────────────────────────────────────────────────────────────────

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from "recharts";

// ─── EMAILJS CONFIG ───────────────────────────────────────────────────────────
const EJS_SERVICE  = "service_47yayo1";
const EJS_PUB_KEY  = "dytz55eqSJLyofT-K";
const EJS_TMPL_LEAD = "template_br3rp4e";
const EJS_TMPL_USER = "template_bwv1cy5v";

async function sendEmail(templateId, params) {
  try {
    const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id:  EJS_SERVICE,
        template_id: templateId,
        user_id:     EJS_PUB_KEY,
        template_params: params,
      }),
    });
    return res.ok;
  } catch { return false; }
}

// ─── SUPABASE AUTH ───────────────────────────────────────────────────────────
// Setup: supabase.com -> new project -> Settings -> API -> paste below
// SQL (run once in SQL Editor):
//   create table bess_projects (
//     id uuid default gen_random_uuid() primary key,
//     user_id uuid references auth.users, user_email text,
//     project_name text, company text, phone text, role text, timeline text,
//     area text, mw int, hrs int, scn text, grid text, tab text,
//     capex_total text, irr text, npv text, payback text,
//     created_at timestamptz default now()
//   );
//   alter table bess_projects enable row level security;
//   create policy "own_sel" on bess_projects for select using (auth.uid()=user_id);
//   create policy "own_ins" on bess_projects for insert with check (auth.uid()=user_id);
//
//   -- Saving, reopening, updating and deleting projects:
//   alter table bess_projects add column if not exists config text;
//   alter table bess_projects add column if not exists updated_at timestamptz default now();
//   create policy "own_upd" on bess_projects for update using (auth.uid()=user_id);
//   create policy "own_del" on bess_projects for delete using (auth.uid()=user_id);
// Credentials come from Vercel environment variables so this file never needs
// editing between deploys. Set these once under Settings -> Environment Variables:
//     REACT_APP_SB_URL = https://<project-id>.supabase.co
//     REACT_APP_SB_KEY = <anon public key>
// The anon key is designed to be public — row level security is what protects
// the data — so shipping it in the bundle is expected, not a leak.
const SB_URL      = process.env.REACT_APP_SB_URL || "";
const SB_KEY      = process.env.REACT_APP_SB_KEY || "";
const ADMIN_EMAIL = process.env.REACT_APP_ADMIN_EMAIL || "patrik.bjorklund@greenvoltis.com";
// Sanitize: trim whitespace, drop trailing slashes and any accidental path
// (e.g. ".../rest/v1" pasted from the API docs) — these break the SDK silently.
function cleanSbUrl(u) {
  let s = (u || "").trim();
  s = s.replace(/\/+$/, "");
  const m = s.match(/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)/i);
  return m ? m[0] : s;
}
const SB_URL_CLEAN = cleanSbUrl(SB_URL);
const SB_KEY_CLEAN = (SB_KEY || "").trim();
const SB_SET       = SB_URL_CLEAN.length > 0 && SB_KEY_CLEAN.length > 0
                     && !SB_URL.includes("YOUR_PROJECT") && !SB_KEY.includes("YOUR_ANON");
const SB_URL_OK    = /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(SB_URL_CLEAN);
const SB_KEY_OK    = SB_KEY_CLEAN.length > 40;
const SB_READY     = SB_SET && SB_URL_OK && SB_KEY_OK;
const supabase     = SB_READY ? createClient(SB_URL_CLEAN, SB_KEY_CLEAN) : null;

// ─── TRANSLATIONS ─────────────────────────────────────────────────────────────
const T = {
  en: {
    appSub:"UTILITY-SCALE · GRID-CONNECTED · INVESTMENT MODEL",
    simple:"Simple", advanced:"Advanced", reset:"Reset",
    exportPdf:"Export PDF", exportCmp:"Compare Scenarios", projects:"Projects",
    saveShare:"Save & Share", shareLink:"Share Link", shareCopied:"Link copied!",
    opexPanel:"OPEX Breakdown", showOpex:"Show OPEX", hideOpex:"Hide OPEX",
    sysConf:"System Configuration",
    sysSize:"System Size (MW)", dur:"Storage Duration",
    capex:"CAPEX (SEK/kWh)", omLabel:"O&M + Insurance (% of CAPEX/yr)",
    rte:"Round-Trip Efficiency (%)", cpd:"Cycles per Day (wear & grid fees)",
    totalCapex:"TOTAL CAPEX", omYr1:"O&M Year 1",
    finStr:"Financing Structure", finType:"Financing Type",
    eqLabel:"Equity", mixLabel:"Mixed", dbtLabel:"Debt",
    debtR:"Debt Ratio (%)", intR:"Interest Rate (%)", loanT:"Loan Term (yr)",
    wacc:"Discount Rate / WACC (%)",
    taxInc:"Corporate Tax", taxOn:"Include", taxOff:"Exclude (default)", taxRate:"Tax Rate (%)",
    dsoSec:"Grid Owner (DSO) Tariffs",
    hybGridMW:"Subscribed Export Capacity (MW)",
    hybGridMWHint:"Defaults to the plant's rating, because the connection was sized for the plant. Swedish PV peaks around 85% of rating, so roughly 15% of the connection is free at all times and the battery can discharge into it even at midday - and for half the year the plant produces almost nothing, leaving the whole connection open. Raise this only if you intend to fit a battery larger than that headroom and upgrade the subscription accordingly.",
    powerUtil:"Billed Power (% of nameplate)",
    powerUtilHint:"Capacity tariffs are billed on the HIGHEST hourly average in the period, not the mean across all hours. Over a month a BESS usually hits at least one hour near full power, so the billed level tends toward nameplate. The 90% default is deliberately conservative. Check an invoice: billed kW divided by installed kW. Combined subscription? Set the tariff you are not charged to zero.",
    dsoFixed:"Fixed Grid Fee (SEK/yr)",
    dsoFixedHint:"Flat annual charge for the connection — subscription and metering. Not scaled by system size. Sites under 5 MW often land between 5 000 and 25 000 SEK; larger connections run considerably higher. The slider steps in 1 000 up to 50 000, then 10 000 to a million, then 50 000.", dsoCons:"Consumption Tariff (SEK/kW/yr)",
    dsoProd:"Production Tariff (SEK/kW/yr)", dsoTrans:"Transaction Cost (öre/kWh)",
    dsoGain:"Grid Benefit (öre/kWh)",
    scnSec:"Revenue Scenario", revDecay:"Revenue Decline yr 11+ (%/yr)",
    revDecayHint:"Applies from year 11, after the zones have converged. Years 1-10 follow the convergence path instead.",
    cons:"Conservative", base:"Base", opti:"Optimistic",
    scnInfo:[
      "Year 1 = GreenVoltis Multi-Market Optimization actuals for the selected zone, annualised from Revenue Intelligence.",
      "Year 10 converges to a common Nordic level as transmission bottlenecks are built out: 1.1 / 1.5 / 1.8 MSEK per MW.",
      "Zones therefore decline unevenly - SE4 falls furthest from today's level, SE3 least.",
      "Those are market levels per MW nameplate. Booked revenue is lower by battery state-of-health and availability.",
      "Years 11-15 drift from the converged level at the decline rate you set below.",
    ],
    landLease:"Land Lease (SEK/yr)", landLeaseHint:"Annual ground rent. Escalates with O&M at same rate.",
    peakTariff:"Winter Peak Tariff (SEK/kW/month)", peakTariffHint:"High-load capacity charge Nov–Mar (5 months). Added to consumption tariff.",
    opexPeakTariff:"Winter Peak Tariff",
    warnDSCR:"⚠ Debt service exceeds EBITDA — project cannot service debt from operations. Consider lower leverage, longer loan term, or higher revenue assumptions.",
    warnPB:"⚠ Equity not recovered within 15 years at current settings.",
    opexLandLease:"Land Lease",
    brpNote:"Optimizer + BRP fee: 15% of gross revenue (fixed)",
    kIRR:"Equity IRR", kNPV:"NPV (Equity)",
    kPBK:"Payback", kMOIC:"MOIC", kCAP:"Total CAPEX",
    kEBITDAM:"EBITDA Margin yr1", kDSCR:"Avg DSCR", kLTV:"LTV", kPI:"Profit. Index",
    dNote:"@ WACC", eBasis:"equity basis", moicSub:"money-on-invested",
    eqCap:"Equity", piSub:"NPV÷equity+1",
    cRev:"Annual Revenue — Multi-Market Optimization (KEUR)",
    cCF:"Cumulative Equity Cash Flow (KEUR)",
    cScn:"Scenario Comparison — Net Revenue after BRP (KEUR/yr)",
    cEB:"EBITDA & Net Cash Flow (KEUR)",
    tTitle:"15-Year Projection (KEUR)",
    cYr:"Yr", cMmo:"MMO Revenue", cRvT:"Gross Rev",
    cBRP:"BRP 15%", cOM:"O&M", cDSO:"DSO net",
    cEBI:"EBITDA", cTAX:"Tax", cDBT:"Debt Svc", cNCF:"Net CF", cCCF:"Cum CF", cDEG:"SoH%",
    mmoLeg:"Multi-Market Optimization", cumLeg:"Cum. CF", ebiLeg:"EBITDA", nfLeg:"Net CF",
    pbLbl:"Payback", pbOvr:">", pbYr:"yr",
    opexOM:"O&M + Insurance", opexDsoFixed:"DSO Fixed Fee",
    opexDsoCons:"DSO Consumption", opexDsoProd:"DSO Production",
    opexDsoTrans:"DSO Transaction", opexDsoGain:"DSO Grid Benefit",
    opexDsoNet:"DSO Net Total",
    opexBRP:"Optimizer + BRP (15%)", opexTotal:"Total OPEX + Fees yr 1", opexUnit:"KEUR/yr",
    dsoN:"DSO Net/yr", thrN:"Throughput/yr", lssN:"Losses/yr", grdN:"Grid",
    availLabel:"Availability Factor (%)",
    availHint:"Time online per year (maintenance + outages). Multiplies all revenues.",
    degHint:"Physics SoH. At the 1.3 cpd GreenVoltis runs today: ~93% yr3, ~81% yr10.",
    cycleHint:"Does not affect revenue — the MMO anchor already embeds the strategy\u0027s own cycling. Drives degradation and throughput-based grid fees only.",
    dur2hint:"2h: ~3,200 SEK/kWh -- the RI anchor, calibrated on realised performance",
    dur3hint:"3h: ~3,000 SEK/kWh (+15% vs 2h) -- close to the 2.5h systems GreenVoltis operates today",
    dur4hint:"4h: ~2,800 SEK/kWh (+30% vs 2h) -- modelled; 2.5h recommended up to ~5-10 MW",
    footer:"GreenVoltis · AI-Native Energy Optimization · patrik.bjorklund@greenvoltis.com · +46 791-023 675",
    milestones:"Milestones",
    msPayback:"Payback",
    msSoH80:"SoH 80%",
    msSoH70:"SoH 70%",
    msLoanEnd:"Loan repaid",
    msEbitdaPos:"EBITDA+",
    msShow:"Show milestones",
    msHide:"Hide milestones",
    hybTab:"Hybrid Project", bessTab:"Standalone BESS",
    hybSub:"CO-LOCATED RENEWABLE + BESS · REVENUE STACK ANALYSIS",
    hybRenType:"Renewable Type", hybWind:"Wind", hybSolar:"Solar",
    hybRenMW:"Renewable Capacity (MW)", hybSuggest:"Suggested BESS",
    hybSuggestBtn:"Apply", hybCapRes:"Capacity Reserved for Balancing (%)",
    hybImbal:"Imbalance Cost (SEK/MWh produced)",
    hybImbalHint:"The plant's current imbalance cost per MWh. The optimiser removes 90% of it. Netting happens on the intraday market, so a battery anywhere in the same bidding zone can correct the deviation - the benefit does not require physical co-location.",
    hybDownOn:"Include down-regulation from the plant",
    hybDownOnHint:"Off by default. Tick only if GreenVoltis brings this service to a plant that does not already have it - then the revenue is incremental to the battery investment. If the plant already sells down-regulation through another provider, leave it off.",
    hybDownPart:"Down-Regulation Participation (%)",
    hybDownPartHint:"Bid volume and available hours come from the technology's production duration curve. This slider is the share of that theoretical optimum you can actually commit, and 40% is deliberately cautious: capacity is procured in blocks so output must hold above the bid for the whole block, not just the odd hour, and bids still have to clear. Capacity payment only - activation energy is excluded.",
    hybRevDown:"Down-Regulation (plant)",
    hybCapturePremium:"Capture Rate Premium (SEK/MWh)",
    hybCapturePremiumHint:"Combined value of time-shifting AND curtailment recovery per MWh total renewable production. Solar captures more because midday production often coincides with low/negative prices, creating large spreads (80-150 ore/kWh in SE3/SE4). Wind premium is lower since wind curtailment typically occurs at night when spreads are smaller. No decline applied -- price volatility is expected to increase. Presets: Solar 2h=120, 3h=200, 4h=250. Wind 2h=30, 3h=50, 4h=70 SEK/MWh.",
    hybRevMmo:"Multi-Market Optimization", hybRevImbal:"Imbalance", hybRevCapt:"Price shifting",
    hybChartRev:"Hybrid Revenue Stack (KSEK/yr)", hybChartCF:"Cumulative Hybrid CF (KSEK)",
    hybScnChart:"Hybrid Scenario Comparison (KSEK/yr)",
    hybTitle:"15-Year Hybrid Projection (KSEK)",
    hybNote:"Hybrid: BESS ancillary + trading use the same standalone revenue engine, reduced by seasonal capacity reservation (solar ~27% of year, wind ~75%). Capture Rate Premium = combined time-shifting + curtailment value per MWh renewable production -- no decline factor applied. Three scenarios available.",
    helpBtn:"?",
    helpTitle:"How to use the BESS Calculator",
    helpClose:"Close guide",
    helpSections:[
      {icon:"⚙",title:"System Configuration",
        text:"Set system size (MW) and storage duration: 2h (~3,200 SEK/kWh) for ancillary-focused assets, 3h (~3,000 SEK/kWh, +15% revenue), close to the 2.5h systems GreenVoltis operates today and the practical sweet spot up to roughly 5-10 MW, 4h (~2,800 SEK/kWh, +30% revenue) for maximum day-ahead arbitrage. CPD reflects dispatch intensity (1.5 = realistic default). Availability captures planned downtime and forced outages."},
      {icon:"◈",title:"Price Area (SE1–SE4)",
        text:"Select your grid connection zone. Each zone carries its own year-1 anchor taken directly from realised MMO performance there - not a multiplier applied to a national average. SE4 has delivered the strongest results, SE1 sits above SE3 on price volatility and congestion rents, and SE2 tracks close to SE3. These relationships differ materially from pre-2026 industry assumptions, which generally placed the northern zones lowest. The model does not assume they persist: by year 10 all four zones converge on a common level, so the choice of zone matters most for the early years of the investment."},
      {icon:"≋",title:"Revenue Scenarios",
        text:"Year 1 is not a forecast - it is the realised result of GreenVoltis Multi-Market Optimization for your bidding zone, annualised from the Revenue Intelligence platform, which has been in live operation since April 2026. Base takes that figure as year 1; Conservative applies 85%, Optimistic 115%. From there all four zones converge toward a common Nordic level by year 10: 1.1 MSEK per MW conservative, 1.5 base, 1.8 optimistic. The reasoning is that today's price-area spreads are largely a bottleneck phenomenon, and a decade of transmission investment narrows them. A zone earning more today therefore declines further - SE4 retains roughly 43% of its year-1 level in the base case, SE3 about 65%. Note that these are market levels per MW of nameplate capacity: what the asset books is lower once battery state-of-health and availability are applied, so a 1.5 MSEK market level yields roughly 1.17 MSEK booked at 1.5 cycles per day. Years 11-15 drift from the converged level at the decline rate set in the sidebar."},
      {icon:"⚡",title:"Billed Power & Grid Tariffs",
        text:"Capacity-based network tariffs are billed on the highest hourly AVERAGE power drawn, not on what the nameplate says. This matters more for a BESS than for most loads: an asset running mFRR responds in 15-minute activations and rarely sustains full power across a whole hour, so the level the DSO bills can sit well below installed capacity. Set Billed Power to the ratio you see on an actual invoice - billed kW divided by installed kW. It scales the consumption tariff, the production tariff and the winter peak charge. It does not touch the fixed connection fee, which is charged regardless, nor the per-kWh transaction cost and grid benefit, which follow the energy you actually move. Grid agreements come in several forms: some DSOs subscribe consumption and production separately, others combine them. If you are only charged on one side, set the other tariff to zero."},
      {icon:"$",title:"Financing Structure",
        text:"Equity: all capital is equity — IRR reflects full return on invested capital. Mixed: partial debt financing, set the debt ratio, interest rate and loan term. Debt: maximum leverage. The WACC / Discount Rate is used to calculate NPV — set this to your required rate of return. All key metrics update instantly."},
      {icon:"▦",title:"DSO Tariffs",
        text:"Enter your actual network tariff agreement. Consumption tariff (SEK/kW/yr) is charged on subscribed capacity. Production tariff applies to injection. Transaction cost (öre/kWh) is charged on energy drawn from the grid. Grid benefit (öre/kWh) is a credit for energy delivered to the grid."},
      {icon:"↓",title:"Export PDF & Lead Capture",
        text:"Click Export PDF to register your project and generate a landscape A3 report with charts and the full 15-year table. Your project details are emailed to the GreenVoltis team. Use Export Comparison for a side-by-side report across all three scenarios. After export you can request a consultation from the banner."},
      {icon:"⇗",title:"Save & Share",
        text:"The Save & Share button encodes your entire configuration into a URL. Bookmark it or send it to a colleague -- opening the link restores every slider and setting exactly as you left them. No account or login required."},
      {icon:"⚿",title:"Sign In & Project History",
        text:"Click Sign In to access PDF export and project history. We use passwordless magic links -- enter your email, click the link we send. Every PDF export is automatically saved with your project name, configuration and key financials. Click My Projects to review history. Admin users see all projects across all users."},
      {icon:"⚡",title:"Hybrid Project",
        text:"Model a co-located renewable + BESS. Ancillary + trading use the standalone engine reduced by a time-based fraction: BESS spends part of each day charging/discharging for production optimization and cannot participate in ancillary markets during those hours. Solar 2h=92%/3h=88%/4h=84% of standalone retained. Wind 2h=85%/3h=81%/4h=77%. Three transparent inputs drive capture revenue: curtailment % of production, avg price during curtailment, and BESS sell price after time-shift. Three scenarios (conservative/base/optimistic) available."},
            {icon:"☀",title:"Solar + BESS",
        text:"Solar production in Sweden is concentrated April-September during daylight hours. Midday prices in SE3/SE4 are frequently low or negative (0-300 SEK/MWh), while evening peaks reach 800-1500 SEK/MWh (April 2026 SE3 data shows >1000 SEK/MWh). Set Curtailment % to how much of your annual production is currently curtailed (typically 3-8% for solar). Set the low price to your average midday selling price and the high price to your expected BESS evening selling price. A 4h BESS can capture most of the daily spread. The ancillary fraction (84-92%) reflects that BESS spends 4-8h/day on solar optimization during summer, but is fully free for ancillary services during autumn/winter."},
      {icon:"⚑",title:"Wind + BESS",
        text:"Wind production is year-round but variable (capacity factor ~31%). Wind curtailment occurs mostly at night or during storms when demand is low and prices are moderate (200-400 SEK/MWh) compared to solar midday lows. The price spread for wind time-shifting is smaller (sell at 500-800 SEK/MWh day peak vs 200-400 night). BESS handles more of wind production hours (75% vs 20% for solar), so the ancillary fraction is lower (77-85% of standalone). Set your wind curtailment % (typically 2-5%), avg night price, and expected day-peak sell price."},
    ],
    // Export modal
    exportTitle:"Export PDF — Project Registration",
    exportCmpTitle:"Scenario Comparison Report",
    exportUser:"Full Name", exportCompany:"Company", exportEmail:"Email Address",
    exportPhone:"Phone Number", exportProject:"Project Name",
    exportRole:"Your Role", exportTimeline:"Project Timeline",
    exportUserPh:"e.g. Anna Svensson", exportCompanyPh:"e.g. Vattenfall AB",
    exportEmailPh:"e.g. anna@vattenfall.com", exportPhonePh:"e.g. +46 70 123 4567",
    exportProjectPh:"e.g. Vattenfall 20MW SE3",
    exportRolePh:"Select role...", exportTimelinePh:"Select timeline...",
    roleOptions:["Developer / IPP","Investor / Fund","Grid Owner / DSO","Consultant / Advisor","EPC / Supplier"],
    timelineOptions:["Just exploring","6–12 months","Ready to procure","Already in operation"],
    exportSave:"Save & Export PDF", exportCancel:"Cancel",
    exportRequired:"Please fill in all required fields.",
    exportSending:"Sending...", exportSent:"✓ Sent — opening PDF",
    exportError:"Email failed but PDF will still open.",
    // Projects
    projectsTitle:"Saved Projects", projectsEmpty:"No projects saved yet.", projectsBy:"by",
    printedBy:"Prepared by", printConfig:"System Configuration", printFinancials:"Key Financials",
    // Quote
    quoteTitle:"Request a Consultation",
    quoteBody:"Thank you for using the GreenVoltis BESS Calculator. Our team will reach out within 1 business day to discuss your project in detail.",
    quoteBtn:"Request Consultation",
    quoteSent:"✓ Consultation request sent!",
    quoteNote:"A GreenVoltis advisor will contact you at",
    // Comparison
    cmpTitle:"Three-Scenario Comparison Report",
    cmpSubtitle:"Conservative · Base · Optimistic",
    loginBtn:"Sign in", loginRequired:"Sign in required",
    loginRequiredSub:"Sign in with your email to export PDFs and save projects.",
    loginTitle:"Sign in to GreenVoltis",
    loginSub:"Enter your email -- we send a magic link. No password needed.",
    loginEmail:"Email address", loginEmailPh:"e.g. anna@vattenfall.com",
    loginSend:"Send magic link", loginSending:"Sending...",
    loginSent:"Check your inbox", loginSentSub:"Click the link in the email to sign in.",
    loginError:"Could not send link. Please try again.",
    loginLogout:"Sign out", loginSignedIn:"Signed in as",
    loginMyProjects:"My saved projects", loginAdminTitle:"All Projects -- Admin",
    loginNoProjects:"No projects saved yet.",
  },
  sv: {
    appSub:"STORSKALIG · NÄTANSLUTEN · INVESTERINGSMODELL",
    simple:"Enkel", advanced:"Avancerad", reset:"Återställ",
    exportPdf:"Exportera PDF", exportCmp:"Jämför scenarier", projects:"Projekt",
    saveShare:"Spara & dela", shareLink:"Dela länk", shareCopied:"Länk kopierad!",
    opexPanel:"OPEX-specifikation", showOpex:"Visa OPEX", hideOpex:"Dölj OPEX",
    sysConf:"Systemkonfiguration",
    sysSize:"Systemstorlek (MW)", dur:"Lagringstid",
    capex:"CAPEX (SEK/kWh)", omLabel:"O&M + Försäkring (% av CAPEX/år)",
    rte:"Tur-och-retur-effektivitet (%)", cpd:"Cykler per dag (slitage & nätavgifter)",
    totalCapex:"TOTAL CAPEX", omYr1:"O&M År 1",
    finStr:"Finansieringsstruktur", finType:"Finansieringstyp",
    eqLabel:"Eget kap.", mixLabel:"Blandat", dbtLabel:"Lån",
    debtR:"Skuldandel (%)", intR:"Ränta (%)", loanT:"Lånetid (år)",
    wacc:"Diskonteringsränta / WACC (%)",
    taxInc:"Bolagsskatt", taxOn:"Inkludera", taxOff:"Exkludera (standard)", taxRate:"Skattesats (%)",
    dsoSec:"Nätägaravgifter (DSO)",
    hybGridMW:"Abonnerad effekt (MW)",
    hybGridMWHint:"Sätts som standard till parkens märkeffekt, eftersom anslutningen dimensionerades för parken. Svensk solel toppar runt 85% av märkeffekten, så ungefär 15% av anslutningen står fri hela tiden och batteriet kan ladda ur i den även mitt på dagen - och halva året producerar parken nästan ingenting, vilket lämnar hela anslutningen öppen. Höj bara om du vill sätta ett batteri större än det utrymmet och uppgradera abonnemanget.",
    powerUtil:"Debiterad effekt (% av märkeffekt)",
    powerUtilHint:"Effekttariffer debiteras på HÖGSTA timmedeleffekt under perioden, inte på snittet av alla timmar. Under en månad når ett BESS oftast minst en timme nära full effekt, så debiterad nivå dras mot märkeffekt. Standardvärdet 90% är medvetet försiktigt. Kontrollera mot en faktura: debiterad kW delat med installerad kW. Sammanslaget abonnemang? Sätt den tariff du inte debiteras för till noll.",
    dsoFixed:"Fast nätavgift (SEK/år)",
    dsoFixedHint:"Fast årlig avgift för anslutningen — abonnemang och mätning. Skalar inte med systemstorlek. Anläggningar under 5 MW hamnar ofta mellan 5 000 och 25 000 SEK; större anslutningar ligger betydligt högre. Reglaget går i steg om 1 000 upp till 50 000, sedan 10 000 upp till en miljon, därefter 50 000.", dsoCons:"Uttagstariff (SEK/kW/år)",
    dsoProd:"Inmatningstariff (SEK/kW/år)", dsoTrans:"Transaktionskostnad (öre/kWh)",
    dsoGain:"Nätnytta (öre/kWh)",
    scnSec:"Intäktsscenario", revDecay:"Intäktsminskning år 11+ (%/år)",
    revDecayHint:"Gäller från år 11, efter att zonerna konvergerat. År 1-10 följer konvergensbanan istället.",
    cons:"Konservativt", base:"Bas", opti:"Optimistiskt",
    scnInfo:[
      "År 1 = GreenVoltis Multi-Market Optimization faktiskt utfall för valt prisområde, annualiserat från Revenue Intelligence.",
      "År 10 konvergerar mot en gemensam nordisk nivå när flaskhalsar byggs bort: 1,1 / 1,5 / 1,8 MSEK per MW.",
      "Zonerna faller därför olika mycket - SE4 längst från dagens nivå, SE3 minst.",
      "Det är marknadsnivåer per MW installerat. Bokförd intäkt blir lägre efter batteriets hälsa och tillgänglighet.",
      "År 11-15 glider från den konvergerade nivån med den nedgångstakt du anger nedan.",
    ],
    landLease:"Markarrende (SEK/år)", landLeaseHint:"Årlig markhyra. Eskalerar i takt med O&M.",
    peakTariff:"Höglasttariff vinter (SEK/kW/mån)", peakTariffHint:"Effekttariff nov–mar (5 månader). Adderas till uttagstariff.",
    opexPeakTariff:"Höglasttariff vinter",
    warnDSCR:"⚠ Skuldservicen överstiger EBITDA — projektet kan inte betjäna skulden från verksamheten. Överväg lägre belåning, längre lånetid eller högre intäktsantaganden.",
    warnPB:"⚠ Eget kapital återbetalas inte inom 15 år med nuvarande inställningar.",
    opexLandLease:"Markarrende",
    brpNote:"Optimizer + BRP-avgift: 15% av bruttointäkt (fast)",
    kIRR:"Eget kap. IRR", kNPV:"NPV (eget kap.)",
    kPBK:"Återbetalningstid", kMOIC:"MOIC", kCAP:"Total CAPEX",
    kEBITDAM:"EBITDA-marginal år1", kDSCR:"Avg DSCR", kLTV:"LTV", kPI:"Lönsamhetsindex",
    dNote:"@ WACC", eBasis:"equity-basis", moicSub:"pengar-på-investering",
    eqCap:"Eget kap.", piSub:"NPV÷eget kap.+1",
    cRev:"Intäkter per år — Multi-Market Optimization (KSEK)",
    cCF:"Kumulativt kassaflöde — eget kapital (KSEK)",
    cScn:"Scenariojämförelse — Nettointäkt efter BRP (KSEK/år)",
    cEB:"EBITDA & Nettokassaflöde (KSEK)",
    tTitle:"15-årsprojektion (KSEK)",
    cYr:"År", cMmo:"MMO-intäkt", cRvT:"Bruttointäkt",
    cBRP:"BRP 15%", cOM:"O&M", cDSO:"DSO netto",
    cEBI:"EBITDA", cTAX:"Skatt", cDBT:"Skuldsvc", cNCF:"Netto KF", cCCF:"Kum. KF", cDEG:"SoH%",
    mmoLeg:"Multi-Market Optimization", cumLeg:"Kum. KF", ebiLeg:"EBITDA", nfLeg:"Netto KF",
    pbLbl:"Payback", pbOvr:">", pbYr:"år",
    opexOM:"O&M + Försäkring", opexDsoFixed:"DSO Fast avgift",
    opexDsoCons:"DSO Uttag", opexDsoProd:"DSO Inmatning",
    opexDsoTrans:"DSO Transaktion", opexDsoGain:"DSO Nätnytta",
    opexDsoNet:"DSO Netto totalt",
    opexBRP:"Optimizer + BRP (15%)", opexTotal:"Total OPEX + avgifter år 1", opexUnit:"KSEK/år",
    dsoN:"DSO Netto/år", thrN:"Genomströmning/år", lssN:"Förluster/år", grdN:"Nättyp",
    availLabel:"Tillgänglighetsfaktor (%)",
    availHint:"Andel av året online (underhåll + nätavbrott). Multiplicerar alla intäkter.",
    degHint:"Fysikalisk SoH. Vid 1,3 cpd som GreenVoltis kör idag: ~93% år3, ~81% år10.",
    cycleHint:"Påverkar inte intäkten — MMO-ankaret har strategins cykling inbyggd. Styr endast degradering och genomströmningsbaserade nätavgifter.",
    dur2hint:"2h: ~3 200 SEK/kWh -- RI-ankaret, kalibrerat på faktiskt utfall",
    dur3hint:"3h: ~3 000 SEK/kWh (+15% intäkter vs 2h) -- Balanserat ancillary + trading -- Bra for hybrid",
    dur4hint:"4h: ~2 800 SEK/kWh (+30% intäkter vs 2h) -- Bast for hybrid & arbitrage",
    footer:"GreenVoltis · AI-Native Energy Optimization · patrik.bjorklund@greenvoltis.com · +46 791-023 675",
    milestones:"Milstolpar",
    msPayback:"Återbetalt",
    msSoH80:"SoH 80%",
    msSoH70:"SoH 70%",
    msLoanEnd:"Lån återbetalt",
    msEbitdaPos:"EBITDA+",
    msShow:"Visa milstolpar",
    msHide:"Dölj milstolpar",
    hybTab:"Hybridprojekt", bessTab:"Fristående BESS",
    hybSub:"SAMPLACERAD FÖRNYBAR + BESS · INTÄKTSSTACKANALYS",
    hybRenType:"Förnybar typ", hybWind:"Vind", hybSolar:"Sol",
    hybRenMW:"Förnybar kapacitet (MW)", hybSuggest:"Föreslagen BESS",
    hybSuggestBtn:"Använd", hybCapRes:"Reserverad balanskapacitet (%)",
    hybImbal:"Obalanskostnad (SEK/MWh producerat)",
    hybImbalHint:"Anläggningens nuvarande obalanskostnad per MWh. Optimeringen tar bort 90% av den. Nettningen sker på intradagsmarknaden, så ett batteri var som helst i samma elområde kan korrigera avvikelsen - nyttan kräver inte fysisk samplacering.",
    hybDownOn:"Inkludera nedreglering från anläggningen",
    hybDownOnHint:"Avslagen som standard. Kryssa i endast om GreenVoltis tillför tjänsten till en anläggning som inte redan har den - då är intäkten tillkommande för batteriinvesteringen. Säljer anläggningen redan nedreglering via annan aktör, låt den vara avslagen.",
    hybDownPart:"Deltagande nedreglering (%)",
    hybDownPartHint:"Budvolym och tillgängliga timmar härleds ur teknikens varaktighetskurva. Reglaget är den andel av det teoretiska optimumet du faktiskt kan binda, och 40% är medvetet försiktigt: kapacitet upphandlas i block så produktionen måste ligga över budet hela blocket, inte bara enstaka timmar, och buden måste dessutom antas. Endast kapacitetsersättning - aktiveringsenergi är utelämnad.",
    hybRevDown:"Nedreglering (anläggning)",
    hybCapturePremium:"Capture Rate-premium (SEK/MWh)",
    hybCapturePremiumHint:"Sammanvägt värde av tidsförskjutning OCH curtailment-återvinning per MWh total förnybar produktion. Sol fångar mer eftersom middagsproduktion sammanfaller med låga/negativa priser (spridning 80-150 öre/kWh i SE3/SE4). Vindpremie lägre då vindcurtailment sker nattetid med mindre spridningar. Ingen avtagande faktor -- prisvolatilitet förväntas öka. Förval: Sol 2h=120, 3h=200, 4h=250. Vind 2h=30, 3h=50, 4h=70 SEK/MWh.",
    hybRevMmo:"Multi-Market Optimization", hybRevImbal:"Obalans", hybRevCapt:"Prisförflyttning",
    hybChartRev:"Hybridintaktsstack (KSEK/ar)", hybChartCF:"Kumulativt hybridkassaflode (KSEK)",
    hybScnChart:"Hybrid scenariojamforelse (KSEK/ar)",
    hybTitle:"15-årig hybridprognos (KSEK)",
    hybNote:"Hybrid: BESS stödtjänster + trading använder samma standalone-motor, reducerat med säsongsbaserad kapacitetsreservation (sol ~27% av aret, vind ~75%). Capture Rate-premium = kombinerat tidsförskjutnings- + curtailmentvärde per MWh förnybar produktion -- ingen avtagande faktor. Tre scenarier tillgängliga.",
    helpBtn:"?",
    helpTitle:"Så använder du BESS-kalkylatorn",
    helpClose:"Stäng guide",
    helpSections:[
      {icon:"⚙",title:"Systemkonfiguration",
        text:"Ange systemstorlek (MW) och lagringstid: 2h (~3 200 SEK/kWh) för ancillary-fokuserade tillgångar, 3h (~3 000 SEK/kWh, +15% intäkter), nära de 2,5h-system GreenVoltis driver idag och den praktiska sweet spoten upp till omkring 5-10 MW, 4h (~2 800 SEK/kWh, +30% intäkter) för maximal day-ahead-arbitrage. CPD visar dispatchintensitet (1,5 = realistiskt standardvärde). Tillgänglighet fångar planerat underhåll och nätavbrott."},
      {icon:"◈",title:"Prisområde (SE1–SE4)",
        text:"Välj ditt nätanslutningsområde. Varje zon har ett eget år 1-ankare hämtat direkt från realiserat MMO-utfall där - inte en multiplikator på ett nationellt snitt. SE4 har levererat starkast resultat, SE1 ligger över SE3 på prisvolatilitet och flaskhalsintäkter, och SE2 följer SE3 nära. Förhållandena skiljer sig markant från branschantaganden före 2026, som generellt placerade de norra zonerna lägst. Modellen antar inte att de består: vid år 10 konvergerar alla fyra zoner mot en gemensam nivå, så valet av prisområde spelar störst roll för investeringens tidiga år."},
      {icon:"≋",title:"Intäktsscenarier",
        text:"År 1 är ingen prognos - det är det faktiska utfallet av GreenVoltis Multi-Market Optimization för ditt prisområde, annualiserat från Revenue Intelligence som varit i skarp drift sedan april 2026. Bas använder den siffran som år 1; Konservativt tillämpar 85%, Optimistiskt 115%. Därifrån konvergerar alla fyra zoner mot en gemensam nordisk nivå år 10: 1,1 MSEK per MW konservativt, 1,5 bas, 1,8 optimistiskt. Resonemanget är att dagens skillnader mellan prisområden till stor del är ett flaskhalsfenomen, och att ett decennium av nätinvesteringar jämnar ut dem. En zon som tjänar mer idag faller därför längre - SE4 behåller omkring 43% av sin år 1-nivå i basfallet, SE3 cirka 65%. Observera att detta är marknadsnivåer per MW installerat: vad anläggningen bokför blir lägre när batteriets hälsa och tillgänglighet räknats av, så en marknadsnivå på 1,5 MSEK ger runt 1,17 MSEK bokfört vid 1,5 cykler per dygn. År 11-15 glider från den konvergerade nivån med den nedgångstakt du anger i sidopanelen."},
      {icon:"⚡",title:"Debiterad effekt & nätavgifter",
        text:"Effektbaserade nätavgifter debiteras på högsta timMEDELeffekt, inte på vad som står på typskylten. Det spelar större roll för ett BESS än för de flesta laster: en anläggning som kör mFRR svarar i 15-minutersaktiveringar och håller sällan full effekt en hel timme, så nivån DSO:n fakturerar kan ligga väsentligt under installerad effekt. Sätt Debiterad effekt till det förhållande du ser på en faktisk faktura - debiterad kW delat med installerad kW. Den skalar uttagstariff, inmatningstariff och höglasttariff vinter. Den påverkar inte den fasta anslutningsavgiften, som debiteras oavsett, och inte heller transaktionskostnad eller nätnytta per kWh, som följer den energi du faktiskt flyttar. Nätavtal finns i flera former: vissa DSO:er abonnerar konsumtion och produktion separat, andra slår ihop dem. Debiteras du bara på ena sidan, sätt den andra tariffen till noll."},
      {icon:"$",title:"Finansieringsstruktur",
        text:"Eget kapital: allt kapital är eget — IRR speglar avkastning på investerat kapital. Blandat: delvis lånefinansiering, ange skuldandel, ränta och löptid. Lån: maximal belåning. WACC/Diskonteringsränta används för NPV-beräkningen — sätt den till ditt avkastningskrav. Alla nyckeltal uppdateras omedelbart."},
      {icon:"▦",title:"DSO-tariffer",
        text:"Ange ditt faktiska nätavtal. Uttagstariff (SEK/kW/år) debiteras på tecknad effekt. Inmatningstariffen gäller inmatning till nätet. Transaktionskostnad (öre/kWh) debiteras på energi uttagen från nätet. Nätnytta (öre/kWh) är en kredit för energi levererad till nätet."},
      {icon:"↓",title:"Exportera PDF och leadinsamling",
        text:"Klicka på Exportera PDF för att registrera ditt projekt och generera en liggande A3-rapport med diagram och den fullständiga 15-årstabellen. Dina projektuppgifter skickas till GreenVoltis-teamet. Använd Exportera jämförelse för en rapport sida vid sida för alla tre scenarier. Efter export kan du begära en konsultation direkt från bannern."},
      {icon:"⇗",title:"Spara och dela",
        text:"Knappen Spara och dela kodar hela din konfiguration till en URL. Bokmärk den eller skicka till en kollega -- att öppna länken återställer alla reglage och inställningar exakt som du lämnade dem. Inget konto eller inloggning krävs."},
      {icon:"⚿",title:"Logga in & projekthistorik",
        text:"Klicka på Logga in för att få tillgång till PDF-export och projekthistorik. Vi använder lösenordslösa magic links -- ange din e-post, klicka på länken vi skickar. Varje PDF-export sparas automatiskt med projektnamn, konfiguration och nyckeltal. Klicka på Mina projekt för att se historiken. Admin-användare ser alla projekt."},
            {icon:"⚡",title:"Hybridprojekt",
        text:"Modellera samplacerad fornybar + BESS. Stödtjänster + trading använder standalone-motorn reducerad med en tidsbaserad fraktion: BESS laddar/urladdar under delar av dagen för produktionsoptimering och kan inte delta i stödtjänster då. Sol 2h=92%/3h=88%/4h=84% av standalone kvarstår. Vind 2h=85%/3h=81%/4h=77%. Tre transparenta inputs driver capture-intäkten: curtailment %, snittpris vid curtailment och BESS försäljningspris. Tre scenarier (konservativt/bas/optimistiskt) finns."},
      {icon:"☀",title:"Sol + BESS",
        text:"Solproduktion i Sverige koncentreras april-september under dagsljustimmar. Middagspriser i SE3/SE4 är ofta låga eller negativa (0-300 SEK/MWh) medan kvällstoppar når 800-1500 SEK/MWh (april 2026 SE3 > 1000 SEK/MWh). Ange curtailment % för hur mycket av din årsproduktion som curtailas (typiskt 3-8% för sol). Ange lågt pris = genomsnittligt middagspris och högt pris = förväntad BESS-försäljning på kvällen. 4h BESS fångar merparten av dagsspridningen. Stödtjänstandelen (84-92%) speglar att BESS ägnar 4-8h/dag åt soloptimering på sommaren men är helt fritt för stödtjänster höst/vinter."},
            {icon:"⚑",title:"Vind + BESS",
        text:"Vindproduktion sker året runt men variabelt (kapacitetsfaktor ~31%). Vindcurtailment sker oftast nattetid eller under stormar när efterfrågan är låg och priser måttliga (200-400 SEK/MWh) jämfört med solens middagslåga. Prisspridningen för vindtidsförskjutning är mindre (försäljning 500-800 SEK/MWh dagstopp vs 200-400 natt). BESS hanterar större del av vindproduktionen (75% vs 20% for sol), så stödtjänstandelen är lägre (77-85% av standalone). Ange vindcurtailment (typiskt 2-5%), snittpris natt och förväntad dagstopp-försäljning."},
    ],
    exportTitle:"Exportera PDF — Projektregistrering",
    exportCmpTitle:"Scenariojämförelserapport",
    exportUser:"Fullständigt namn", exportCompany:"Företag", exportEmail:"E-postadress",
    exportPhone:"Telefonnummer", exportProject:"Projektnamn",
    exportRole:"Din roll", exportTimeline:"Projekttidslinje",
    exportUserPh:"t.ex. Anna Svensson", exportCompanyPh:"t.ex. Vattenfall AB",
    exportEmailPh:"t.ex. anna@vattenfall.com", exportPhonePh:"t.ex. +46 70 123 4567",
    exportProjectPh:"t.ex. Vattenfall 20MW SE3",
    exportRolePh:"Välj roll...", exportTimelinePh:"Välj tidslinje...",
    roleOptions:["Developer / IPP","Investor / Fund","Grid Owner / DSO","Consultant / Advisor","EPC / Supplier"],
    timelineOptions:["Utforskar","6–12 månader","Redo att upphandla","Redan i drift"],
    exportSave:"Spara & exportera PDF", exportCancel:"Avbryt",
    exportRequired:"Fyll i alla obligatoriska fält.",
    exportSending:"Skickar...", exportSent:"✓ Skickat — öppnar PDF",
    exportError:"E-post misslyckades men PDF öppnas ändå.",
    projectsTitle:"Sparade projekt", projectsEmpty:"Inga projekt sparade ännu.", projectsBy:"av",
    printedBy:"Framtagen av", printConfig:"Systemkonfiguration", printFinancials:"Nyckeltal",
    quoteTitle:"Begär en konsultation",
    quoteBody:"Tack för att du använder GreenVoltis BESS-kalkylator. Vårt team återkommer inom 1 arbetsdag.",
    quoteBtn:"Begär konsultation",
    quoteSent:"✓ Konsultationsförfrågan skickad!",
    quoteNote:"En GreenVoltis-rådgivare kontaktar dig på",
    cmpTitle:"Trescenariojämförelserapport",
    cmpSubtitle:"Konservativt -- Bas -- Optimistiskt",
    loginBtn:"Logga in", loginRequired:"Inloggning krävs",
    loginRequiredSub:"Logga in med din e-post för att exportera PDF och spara projekt.",
    loginTitle:"Logga in på GreenVoltis",
    loginSub:"Ange din e-post -- vi skickar en magic link. Inget lösenord behövs.",
    loginEmail:"E-postadress", loginEmailPh:"t.ex. anna@vattenfall.com",
    loginSend:"Skicka magic link", loginSending:"Skickar...",
    loginSent:"Kolla din inkorg", loginSentSub:"Klicka på länken i mejlet för att logga in.",
    loginError:"Kunde inte skicka länk. Försök igen.",
    loginLogout:"Logga ut", loginSignedIn:"Inloggad som",
    loginMyProjects:"Mina sparade projekt", loginAdminTitle:"Alla projekt -- Admin",
    loginNoProjects:"Inga projekt sparade ännu.",
  },
};


// ─── SERVER-SIDE COMPUTATION ────────────────────────────────────────────────
// Business logic runs on Vercel serverless (/api/compute).
// Client sends parameters, receives computed results.
// Formulas never exposed in browser source code.
const API_URL = "/api/compute";

async function fetchCompute(params) {
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "standalone", params }),
    });
    if (!res.ok) throw new Error("API error");
    return await res.json();
  } catch (e) {
    console.error("API unavailable:", e.message);
    return null;  // No client-side fallback — engine runs server-side only
  }
}

async function fetchRiMeta() {
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "ri_meta" }),
    });
    if (!res.ok) throw new Error("API error");
    return await res.json();
  } catch (e) {
    console.error("RI meta unavailable:", e.message);
    return null;
  }
}

async function fetchHybridCompute(params, hybParams, scnOverride) {
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "hybrid", params, hybParams, scnOverride }),
    });
    if (!res.ok) throw new Error("API error");
    return await res.json();
  } catch (e) {
    console.error("API unavailable:", e.message);
    return null;
  }
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const BRP_FEE = 0.15;

// ─── COMPUTATION ENGINE ──────────────────────────────────────────────────────
function suggestCapex(hrs, hybrid) {
  const base = hrs>=4 ? 2800 : hrs===3 ? 3000 : 3200;
  // Co-located: civil works, land, access roads and the grid connection are
  // already in place, so only the battery itself is added to a finished site.
  return hybrid ? Math.round(base * 0.9 / 100) * 100 : base;
}

function suggestHybBESS(renMW, renType, hrs) {
  // Ratio rules describe large plants. Below roughly 5 MW they suggest a
  // battery too small to be worth connecting, so the suggestion is blended
  // toward one-to-one at the small end and never falls under 1 MW.
  // Headroom, not caution, sets the ceiling. With the connection sized for the
  // plant, a solar site can discharge at full power ~97% of hours with a
  // battery at 30% of plant MW, and ~91% at 50%. Wind reaches its rating more
  // often, so its headroom is tighter.
  const ratio = renType==="wind"
    ? (hrs>=4?0.25:hrs===3?0.30:0.35)
    : (hrs>=4?0.30:hrs===3?0.35:0.40);
  // Effective ratio decays smoothly from 1:1 at 1 MW toward the ratio rule as
  // the plant grows, so the suggestion never steps backwards as MW increases.
  const eff = ratio + (1 - ratio) * Math.exp(-(Math.max(1, renMW) - 1) / 3);
  return Math.max(1, Math.round(renMW * eff));
}

function hybCapFactor(renType) {
  return renType==="wind" ? 0.31 : 0.11;
}

// All financial calculations (buildRevs, calcSoH, calcIRR, calcNPV, annDS,
// compute, buildHybridRows, hybridAncillaryFraction, hybCapFactor) run
// exclusively on the server via /api/compute. Source code is not shipped
// to the browser. See api/compute.js in the repository.
// ─────────────────────────────────────────────────────────────────────────────

// ─── URL STATE ENCODE / DECODE ────────────────────────────────────────────────
const STATE_KEYS = ["mw","hrs","capex","omPct","disc","revDecay","avail","finType","debtR",
  "intR","loanT","taxR","inclTax","omEsc","area","scn","cpd","powerUtil","dsoFixedAnnual",
  "dsoCons","dsoProd","dsoTrans","dsoGain","rte","landLease","peakTariff"];

function encodeState(p) {
  const obj = {};
  STATE_KEYS.forEach(k => { if (p[k] !== undefined) obj[k] = p[k]; });
  return btoa(JSON.stringify(obj));
}
function decodeState(str) {
  try { return JSON.parse(atob(str)); } catch { return null; }
}

// Supabase returns magic-link tokens in the URL hash. The shared project state
// therefore lives in a query parameter — putting both in the hash meant the
// auth callback overwrote the shared project, and the app's own hash parsing
// collided with the token handshake. Old hash links still resolve.
function readSharedState() {
  try {
    const q = new URLSearchParams(window.location.search).get("p");
    if (q) return decodeState(q);
    const h = window.location.hash.slice(1);
    if (h && !h.includes("access_token") && !h.includes("error")) return decodeState(h);
  } catch { /* malformed link — fall through to defaults */ }
  return null;
}
function hasSharedState() { return readSharedState() != null; }

// Strip the auth fragment once Supabase has consumed it, so a refresh does not
// replay a spent token and the address bar stays clean and shareable.
function clearAuthHash() {
  if (typeof window === "undefined") return;
  const h = window.location.hash;
  if (h && (h.includes("access_token") || h.includes("error_description"))) {
    window.history.replaceState(null, "",
      window.location.pathname + window.location.search);
  }
}

// Surface anything Supabase reports back through the URL rather than failing
// silently — an expired or already-used link is the common case.
function readAuthError() {
  if (typeof window === "undefined") return null;
  const h = new URLSearchParams(window.location.hash.slice(1));
  const q = new URLSearchParams(window.location.search);
  const d = h.get("error_description") || q.get("error_description");
  return d ? decodeURIComponent(d.replace(/\+/g, " ")) : null;
}

// ─── DEFAULTS ─────────────────────────────────────────────────────────────────
const DEF = {
  mw:10, hrs:2, capex:3200, omPct:2.0,
  yrs:15, disc:8, revDecay:2.0, avail:98,
  finType:"equity", debtR:60, intR:5.5, loanT:12, taxR:20.6, inclTax:false,
  omEsc:2.5, area:"SE3", scn:"base", cpd:1.3, powerUtil:90,
  dsoFixedAnnual:25_000, dsoCons:200, dsoProd:50, dsoTrans:10, dsoGain:8,
  rte:90, landLease:0, peakTariff:0,
};



// ─── FORMATTERS ───────────────────────────────────────────────────────────────
const EUR_SEK=11.5;
const loc     =l=>l==="sv"?"sv-SE":"en-GB";
const mCur    =l=>l==="sv"?"MSEK":"MEUR";
const kCur    =l=>l==="sv"?"KSEK":"KEUR";
const toDisp  =(sek,l)=>l==="sv"?sek:sek/EUR_SEK;
const fN=(n,l,d=1)=>n==null?"—":n.toLocaleString(loc(l),{minimumFractionDigits:d,maximumFractionDigits:d});
const fM=(n,l)=>`${fN(toDisp(n,l)/1e6,l,1)} ${mCur(l)}`;
const fK=(n,l)=>`${Math.round(toDisp(n,l)/1e3).toLocaleString(loc(l))} ${kCur(l)}`;
const fP=(n,l)=>n==null?"—":`${fN(n,l,1)}%`;
const fX=(n,l)=>n==null?"—":`${fN(n,l,2)}×`;
const dispK=(ksek,l)=>l==="sv"?Math.round(ksek):Math.round(ksek/EUR_SEK);

// ─── UI ATOMS ─────────────────────────────────────────────────────────────────
function Slide({label,value,min,max,step=1,onChange,hint}){
  return(
    <div style={{padding:"10px 15px",borderBottom:"1px solid #1C2E4A"}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:5,fontFamily:"var(--ff-num)",fontSize:14,color:"#8AACCA",textTransform:"uppercase",letterSpacing:0.5}}>
        <span style={{maxWidth:"68%",lineHeight:1.4,color:"var(--tx2)"}}>{label}</span>
        <span className="num" style={{color:"var(--acc)",whiteSpace:"nowrap",fontSize:"var(--fs-lg)"}}>{typeof value==="number"?value.toLocaleString("sv-SE"):value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.target.value))}/>
      {hint&&<div style={{fontSize:14,color:"#607A96",marginTop:3,fontFamily:"var(--ff-num)",lineHeight:1.5}}>{hint}</div>}
    </div>
  );
}
function SlideSteps({label,value,values,onChange,hint,fmt}){
  const idx = (()=>{ let b=0,d=Infinity;
    values.forEach((v,i)=>{const dd=Math.abs(v-value); if(dd<d){d=dd;b=i;}}); return b; })();
  return(
    <div style={{padding:"14px 18px",borderBottom:"1px solid var(--bg3)"}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:10,marginBottom:6,fontFamily:"var(--ff-ui)",fontSize:"var(--fs-cap)",fontWeight:600,color:"var(--tx2)",textTransform:"uppercase",letterSpacing:"0.06em"}}>
        <span style={{maxWidth:"62%",lineHeight:1.4}}>{label}</span>
        <span className="num" style={{color:"var(--acc)",whiteSpace:"nowrap",fontSize:"var(--fs-lg)"}}>
          {(fmt?fmt(values[idx]):values[idx].toLocaleString("sv-SE"))}
        </span>
      </div>
      <input type="range" min={0} max={values.length-1} step={1} value={idx}
        onChange={e=>onChange(values[Number(e.target.value)])}/>
      {hint&&<div style={{fontFamily:"var(--ff-ui)",fontSize:"var(--fs-cap)",color:"var(--tx3)",marginTop:5,lineHeight:1.6}}>{hint}</div>}
    </div>
  );
}

// Connection charges span two orders of magnitude: a few thousand for a small
// site, up to seven figures for a large one. A uniform step would either make
// 5 000 unreachable or leave the useful range squeezed into the first
// percent of the track, so the resolution follows the values.
const GRID_FEE_STEPS = (() => {
  const v = [];
  for (let x = 0;       x <=   50000; x +=  1000) v.push(x);   // small sites
  for (let x = 60000;   x <= 1000000; x += 10000) v.push(x);   // mid range
  for (let x = 1050000; x <= 2000000; x += 50000) v.push(x);   // large sites
  return v;
})();

function Tog({value,options,onChange,small}){
  return(
    <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
      {options.map(o=>(
        <button key={o.value} onClick={()=>onChange(o.value)} style={{
          padding:small?"8px 12px":"10px 16px",minHeight:36,borderRadius:"var(--r)",
          background:value===o.value?"#00E076":"transparent",
          color:value===o.value?"#050D1A":"#4A6580",
          border:`1px solid ${value===o.value?"#00E076":"#1C2E4A"}`,
          fontFamily:"var(--ff-num)",fontSize:small?9:10,letterSpacing:1,textTransform:"uppercase",
          cursor:"pointer",fontWeight:value===o.value?700:400,transition:"all 0.12s",
        }}>{o.label}</button>
      ))}
    </div>
  );
}
function SHdr({label}){
  return(
    <div style={{padding:"12px 18px",borderTop:"1px solid var(--bg3)",borderBottom:"1px solid var(--bg3)",
      background:"var(--bg2)",position:"sticky",top:0,zIndex:3,boxShadow:"0 1px 0 rgba(0,224,118,0.18)"}}>
      <span style={{fontFamily:"var(--ff-num)",fontSize:14,letterSpacing:1.5,color:"var(--acc)",textTransform:"uppercase",fontWeight:600}}>▶ {label}</span>
    </div>
  );
}
function KPI({label,value,sub,color="#00E076"}){
  return(
    <div style={{padding:"13px 15px",borderRight:"1px solid #1C2E4A",borderBottom:"1px solid #1C2E4A",flex:1,minWidth:0,position:"relative"}}>
      <div style={{position:"absolute",bottom:0,left:0,right:0,height:2,background:color,opacity:0.4}}/>
      <div style={{fontFamily:"var(--ff-num)",fontSize:14,letterSpacing:1,color:"var(--tx2)",textTransform:"uppercase",marginBottom:6}}>{label}</div>
      <div style={{fontFamily:"var(--ff-num)",fontSize:32,fontWeight:700,color,lineHeight:1}}>{value}</div>
      {sub&&<div style={{fontFamily:"var(--ff-num)",fontSize:14,color:"var(--tx2)",marginTop:4}}>{sub}</div>}
    </div>
  );
}
function Panel({title,children,full}){
  return(
    <div style={{borderBottom:"1px solid var(--bg3)",padding:"22px var(--gut)",gridColumn:full?"1/-1":undefined}}>
      <div style={{fontFamily:"var(--ff-num)",fontSize:14,letterSpacing:1.5,color:"#00E076",textTransform:"uppercase",marginBottom:12}}>■ {title}</div>
      {children}
    </div>
  );
}

// ─── FIELD COMPONENT ─────────────────────────────────────────────────────────
function Field({label,error,children}){
  return(
    <div style={{marginBottom:14}}>
      <div style={{fontFamily:"var(--ff-num)",fontSize:12,color:error?"#FF4D6A":"#4A6580",
        textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>
        {label}{error&&<span style={{marginLeft:6}}>*</span>}
      </div>
      {children}
    </div>
  );
}

// ─── EXPORT MODAL ─────────────────────────────────────────────────────────────
function ExportModal({s,p,res,lang,mode,onSave,onCancel}){
  const[form,setForm]=useState({
    userName:"", company:"", email:"", phone:"",
    projectName:"", role:"", timeline:"",
  });
  const[err,setErr]=useState(false);
  const[status,setStatus]=useState("idle"); // idle|sending|sent|error
  const lc=loc(lang);

  const upd=k=>e=>setForm(f=>({...f,[k]:e.target.value}));
  const req=["userName","company","email","phone","projectName","role","timeline"];
  const valid=req.every(k=>form[k].trim());

  const handle=async()=>{
    if(!valid){setErr(true);return;}
    setStatus("sending");

    const scnMap={conservative:s.cons,base:s.base,optimistic:s.opti};
    const date=new Date().toLocaleDateString(lc);

    // Lead notification to Patrik
    await sendEmail(EJS_TMPL_LEAD,{
      from_name:   form.userName,
      company:     form.company,
      email:       form.email,
      phone:       form.phone,
      role:        form.role,
      timeline:    form.timeline,
      project_name:form.projectName,
      area:        p.area,
      mw:          `${p.mw} MW`,
      hrs:         `${p.hrs}h`,
      scenario:    scnMap[p.scn],
      grid:        `${p.powerUtil??90}% billed power`,
      capex_total: fM(res.capSEK,lang),
      equity_irr:  fP(res.eqIRR,lang),
      npv:         fM(res.NPV,lang),
      payback:     res.pb?`${res.pb} yr`:">15 yr",
      date,
      reply_to:    form.email,
    });

    // Confirmation to user
    await sendEmail(EJS_TMPL_USER,{
      to_name:     form.userName,
      company:     form.company,
      project_name:form.projectName,
      area:        p.area,
      mw:          `${p.mw} MW`,
      hrs:         `${p.hrs}h`,
      scenario:    scnMap[p.scn],
      grid:        `${p.powerUtil??90}% billed power`,
      capex_total: fM(res.capSEK,lang),
      equity_irr:  fP(res.eqIRR,lang),
      npv:         fM(res.NPV,lang),
      payback:     res.pb?`${res.pb} yr`:">15 yr",
      date,
      reply_to:    "patrik.bjorklund@greenvoltis.com",
    });

    setStatus("sent");
    setTimeout(()=>onSave(form,mode),900);
  };

  const iStyle={
    width:"100%",background:"#0A1628",color:"#C8D8E8",
    fontFamily:"var(--ff-num)",fontSize:15,padding:"8px 11px",
    outline:"none",borderRadius:2,
  };
  const selStyle={...iStyle,appearance:"none",cursor:"pointer"};

  const isErr=k=>err&&!form[k].trim();

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(5,13,26,0.94)",zIndex:2000,
      display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(6px)",
      overflowY:"auto",padding:"20px"}}>
      <div style={{background:"#080F1C",border:"1px solid #253A55",width:500,padding:"30px 34px",
        boxShadow:"0 32px 100px rgba(0,0,0,0.8)",maxWidth:"100%"}}>

        {/* Header */}
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:24}}>
          <svg width="22" height="22" viewBox="0 0 32 32">
            <polygon points="16,2 30,26 2,26" fill="none" stroke="#00E076" strokeWidth="1.5"/>
            <polygon points="16,8 25,23 7,23" fill="rgba(0,224,118,0.1)"/>
          </svg>
          <span style={{fontFamily:"var(--ff-num)",fontSize:14,letterSpacing:2,color:"#00E076",textTransform:"uppercase"}}>
            {mode==="comparison"?s.exportCmpTitle:s.exportTitle}
          </span>
        </div>

        {/* Auto-populated config hint */}
        <div style={{background:"rgba(0,224,118,0.05)",border:"1px solid rgba(0,224,118,0.15)",
          padding:"8px 12px",marginBottom:20,fontFamily:"var(--ff-num)",fontSize:12,color:"#8AACCA",lineHeight:1.8}}>
          <span style={{color:"#00E076"}}>⚙ </span>
          {lang==="sv"?"Konfiguration":"Config"}: {p.mw}MW · {p.hrs}h · {p.area} · {s[p.scn]} · {fM(res.capSEK,lang)} CAPEX · IRR {fP(res.eqIRR,lang)}
        </div>

        {/* Two-column grid for fields */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
          <Field label={s.exportUser} error={isErr("userName")}>
            <input style={{...iStyle,border:`1px solid ${isErr("userName")?"#FF4D6A":"#1C2E4A"}`}}
              placeholder={s.exportUserPh} value={form.userName} onChange={upd("userName")}/>
          </Field>
          <Field label={s.exportCompany} error={isErr("company")}>
            <input style={{...iStyle,border:`1px solid ${isErr("company")?"#FF4D6A":"#1C2E4A"}`}}
              placeholder={s.exportCompanyPh} value={form.company} onChange={upd("company")}/>
          </Field>
          <Field label={s.exportEmail} error={isErr("email")}>
            <input style={{...iStyle,border:`1px solid ${isErr("email")?"#FF4D6A":"#1C2E4A"}`}}
              placeholder={s.exportEmailPh} value={form.email} onChange={upd("email")} type="email"/>
          </Field>
          <Field label={s.exportPhone} error={isErr("phone")}>
            <input style={{...iStyle,border:`1px solid ${isErr("phone")?"#FF4D6A":"#1C2E4A"}`}}
              placeholder={s.exportPhonePh} value={form.phone} onChange={upd("phone")}/>
          </Field>
          <Field label={s.exportRole} error={isErr("role")}>
            <select style={{...selStyle,border:`1px solid ${isErr("role")?"#FF4D6A":"#1C2E4A"}`}}
              value={form.role} onChange={upd("role")}>
              <option value="">{s.exportRolePh}</option>
              {s.roleOptions.map(r=><option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label={s.exportTimeline} error={isErr("timeline")}>
            <select style={{...selStyle,border:`1px solid ${isErr("timeline")?"#FF4D6A":"#1C2E4A"}`}}
              value={form.timeline} onChange={upd("timeline")}>
              <option value="">{s.exportTimelinePh}</option>
              {s.timelineOptions.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
        </div>

        <Field label={s.exportProject} error={isErr("projectName")}>
          <input style={{...iStyle,border:`1px solid ${isErr("projectName")?"#FF4D6A":"#1C2E4A"}`}}
            placeholder={s.exportProjectPh} value={form.projectName} onChange={upd("projectName")}
            onKeyDown={e=>e.key==="Enter"&&handle()}/>
        </Field>

        {err&&!valid&&(
          <div style={{fontFamily:"var(--ff-num)",fontSize:13,color:"#FF4D6A",marginBottom:14}}>{s.exportRequired}</div>
        )}

        <div style={{display:"flex",gap:8,marginTop:4}}>
          <button onClick={handle} disabled={status==="sending"||status==="sent"} style={{
            flex:2,padding:"11px",
            background:status==="sent"?"rgba(0,224,118,0.2)":status==="sending"?"rgba(0,224,118,0.07)":"#00E076",
            border:`1px solid ${status==="sent"?"#00E076":"#00E076"}`,
            color:status==="sent"?"#00E076":status==="sending"?"#00E076":"#050D1A",
            fontFamily:"var(--ff-num)",fontSize:14,letterSpacing:1.5,
            textTransform:"uppercase",cursor:status==="sending"?"wait":"pointer",fontWeight:700,
            transition:"all 0.2s",
          }}>
            {status==="sending"?s.exportSending:status==="sent"?s.exportSent:`↓ ${s.exportSave}`}
          </button>
          <button onClick={onCancel} style={{flex:1,padding:"11px",background:"transparent",
            border:"1px solid #1C2E4A",color:"#8AACCA",fontFamily:"var(--ff-num)",fontSize:14,
            letterSpacing:1,textTransform:"uppercase",cursor:"pointer"}}>
            {s.exportCancel}
          </button>
        </div>
        {status==="error"&&<div style={{fontFamily:"var(--ff-num)",fontSize:12,color:"#F5A623",marginTop:8}}>{s.exportError}</div>}
      </div>
    </div>
  );
}

// ─── POST-EXPORT BANNER ───────────────────────────────────────────────────────
function PostExportBanner({s,form,onQuote,onDismiss,quoteSent}){
  return(
    <div style={{position:"fixed",bottom:24,right:24,zIndex:1500,
      background:"#080F1C",border:"1px solid #1C2E4A",padding:"18px 22px",
      width:320,boxShadow:"0 16px 60px rgba(0,0,0,0.7)"}}>
      <div style={{fontFamily:"var(--ff-num)",fontSize:13,letterSpacing:2,color:"#00E076",
        textTransform:"uppercase",marginBottom:8}}>■ {s.quoteTitle}</div>
      <div style={{fontFamily:"var(--ff-num)",fontSize:13,color:"#8AACCA",lineHeight:1.7,marginBottom:14}}>
        {s.quoteBody}
      </div>
      {quoteSent?(
        <div style={{fontFamily:"var(--ff-num)",fontSize:14,color:"#00E076",fontWeight:700}}>{s.quoteSent}</div>
      ):(
        <div style={{display:"flex",gap:8}}>
          <button onClick={onQuote} style={{flex:2,padding:"8px",background:"rgba(0,224,118,0.1)",
            border:"1px solid #00E076",color:"#00E076",fontFamily:"var(--ff-num)",fontSize:13,
            letterSpacing:1,textTransform:"uppercase",cursor:"pointer",fontWeight:700}}>
            {s.quoteBtn}
          </button>
          <button onClick={onDismiss} style={{flex:1,padding:"8px",background:"transparent",
            border:"1px solid #1C2E4A",color:"#8AACCA",fontFamily:"var(--ff-num)",fontSize:13,
            cursor:"pointer"}}>✕</button>
        </div>
      )}
      {quoteSent&&(
        <div style={{fontFamily:"var(--ff-num)",fontSize:12,color:"#8AACCA",marginTop:6}}>
          {s.quoteNote} {form?.email}
        </div>
      )}
    </div>
  );
}

// ─── PROJECTS PANEL ───────────────────────────────────────────────────────────
function ProjectsPanel({projects,s,lang,onClose}){
  const lc=loc(lang);
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(5,13,26,0.88)",zIndex:1999,
      display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(4px)"}}
      onClick={onClose}>
      <div style={{background:"#080F1C",border:"1px solid #1C2E4A",width:700,maxHeight:"75vh",
        display:"flex",flexDirection:"column",boxShadow:"0 24px 80px rgba(0,0,0,0.7)"}}
        onClick={e=>e.stopPropagation()}>
        <div style={{padding:"16px 22px",borderBottom:"1px solid #1C2E4A",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontFamily:"var(--ff-num)",fontSize:14,letterSpacing:2,color:"#00E076",textTransform:"uppercase"}}>■ {s.projectsTitle}</span>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#8AACCA",cursor:"pointer",fontSize:24,lineHeight:1}}>✕</button>
        </div>
        <div style={{overflowY:"auto",flex:1}}>
          {projects.length===0?(
            <div style={{padding:"40px 22px",fontFamily:"var(--ff-num)",fontSize:14,color:"#607A96",textAlign:"center"}}>{s.projectsEmpty}</div>
          ):(
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr>
                  {["#","Project","User","Company","Role","Area","MW","h","Scenario","Timeline","Date"].map(h=>(
                    <th key={h} style={{padding:"9px 12px",fontFamily:"var(--ff-num)",fontSize:11,letterSpacing:1,
                      color:"#8AACCA",textTransform:"uppercase",borderBottom:"1px solid #1C2E4A",textAlign:"left",whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projects.map((pr,i)=>(
                  <tr key={i} style={{borderBottom:"1px solid rgba(28,46,74,0.4)"}}>
                    <td style={{padding:"8px 12px",fontFamily:"var(--ff-num)",fontSize:12,color:"#8AACCA"}}>{i+1}</td>
                    <td style={{padding:"8px 12px",fontFamily:"var(--ff-num)",fontSize:12,color:"#00E076",fontWeight:700}}>{pr.projectName}</td>
                    <td style={{padding:"8px 12px",fontFamily:"var(--ff-num)",fontSize:12,color:"#C8D8E8"}}>{pr.userName}</td>
                    <td style={{padding:"8px 12px",fontFamily:"var(--ff-num)",fontSize:12,color:"#C8D8E8"}}>{pr.company}</td>
                    <td style={{padding:"8px 12px",fontFamily:"var(--ff-num)",fontSize:12,color:"#8AACCA"}}>{pr.role}</td>
                    <td style={{padding:"8px 12px",fontFamily:"var(--ff-num)",fontSize:12,color:"#F5A623"}}>{pr.area}</td>
                    <td style={{padding:"8px 12px",fontFamily:"var(--ff-num)",fontSize:12,color:"#C8D8E8"}}>{pr.mw}</td>
                    <td style={{padding:"8px 12px",fontFamily:"var(--ff-num)",fontSize:12,color:"#C8D8E8"}}>{pr.hrs}</td>
                    <td style={{padding:"8px 12px",fontFamily:"var(--ff-num)",fontSize:12,color:"#8AACCA",textTransform:"capitalize"}}>{pr.scn}</td>
                    <td style={{padding:"8px 12px",fontFamily:"var(--ff-num)",fontSize:12,color:"#8AACCA"}}>{pr.timeline}</td>
                    <td style={{padding:"8px 12px",fontFamily:"var(--ff-num)",fontSize:13,color:"#7A95AF"}}>{pr.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── PRINT REPORT ─────────────────────────────────────────────────────────────
function PrintReport({project,p,res,s,lang,printMode,activeTab,hyb,hybRes,stdScnData}){
  if(!project)return null;
  const l=lang, lc=loc(lang);
  const scnMap={conservative:s.cons,base:s.base,optimistic:s.opti};
  const isHybrid = activeTab==="hybrid" && hybRes;
  const useRes = isHybrid ? hybRes : res;
  if(!useRes)return null;
  const useRows = isHybrid ? (hybRes?.rows||[]) : (res?.rows||[]);
  const{eqIRR=null,prIRR=null,NPV=0,moic=0,pb=null,avgDSCR=null,ebitdaMgn=0,ltv=0,capSEK=0,eq=0,dbt=0,rows=[]}=res||{};
  const hybIRR = hybRes?.irr, hybNPV = hybRes?.npv, hybPb = hybRes?.pb;
  const printIRR = isHybrid ? hybIRR : eqIRR;
  const printNPV = isHybrid ? hybNPV : NPV;
  const printPb  = isHybrid ? hybPb : pb;
  const printRows = isHybrid ? hybRes.rows : rows;
  const curr=l==="sv"?"KSEK":"KEUR";
  const isComparison=printMode==="comparison";
  const scns=["conservative","base","optimistic"];

  const kpis=[
    [s.kIRR,fP(printIRR,l),printIRR>=12?"#00E076":printIRR>=8?"#F5A623":"#FF4D6A"],
    [isHybrid?"Hybrid IRR":"Project IRR",isHybrid?fP(hybIRR,l):fP(prIRR,l),"#C8D8E8"],
    [s.kNPV,fM(printNPV,l),printNPV>=0?"#00E076":"#FF4D6A"],
    [s.kPBK,printPb?`${printPb} ${s.pbYr}`:`>${p.yrs} ${s.pbYr}`,"#F5A623"],
    [s.kMOIC,fX(moic,l),"#00E076"],
    [s.kEBITDAM,fP(ebitdaMgn,l),"#4D9FFF"],
    [s.kDSCR,avgDSCR!=null?fN(avgDSCR,l,2):"N/A",avgDSCR>=1.3?"#00E076":avgDSCR>=1.1?"#F5A623":"#FF4D6A"],
    [s.kLTV,fP(ltv,l),"#A06FD8"],
    [s.kCAP,fM(capSEK,l),"#A06FD8"],
    [s.eqCap,fM(eq,l),"#C8D8E8"],
  ];
  const configs=[
    [isHybrid?"BESS":"System",`${p.mw} MW / ${p.hrs}h`],["Area",p.area],
    ["Scenario",isHybrid?scnMap[hyb?.hybScn||p.scn]:scnMap[p.scn]],["CAPEX",`${p.capex} SEK/kWh`],
    ["Billed power",`${p.powerUtil??90}%`],["Financing",p.finType],
    ["CPD",p.cpd],["Avail.",`${p.avail??98}%`],["RTE",`${p.rte}%`],["Decay",`${p.revDecay}%/yr`],
    ...(isHybrid?[
      ["Type",hyb?.renType==="solar"?"Solar + BESS":"Wind + BESS"],
      ["Renewable",`${hyb?.renMW} MW`],
      ["Curtailment",`${hyb?.curtPct||0}%`],
      ["Price spread",`${Math.max(0,(hyb?.shiftPrice||0)-(hyb?.curtPrice||0))} SEK/MWh`],
      ["BESS optim. share",`${Math.round((hybRes?.ancFrac||0)*100)}%`],
      ["Curtailment recovered",`${Math.round((hybRes?.recoveryFrac||0)*100)}%`],
    ]:[]),
  ];

  // Bar chart rendered as SVG (no recharts in print context)
  const maxRev=Math.max(...printRows.map(r=>r.mmo||0));
  const maxCCF=Math.max(...printRows.map(r=>Math.abs(r.ccf)));
  const chartW=580, chartH=130, barW=Math.floor(chartW/15)-3;

  const RevenueChart=()=>(
    <svg width={chartW} height={chartH} style={{overflow:"visible"}}>
      {printRows.map((r,i)=>{
        const ancH=Math.round(((r.mmo||0)/(maxRev||1))*chartH*0.85);
        const trdH=0;
        const x=i*(barW+3);
        return(
          <g key={i}>
            <rect x={x} y={chartH-ancH-trdH} width={barW} height={ancH} fill="#4D9FFF" opacity={0.9}/>
            <rect x={x} y={chartH-trdH} width={barW} height={trdH} fill="#00E076" opacity={0.9}/>
            <text x={x+barW/2} y={chartH+10} textAnchor="middle" fontSize={7} fill="#4A6580" fontFamily="monospace">{r.year}</text>
          </g>
        );
      })}
    </svg>
  );

  const CCFChart=()=>{
    const zeroY=chartH*0.5;
    const pts=printRows.map((r,i)=>{
      const x=i*(chartW/14);
      const y=chartH/2-(r.ccf/(maxCCF||1))*(chartH*0.42);
      return `${x},${y}`;
    }).join(" ");
    return(
      <svg width={chartW} height={chartH} style={{overflow:"visible"}}>
        <line x1={0} y1={chartH/2} x2={chartW} y2={chartH/2} stroke="#FF4D6A" strokeWidth={0.8} strokeDasharray="4,3"/>
        {pb&&<line x1={(pb-1)*(chartW/14)} y1={0} x2={(pb-1)*(chartW/14)} y2={chartH}
          stroke="#F5A623" strokeWidth={0.8} strokeDasharray="4,3"/>}
        <polyline points={pts} fill="none" stroke="#00E076" strokeWidth={2}/>
        {printRows.map((r,i)=>{
          const x=i*(chartW/14);
          return <text key={i} x={x} y={chartH+10} textAnchor="middle" fontSize={7} fill="#4A6580" fontFamily="monospace">{r.year}</text>;
        })}
      </svg>
    );
  };

  return(
    <div className="print-report" style={{width:"100%",boxSizing:"border-box"}}>
      {/* HEADER ROW */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
        borderBottom:"2px solid #00E076",paddingBottom:10,marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <svg width="30" height="30" viewBox="0 0 32 32">
            <polygon points="16,2 30,26 2,26" fill="none" stroke="#00E076" strokeWidth="1.5"/>
            <polygon points="16,8 25,23 7,23" fill="rgba(0,224,118,0.12)"/>
            <line x1="16" y1="8" x2="16" y2="23" stroke="#00E076" strokeWidth="1.2"/>
          </svg>
          <div>
            <div style={{fontFamily:"monospace",fontSize:16,fontWeight:800,color:"#E8F4FF",letterSpacing:1}}>GreenVoltis</div>
            <div style={{fontFamily:"monospace",fontSize:7,color:"#8AACCA",letterSpacing:1.5}}>{isHybrid?s.hybSub:s.appSub}</div>
          </div>
        </div>
        <div style={{fontFamily:"monospace",fontSize:16,fontWeight:700,color:"#00E076",flex:1,textAlign:"center"}}>{project.projectName}</div>
        <div style={{textAlign:"right",fontFamily:"monospace",fontSize:8}}>
          <div style={{color:"#8AACCA"}}>{project.date}</div>
          <div style={{color:"#C8D8E8",marginTop:2}}>{project.userName} · {project.company}</div>
          <div style={{color:"#00E076",marginTop:2}}>{project.role} · {project.timeline}</div>
        </div>
      </div>

      {/* MAIN BODY: 3 columns */}
      <div style={{display:"grid",gridTemplateColumns:"230px 1fr",gap:20,marginBottom:16,alignItems:"start"}}>

        {/* COL 1: Config + KPIs */}
        <div>
          <div style={{fontFamily:"monospace",fontSize:8,letterSpacing:1.5,color:"#00E076",textTransform:"uppercase",marginBottom:6}}>■ {s.printConfig}</div>
          <table style={{width:"100%",borderCollapse:"collapse",marginBottom:12}}>
            <tbody>
              {configs.map(([k,v])=>(
                <tr key={k}>
                  <td style={{padding:"2px 6px 2px 0",fontFamily:"monospace",fontSize:8,color:"#8AACCA",borderBottom:"1px solid rgba(28,46,74,0.25)"}}>{k}</td>
                  <td style={{padding:"2px 0",fontFamily:"monospace",fontSize:8,color:"#C8D8E8",borderBottom:"1px solid rgba(28,46,74,0.25)",fontWeight:600,textAlign:"right"}}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{fontFamily:"monospace",fontSize:8,letterSpacing:1.5,color:"#00E076",textTransform:"uppercase",marginBottom:6}}>■ {s.printFinancials}</div>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <tbody>
              {kpis.map(([k,v,c])=>(
                <tr key={k}>
                  <td style={{padding:"2px 4px 2px 0",fontFamily:"monospace",fontSize:8,color:"#8AACCA",borderBottom:"1px solid rgba(28,46,74,0.25)"}}>{k}</td>
                  <td style={{padding:"2px 0",fontFamily:"monospace",fontSize:9,color:c||"#00E076",borderBottom:"1px solid rgba(28,46,74,0.25)",fontWeight:700,textAlign:"right"}}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* COL 3: all four charts, two up */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <div>
          <div style={{fontFamily:"monospace",fontSize:8,letterSpacing:1.5,color:"#00E076",textTransform:"uppercase",marginBottom:8}}>■ {s.cRev}</div>
          <div style={{marginBottom:4,display:"flex",gap:12}}>
            <span style={{fontFamily:"monospace",fontSize:7,color:"#4D9FFF"}}>■ {s.mmoLeg}</span>
          </div>
          <RevenueChart/>
          <div style={{fontFamily:"monospace",fontSize:8,letterSpacing:1.5,color:"#00E076",textTransform:"uppercase",marginTop:18,marginBottom:8}}>■ {s.cScn}</div>
          <svg width={580} height={chartH} style={{overflow:"visible"}}>
            {["conservative","base","optimistic"].map((sc,si)=>{
              const scnRows=(stdScnData||{})[sc]||[];
              const d=scnRows;
              const maxV=Math.max(...(d.length?d.map(r=>r.rev-r.brp):[1]));
              const cols=["#4D9FFF","#00E076","#F5A623"];
              const pts=d.map((r,i)=>{
                const v=r.rev-r.brp;
                const x=i*(chartW/14);
                const y=chartH-(v/(maxV||1))*chartH*0.85;
                return `${x},${y}`;
              }).join(" ");
              return <polyline key={sc} points={pts} fill="none" stroke={cols[si]}
                strokeWidth={sc===p.scn?2:1} strokeDasharray={sc===p.scn?"0":"5,3"}/>;
            })}
            {printRows.map((_,i)=>(
              <text key={i} x={i*(chartW/14)} y={chartH+10} textAnchor="middle" fontSize={7} fill="#4A6580" fontFamily="monospace">{i+1}</text>
            ))}
          </svg>
        </div>

          <div>
          <div style={{fontFamily:"monospace",fontSize:8,letterSpacing:1.5,color:"#00E076",textTransform:"uppercase",marginBottom:8}}>■ {s.cCF}</div>
          <CCFChart/>
          <div style={{fontFamily:"monospace",fontSize:8,letterSpacing:1.5,color:"#00E076",textTransform:"uppercase",marginTop:18,marginBottom:8}}>■ {s.cEB}</div>
          <svg width={580} height={chartH} style={{overflow:"visible"}}>
            {(()=>{
              const maxE=Math.max(...printRows.map(r=>Math.abs(r.ebi)));
              return printRows.map((r,i)=>{
                const ebiH=Math.round((Math.abs(r.ebi)/(maxE||1))*chartH*0.75);
                const x=i*(barW+3);
                return(
                  <g key={i}>
                    <rect x={x} y={chartH-ebiH} width={barW} height={ebiH} fill="#4D9FFF" opacity={0.6}/>
                    <text x={x+barW/2} y={chartH+10} textAnchor="middle" fontSize={7} fill="#4A6580" fontFamily="monospace">{r.year}</text>
                  </g>
                );
              });
            })()}
          </svg>
          </div>
        </div>
      </div>
      <div style={{fontFamily:"monospace",fontSize:8,letterSpacing:1.5,color:"#00E076",textTransform:"uppercase",marginBottom:6}}>■ {isHybrid?s.hybTitle:s.tTitle}</div>
      <table style={{width:"100%",borderCollapse:"collapse"}}>
        <thead>
          <tr style={{background:"rgba(0,224,118,0.06)"}}>
            {(isHybrid
              ?[s.cYr,s.cMmo,lang==="sv"?"Obalans":"Imbalance",lang==="sv"?"Prisförfl.":"Shifting",...(hyb?.downEnabled!==false?[lang==="sv"?"Nedreg":"Down-reg"]:[]),s.cRvT,s.cBRP,s.cOM,s.cDSO,s.cEBI,s.cNCF,s.cCCF,s.cDEG]
              :[s.cYr,s.cMmo,s.cRvT,s.cBRP,s.cOM,(lang==="sv"?"Arrende":"Land Lease"),s.cDSO,s.cEBI,s.cNCF,s.cCCF,s.cDEG]
            ).map(h=>(
              <th key={h} style={{padding:"4px 6px",fontFamily:"monospace",fontSize:7,color:"#8AACCA",
                textTransform:"uppercase",borderBottom:"1px solid #1C2E4A",
                textAlign:h===s.cYr?"left":"right",whiteSpace:"nowrap"}}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {printRows.map(r=>(
            <tr key={r.year} style={{borderBottom:"1px solid rgba(28,46,74,0.2)"}}>
              <td style={{padding:"3px 6px",fontFamily:"monospace",fontSize:8,color:"#F5A623",textAlign:"left"}}>{r.year}</td>
              {(isHybrid
                ?[r.mmo||0,r.imbal||0,r.capt||0,...(hyb?.downEnabled!==false?[r.down||0]:[]),r.rev,r.brp,r.om,r.dso,r.ebi,r.ncf,r.ccf]
                :[r.mmo||0,r.rev,r.brp,r.om,r.ll||0,r.dso,r.ebi,r.ncf,r.ccf]
              ).map((v,i)=>{
                const dv=dispK(v,l);
                const dOn=isHybrid&&hyb?.downEnabled!==false;
                const negStart=isHybrid?(dOn?5:4):2, negEnd=isHybrid?(dOn?7:6):5;
                const isNeg=i>=negStart&&i<=negEnd;
                let color="#C8D8E8";
                if(i>negEnd)color=v>=0?"#00E076":"#FF4D6A";
                if(isNeg)color="#FF4D6A";
                if(isHybrid&&(i===1))color="#A06FD8"; // imbalance
                if(isHybrid&&(i===2))color="#FF6B6B"; // capture
                if(dOn&&(i===3))color="#F5A623"; // down-regulation
                return(
                  <td key={i} style={{padding:"3px 6px",fontFamily:"monospace",fontSize:8,color,textAlign:"right"}}>
                    {isNeg?`(${Math.abs(dv).toLocaleString(lc)})`:dv.toLocaleString(lc)}
                  </td>
                );
              })}
              <td style={{padding:"3px 6px",fontFamily:"monospace",fontSize:8,color:"#8AACCA",textAlign:"right"}}>{r.dg}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* FOOTER */}
      <div style={{marginTop:14,paddingTop:8,borderTop:"1px solid #1C2E4A",
        display:"flex",justifyContent:"space-between",fontFamily:"monospace",fontSize:7,color:"#607A96"}}>
        <span>{s.footer}</span>
        <span>{curr} · {scnMap[p.scn]} · {p.area} · {project.date}</span>
      </div>
    </div>
  );
}

// ─── HELP MODAL ──────────────────────────────────────────────────────────────
function HelpModal({s,onClose}){
  const[active,setActive]=useState(0);
  const sec=s.helpSections[active];
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(5,13,26,0.92)",zIndex:2200,
      display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(8px)"}}
      onClick={onClose}>
      <div style={{background:"#080F1C",border:"1px solid #1C2E4A",width:700,maxHeight:"88vh",
        display:"flex",flexDirection:"column",boxShadow:"0 32px 100px rgba(0,0,0,0.85)"}}
        onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div style={{padding:"18px 24px",borderBottom:"1px solid #1C2E4A",
          display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:28,height:28,borderRadius:"50%",background:"rgba(0,224,118,0.12)",
              border:"1px solid #00E076",display:"flex",alignItems:"center",justifyContent:"center",
              fontFamily:"var(--ff-num)",fontSize:18,color:"#00E076",fontWeight:700}}>?</div>
            <span style={{fontFamily:"var(--ff-num)",fontSize:14,letterSpacing:2,color:"#00E076",textTransform:"uppercase"}}>
              {s.helpTitle}
            </span>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",
            color:"#8AACCA",cursor:"pointer",fontSize:26,lineHeight:1,padding:"0 4px"}}>✕</button>
        </div>
        <div style={{display:"flex",flex:1,overflow:"hidden",minHeight:0}}>
          {/* Left nav */}
          <div style={{width:195,borderRight:"1px solid #1C2E4A",overflowY:"auto",flexShrink:0,padding:"8px 0"}}>
            {s.helpSections.map((sec,i)=>(
              <button key={i} onClick={()=>setActive(i)} style={{
                width:"100%",padding:"11px 16px",background:active===i?"rgba(0,224,118,0.08)":"transparent",
                border:"none",borderLeft:`2px solid ${active===i?"#00E076":"transparent"}`,
                color:active===i?"#00E076":"#8AACCA",fontFamily:"var(--ff-num)",fontSize:14,
                textAlign:"left",cursor:"pointer",display:"flex",alignItems:"center",gap:9,
                letterSpacing:0.3,lineHeight:1.4,
              }}>
                <span style={{fontSize:18,flexShrink:0}}>{sec.icon}</span>
                <span>{sec.title}</span>
              </button>
            ))}
          </div>
          {/* Right content */}
          <div style={{flex:1,overflowY:"auto",padding:"28px 32px",minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
              <div style={{width:38,height:38,borderRadius:"50%",flexShrink:0,
                background:"rgba(0,224,118,0.08)",border:"1px solid rgba(0,224,118,0.3)",
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>
                {sec.icon}
              </div>
              <div style={{fontFamily:"var(--ff-num)",fontSize:16,fontWeight:700,color:"#E8F4FF",letterSpacing:0.5}}>
                {sec.title}
              </div>
            </div>
            <div style={{fontFamily:"var(--ff-num)",fontSize:15,color:"#C8D8E8",lineHeight:1.9,
              borderLeft:"2px solid rgba(0,224,118,0.2)",paddingLeft:16}}>
              {sec.text}
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:32}}>
              <button onClick={()=>setActive(i=>Math.max(0,i-1))} disabled={active===0}
                style={{padding:"7px 18px",background:"transparent",
                  border:"1px solid #1C2E4A",color:active===0?"#253A55":"#8AACCA",
                  fontFamily:"var(--ff-num)",fontSize:14,letterSpacing:1,textTransform:"uppercase",
                  cursor:active===0?"default":"pointer"}}>← Prev</button>
              <span style={{fontFamily:"var(--ff-num)",fontSize:13,color:"#4A6580"}}>
                {active+1} / {s.helpSections.length}
              </span>
              {active<s.helpSections.length-1?(
                <button onClick={()=>setActive(i=>Math.min(s.helpSections.length-1,i+1))}
                  style={{padding:"7px 18px",background:"rgba(0,224,118,0.08)",
                    border:"1px solid #00E076",color:"#00E076",
                    fontFamily:"var(--ff-num)",fontSize:14,letterSpacing:1,textTransform:"uppercase",cursor:"pointer"}}>
                  Next →</button>
              ):(
                <button onClick={onClose}
                  style={{padding:"7px 18px",background:"rgba(0,224,118,0.15)",
                    border:"1px solid #00E076",color:"#00E076",fontWeight:700,
                    fontFamily:"var(--ff-num)",fontSize:14,letterSpacing:1,textTransform:"uppercase",cursor:"pointer"}}>
                  ✓ {s.helpClose}</button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── OPEX PANEL ───────────────────────────────────────────────────────────────
function OpexPanel({ob,s,lang}){
  const lc=loc(lang);
  const rows=[
    {label:s.opexOM,      val:ob.om,       isPos:false,color:"#C8D8E8"},
    {label:s.opexLandLease||"Land Lease",val:ob.landLease||0,isPos:false,color:"#C8D8E8",hide:!(ob.landLease>0)},
    {label:s.opexDsoFixed,val:ob.dsoFixed,  isPos:false,color:"#C8D8E8"},
    {label:s.opexDsoCons, val:ob.dsoCons,   isPos:false,color:"#C8D8E8"},
    {label:s.opexPeakTariff||"Peak Tariff",val:ob.peakTariff||0,isPos:false,color:"#C8D8E8",hide:!(ob.peakTariff>0)},
    {label:s.opexDsoProd, val:ob.dsoProd,   isPos:false,color:"#C8D8E8"},
    {label:s.opexDsoTrans,val:ob.dsoTrans,  isPos:false,color:"#C8D8E8"},
    {label:s.opexDsoGain, val:-ob.dsoGain,  isPos:true, color:"#00E076"},
    {label:s.opexBRP,     val:ob.brp,       isPos:false,color:"#A06FD8"},
  ];
  const maxVal=Math.max(...rows.map(r=>Math.abs(r.val)));
  return(
    <div style={{padding:"16px 22px",borderBottom:"1px solid #1C2E4A",background:"#060D1A"}}>
      <div style={{fontFamily:"var(--ff-num)",fontSize:14,letterSpacing:1.5,color:"#00E076",textTransform:"uppercase",marginBottom:14}}>
        ■ {s.opexPanel} — {s.opexUnit}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:6}}>
        {rows.filter(r=>!r.hide).map((r,i)=>{
          const kval=Math.round((lang==="sv"?r.val:r.val/EUR_SEK)/1000);
          const barW=maxVal>0?Math.abs(r.val)/maxVal*100:0;
          return(
            <div key={i} style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{fontFamily:"var(--ff-num)",fontSize:14,color:"#8AACCA",width:170,flexShrink:0}}>{r.label}</div>
              <div style={{flex:1,height:16,background:"#0A1628",position:"relative",borderRadius:2}}>
                <div style={{position:"absolute",left:0,top:0,height:"100%",width:`${barW}%`,
                  background:r.isPos?"rgba(0,224,118,0.35)":"rgba(255,77,106,0.25)",borderRadius:2}}/>
              </div>
              <div style={{fontFamily:"var(--ff-num)",fontSize:14,fontWeight:r.bold?700:400,
                color:r.isPos?"#00E076":r.color,width:80,textAlign:"right"}}>
                {r.isPos?"+":""}{kval.toLocaleString(lc)}
              </div>
            </div>
          );
        })}
        <div style={{display:"flex",alignItems:"center",gap:10,borderTop:"1px solid #1C2E4A",paddingTop:8,marginTop:4,gridColumn:"1/-1"}}>
          <div style={{fontFamily:"var(--ff-num)",fontSize:13,color:"#F5A623",fontWeight:700,width:160}}>{s.opexTotal}</div>
          <div style={{flex:1}}/>
          <div style={{fontFamily:"var(--ff-num)",fontSize:16,fontWeight:700,color:"#FF4D6A",width:80,textAlign:"right"}}>
            {Math.round((lang==="sv"?ob.total:ob.total/EUR_SEK)/1000).toLocaleString(lc)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── KPI SUMMARY ──────────────────────────────────────────────────────────────
function FinSummary({res,p,s,lang,mode}){
  const [showAll,setShowAll] = useState(false);
  if(!res)return null;
  const{eqIRR,prIRR,NPV,moic,pb,avgDSCR,ebitdaMgn,ltv,pi,capSEK,eq,dbt}=res;
  const l=lang, sv=lang==="sv";
  // Colour is reserved for judgement, not decoration
  const iC = eqIRR==null?"var(--tx3)":eqIRR>=12?"var(--acc)":eqIRR>=8?"var(--warn)":"var(--err)";
  const nC = NPV>=0?"var(--acc)":"var(--err)";
  const dC = avgDSCR==null?"var(--tx3)":avgDSCR>=1.3?"var(--acc)":avgDSCR>=1.1?"var(--warn)":"var(--err)";
  const verdict = eqIRR==null ? "" : eqIRR>=12
    ? (sv?"Stark avkastning":"Strong return")
    : eqIRR>=8 ? (sv?"Marginell avkastning":"Marginal return")
               : (sv?"Svag avkastning":"Weak return");

  const secondary=[
    [s.kNPV,   fM(NPV,l),  `${s.dNote} ${p.disc}%`, nC],
    [s.kPBK,   pb?`${pb} ${s.pbYr}`:`${s.pbOvr}${p.yrs} ${s.pbYr}`, s.eBasis, "var(--tx0)"],
    [s.kCAP,   fM(capSEK,l), `${s.eqCap}: ${fM(eq,l)}`, "var(--tx0)"],
  ];
  const detail=[
    [s.kMOIC,    fX(moic,l), s.moicSub],
    [s.kPI,      pi!=null?fX(pi,l):"—", s.piSub],
    [s.kEBITDAM, fP(ebitdaMgn,l), sv?"År 1":"Yr 1"],
    [s.kDSCR,    avgDSCR!=null?fN(avgDSCR,l,2):"N/A", sv?"Skuldsvc-täckning":"Debt svc coverage", dC],
    [s.kLTV,     fP(ltv,l), `${fM(dbt,l)} ${sv?"skuld":"debt"}`],
    ["Project IRR", fP(prIRR,l), sv?"på totalt kapital":"on total capital"],
  ];

  return(
    <div style={{padding:"28px var(--gut) 20px"}}>
      <div className="fin-hero" style={{display:"grid",gridTemplateColumns:"minmax(240px,340px) 1fr",gap:32,alignItems:"center"}}>
        {/* One number carries the answer */}
        <div>
          <div style={{fontFamily:"var(--ff-ui)",fontSize:"var(--fs-cap)",fontWeight:600,letterSpacing:"0.08em",
            textTransform:"uppercase",color:"var(--tx2)",marginBottom:6}}>{s.kIRR}</div>
          <div className="num" style={{fontSize:"var(--fs-hero)",fontWeight:500,color:iC,lineHeight:1}}>
            {fP(eqIRR,l)}
          </div>
          {verdict&&<div style={{fontFamily:"var(--ff-ui)",fontSize:"var(--fs-body)",color:iC,marginTop:8,fontWeight:500}}>{verdict}</div>}
        </div>
        {/* Three numbers carry the context */}
        <div className="fin-sec" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"var(--gut)"}}>
          {secondary.map(([lab,val,sub,col])=>(
            <div key={lab} style={{borderLeft:"2px solid var(--bg3)",paddingLeft:16}}>
              <div style={{fontFamily:"var(--ff-ui)",fontSize:"var(--fs-cap)",fontWeight:600,letterSpacing:"0.06em",
                textTransform:"uppercase",color:"var(--tx2)",marginBottom:6}}>{lab}</div>
              <div className="num" style={{fontSize:"var(--fs-metric)",color:col,lineHeight:1.1}}>{val}</div>
              <div style={{fontFamily:"var(--ff-ui)",fontSize:"var(--fs-cap)",color:"var(--tx3)",marginTop:6}}>{sub}</div>
            </div>
          ))}
        </div>
      </div>

      <button onClick={()=>setShowAll(v=>!v)} style={{marginTop:20,padding:"9px 16px",background:"transparent",
        border:"1px solid var(--bg3)",borderRadius:"var(--r)",color:"var(--tx2)",fontFamily:"var(--ff-ui)",
        fontSize:"var(--fs-cap)",fontWeight:600,letterSpacing:"0.04em",cursor:"pointer"}}>
        {showAll ? (sv?"Dölj fler nyckeltal":"Hide more metrics") : (sv?"Fler nyckeltal":"More metrics")}
      </button>

      {showAll&&(
        <div className="fin-detail" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",
          gap:"var(--gut)",marginTop:20,paddingTop:20,borderTop:"1px solid var(--bg3)"}}>
          {detail.map(([lab,val,sub,col])=>(
            <div key={lab}>
              <div style={{fontFamily:"var(--ff-ui)",fontSize:"var(--fs-cap)",fontWeight:600,letterSpacing:"0.06em",
                textTransform:"uppercase",color:"var(--tx2)",marginBottom:5}}>{lab}</div>
              <div className="num" style={{fontSize:"var(--fs-sec)",color:col||"var(--tx0)"}}>{val}</div>
              <div style={{fontFamily:"var(--ff-ui)",fontSize:"var(--fs-cap)",color:"var(--tx3)",marginTop:4}}>{sub}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── CHART TOOLTIP ────────────────────────────────────────────────────────────
const ChTip=({active,payload,label,lang})=>{
  if(!active||!payload?.length)return null;
  return(
    <div style={{background:"#0A1628",border:"1px solid #1C2E4A",padding:"10px 14px",fontFamily:"var(--ff-num)",fontSize:15}}>
      <div style={{color:"#8AACCA",marginBottom:6,fontSize:14}}>{lang==="sv"?"År":"Year"} {label}</div>
      {payload.map((p,i)=>(
        <div key={i} style={{color:p.color,marginBottom:2}}>
          {p.name}: {typeof p.value==="number"?dispK(p.value,lang).toLocaleString(loc(lang)):p.value} {lang==="sv"?"KSEK":"KEUR"}
        </div>
      ))}
    </div>
  );
};

// ─── APP ──────────────────────────────────────────────────────────────────────

// ─── HYBRID ENGINE ────────────────────────────────────────────────────────────
const HYB_DEF = {
  renType:"wind", renMW:50, gridMW:50,
  imbal:70,              // Plant's current imbalance cost, SEK/MWh produced
  downEnabled:false,     // Opt-in: only counts if GreenVoltis brings the service
  downPart:40,           // Committable share after block bidding and bid acceptance
  curtPct:5,             // % of annual production currently curtailed
  curtPrice:150,         // Avg sell price during curtailment hours (SEK/MWh) - often low/negative
  shiftPrice:850,        // Expected sell price after BESS time-shift (SEK/MWh) - evening peak
  hybScn:"base",         // Hybrid scenario
};

// Fraction of standalone ancillary+trading revenue retained in hybrid
// Based on time-analysis: BESS is occupied charging+discharging during production hours
// Sol: 2h=4h/10h×20%=8% occupied → 92% free. 3h→88%. 4h→84%.
// Vind: 2h=15% occupied → 85% free. 3h→81%. 4h→77%.








// ─── REVENUE INTELLIGENCE PANEL ──────────────────────────────────────────────
// Historical evidence, deliberately separated from the forward projection.
function RiPanel({ ri, area, lang, onClose }) {
  if (!ri) return null;
  const sv = lang === "sv";
  const z  = ri.zones?.[area];
  const lc = loc(lang);
  const MK = [
    "Day-Ahead", "Intraday", "FCR-N", "FCR-D", "mFRR CM", "mFRR EAM",
  ];
  const STEPS = sv ? [
    ["Prognos & marknadsscan", "Aether väger pris-, frekvens-, väder- och systemdata till en probabilistisk prismodell per budzon."],
    ["Opportunity-cost-allokering", "Kapacitetsersättning på mFRR CM ställs mot förväntad aktiveringsintäkt, DA-spread och ID-volatilitet."],
    ["Cross-market stacking", "När batteriet aktiveras i mFRR Ned säljs den förvärvade energin simultant på Intraday."],
    ["Re-optimering var 15:e minut", "Allokeringen räknas om löpande under leveransdygnet mot faktiska priser och SoC."],
  ] : [
    ["Forecast & market scan", "Aether combines price, frequency, weather and system data into a probabilistic price model per bidding zone."],
    ["Opportunity-cost allocation", "mFRR CM capacity payments are weighed against expected activation revenue, DA spread and ID volatility."],
    ["Cross-market stacking", "When the battery activates in mFRR Down, the acquired energy is sold simultaneously on Intraday."],
    ["Re-optimisation every 15 min", "Allocation is recomputed continuously through the delivery day against actual prices and SoC."],
  ];
  const MN = sv ? ["jan","feb","mar","apr","maj","jun","jul","aug","sep","okt","nov","dec"]
                : ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const label = ym => {
    const [y,m] = String(ym).split("-");
    return m ? MN[parseInt(m,10)-1] : ym;
  };
  const period = (z?.months?.length)
    ? `${label(z.months[0])}–${label(z.months[z.months.length-1])} ${String(z.months[0]).slice(0,4)}`
    : "";
  const maxM = Math.max(...(z?.monthly || [1]));

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(5,13,26,0.94)",zIndex:2600,
      display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(8px)",padding:20}}
      onClick={onClose}>
      <div style={{background:"var(--bg1)",border:"1px solid var(--bg3)",width:720,maxWidth:"100%",
        maxHeight:"88vh",overflowY:"auto",padding:"32px 36px",boxShadow:"0 32px 100px rgba(0,0,0,0.9)"}}
        onClick={e=>e.stopPropagation()}>

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
          <div>
            <div style={{fontFamily:"var(--ff-num)",fontSize:18,fontWeight:700,color:"var(--tx0)",letterSpacing:0.5}}>
              {sv ? "Revenue Intelligence — digital tvilling" : "Revenue Intelligence — digital twin"}
            </div>
            <div style={{fontFamily:"var(--ff-num)",fontSize:13,color:"var(--acc)",letterSpacing:1.5,textTransform:"uppercase",marginTop:4}}>
              {sv ? "GreenVoltis Multi-Market Optimization" : "GreenVoltis Multi-Market Optimization"}
            </div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"1px solid var(--bg3)",color:"var(--tx2)",
            cursor:"pointer",fontSize:16,padding:"5px 11px",fontFamily:"var(--ff-num)"}}>X</button>
        </div>

        <div style={{fontFamily:"var(--ff-num)",fontSize:14,color:"var(--tx1)",lineHeight:1.9,marginBottom:20}}>
          {sv
            ? "Varje strategi körs mot faktisk historisk marknadsdata i en digital tvilling innan den går live. Siffrorna nedan är utfallet av GreenVoltis Multi-Market Optimization i den tvillingen, jämfört med sju konventionella alternativ i varje elområde och månad. Strategin handlar sex marknader simultant och omallokerar kapacitet var 15:e minut. Den är i skarp drift sedan april 2026."
            : "Every strategy is run against actual historical market data in a digital twin before going live. The figures below are the outcome of GreenVoltis Multi-Market Optimization in that twin, benchmarked against seven conventional alternatives in every bidding zone and month. The strategy trades six markets simultaneously and re-allocates capacity every 15 minutes. It has been in live operation since April 2026."}
        </div>

        <div style={{fontFamily:"var(--ff-num)",fontSize:12,color:"var(--tx3)",marginBottom:20}}>
          {sv ? "Källa" : "Source"}: GreenVoltis BESS Revenue Intelligence{period ? ` · ${period}` : ""}
          {" · "}{sv ? "underliggande marknadsdata" : "underlying market data"}: Svenska kraftnät, ENTSO-E, Nord Pool
          {" · "}{ri.live
            ? (sv ? "live-feed" : "live feed")
            : (sv ? "senast publicerade" : "last published")}
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12,marginBottom:22}}>
          {[
            [sv?"Vunna jämförelser":"Benchmarks won", "28/28", "var(--acc)"],
            [sv?"Över bästa alternativ":"Above best alternative", "+58%", "var(--acc)"],
            [sv?"Marknader samtidigt":"Markets in parallel", "6", "var(--info)"],
            [sv?"Omallokering":"Re-allocation", sv?"var 15:e min":"every 15 min", "var(--info)"],
          ].map(([lbl,val,col])=>(
            <div key={lbl} style={{padding:"12px 14px",border:"1px solid var(--bg3)",borderRadius:"var(--r)"}}>
              <div style={{fontFamily:"var(--ff-ui)",fontSize:"var(--fs-cap)",fontWeight:600,letterSpacing:"0.05em",
                textTransform:"uppercase",color:"var(--tx3)",marginBottom:5}}>{lbl}</div>
              <div className="num" style={{fontSize:"var(--fs-sec)",color:col}}>{val}</div>
            </div>
          ))}
        </div>

        {/* Markets */}
        <div style={{fontFamily:"var(--ff-num)",fontSize:12,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:1.5,marginBottom:8}}>
          {sv ? "Marknader som handlas simultant" : "Markets traded simultaneously"}
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:22}}>
          {MK.map(m=>(
            <span key={m} style={{fontFamily:"var(--ff-num)",fontSize:13,padding:"4px 10px",
              background:"rgba(0,224,118,0.08)",border:"1px solid rgba(0,224,118,0.3)",color:"var(--acc)"}}>{m}</span>
          ))}
        </div>

        {/* Monthly realised revenue for the selected zone */}
        <div style={{fontFamily:"var(--ff-num)",fontSize:12,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:1.5,marginBottom:10}}>
          {sv ? `Utfall ${area} — EUR/MW/månad, 1 MW / 2 MWh` : `Outcome ${area} — EUR/MW/month, 1 MW / 2 MWh`}
        </div>
        <div style={{display:"flex",alignItems:"flex-end",gap:6,height:96,marginBottom:6}}>
          {(z?.months||[]).map((m,i)=>{
            const v = z.monthly[i];
            const h = Math.max(4, Math.round((v/(maxM||1))*88));
            return (
              <div key={m} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                <div style={{fontFamily:"var(--ff-num)",fontSize:12,color:"var(--tx2)"}}>{Math.round(v/1000)}k</div>
                <div style={{width:"100%",height:h,background:"rgba(77,159,255,0.55)",borderTop:"2px solid #4D9FFF"}}/>
              </div>
            );
          })}
        </div>
        <div style={{display:"flex",gap:6,marginBottom:20}}>
          {(z?.months||[]).map(m=>(
            <div key={m} style={{flex:1,textAlign:"center",fontFamily:"var(--ff-num)",fontSize:12,color:"var(--tx3)"}}>{label(m)}</div>
          ))}
        </div>

        {/* Zone summary */}
        <table style={{width:"100%",borderCollapse:"collapse",marginBottom:22}}>
          <thead>
            <tr>
              {["", sv?"Snitt/mån":"Avg/month", sv?"Annualiserat":"Annualised", sv?"Annualiserat":"Annualised"].map((h,i)=>(
                <th key={i} style={{padding:"6px 8px",fontFamily:"var(--ff-num)",fontSize:12,color:"var(--tx3)",
                  textTransform:"uppercase",letterSpacing:1,borderBottom:"1px solid var(--bg3)",
                  textAlign:i===0?"left":"right"}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {["SE1","SE2","SE3","SE4"].map(zone=>{
              const d = ri.zones?.[zone]; if(!d) return null;
              const sel = zone===area;
              return (
                <tr key={zone} style={{background:sel?"rgba(0,224,118,0.06)":undefined}}>
                  <td style={{padding:"6px 8px",fontFamily:"var(--ff-num)",fontSize:14,
                    color:sel?"var(--acc)":"var(--tx2)",fontWeight:sel?700:400,textAlign:"left"}}>{zone}</td>
                  <td style={{padding:"6px 8px",fontFamily:"var(--ff-num)",fontSize:14,color:"var(--tx1)",textAlign:"right"}}>
                    €{d.avgEUR.toLocaleString(lc)}</td>
                  <td style={{padding:"6px 8px",fontFamily:"var(--ff-num)",fontSize:14,color:"var(--tx0)",textAlign:"right",fontWeight:600}}>
                    €{d.annualEUR.toLocaleString(lc)}</td>
                  <td style={{padding:"6px 8px",fontFamily:"var(--ff-num)",fontSize:14,color:"var(--tx2)",textAlign:"right"}}>
                    {(d.annualSEK/1e6).toFixed(2)} MSEK</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{background:"rgba(245,166,35,0.07)",border:"1px solid rgba(245,166,35,0.28)",
          padding:"11px 14px",fontFamily:"var(--ff-num)",fontSize:13,color:"var(--warn)",lineHeight:1.8,marginBottom:22}}>
          {sv
            ? `Årstakt = snitt × 12, beräknat på ${ri.monthCount} månader (${period}). Månadsutfallet varierar med frekvensavvikelser, spotvolatilitet och flaskhalsar — intervallet i diagrammet ovan visar spännvidden. Exakt hur modellerna är byggda är GreenVoltis kärn-IP, men utfallet är öppet att granska mot publik marknadsdata. Historiskt utfall är ingen garanti för framtida intäkter.`
            : `Annualised from ${ri.monthCount} months (${period}). Monthly outcomes vary with frequency deviations, spot volatility and congestion — the chart above shows the range. How the models are built is GreenVoltis core IP, but the outcome is open to verification against public market data. Past performance is not a guarantee of future revenue.`}
        </div>

        {/* How MMO works */}
        <div style={{fontFamily:"var(--ff-num)",fontSize:12,color:"var(--tx3)",textTransform:"uppercase",letterSpacing:1.5,marginBottom:10}}>
          {sv ? "Så fungerar optimeringen" : "How the optimisation works"}
        </div>
        {STEPS.map(([t,d],i)=>(
          <div key={i} style={{display:"flex",gap:12,marginBottom:12}}>
            <div style={{flexShrink:0,width:22,height:22,borderRadius:"50%",background:"rgba(0,224,118,0.1)",
              border:"1px solid rgba(0,224,118,0.4)",display:"flex",alignItems:"center",justifyContent:"center",
              fontFamily:"var(--ff-num)",fontSize:14,color:"var(--acc)",fontWeight:700}}>{i+1}</div>
            <div>
              <div style={{fontFamily:"var(--ff-num)",fontSize:14,color:"var(--tx0)",fontWeight:600,marginBottom:2}}>{t}</div>
              <div style={{fontFamily:"var(--ff-num)",fontSize:13,color:"var(--tx2)",lineHeight:1.8}}>{d}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


// ─── SAVE PROJECT ────────────────────────────────────────────────────────────
// Saving and sharing were the same button before, which meant "Save" only ever
// copied a link and nothing was stored. They are separate concerns now.
function SaveModal({ lang, initialName, isUpdate, onSave, onCancel }) {
  const sv = lang === "sv";
  const [name, setName] = useState(initialName || "");
  const [status, setStatus] = useState("idle");
  const [err, setErr] = useState("");
  const [warn, setWarn] = useState("");
  const go = async () => {
    if (!name.trim()) { setErr(sv?"Ge projektet ett namn.":"Give the project a name."); return; }
    setStatus("saving"); setErr("");
    const r = await onSave(name.trim());
    if (r?.ok) {
      setStatus("saved");
      if (r.warning) { setWarn(r.warning); }        // saved, but degraded
      else setTimeout(onCancel, 700);
    } else { setStatus("idle"); setErr(r?.error || (sv?"Kunde inte spara.":"Could not save.")); }
  };
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(6,14,27,0.94)",zIndex:2700,display:"flex",
      alignItems:"center",justifyContent:"center",backdropFilter:"blur(8px)",padding:20}} onClick={onCancel}>
      <div style={{background:"var(--bg1)",border:"1px solid var(--bg3)",borderRadius:12,width:460,maxWidth:"100%",
        padding:"30px 34px",boxShadow:"0 32px 100px rgba(0,0,0,0.9)"}} onClick={e=>e.stopPropagation()}>
        <div style={{fontFamily:"var(--ff-ui)",fontSize:"var(--fs-sec)",fontWeight:700,color:"var(--tx0)",marginBottom:6}}>
          {isUpdate ? (sv?"Uppdatera projekt":"Update project") : (sv?"Spara projekt":"Save project")}
        </div>
        <div style={{fontFamily:"var(--ff-ui)",fontSize:"var(--fs-cap)",color:"var(--tx3)",marginBottom:20,lineHeight:1.6}}>
          {isUpdate
            ? (sv?"Ändringarna skrivs till det projekt du öppnade. Vill du i stället skapa ett nytt, byt namn."
                 :"Changes are written to the project you opened. Rename it to create a new one instead.")
            : (sv?"Hela konfigurationen sparas och går att öppna igen från Mina projekt."
                 :"The whole configuration is stored and can be reopened from My projects.")}
        </div>
        <div style={{fontFamily:"var(--ff-ui)",fontSize:"var(--fs-cap)",fontWeight:600,letterSpacing:"0.06em",
          textTransform:"uppercase",color:"var(--tx2)",marginBottom:8}}>{sv?"Projektnamn":"Project name"}</div>
        <input value={name} onChange={e=>setName(e.target.value)} autoFocus
          onKeyDown={e=>e.key==="Enter"&&go()}
          placeholder={sv?"t.ex. Vattenfall 50 MW Hjo":"e.g. Vattenfall 50 MW Hjo"}
          style={{width:"100%",background:"var(--bg2)",color:"var(--tx0)",border:"1px solid var(--bg3)",
            borderRadius:"var(--r)",fontFamily:"var(--ff-ui)",fontSize:"var(--fs-body)",padding:"12px 14px",outline:"none"}}/>
        {err&&<div style={{fontFamily:"var(--ff-ui)",fontSize:"var(--fs-cap)",color:"var(--err)",marginTop:12,
          padding:"11px 13px",background:"rgba(255,92,120,0.08)",border:"1px solid rgba(255,92,120,0.3)",
          borderRadius:"var(--r)",lineHeight:1.65}}>{err}</div>}
        {warn&&<div style={{fontFamily:"var(--ff-ui)",fontSize:"var(--fs-cap)",color:"var(--warn)",marginTop:12,
          padding:"11px 13px",background:"rgba(245,166,35,0.08)",border:"1px solid rgba(245,166,35,0.3)",
          borderRadius:"var(--r)",lineHeight:1.65}}>{warn}</div>}
        <div style={{display:"flex",gap:8,marginTop:20}}>
          <button onClick={go} disabled={status!=="idle"} style={{flex:2,padding:"12px",minHeight:44,
            background:status==="saved"?"rgba(0,224,118,0.2)":"var(--acc)",border:"1px solid var(--acc)",
            borderRadius:"var(--r)",color:status==="saved"?"var(--acc)":"#050D1A",fontFamily:"var(--ff-ui)",
            fontSize:"var(--fs-body)",fontWeight:700,cursor:status==="idle"?"pointer":"default"}}>
            {status==="saved"?(sv?"Sparat":"Saved"):status==="saving"?(sv?"Sparar...":"Saving..."):
              isUpdate?(sv?"Uppdatera":"Update"):(sv?"Spara":"Save")}
          </button>
          <button onClick={onCancel} style={{flex:1,padding:"12px",minHeight:44,background:"transparent",
            border:"1px solid var(--bg3)",borderRadius:"var(--r)",color:"var(--tx2)",fontFamily:"var(--ff-ui)",
            fontSize:"var(--fs-body)",fontWeight:600,cursor:"pointer"}}>{sv?"Avbryt":"Cancel"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── WELCOME / DISCLAIMER MODAL ──────────────────────────────────────────────
function WelcomeModal({ s, lang, onDismiss, onDismissPermanent, onStart }) {
  const sv = lang === "sv";
  const [step, setStep] = useState(0);
  const [cfg, setCfg]   = useState({ area:"SE3", mw:10, hrs:2, finType:"equity" });
  const set = (k,v) => setCfg(c => ({...c, [k]:v}));

  const Choice = ({value, current, onClick, title, note}) => (
    <button onClick={onClick} style={{
      flex:"1 1 130px", minHeight:64, padding:"12px 14px", textAlign:"left", cursor:"pointer",
      background: current===value ? "rgba(0,224,118,0.10)" : "transparent",
      border:`1px solid ${current===value ? "var(--acc)" : "var(--bg3)"}`,
      borderRadius:"var(--r)", transition:"all .12s"}}>
      <div style={{fontFamily:"var(--ff-ui)",fontSize:"var(--fs-lg)",fontWeight:600,
        color: current===value ? "var(--acc)" : "var(--tx0)"}}>{title}</div>
      {note&&<div style={{fontFamily:"var(--ff-ui)",fontSize:"var(--fs-cap)",color:"var(--tx3)",marginTop:3}}>{note}</div>}
    </button>
  );
  const Q = ({label, children}) => (
    <div style={{marginBottom:22}}>
      <div style={{fontFamily:"var(--ff-ui)",fontSize:"var(--fs-cap)",fontWeight:600,letterSpacing:"0.06em",
        textTransform:"uppercase",color:"var(--tx2)",marginBottom:10}}>{label}</div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{children}</div>
    </div>
  );

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(6,14,27,0.97)",zIndex:3000,
      display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(10px)",padding:16,overflowY:"auto"}}>
      <div style={{background:"var(--bg1)",border:"1px solid var(--bg3)",borderRadius:12,width:620,maxWidth:"100%",
        padding:"36px 40px",boxShadow:"0 32px 100px rgba(0,0,0,0.9)",margin:"auto"}}>

        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:24}}>
          <svg width="34" height="34" viewBox="0 0 32 32">
            <polygon points="16,2 30,26 2,26" fill="none" stroke="var(--acc)" strokeWidth="1.5"/>
            <polygon points="16,8 25,23 7,23" fill="rgba(0,224,118,0.12)"/>
            <line x1="16" y1="8" x2="16" y2="23" stroke="var(--acc)" strokeWidth="1.2"/>
          </svg>
          <div>
            <div style={{fontFamily:"var(--ff-brand)",fontSize:"var(--fs-sec)",fontWeight:700,color:"var(--tx0)"}}>
              {step===0 ? (sv?"GreenVoltis BESS Calculator":"GreenVoltis BESS Calculator")
                        : (sv?"Tre frågor, sedan är du igång":"Three questions and you're set")}
            </div>
            <div style={{fontFamily:"var(--ff-ui)",fontSize:"var(--fs-cap)",color:"var(--tx3)",letterSpacing:"0.06em",
              textTransform:"uppercase",marginTop:3}}>
              {sv?"Storskalig · Nätansluten · Investeringsmodell":"Utility-scale · Grid-connected · Investment model"}
            </div>
          </div>
        </div>

        {step===0 ? (
          <>
            <div className="prose" style={{marginBottom:20}}>
              <p style={{marginBottom:14}}>
                {sv ? "Verktyget modellerar 15-åriga kassaflöden för storskaliga batterilager på den svenska elmarknaden. Startåret bygger på GreenVoltis faktiska optimeringsutfall, inte på antaganden."
                    : "This tool models 15-year cash flows for utility-scale battery storage on the Swedish electricity market. Year one is built on GreenVoltis' realised optimisation performance, not on assumptions."}
              </p>
              <div style={{background:"rgba(245,166,35,0.07)",border:"1px solid rgba(245,166,35,0.28)",
                borderRadius:"var(--r)",padding:"14px 16px"}}>
                <div style={{fontFamily:"var(--ff-ui)",fontSize:"var(--fs-cap)",fontWeight:700,color:"var(--warn)",
                  letterSpacing:"0.05em",textTransform:"uppercase",marginBottom:8}}>
                  {sv?"Innan du börjar":"Before you start"}
                </div>
                <ul style={{margin:0,paddingLeft:18,fontSize:"var(--fs-body)",color:"var(--tx2)",lineHeight:1.8}}>
                  <li>{sv?"GreenVoltis garanterar inga siffror. Historiskt utfall är ingen utfästelse om framtida intäkter."
                        :"GreenVoltis guarantees no figures. Past performance is not a promise of future revenue."}</li>
                  <li>{sv?"Använd dina egna nätavtal och kostnader — standardvärdena är marknadsgenomsnitt."
                        :"Use your own grid tariffs and costs — the defaults are market averages."}</li>
                  <li>{sv?"Modellen är ett beslutsstöd, inte ett prospekt eller en investeringsrekommendation."
                        :"This is a decision-support tool, not a prospectus or investment recommendation."}</li>
                </ul>
              </div>
            </div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              <button onClick={()=>setStep(1)} style={{flex:"2 1 240px",minHeight:48,padding:"13px",
                background:"var(--acc)",border:"1px solid var(--acc)",borderRadius:"var(--r)",color:"#050D1A",
                fontFamily:"var(--ff-ui)",fontSize:"var(--fs-body)",fontWeight:700,letterSpacing:"0.03em",cursor:"pointer"}}>
                {sv?"Jag förstår — sätt upp mitt projekt":"I understand — set up my project"}
              </button>
              <button onClick={onDismissPermanent} style={{flex:"1 1 150px",minHeight:48,padding:"13px",
                background:"transparent",border:"1px solid var(--bg3)",borderRadius:"var(--r)",color:"var(--tx2)",
                fontFamily:"var(--ff-ui)",fontSize:"var(--fs-body)",fontWeight:600,cursor:"pointer"}}>
                {sv?"Hoppa över":"Skip"}
              </button>
            </div>
          </>
        ) : (
          <>
            <Q label={sv?"Var ligger projektet?":"Where is the project?"}>
              {["SE1","SE2","SE3","SE4"].map(z=>(
                <Choice key={z} value={z} current={cfg.area} onClick={()=>set("area",z)} title={z}
                  note={{SE1:sv?"Norr":"North",SE2:sv?"Norra mellan":"Upper mid",
                         SE3:sv?"Mellan":"Central",SE4:sv?"Söder":"South"}[z]}/>
              ))}
            </Q>
            <Q label={sv?"Hur stort?":"How large?"}>
              {[[5,"2"],[10,"2"],[20,"2"],[50,"4"]].map(([mw,h])=>(
                <Choice key={mw} value={mw} current={cfg.mw}
                  onClick={()=>{set("mw",mw);set("hrs",Number(h));}}
                  title={`${mw} MW`} note={`${h}h`}/>
              ))}
            </Q>
            <Q label={sv?"Hur finansieras det?":"How is it financed?"}>
              <Choice value="equity" current={cfg.finType} onClick={()=>set("finType","equity")}
                title={sv?"Eget kapital":"Equity"} note={sv?"Ingen belåning":"No leverage"}/>
              <Choice value="mixed" current={cfg.finType} onClick={()=>set("finType","mixed")}
                title={sv?"Blandat":"Mixed"} note={sv?"60% lån":"60% debt"}/>
              <Choice value="debt" current={cfg.finType} onClick={()=>set("finType","debt")}
                title={sv?"Maximal belåning":"Max leverage"} note="90%"/>
            </Q>
            <div style={{display:"flex",gap:10,marginTop:8,flexWrap:"wrap"}}>
              <button onClick={()=>{onStart(cfg);}} style={{flex:"2 1 240px",minHeight:48,padding:"13px",
                background:"var(--acc)",border:"1px solid var(--acc)",borderRadius:"var(--r)",color:"#050D1A",
                fontFamily:"var(--ff-ui)",fontSize:"var(--fs-body)",fontWeight:700,letterSpacing:"0.03em",cursor:"pointer"}}>
                {sv?"Visa min kalkyl":"Show my case"}
              </button>
              <button onClick={()=>setStep(0)} style={{flex:"1 1 110px",minHeight:48,padding:"13px",
                background:"transparent",border:"1px solid var(--bg3)",borderRadius:"var(--r)",color:"var(--tx2)",
                fontFamily:"var(--ff-ui)",fontSize:"var(--fs-body)",fontWeight:600,cursor:"pointer"}}>
                {sv?"Tillbaka":"Back"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── AUTH HOOK ────────────────────────────────────────────────────────────────
function useSupabaseAuth() {
  const [user, setUser] = useState(null);
  const [authLoading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(() => readAuthError());
  useEffect(() => {
    if (!supabase) { clearAuthHash(); setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      setUser(data?.session?.user ?? null);
      setLoading(false);
      // Supabase has parsed the fragment by now; drop it so a refresh does not
      // replay a spent token and the URL stays shareable.
      clearAuthHash();
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);
  const signIn = useCallback(async (email) => {
    if (!supabase) return { error:{ message:"Supabase not configured" } };
    // Preserve current URL including hash so user returns to same config
    // Return to the same page and the same shared project, but with no hash —
    // Supabase overwrites the hash with its tokens on the way back.
    const back = window.location.origin + window.location.pathname + window.location.search;
    return supabase.auth.signInWithOtp({ email, options:{ emailRedirectTo: back } });
  }, []);
  const signOut = useCallback(async () => { if(supabase) await supabase.auth.signOut(); setUser(null); }, []);
  // Returns the row id so the caller can keep updating the same project
  // instead of creating a duplicate every time the user presses save.
  const saveProject = useCallback(async (payload, id) => {
    if (!supabase) return { error:"Supabase is not configured." };
    if (!user)     return { error:"Not signed in." };
    // PostgREST rejects the whole row when it does not recognise a column, and
    // names the offending one in the message. Rather than losing the project,
    // drop that field and try again — repeatedly, since a table can be behind
    // by more than one column. Whatever had to be dropped is reported back.
    const columnFrom = e => {
      const m = /'([^']+)' column|column "([^"]+)"/i.exec(e?.message || "");
      return m ? (m[1] || m[2]) : null;
    };
    const send = body => id
      ? supabase.from("bess_projects").update({ ...body, updated_at:new Date().toISOString() })
          .eq("id", id).eq("user_id", user.id).select("id").single()
      : supabase.from("bess_projects").insert({ ...body, user_id:user.id, user_email:user.email })
          .select("id").single();

    let body = { ...payload };
    let dropped = [];
    let data, error;
    for (let attempt = 0; attempt < 6; attempt++) {
      ({ data, error } = await send(body));
      if (!error) break;
      const col = columnFrom(error);
      if (!col || !(col in body)) break;      // not a column problem — stop here
      delete body[col];
      dropped.push(col);
    }
    if (!error && dropped.length) {
      const reopen = dropped.includes("config");
      return { id: data?.id ?? id ?? null,
               warning: `Saved without: ${dropped.join(", ")}. `
                 + (reopen ? "This project cannot be reopened until the config column exists. " : "")
                 + "Run: alter table bess_projects add column if not exists "
                 + dropped[0] + " text; then: notify pgrst, 'reload schema';" };
    }

    if (error) {
      console.warn("Save error:", error);
      const msg = columnFrom(error)
        ? "The database is missing a column this version needs, or PostgREST is serving a stale schema cache. Run the ALTER TABLE statements, then: notify pgrst, 'reload schema';"
        : /row-level security|policy/i.test(error.message || "")
        ? "Blocked by row level security. Run the CREATE POLICY statements for update and delete from the config comment."
        : error.message || "Unknown error.";
      return { error: msg };
    }
    return { id: data?.id ?? id ?? null };
  }, [user]);

  const deleteProject = useCallback(async (id) => {
    if (!supabase||!user||!id) return false;
    const { error } = await supabase.from("bess_projects").delete().eq("id", id).eq("user_id", user.id);
    if (error) console.warn("Delete error:", error.message);
    return !error;
  }, [user]);
  const loadUserProjects = useCallback(async () => {
    if (!supabase||!user) return [];
    const { data } = await supabase.from("bess_projects").select("*").eq("user_id",user.id).order("created_at",{ascending:false});
    return data||[];
  }, [user]);
  const loadAllProjects = useCallback(async () => {
    if (!supabase) return [];
    const { data } = await supabase.from("bess_projects").select("*").order("created_at",{ascending:false});
    return data||[];
  }, []);
  return { user, authLoading, authError, setAuthError, signIn, signOut, saveProject, deleteProject, loadUserProjects, loadAllProjects };
}

// ─── LOGIN MODAL ──────────────────────────────────────────────────────────────
function LoginModal({ s, onClose, signIn, requiredFor, authError }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle");
  const [errMsg, setErrMsg] = useState("");
  const [diag, setDiag] = useState("");
  useEffect(() => {
    if (authError) { setErrMsg(authError); setStatus("error"); }
  }, [authError]);
  const handle = async () => {
    if (!email.trim()||!email.includes("@")) { setErrMsg("Enter a valid email"); setStatus("error"); return; }
    setStatus("sending"); setErrMsg(""); setDiag("");
    if (!SB_READY) { setStatus("sent"); return; }
    const { error } = await signIn(email.trim());
    if (!error) { setStatus("sent"); return; }
    const raw = (error.message || "").toLowerCase();
    // "Failed to fetch" = the request never reached Supabase (DNS, paused
    // project, blocked by extension). Probe the host to pinpoint which.
    if (raw.includes("failed to fetch") || raw.includes("networkerror") || raw.includes("load failed")) {
      let hint;
      try {
        const probe = await fetch(SB_URL_CLEAN + "/auth/v1/health", {
          headers: { apikey: SB_KEY_CLEAN },
        });
        hint = probe.ok
          ? "Host reachable but auth rejected the request. Check that the anon public key matches this project, and that Authentication -> URL Configuration lists this domain."
          : "Host responded " + probe.status + ". If 401/403, the anon key is wrong for this project.";
      } catch {
        hint = "Host unreachable. Most likely: the Supabase project is paused (free tier pauses after inactivity - open the dashboard to resume), the project URL is misspelled, or a browser extension/ad blocker is blocking the request.";
      }
      setErrMsg("Cannot reach Supabase");
      setDiag(hint + "  ·  Target: " + SB_URL_CLEAN);
    } else {
      setErrMsg(error.message || s.loginError);
    }
    setStatus("error");
  };
  const iSt = { width:"100%",background:"#0A1628",color:"#C8D8E8",border:"1px solid #1C2E4A",fontFamily:"var(--ff-num)",fontSize:16,padding:"11px 13px",outline:"none",borderRadius:2 };
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(5,13,26,0.94)",zIndex:2500,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(8px)",padding:20}} onClick={onClose}>
      <div style={{background:"#080F1C",border:"1px solid #253A55",width:460,padding:"34px 38px",boxShadow:"0 32px 100px rgba(0,0,0,0.85)",maxWidth:"100%"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:6}}>
          <svg width="28" height="28" viewBox="0 0 32 32"><polygon points="16,2 30,26 2,26" fill="none" stroke="#00E076" strokeWidth="1.5"/><polygon points="16,8 25,23 7,23" fill="rgba(0,224,118,0.12)"/><line x1="16" y1="8" x2="16" y2="23" stroke="#00E076" strokeWidth="1.2"/></svg>
          <span style={{fontFamily:"var(--ff-num)",fontSize:16,fontWeight:700,color:"#E8F4FF",letterSpacing:1}}>{s.loginTitle}</span>
        </div>
        <div style={{fontFamily:"var(--ff-num)",fontSize:14,color:"#8AACCA",marginBottom:24,marginLeft:40,lineHeight:1.6}}>{requiredFor||s.loginSub}</div>
        {status==="sent" ? (
          <div style={{textAlign:"center",padding:"20px 0"}}>
            <div style={{fontSize:44,marginBottom:14,fontFamily:"var(--ff-num)",color:"#00E076"}}>{"\u2709"}</div>
            <div style={{fontFamily:"var(--ff-num)",fontSize:18,color:"#00E076",fontWeight:700,marginBottom:10}}>{s.loginSent}</div>
            <div style={{fontFamily:"var(--ff-num)",fontSize:14,color:"#8AACCA",lineHeight:1.7}}>{SB_READY?s.loginSentSub:"Demo -- add SB_URL + SB_KEY in App.jsx for live auth."}</div>
            {!SB_READY&&<div style={{marginTop:16,background:"rgba(245,166,35,0.08)",border:"1px solid rgba(245,166,35,0.3)",padding:"12px 14px",fontFamily:"var(--ff-num)",fontSize:13,color:"#F5A623",lineHeight:1.8,textAlign:"left"}}><div style={{fontWeight:700,marginBottom:4}}>Setup:</div><div>1. supabase.com -- new project -- Settings -- API</div><div>2. Paste Project URL + anon key into App.jsx</div><div>3. Run SQL from the config comment</div><div>4. Auth -- URL Configuration -- add your Vercel URL</div></div>}
            <button onClick={onClose} style={{marginTop:16,padding:"10px 24px",background:"transparent",border:"1px solid #1C2E4A",color:"#8AACCA",fontFamily:"var(--ff-num)",fontSize:14,letterSpacing:1.5,textTransform:"uppercase",cursor:"pointer"}}>Close</button>
          </div>
        ) : (
          <>
            <div style={{marginBottom:18}}>
              <div style={{fontFamily:"var(--ff-num)",fontSize:12,color:"#4A6580",textTransform:"uppercase",letterSpacing:1.5,marginBottom:8}}>{s.loginEmail}</div>
              <input style={iSt} type="email" placeholder={s.loginEmailPh} value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()} autoFocus/>
            </div>
            {status==="error"&&errMsg&&<div style={{fontFamily:"var(--ff-num)",fontSize:13,color:"#FF4D6A",marginBottom:diag?6:14,padding:"8px 11px",background:"rgba(255,77,106,0.08)",border:"1px solid rgba(255,77,106,0.3)"}}>! {errMsg}</div>}
            {status==="error"&&diag&&<div style={{fontFamily:"var(--ff-num)",fontSize:13,color:"#F5A623",marginBottom:14,padding:"8px 11px",background:"rgba(245,166,35,0.07)",border:"1px solid rgba(245,166,35,0.28)",lineHeight:1.7,wordBreak:"break-all"}}>{diag}</div>}
            <div style={{display:"flex",gap:8}}>
              <button onClick={handle} disabled={status==="sending"} style={{flex:2,padding:"12px",background:status==="sending"?"rgba(0,224,118,0.07)":"#00E076",border:"1px solid #00E076",color:status==="sending"?"#00E076":"#050D1A",fontFamily:"var(--ff-num)",fontSize:14,letterSpacing:1.5,textTransform:"uppercase",cursor:status==="sending"?"wait":"pointer",fontWeight:700}}>{status==="sending"?s.loginSending:("> "+s.loginSend)}</button>
              <button onClick={onClose} style={{flex:1,padding:"12px",background:"transparent",border:"1px solid #1C2E4A",color:"#8AACCA",fontFamily:"var(--ff-num)",fontSize:14,letterSpacing:1,textTransform:"uppercase",cursor:"pointer"}}>X</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── USER PROJECTS PANEL ─────────────────────────────────────────────────────
function UserProjectsPanel({ s, lang, user, loadUserProjects, loadAllProjects, deleteProject, onOpen, onClose }) {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirm] = useState(null);
  const sv = lang === "sv";
  const isAdmin = user?.email === ADMIN_EMAIL;
  const fmt = iso => iso ? new Date(iso).toLocaleString(sv?"sv-SE":"en-GB",{
    year:"numeric",month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit"}) : "—";

  const refresh = async () => {
    const data = isAdmin ? await loadAllProjects() : await loadUserProjects();
    setRows(data||[]); setLoading(false);
  };
  useEffect(() => { refresh(); }, []);

  const remove = async (id) => {
    const ok = await deleteProject(id);
    if (ok) setRows(r => r.filter(x => x.id !== id));
    setConfirm(null);
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(6,14,27,0.9)",zIndex:2000,display:"flex",
      alignItems:"center",justifyContent:"center",backdropFilter:"blur(6px)",padding:20}} onClick={onClose}>
      <div style={{background:"var(--bg1)",border:"1px solid var(--bg3)",borderRadius:12,width:1040,maxHeight:"84vh",
        display:"flex",flexDirection:"column",boxShadow:"0 24px 80px rgba(0,0,0,0.7)",maxWidth:"100%"}}
        onClick={e=>e.stopPropagation()}>

        <div style={{padding:"20px 26px",borderBottom:"1px solid var(--bg3)",display:"flex",
          justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
          <div>
            <div style={{fontFamily:"var(--ff-ui)",fontSize:"var(--fs-sec)",fontWeight:700,color:"var(--tx0)"}}>
              {isAdmin ? s.loginAdminTitle : s.loginMyProjects}
            </div>
            <div style={{fontFamily:"var(--ff-ui)",fontSize:"var(--fs-cap)",color:"var(--tx3)",marginTop:4}}>
              {s.loginSignedIn}: {user?.email}{isAdmin&&<span style={{color:"var(--warn)"}}> · admin</span>}
              {rows.length>0 && <span> · {rows.length} {sv?"projekt":"projects"}</span>}
            </div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"1px solid var(--bg3)",borderRadius:"var(--r)",
            color:"var(--tx2)",cursor:"pointer",fontSize:"var(--fs-body)",padding:"9px 14px",minHeight:38,
            fontFamily:"var(--ff-ui)"}}>{sv?"Stäng":"Close"}</button>
        </div>

        <div style={{overflowY:"auto",flex:1}}>
          {loading ? (
            <div style={{padding:60,fontFamily:"var(--ff-ui)",fontSize:"var(--fs-body)",color:"var(--tx3)",textAlign:"center"}}>
              {sv?"Hämtar...":"Loading..."}
            </div>
          ) : rows.length===0 ? (
            <div style={{padding:"60px 30px",textAlign:"center"}}>
              <div style={{fontFamily:"var(--ff-ui)",fontSize:"var(--fs-lg)",color:"var(--tx2)",marginBottom:8}}>
                {s.loginNoProjects}
              </div>
              <div style={{fontFamily:"var(--ff-ui)",fontSize:"var(--fs-body)",color:"var(--tx3)",lineHeight:1.7}}>
                {sv?"Använd Spara projekt i headern för att lägga till det du arbetar med nu."
                   :"Use Save project in the header to store what you are working on."}
              </div>
            </div>
          ) : (
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr>
                  {[sv?"Projekt":"Project", ...(isAdmin?["Email"]:[]), sv?"System":"System",
                    sv?"Område":"Zone", "IRR", sv?"Payback":"Payback", sv?"Sparat":"Saved", ""].map((hd,i)=>(
                    <th key={i} style={{textAlign:i===0?"left":i===7?"right":"left"}}>{hd}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r,i)=>(
                  <tr key={r.id||i}>
                    <td style={{textAlign:"left",color:"var(--tx0)",fontWeight:600}}>{r.project_name}</td>
                    {isAdmin&&<td style={{textAlign:"left",color:"var(--tx2)"}}>{r.user_email}</td>}
                    <td style={{textAlign:"left",color:"var(--tx2)"}}>{r.mw} MW / {r.hrs}h{r.tab==="hybrid"?" · hybrid":""}</td>
                    <td style={{textAlign:"left",color:"var(--warn)"}}>{r.area}</td>
                    <td style={{textAlign:"left",color:"var(--acc)"}}>{r.irr}</td>
                    <td style={{textAlign:"left",color:"var(--tx2)"}}>{r.payback}</td>
                    <td style={{textAlign:"left",color:"var(--tx3)"}}>{fmt(r.updated_at||r.created_at)}</td>
                    <td style={{textAlign:"right",whiteSpace:"nowrap"}}>
                      {confirmId===r.id ? (
                        <>
                          <button onClick={()=>remove(r.id)} style={{padding:"7px 12px",minHeight:34,marginRight:6,
                            background:"var(--err)",border:"1px solid var(--err)",borderRadius:"var(--r)",color:"#fff",
                            fontFamily:"var(--ff-ui)",fontSize:"var(--fs-cap)",fontWeight:700,cursor:"pointer"}}>
                            {sv?"Ta bort":"Delete"}
                          </button>
                          <button onClick={()=>setConfirm(null)} style={{padding:"7px 12px",minHeight:34,
                            background:"transparent",border:"1px solid var(--bg3)",borderRadius:"var(--r)",
                            color:"var(--tx2)",fontFamily:"var(--ff-ui)",fontSize:"var(--fs-cap)",cursor:"pointer"}}>
                            {sv?"Avbryt":"Cancel"}
                          </button>
                        </>
                      ) : (
                        <>
                          {r.config && (
                            <button onClick={()=>onOpen(r)} style={{padding:"7px 14px",minHeight:34,marginRight:6,
                              background:"rgba(0,224,118,0.12)",border:"1px solid var(--acc)",borderRadius:"var(--r)",
                              color:"var(--acc)",fontFamily:"var(--ff-ui)",fontSize:"var(--fs-cap)",fontWeight:600,
                              cursor:"pointer"}}>{sv?"Öppna":"Open"}</button>
                          )}
                          {!isAdmin && (
                            <button onClick={()=>setConfirm(r.id)} style={{padding:"7px 12px",minHeight:34,
                              background:"transparent",border:"1px solid var(--bg3)",borderRadius:"var(--r)",
                              color:"var(--tx3)",fontFamily:"var(--ff-ui)",fontSize:"var(--fs-cap)",cursor:"pointer"}}>
                              {sv?"Ta bort":"Delete"}</button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default function GVCalc(){
  const[p,setP]                     =useState(()=>{
    // Load from URL if present
    const shared = readSharedState();
    if (shared) return {...DEF, ...shared};
    return{...DEF};
  });
  const[mode,setMode]               =useState("basic");
  const[lang,setLang]               =useState("en");
  const[showOpex,setShowOpex]       =useState(false);
  const[showExport,setShowExport]   =useState(false);
  const[exportMode,setExportMode]   =useState("single"); // single|comparison
  const[showProjects,setShowProjects]=useState(false);
  const[projects,setProjects]       =useState([]);
  const[currentProject,setCurrentProject]=useState(null);
  const[printMode,setPrintMode]     =useState("single");
  const[showBanner,setShowBanner]   =useState(false);
  const[quoteSent,setQuoteSent]     =useState(false);
  const[currentForm,setCurrentForm] =useState(null);
  const[shareCopied,setShareCopied] =useState(false);
  const[showHelp,setShowHelp]       =useState(false);
  const[showMS,setShowMS]           =useState(true);
  const[activeTab,setActiveTab]     =useState("bess");
  const prevTab = useRef("bess");
  const[hyb,setHyb]                 =useState({...HYB_DEF});
// ── Welcome / disclaimer ──
  // Someone opening a shared project already has a configuration — asking them
  // to answer setup questions would discard it.
  const[showWelcome,setShowWelcome] =useState(()=>!hasSharedState() && localStorage.getItem("gv_guide_seen")!=="1");
  const[showRi,setShowRi]           =useState(false);
  const[showSave,setShowSave]       =useState(false);
  // Which stored project the current configuration belongs to. Set when a
  // project is saved or opened, so pressing save again updates it rather than
  // creating a duplicate.
  const[savedId,setSavedId]         =useState(null);
  const[savedName,setSavedName]     =useState("");
  const[chartTab,setChartTab]       =useState("none");
  const[showTable,setShowTable]     =useState(false);
  const[sheetOpen,setSheetOpen]     =useState(false);
  const[riMeta,setRiMeta]           =useState(null);
  useEffect(()=>{ fetchRiMeta().then(setRiMeta); },[]);
  const dismissWelcome   = ()=>setShowWelcome(false);
  const dismissPermanent = ()=>{ localStorage.setItem("gv_guide_seen","1"); setShowWelcome(false); };
  // ── Supabase config notice ──
  const sbConfigured = SB_READY;
  // ── Session tracking (anonymous) ──
  useEffect(()=>{
    if(!supabase) return;
    const sid = sessionStorage.getItem("gv_sid") || (()=>{
      const id = Math.random().toString(36).slice(2)+Date.now().toString(36);
      sessionStorage.setItem("gv_sid",id);
      return id;
    })();
    supabase.from("bess_sessions").insert({
      session_id:sid, area:p.area, user_agent:navigator.userAgent.slice(0,120), landed_at:new Date().toISOString()
    }).then(()=>{}).catch(()=>{});
  },[]);
  // ── Reset confirm ──
  const handleReset = ()=>{
    if(window.confirm(lang==="sv"?"Återställ alla inställningar till standardvärden?":"Reset all settings to defaults?"))
      setP({...DEF});
  };
  const { user, authLoading, authError, setAuthError, signIn, signOut, saveProject, deleteProject,
          loadUserProjects, loadAllProjects } = useSupabaseAuth();
  const[showLogin,setShowLogin]       =useState(false);
  const[loginRequiredFor,setLoginReqFor]=useState(null);
  const[showMyProjects,setShowMyProj] =useState(false);
  const sdH = (k,v) => setHyb(h=>({...h,[k]:v}));

  const s  =T[lang];
  const set=k=>v=>setP(prev=>({...prev,[k]:v}));
  const sd =(k,v)=>setP(prev=>({...prev,[k]:v}));
  // Server-side compute with client fallback
  const [res, setRes] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetchCompute(p).then(r => { if (!cancelled) setRes(r); });
    // Fetch all 3 scenarios for comparison chart
    Promise.all(["conservative","base","optimistic"].map(sc =>
      fetchCompute({...p, scn:sc}).then(r => r?.rows || [])
    )).then(([cons,base,opti]) => {
      if (!cancelled) setStdScnData({conservative:cons,base,optimistic:opti});
    });
    return () => { cancelled = true; };
  }, [p]);
  const{rows=[],capSEK=0,eq=0,pb=null,mwhTrd=0,mwhLoss=0,dsoNet=0,etBase=0,omBasePerYear=0,opexBreak={}}=res||{};
  const yr1=rows[0]||{anc:0,trd:0,rev:0,brp:0,om:0,dso:0,ebi:0,ncf:0,ccf:0,dg:100};
  const [hybRes, setHybRes] = useState(null);
  const [hybScnData, setHybScnData] = useState({conservative:[],base:[],optimistic:[]});
  const [stdScnData, setStdScnData] = useState({conservative:[],base:[],optimistic:[]});
  useEffect(() => {
    let cancelled = false;
    fetchHybridCompute(p, hyb).then(r => { if (!cancelled) setHybRes(r); });
    // Also fetch all 3 scenarios for comparison chart
    Promise.all(["conservative","base","optimistic"].map(sc =>
      fetchHybridCompute(p, hyb, sc).then(r => r?.rows || [])
    )).then(([cons,base,opti]) => {
      if (!cancelled) setHybScnData({conservative:cons,base,optimistic:opti});
    });
    return () => { cancelled = true; };
  }, [p, hyb]);
  const hybRows = hybRes?.rows || [];
  const hybPb   = hybRes?.pb;
  // ── Milestone calculations ──
  const msSoH80 = rows.find(r=>r.dg<=80)?.year ?? null;
  const msSoH70 = rows.find(r=>r.dg<=70)?.year ?? null;
  const msLoanEnd = (p.finType!=="equity" && p.loanT<=15) ? p.loanT : null;
  const msEbitdaPos = rows.find(r=>r.ebi>0)?.year ?? null;
  const msEbitdaNeg = rows.slice(1).find(r=>r.ebi<0)?.year ?? null; // turns negative

  const Tip=props=><ChTip {...props} lang={lang}/>;
  const lc=loc(lang);
  const scOpts=[{value:"conservative",label:s.cons},{value:"base",label:s.base},{value:"optimistic",label:s.opti}];
  const scnMap={conservative:s.cons,base:s.base,optimistic:s.opti};

  // Share URL
  const persistProject = async (name) => {
    if (!user || !SB_READY || !res) return { ok:false, error:"Sign in first." };
    const isHyb = activeTab==="hybrid";
    const active = isHyb ? hybRes : res;
    if (!active) return { ok:false, error:"Waiting for the calculation to finish." };
    const out = await saveProject({
      project_name:name,
      area:p.area, mw:p.mw, hrs:p.hrs, tab:activeTab,
      scn:isHyb?(hyb.hybScn||p.scn):p.scn, grid:`${p.powerUtil??90}%`,
      capex_total:fM(active.capSEK,lang),
      irr:fP(isHyb?active.irr:res.eqIRR,lang),
      npv:fM(isHyb?active.npv:res.NPV,lang),
      payback:(active.pb)?(active.pb+" yr"):">15 yr",
      // Everything needed to reconstruct the case, including the hybrid inputs
      config: btoa(JSON.stringify({ p, hyb, tab:activeTab })),
    }, savedId);
    if (out?.id) { setSavedId(out.id); setSavedName(name); return { ok:true, warning: out.warning }; }
    return { ok:false, error: out?.error };
  };

  const openProject = (row) => {
    try {
      const cfg = JSON.parse(atob(row.config));
      if (cfg.p)   setP(prev => ({...DEF, ...cfg.p}));
      if (cfg.hyb) setHyb(prev => ({...HYB_DEF, ...cfg.hyb}));
      if (cfg.tab) setActiveTab(cfg.tab);
      setSavedId(row.id); setSavedName(row.project_name);
      setShowMyProj(false);
    } catch { /* a project stored before configs were kept simply cannot open */ }
  };

  const handleShare=()=>{
    const url=`${window.location.origin}${window.location.pathname}?p=${encodeURIComponent(encodeState(p))}`;
    navigator.clipboard.writeText(url).then(()=>{
      setShareCopied(true);
      setTimeout(()=>setShareCopied(false),2500);
    });
  };

  // Export saved
  const handleExportSave=async(form,mode)=>{
    const isHyb = activeTab==="hybrid";
    const activeRes = isHyb ? hybRes : res;
    if(!activeRes) return;
    const proj={
      userName:form.userName, company:form.company, email:form.email,
      phone:form.phone, role:form.role, timeline:form.timeline,
      projectName:form.projectName,
      area:p.area, mw:p.mw, hrs:p.hrs, scn:isHyb?(hyb.hybScn||p.scn):p.scn,
      tab:activeTab,
      date:new Date().toLocaleDateString(lc),
    };
    setProjects(prev=>[...prev,proj]);
    setCurrentProject(proj);
    setCurrentForm(form);
    setPrintMode(mode);
    setShowExport(false);
    setQuoteSent(false);
    if (user && SB_READY) {
      await saveProject({
        project_name:form.projectName, company:form.company, phone:form.phone,
        role:form.role, timeline:form.timeline, area:p.area, mw:p.mw, hrs:p.hrs,
        scn:isHyb?(hyb.hybScn||p.scn):p.scn, grid:`${p.powerUtil??90}%`, tab:activeTab,
        capex_total:fM(activeRes.capSEK,lang), irr:fP(activeRes.irr||res.eqIRR,lang),
        npv:fM(activeRes.npv||res.NPV,lang),
        payback:(activeRes.pb||res.pb)?((activeRes.pb||res.pb)+" yr"):">15 yr",
      });
    }
    setTimeout(()=>{
      window.print();
      setTimeout(()=>setShowBanner(true),500);
    },200);
  };

  // Request quote
  const handleQuote=async()=>{
    if(!currentForm)return;
    await sendEmail(EJS_TMPL_LEAD,{
      from_name:   currentForm.userName,
      company:     currentForm.company,
      email:       currentForm.email,
      phone:       currentForm.phone,
      role:        currentForm.role,
      timeline:    currentForm.timeline,
      project_name:`CONSULTATION REQUEST: ${currentForm.projectName}`,
      area:        p.area, mw:`${p.mw} MW`, hrs:`${p.hrs}h`,
      scenario:    scnMap[p.scn],
      grid:        `${p.powerUtil??90}% billed power`,
      capex_total: fM(res.capSEK,lang),
      equity_irr:  fP(res.eqIRR,lang),
      npv:         fM(res.NPV,lang),
      payback:     res.pb?`${res.pb} yr`:">15 yr",
      date:        new Date().toLocaleDateString(lc),
      reply_to:    currentForm.email,
    });
    setQuoteSent(true);
  };

  return(
    <>
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Inter:wght@400;500;600;700&family=Syne:wght@600;700;800&display=swap');
      :root{
        --bg0:#060E1B;--bg1:#0A1424;--bg2:#0E1B2E;--bg3:#1E3352;--bg4:#2A4468;
        --tx0:#F2F7FF;--tx1:#D5E3F2;--tx2:#95B2CE;--tx3:#6B87A4;
        /* Colour carries meaning only: positive, caution, negative, reference */
        --acc:#00E076;--warn:#F5A623;--err:#FF5C78;--info:#5AA9FF;
        --ff-ui:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;
        --ff-num:'DM Mono',ui-monospace,'Cascadia Mono',monospace;
        --ff-brand:'Syne',var(--ff-ui);
        --fs-cap:12px;--fs-body:14px;--fs-lg:16px;--fs-sec:20px;--fs-metric:32px;--fs-hero:56px;
        --maxw:1440px;--gut:24px;--r:6px;
      }
      .num{font-family:var(--ff-num);font-variant-numeric:tabular-nums;letter-spacing:-0.01em;}
      .shell{max-width:var(--maxw);margin:0 auto;}
      .prose{font-family:var(--ff-ui);font-size:var(--fs-body);line-height:1.75;color:var(--tx1);}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
      body{background:var(--bg0);color:var(--tx1);font-family:var(--ff-ui);font-size:var(--fs-body);-webkit-font-smoothing:antialiased;}
      input[type=range]{-webkit-appearance:none;width:100%;height:28px;background:transparent;outline:none;display:block;cursor:pointer;}
      input[type=range]::-webkit-slider-runnable-track{height:4px;background:var(--bg3);border-radius:2px;}
      input[type=range]::-moz-range-track{height:4px;background:var(--bg3);border-radius:2px;}
      input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:13px;height:13px;border-radius:50%;background:#00E076;cursor:pointer;box-shadow:0 0 7px rgba(0,224,118,0.45);}
      select option{background:#0A1628;color:#C8D8E8;}
      ::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-track{background:var(--bg0);}::-webkit-scrollbar-thumb{background:var(--bg3);}
      table{width:100%;border-collapse:collapse;}
      th{padding:6px 7px;font-family:monospace;font-size:10px;letter-spacing:0.5px;color:var(--tx2);text-transform:uppercase;border-bottom:1px solid #1C2E4A;text-align:right;white-space:nowrap;}
      th:first-child{text-align:left;}
      td{padding:5px 7px;font-family:monospace;font-size:11px;color:var(--tx1);border-bottom:1px solid var(--bg3);text-align:right;}
      td:first-child{text-align:left;color:var(--tx2);}
      tbody tr:hover td{background:rgba(0,224,118,0.05);}
      .g{color:#00E076!important}.r{color:#FF4D6A!important}.a{color:#F5A623!important}.dm{color:#4A6580!important}
      .print-report{display:none;}
      /* ── Tablet ───────────────────────────────────────────────── */
      @media(max-width:1200px){
        .fin-hero{grid-template-columns:1fr!important;gap:20px!important;}
        .fin-sec{grid-template-columns:repeat(3,1fr)!important;}
      }
      /* ── Mobile ───────────────────────────────────────────────── */
      @media(max-width:768px){
        :root{--gut:16px;--fs-hero:44px;--fs-metric:26px;}
        .shell{grid-template-columns:1fr!important;}
        /* Controls become a bottom sheet the thumb can reach */
        .sidebar-panel{position:fixed!important;left:0!important;right:0!important;bottom:0!important;
          top:auto!important;width:100%!important;max-height:78vh!important;z-index:300!important;
          transform:translateY(100%);transition:transform .28s cubic-bezier(.4,0,.2,1)!important;
          border-right:none!important;border-top:1px solid var(--bg3)!important;
          border-radius:16px 16px 0 0!important;box-shadow:0 -8px 40px rgba(0,0,0,.6)!important;}
        .sidebar-panel.open{transform:translateY(0);}
        .sidebar-panel::before{content:"";display:block;width:40px;height:4px;border-radius:2px;
          background:var(--bg4);margin:10px auto 4px;}
        .mobile-only{display:flex!important;}
        .desktop-only{display:none!important;}
        /* Four metrics max, two up */
        .fin-sec{grid-template-columns:repeat(2,1fr)!important;gap:14px!important;}
        .fin-detail{grid-template-columns:repeat(2,1fr)!important;}
        .kpi-strip{display:grid!important;grid-template-columns:repeat(2,1fr)!important;}
        .kpi-strip>div{min-width:0!important;border-right:none!important;
          border-bottom:1px solid var(--bg3)!important;}
        /* Tables scroll horizontally with the year column pinned */
        .tbl-wrap{overflow-x:auto!important;-webkit-overflow-scrolling:touch;}
        .tbl-wrap th:first-child,.tbl-wrap td:first-child{position:sticky;left:0;
          background:var(--bg1);z-index:1;}
        th,td{padding:9px 10px!important;font-size:13px!important;}
        .chart-tabs button{padding:11px 13px!important;}
        /* Room for the sticky summary bar */
        .screen-app{padding-bottom:64px!important;}
      }
      @media(max-width:480px){
        .fin-sec,.fin-detail{grid-template-columns:1fr!important;}
      }
      /* Sticky result bar so a parameter change is never invisible */
      .sticky-bar{display:none;}
      @media(max-width:768px){
        .sticky-bar{display:flex!important;position:fixed;left:0;right:0;bottom:0;z-index:250;
          background:var(--bg1);border-top:1px solid var(--bg3);padding:9px 16px;
          align-items:center;gap:18px;box-shadow:0 -4px 20px rgba(0,0,0,.5);}
      }
      .mobile-only{display:none;}
      @media print{
        *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
        body{background:#050D1A!important;margin:0;padding:16px;}
        .screen-app{display:none!important;}
        .print-report{display:block!important;}
        @page{margin:10mm 12mm;size:A3 landscape;}
        .print-report table{page-break-inside:auto;}
        .print-report tr{page-break-inside:avoid;page-break-after:auto;}
        .print-report thead{display:table-header-group;}
      }
    `}</style>

    {showExport&&<ExportModal s={s} p={p} res={res} lang={lang} mode={exportMode}
      onSave={handleExportSave} onCancel={()=>setShowExport(false)}/>}
    {showHelp&&<HelpModal s={s} onClose={()=>setShowHelp(false)}/>}
    {showProjects&&<ProjectsPanel projects={projects} s={s} lang={lang} onClose={()=>setShowProjects(false)}/>}
    {showWelcome&&<WelcomeModal s={s} lang={lang} onDismiss={dismissWelcome} onDismissPermanent={dismissPermanent}
      onStart={(cfg)=>{ setP(prev=>({...prev,...cfg,capex:suggestCapex(cfg.hrs,false)})); dismissPermanent(); }}/>}
    {showRi&&<RiPanel ri={riMeta} area={p.area} lang={lang} onClose={()=>setShowRi(false)}/>}
    {showSave&&<SaveModal lang={lang} initialName={savedName} isUpdate={!!savedId}
      onSave={persistProject} onCancel={()=>setShowSave(false)}/>}
    {!showWelcome && SB_READY && !user && !authLoading && (
      <div style={{position:"fixed",inset:0,background:"rgba(5,13,26,0.98)",zIndex:2800,
        display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(12px)",padding:20}}>
        <LoginModal s={s} signIn={signIn} authError={authError}
          requiredFor={hasSharedState()
            ? (lang==="sv"?"Logga in för att öppna det delade projektet. Din konfiguration ligger kvar."
                          :"Sign in to open the shared project. Your configuration is preserved.")
            : (lang==="sv"?"Logga in för att använda GreenVoltis BESS Calculator"
                          :"Sign in to use the GreenVoltis BESS Calculator")}
          onClose={()=>{}}/>
      </div>
    )}
    {!showWelcome && !SB_READY && !user && (
      <div style={{position:"fixed",bottom:20,left:"50%",transform:"translateX(-50%)",
        background:"rgba(245,166,35,0.12)",border:"1px solid var(--warn)",padding:"10px 20px",
        zIndex:2800,fontFamily:"var(--ff-num)",fontSize:14,color:"var(--warn)",maxWidth:500,textAlign:"center"}}>
        ⚠ {!SB_SET
            ? (lang==="sv"
                ? "Supabase inte konfigurerat. Sätt REACT_APP_SB_URL och REACT_APP_SB_KEY under Settings → Environment Variables i Vercel och deploya om."
                : "Supabase not configured. Set REACT_APP_SB_URL and REACT_APP_SB_KEY under Settings → Environment Variables in Vercel and redeploy.")
            : !SB_URL_OK
            ? (lang==="sv"
                ? "Supabase-URL ogiltig. Ska vara exakt https://<projekt-id>.supabase.co utan avslutande snedstreck eller sökväg."
                : "Supabase URL invalid. Must be exactly https://<project-id>.supabase.co with no trailing slash or path.")
            : !SB_KEY_OK
            ? (lang==="sv"
                ? "Supabase-nyckel saknas eller är för kort. Använd anon public-nyckeln från Settings → API."
                : "Supabase key missing or too short. Use the anon public key from Settings → API.")
            : (lang==="sv"
                ? "Supabase ej konfigurerat — lägg till SB_URL och SB_KEY i App.jsx för att aktivera inloggning och spårning"
                : "Supabase not configured — add SB_URL and SB_KEY in App.jsx to enable login and tracking")}
      </div>
    )}
    {showLogin&&<LoginModal s={s} signIn={signIn} requiredFor={loginRequiredFor}
      onClose={()=>{setShowLogin(false);setLoginReqFor(null);}}/>}
    {showMyProjects&&user&&<UserProjectsPanel s={s} lang={lang} user={user}
      loadUserProjects={loadUserProjects} loadAllProjects={loadAllProjects}
      deleteProject={deleteProject} onOpen={openProject}
      onClose={()=>setShowMyProj(false)}/>}
    {showBanner&&<PostExportBanner s={s} form={currentForm}
      onQuote={handleQuote} onDismiss={()=>setShowBanner(false)} quoteSent={quoteSent}/>}

    <PrintReport project={currentProject} p={p} res={res} s={s} lang={lang} printMode={printMode}
      activeTab={activeTab} hyb={hyb} hybRes={hybRes} stdScnData={stdScnData}/>

    <div className="screen-app" style={{minHeight:"100vh",background:"var(--bg0)",
      backgroundImage:"radial-gradient(ellipse 70% 40% at 65% -5%,rgba(0,224,118,0.06) 0%,transparent 68%)"}}>

      {/* HEADER */}
      <div className="app-header" style={{borderBottom:"1px solid var(--bg3)",padding:"12px var(--gut)",
        display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap",
        background:"var(--bg1)",backdropFilter:"blur(8px)",position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:11}}>
          <svg width="28" height="28" viewBox="0 0 32 32">
            <polygon points="16,2 30,26 2,26" fill="none" stroke="#00E076" strokeWidth="1.5"/>
            <polygon points="16,8 25,23 7,23" fill="rgba(0,224,118,0.1)"/>
            <line x1="16" y1="8" x2="16" y2="23" stroke="#00E076" strokeWidth="1.2"/>
          </svg>
          <div>
            <div style={{fontFamily:"var(--ff-brand)",fontWeight:800,fontSize:"var(--fs-sec)",letterSpacing:"0.02em",color:"var(--tx0)"}}>GreenVoltis</div>
            <div style={{fontFamily:"var(--ff-num)",fontSize:12,color:"#4A6580",letterSpacing:1}}>{s.appSub}</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
<button onClick={()=>setShowHelp(true)} title={s.helpTitle} style={{
            width:26,height:26,borderRadius:"50%",flexShrink:0,padding:0,lineHeight:1,
            background:"rgba(0,224,118,0.08)",border:"1px solid rgba(0,224,118,0.4)",
            color:"#00E076",fontFamily:"var(--ff-num)",fontSize:18,fontWeight:700,
            cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>?</button>
          <div style={{display:"flex",marginRight:4}}>
            {[["bess",s.bessTab],["hybrid",s.hybTab]].map(([tab,lbl])=>(
              <button key={tab} onClick={()=>{ setActiveTab(tab);
                // Keep the chosen duration — only the site-shared CAPEX and the
                // infeed tariff differ between the two modes.
                if(tab==="hybrid"){ sd("capex",suggestCapex(p.hrs,true)); sd("dsoProd",0); }
                else { sd("capex",suggestCapex(p.hrs,false)); } }} style={{
                padding:"4px 12px",fontFamily:"var(--ff-num)",fontSize:13,letterSpacing:1,
                textTransform:"uppercase",cursor:"pointer",
                background:activeTab===tab?"rgba(0,224,118,0.12)":"transparent",
                border:"1px solid "+(activeTab===tab?"#00E076":"#1C2E4A"),
                borderRight:tab==="bess"?"none":undefined,
                color:activeTab===tab?"#00E076":"#4A6580",
              }}>{lbl}</button>
            ))}
          </div>
          <Tog value={lang}   onChange={setLang}  options={[{value:"en",label:"EN"},{value:"sv",label:"SV"}]} small/>
          <Tog value={mode}   onChange={setMode}  options={[{value:"basic",label:s.simple},{value:"advanced",label:s.advanced}]} small/>
          <Tog value={p.area} onChange={v=>sd("area",v)} options={["SE1","SE2","SE3","SE4"].map(v=>({value:v,label:v}))} small/>
          <button onClick={()=>setShowOpex(v=>!v)} style={{padding:"9px 14px",minHeight:36,borderRadius:"var(--r)",background:showOpex?"rgba(245,166,35,0.15)":"rgba(0,224,118,0.07)",
            border:`1px solid ${showOpex?"#F5A623":"#1C2E4A"}`,color:showOpex?"#F5A623":"#4A6580",
            fontFamily:"var(--ff-num)",fontSize:13,letterSpacing:1.5,textTransform:"uppercase",cursor:"pointer"}}>
            {showOpex?s.hideOpex:s.showOpex}
          </button>
          <button onClick={()=>setShowMS(v=>!v)} style={{padding:"9px 14px",minHeight:36,borderRadius:"var(--r)",background:showMS?"rgba(160,111,216,0.15)":"transparent",
            border:`1px solid ${showMS?"#A06FD8":"#1C2E4A"}`,color:showMS?"#A06FD8":"#8AACCA",
            fontFamily:"var(--ff-num)",fontSize:13,letterSpacing:1.5,textTransform:"uppercase",cursor:"pointer"}}>
            ◈ {showMS?s.msHide:s.msShow}
          </button>
          {user && SB_READY && (
            <button onClick={()=>setShowSave(true)} style={{padding:"9px 14px",minHeight:36,borderRadius:"var(--r)",
              background:"rgba(0,224,118,0.1)",border:"1px solid var(--acc)",color:"var(--acc)",
              fontFamily:"var(--ff-ui)",fontSize:"var(--fs-cap)",fontWeight:600,letterSpacing:"0.04em",
              textTransform:"uppercase",cursor:"pointer",whiteSpace:"nowrap"}}>
              {savedId ? (lang==="sv"?"Uppdatera projekt":"Update project")
                       : (lang==="sv"?"Spara projekt":"Save project")}
            </button>
          )}
          <button onClick={handleShare} style={{padding:"9px 14px",minHeight:36,borderRadius:"var(--r)",background:shareCopied?"rgba(0,224,118,0.15)":"transparent",
            border:`1px solid ${shareCopied?"#00E076":"#1C2E4A"}`,
            color:shareCopied?"#00E076":"#4A6580",
            fontFamily:"var(--ff-num)",fontSize:13,letterSpacing:1.5,textTransform:"uppercase",cursor:"pointer"}}>
            {shareCopied?s.shareCopied:(lang==="sv"?"⇗ Kopiera länk":"⇗ Copy link")}
          </button>
          {/* Auth controls */}
          {!authLoading && (user ? (
            <>
              <button onClick={()=>setShowMyProj(true)} style={{padding:"9px 14px",minHeight:36,borderRadius:"var(--r)",background:"rgba(77,159,255,0.1)",border:"1px solid #4D9FFF",color:"#4D9FFF",
                fontFamily:"var(--ff-num)",fontSize:13,letterSpacing:1,textTransform:"uppercase",cursor:"pointer"}}>
                {"\u25A4"} {s.loginMyProjects}
              </button>
              <button onClick={signOut} title={s.loginSignedIn+": "+user.email}
                style={{padding:"4px 10px",background:"transparent",border:"1px solid #1C2E4A",color:"#4A6580",
                fontFamily:"var(--ff-num)",fontSize:13,letterSpacing:1,textTransform:"uppercase",cursor:"pointer"}}>
                {s.loginLogout}
              </button>
            </>
          ) : (
            <button onClick={()=>{setLoginReqFor(null);setShowLogin(true);}} style={{padding:"9px 14px",minHeight:36,borderRadius:"var(--r)",background:"rgba(0,224,118,0.08)",border:"1px solid rgba(0,224,118,0.4)",color:"#00E076",
              fontFamily:"var(--ff-num)",fontSize:13,letterSpacing:1.5,textTransform:"uppercase",cursor:"pointer",fontWeight:700}}>
              {"\u26BF"} {s.loginBtn}
            </button>
          ))}
                    <button onClick={()=>{if(!user&&SB_READY){setLoginReqFor(s.loginRequiredSub);setShowLogin(true);return;}setExportMode("comparison");setShowExport(true);}} style={{padding:"9px 14px",minHeight:36,borderRadius:"var(--r)",background:"rgba(245,166,35,0.08)",border:"1px solid #F5A623",color:"#F5A623",
            fontFamily:"var(--ff-num)",fontSize:13,letterSpacing:1.5,textTransform:"uppercase",cursor:"pointer"}}>
            ≡ {s.exportCmp}
          </button>
          <button onClick={()=>{if(!user&&SB_READY){setLoginReqFor(s.loginRequiredSub);setShowLogin(true);return;}setExportMode("single");setShowExport(true);}} style={{padding:"9px 14px",minHeight:36,borderRadius:"var(--r)",background:"rgba(0,224,118,0.1)",border:"1px solid #00E076",color:"#00E076",
            fontFamily:"var(--ff-num)",fontSize:13,letterSpacing:1.5,textTransform:"uppercase",cursor:"pointer"}}>
            ↓ {s.exportPdf}
          </button>
        </div>
      </div>

      <div className="shell" style={{display:"grid",gridTemplateColumns:mode==="advanced"?"320px 1fr":"1fr"}}>

        {/* SIDEBAR */}
        {mode==="advanced"&&(
        <div className={"sidebar-panel"+(sheetOpen?" open":"")} style={{borderRight:"1px solid var(--bg3)",overflowY:"auto",
          background:"var(--bg1)",maxHeight:"calc(100vh - 50px)",position:"sticky",top:50}}>
          <SHdr label={s.sysConf}/>
          <Slide label={s.sysSize} value={p.mw} min={1} max={200} step={1} onChange={set("mw")}/>
          <div style={{padding:"10px 15px",borderBottom:"1px solid #1C2E4A"}}>
            <div style={{fontFamily:"var(--ff-num)",fontSize:13,color:"#4A6580",textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>{s.dur}</div>
            <Tog value={String(p.hrs)} onChange={v=>{const h=Number(v);sd("hrs",h);sd("capex",suggestCapex(h,activeTab==="hybrid"));}}
              options={[{value:"2",label:"2h"},{value:"3",label:"3h"},{value:"4",label:"4h"}]} small/>
            <div style={{fontFamily:"var(--ff-num)",fontSize:12,color:"#253A55",marginTop:6,lineHeight:1.6}}>
              <div style={{color:p.hrs===2?"#8AACCA":"#253A55"}}>{s.dur2hint}</div>
              <div style={{color:p.hrs===3?"#00E076":"#253A55"}}>{s.dur3hint}</div>
              <div style={{color:p.hrs>=4?"#00E076":"#253A55"}}>{s.dur4hint}</div>
            </div>
          </div>
          <Slide label={s.capex}   value={p.capex}  min={1000} max={8000} step={100} onChange={set("capex")}
            hint={`Total: ${fM(capSEK,lang)} (${p.mw}MW×${p.hrs}h×1000×${p.capex} SEK/kWh)`}/>
          <Slide label={s.omLabel} value={p.omPct}  min={0.5}  max={5}    step={0.1} onChange={set("omPct")}/>
          <Slide label={s.rte}     value={p.rte}    min={75}   max={97}   step={1}   onChange={set("rte")}/>
          <Slide label={s.availLabel} value={p.avail??98} min={85} max={100} step={0.5} onChange={set("avail")} hint={s.availHint}/>
          <Slide label={s.cpd}     value={p.cpd}    min={0.5}  max={2}    step={0.1} onChange={set("cpd")}
            hint={`${s.cycleHint} · ${s.degHint}`}/>
          <div style={{padding:"9px 15px",borderBottom:"1px solid #1C2E4A"}}>
            <div style={{background:"#0A1628",border:"1px solid #1C2E4A",padding:"8px 11px",fontFamily:"var(--ff-num)",fontSize:14}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <span style={{color:"#4A6580"}}>{s.totalCapex}</span>
                <span style={{color:"#F5A623"}}>{fM(capSEK,lang)}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{color:"#4A6580"}}>{s.omYr1}</span>
                <span style={{color:"#4D9FFF"}}>{fM(omBasePerYear,lang)}</span>
              </div>
            </div>
          </div>
          <SHdr label={s.finStr}/>
          <div style={{padding:"9px 15px",borderBottom:"1px solid #1C2E4A"}}>
            <div style={{fontFamily:"var(--ff-num)",fontSize:13,color:"#4A6580",textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>{s.finType}</div>
            <Tog value={p.finType} onChange={v=>sd("finType",v)}
              options={[{value:"equity",label:s.eqLabel},{value:"mixed",label:s.mixLabel},{value:"debt",label:s.dbtLabel}]} small/>
          </div>
          {p.finType==="mixed"&&<Slide label={s.debtR} value={p.debtR} min={10} max={80} step={5} onChange={set("debtR")}/>}
          {p.finType!=="equity"&&<>
            <Slide label={s.intR}  value={p.intR}  min={2}  max={10} step={0.25} onChange={set("intR")}/>
            <Slide label={s.loanT} value={p.loanT} min={3}  max={15} step={1}    onChange={set("loanT")}/>
          </>}
          <Slide label={s.wacc} value={p.disc} min={1} max={20} step={0.5} onChange={set("disc")}/>
          <div style={{padding:"9px 15px",borderBottom:"1px solid #1C2E4A"}}>
            <div style={{fontFamily:"var(--ff-num)",fontSize:13,color:"#4A6580",textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>{s.taxInc}</div>
            <Tog value={p.inclTax?"yes":"no"} onChange={v=>sd("inclTax",v==="yes")}
              options={[{value:"no",label:s.taxOff},{value:"yes",label:s.taxOn}]} small/>
          </div>
          {p.inclTax&&<Slide label={s.taxRate} value={p.taxR} min={0} max={30} step={0.1} onChange={set("taxR")}/>}
          <SHdr label={s.dsoSec}/>
          <Slide label={s.powerUtil} value={p.powerUtil??90} min={10} max={100} step={5}
            onChange={set("powerUtil")} hint={s.powerUtilHint}/>
          <SlideSteps label={s.dsoFixed} value={p.dsoFixedAnnual??0} values={GRID_FEE_STEPS}
            onChange={set("dsoFixedAnnual")} hint={s.dsoFixedHint}/>
          <Slide label={s.dsoCons}  value={p.dsoCons}       min={0}   max={1500}   step={10}   onChange={set("dsoCons")}/>
          <Slide label={s.peakTariff} value={p.peakTariff||0} min={0} max={300} step={5} onChange={set("peakTariff")}
            hint={s.peakTariffHint}/>
          <Slide label={s.dsoProd}  value={p.dsoProd}       min={0}   max={1500}   step={10}   onChange={set("dsoProd")}/>
          <Slide label={s.dsoTrans} value={p.dsoTrans}      min={0}   max={30}     step={0.5}  onChange={set("dsoTrans")}/>
          <Slide label={s.dsoGain}  value={p.dsoGain}       min={0}   max={20}     step={0.5}  onChange={set("dsoGain")}/>
          <Slide label={s.landLease} value={p.landLease||0} min={0} max={500000} step={5000} onChange={set("landLease")}
            hint={s.landLeaseHint}/>
          <div style={{padding:"9px 15px",borderBottom:"1px solid #1C2E4A"}}>
            <div style={{fontFamily:"var(--ff-num)",fontSize:12,color:"#253A55",lineHeight:1.7}}>
              <span style={{color:"#F5A623"}}>⚙ </span>{s.brpNote}
            </div>
          </div>
          <SHdr label={s.scnSec}/>
          <div style={{padding:"9px 15px",borderBottom:"1px solid #1C2E4A"}}>
            <Tog value={p.scn} onChange={v=>sd("scn",v)} options={scOpts} small/>
            <div style={{fontFamily:"var(--ff-num)",fontSize:12,color:"#253A55",marginTop:8,lineHeight:1.8}}>
              {s.scnInfo.map((h,i)=><div key={i}>{h}</div>)}
            </div>
          </div>
          <button onClick={handleReset} style={{margin:"12px 15px",padding:"7px",
            background:"transparent",border:"1px solid #1C2E4A",color:"#4A6580",
            fontFamily:"var(--ff-num)",fontSize:13,letterSpacing:1.5,textTransform:"uppercase",
            cursor:"pointer",width:"calc(100% - 30px)"}}>↺ {s.reset}</button>
        </div>
        )}

        {/* RIGHT PANEL */}
        <div>
          {mode==="basic"&&(
          <div style={{padding:"16px 22px",borderBottom:"1px solid #1C2E4A",background:"#080F1C"}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(155px,1fr))",gap:15,marginBottom:15}}>
              {[
                {label:s.sysSize,  k:"mw",       min:1,   max:200,  step:1},
                {label:s.capex,    k:"capex",     min:1000,max:8000, step:100},
                {label:lang==="sv"?"Tillgänglighet (%)":"Availability (%)",k:"avail",min:85,max:100,step:0.5},
              ].map(f=>(
                <div key={f.k}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:5,
                    fontFamily:"var(--ff-num)",fontSize:12,color:"#4A6580",textTransform:"uppercase",letterSpacing:1}}>
                    <span>{f.label}</span><span style={{color:"#00E076"}}>{p[f.k]}</span>
                  </div>
                  <input type="range" min={f.min} max={f.max} step={f.step} value={p[f.k]}
                    onChange={e=>sd(f.k,Number(e.target.value))}/>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:13,flexWrap:"wrap",alignItems:"flex-end"}}>
              <div>
                <div style={{fontFamily:"var(--ff-num)",fontSize:12,color:"#4A6580",textTransform:"uppercase",letterSpacing:1,marginBottom:5}}>{s.dur}</div>
                <Tog value={String(p.hrs)}
                  onChange={v=>{const h=Number(v);sd("hrs",h);sd("capex",suggestCapex(h,activeTab==="hybrid"));}}
                  options={[
                    {value:"2",label:"2h -- 3 200 SEK/kWh"},
                    {value:"3",label:"3h -- 3 000 SEK/kWh +15%"},
                    {value:"4",label:"4h -- 2 800 SEK/kWh +30%"},
                  ]} small/>
              </div>
              {[
                {label:s.scnSec,  k:"scn",     opts:scOpts},
                {label:s.finType, k:"finType", opts:[{value:"equity",label:s.eqLabel},{value:"mixed",label:s.mixLabel},{value:"debt",label:s.dbtLabel}]},
              ].map(f=>(
                <div key={f.k}>
                  <div style={{fontFamily:"var(--ff-num)",fontSize:12,color:"#4A6580",textTransform:"uppercase",letterSpacing:1,marginBottom:5}}>{f.label}</div>
                  <Tog value={f.bool?(p[f.k]?"yes":"no"):p[f.k]}
                    onChange={v=>sd(f.k,f.bool?v==="yes":v)} options={f.opts} small/>
                </div>
              ))}
            </div>
          </div>
          )}

          {activeTab==="bess" && res && <FinSummary res={res} p={p} s={s} lang={lang} mode={mode}/>}
          {res && p.hrs === 3 && (
            <div style={{padding:"11px var(--gut)",background:"rgba(90,169,255,0.07)",
              borderBottom:"1px solid rgba(90,169,255,0.25)",fontFamily:"var(--ff-ui)",
              fontSize:"var(--fs-body)",color:"var(--info)",lineHeight:1.7}}>
              ◆ {lang==="sv"
                ? "3h ligger nära de 2,5h-system GreenVoltis driver idag. Driftserfarenheten från Skynet visar att 2,5h är väl dimensionerat för den här marknaden — tillräckligt med energi för mFRR dygnet runt utan att betala för kapacitet som inte utnyttjas."
                : "3h sits close to the 2.5h systems GreenVoltis operates today. Operating experience from Skynet shows 2.5h is well dimensioned for this market — enough energy for round-the-clock mFRR without paying for capacity that goes unused."}
            </div>
          )}
          {res && p.hrs >= 4 && (
            <div style={{padding:"11px var(--gut)",background:"rgba(245,166,35,0.08)",
              borderBottom:"1px solid rgba(245,166,35,0.3)",fontFamily:"var(--ff-ui)",
              fontSize:"var(--fs-body)",color:"var(--warn)",lineHeight:1.7}}>
              ⚠ {lang==="sv"
                ? `${p.hrs}h saknar skarp referens — Revenue Intelligence mäter 1h och 2h, så längre uthållighet är en modellerad extrapolation och bör läsas som en indikation. GreenVoltis rekommenderar 2,5h-system upp till omkring 5–10 MW.`
                : `${p.hrs}h has no live benchmark — Revenue Intelligence measures 1h and 2h, so longer duration is a modelled extrapolation and should be read as an indication. GreenVoltis recommends 2.5h systems up to roughly 5–10 MW.`}
            </div>
          )}
          {res && riMeta && (
            <div onClick={()=>setShowRi(true)} style={{padding:"7px 22px",background:"rgba(0,224,118,0.05)",
              borderBottom:"1px solid var(--bg3)",fontFamily:"var(--ff-num)",fontSize:13,color:"var(--tx2)",
              cursor:"pointer",display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <span style={{color:"var(--acc)"}}>◆</span>
              <span>{lang==="sv"
                ? `Startårets intäkt är kalibrerad på GreenVoltis Multi-Market Optimization — digital tvilling mot faktisk marknadsdata i ${p.area}, ${riMeta.monthCount} månader, i årstakt.`
                : `Year-1 revenue is calibrated on GreenVoltis Multi-Market Optimization — digital twin against actual ${p.area} market data, ${riMeta.monthCount} months, annualised.`}</span>
              <span style={{color:"var(--acc)",textDecoration:"underline"}}>{lang==="sv"?"Visa underlag":"View evidence"}</span>
            </div>
          )}
          {/* ── Warnings ── */}
          {activeTab==="bess" && res && (()=>{
            const dscrWarn = p.finType!=="equity" && res.avgDSCR!=null && res.avgDSCR < 1.0;
            const pbWarn   = !res.pb;
            if (!dscrWarn && !pbWarn) return null;
            return (
              <div style={{padding:"11px var(--gut)",background:"rgba(255,92,120,0.08)",
                borderBottom:"1px solid rgba(255,92,120,0.3)"}}>
                {dscrWarn && <div style={{fontFamily:"var(--ff-ui)",fontSize:"var(--fs-body)",color:"var(--err)",lineHeight:1.7,marginBottom:pbWarn?8:0}}>{s.warnDSCR}</div>}
                {pbWarn   && <div style={{fontFamily:"var(--ff-ui)",fontSize:"var(--fs-body)",color:"var(--warn)",lineHeight:1.7}}>{s.warnPB}</div>}
              </div>
            );
          })()}

          {activeTab==="bess" && <div className="kpi-strip" style={{display:"flex",flexWrap:"wrap",borderBottom:"1px solid var(--bg3)",background:"var(--bg1)"}}>
            {[
              {label:s.dsoN,    val:fK(dsoNet,lang),                                c:"#FF4D6A"},
              {label:lang==="sv"?"BRP/Optim år1":"BRP/Optim yr1", val:fK(yr1.brp*1000,lang), c:"#A06FD8"},
              {label:s.thrN,    val:`${Math.round(mwhTrd).toLocaleString(lc)} MWh`, c:"#4D9FFF"},
              {label:s.lssN,    val:`${Math.round(mwhLoss).toLocaleString(lc)} MWh`,c:"#4A6580"},
              {label:lang==="sv"?"Tillgänglighet":"Availability", val:`${p.avail??98}%`, c:"#4D9FFF"},
              {label:lang==="sv"?"Debiterad effekt":"Billed power", val:`${p.powerUtil??90}%`, c:"var(--info)"},
            ].map((item,i)=>(
              <div key={i} style={{flex:1,minWidth:100,padding:"9px 13px",borderRight:"1px solid #1C2E4A"}}>
                <div style={{fontFamily:"var(--ff-num)",fontSize:12,color:"#4A6580",textTransform:"uppercase",letterSpacing:1,marginBottom:3}}>{item.label}</div>
                <div style={{fontFamily:"var(--ff-num)",fontSize:15,fontWeight:700,color:item.c}}>{item.val}</div>
              </div>
            ))}
          </div>

          }
          {activeTab==="bess" && res && showOpex && <OpexPanel ob={opexBreak} s={s} lang={lang}/>}

          {activeTab==="bess" && <>
            <div style={{display:"grid",gridTemplateColumns:"1fr"}}>

              {/* What the owner gets back, cumulatively */}
              <Panel title={s.cCF} full>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={rows} margin={{left:-6,right:8,top:6}}>
                    <defs>
                      <linearGradient id="cfG" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="var(--acc)" stopOpacity={0.28}/>
                        <stop offset="95%" stopColor="var(--acc)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--bg3)"/>
                    <XAxis dataKey="year" tick={{fill:"var(--tx2)",fontSize:13,fontFamily:"var(--ff-num)"}}/>
                    <YAxis tick={{fill:"var(--tx2)",fontSize:13,fontFamily:"var(--ff-num)"}} tickFormatter={v=>dispK(v,lang)}/>
                    <Tooltip content={<Tip/>}/>
                    <ReferenceLine y={0} stroke="var(--err)" strokeDasharray="4 4"/>
                    {showMS&&pb&&<ReferenceLine x={pb} stroke="var(--warn)" strokeWidth={1.5} strokeDasharray="5 3"
                      label={{value:`${s.msPayback} ${pb}`,fill:"var(--warn)",fontSize:12,fontFamily:"var(--ff-ui)",position:"insideTopLeft"}}/>}
                    <Area type="monotone" dataKey="ccf" name={s.cumLeg} stroke="var(--acc)" fill="url(#cfG)" strokeWidth={2.5} dot={false}/>
                  </AreaChart>
                </ResponsiveContainer>
              </Panel>

              {/* What it earns each year, and how much of that survives costs */}
              <Panel title={lang==="sv"?"Årlig intäkt — behållet vs kostnader":"Annual revenue — retained vs costs"} full>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={rows.map(r=>({...r, cost: Math.max(0,(r.rev||0)-(r.ebi||0))}))} margin={{left:-6,right:8,top:6}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--bg3)"/>
                    <XAxis dataKey="year" tick={{fill:"var(--tx2)",fontSize:13,fontFamily:"var(--ff-num)"}}/>
                    <YAxis tick={{fill:"var(--tx2)",fontSize:13,fontFamily:"var(--ff-num)"}} tickFormatter={v=>dispK(v,lang)}/>
                    <Tooltip content={<Tip/>}/>
                    <Legend wrapperStyle={{fontFamily:"var(--ff-ui)",fontSize:13,color:"var(--tx2)",paddingTop:8}}/>
                    <Bar dataKey="ebi"  name={lang==="sv"?"EBITDA (behållet)":"EBITDA (retained)"} stackId="a" fill="var(--acc)"/>
                    <Bar dataKey="cost" name={lang==="sv"?"Rörliga kostnader & avgifter":"Operating costs & fees"} stackId="a" fill="rgba(149,178,206,0.28)"/>
                  </BarChart>
                </ResponsiveContainer>
                <div style={{fontFamily:"var(--ff-ui)",fontSize:"var(--fs-cap)",color:"var(--tx3)",marginTop:10,lineHeight:1.7}}>
                  {lang==="sv"
                    ? "Stapelns totalhöjd är bruttointäkten. Den gröna delen är vad som återstår efter BRP-avgift, O&M, nätavgifter och arrende — alltså EBITDA, före finansiering och skatt."
                    : "Total bar height is gross revenue. The green portion is what remains after the BRP fee, O&M, grid charges and land lease — that is EBITDA, before financing and tax."}
                </div>
              </Panel>
            </div>

            {/* Secondary analysis stays one click away */}
            <div className="chart-tabs" style={{display:"flex",gap:4,padding:"0 var(--gut)",
              borderTop:"1px solid var(--bg3)",borderBottom:"1px solid var(--bg3)",overflowX:"auto"}}>
              {[["none",lang==="sv"?"Dölj":"Hide"],["scn",s.cScn],["eb",s.cEB]].map(([k,lbl])=>(
                <button key={k} onClick={()=>setChartTab(k)} style={{
                  padding:"12px 16px",background:"transparent",border:"none",
                  borderBottom:`2px solid ${chartTab===k?"var(--acc)":"transparent"}`,
                  color:chartTab===k?"var(--acc)":"var(--tx2)",fontFamily:"var(--ff-ui)",
                  fontSize:"var(--fs-cap)",fontWeight:600,letterSpacing:"0.04em",
                  textTransform:"uppercase",cursor:"pointer",whiteSpace:"nowrap"}}>
                  {String(lbl).split("—")[0].trim()}
                </button>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr"}}>
            {chartTab==="scn" && <Panel title={s.cScn} full>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart margin={{left:-6,right:8,top:6}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--bg3)"/>
                  <XAxis dataKey="year" type="number" domain={[1,15]}
                    tick={{fill:"var(--tx2)",fontSize:13,fontFamily:"var(--ff-num)"}} allowDuplicatedCategory={false}/>
                  <YAxis tick={{fill:"var(--tx2)",fontSize:13,fontFamily:"var(--ff-num)"}} tickFormatter={v=>dispK(v,lang)}/>
                  <Tooltip content={<Tip/>}/>
                  <Legend wrapperStyle={{fontFamily:"var(--ff-ui)",fontSize:13,color:"var(--tx2)",paddingTop:8}}/>
                  {["conservative","base","optimistic"].map((sc,i)=>{
                    const d=(stdScnData[sc]||[]).map(r=>({year:r.year,total:r.rev-r.brp}));
                    return <Line key={sc} data={d} type="monotone" dataKey="total"
                      name={[s.cons,s.base,s.opti][i]}
                      stroke={["var(--info)","var(--acc)","var(--warn)"][i]}
                      strokeWidth={p.scn===sc?2.5:1.2} strokeDasharray={p.scn===sc?"0":"5 3"} dot={false}/>;
                  })}
                </LineChart>
              </ResponsiveContainer>
            </Panel>}
            {chartTab==="eb" && <Panel title={s.cEB} full>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={rows} margin={{left:-6,right:8,top:6}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--bg3)"/>
                  <XAxis dataKey="year" tick={{fill:"var(--tx2)",fontSize:13,fontFamily:"var(--ff-num)"}}/>
                  <YAxis tick={{fill:"var(--tx2)",fontSize:13,fontFamily:"var(--ff-num)"}} tickFormatter={v=>dispK(v,lang)}/>
                  <Tooltip content={<Tip/>}/>
                  <Legend wrapperStyle={{fontFamily:"var(--ff-ui)",fontSize:13,color:"var(--tx2)",paddingTop:8}}/>
                  <Bar dataKey="ebi" name={s.ebiLeg} fill="var(--info)" opacity={0.65}/>
                  <Line type="monotone" dataKey="ncf" name={s.nfLeg} stroke="var(--acc)" strokeWidth={2.5} dot={false}/>
                </ComposedChart>
              </ResponsiveContainer>
            </Panel>}
            </div>
          </>

          }

            {activeTab==="bess" && (
              <div style={{padding:"0 var(--gut) 20px"}}>
                <button onClick={()=>setShowTable(v=>!v)} style={{width:"100%",padding:"14px",
                  background:"transparent",border:"1px dashed var(--bg3)",borderRadius:"var(--r)",
                  color:"var(--tx2)",fontFamily:"var(--ff-ui)",fontSize:"var(--fs-body)",fontWeight:600,
                  letterSpacing:"0.03em",cursor:"pointer"}}>
                  {showTable ? (lang==="sv"?"Dölj 15-årstabellen":"Hide 15-year detail")
                             : (lang==="sv"?"Visa 15-årstabellen":"Show 15-year detail")}
                </button>
              </div>
            )}
            {showTable && <Panel title={s.tTitle} full>
              <div className="tbl-wrap" style={{overflowX:"auto"}}>
                <table>
                  <thead>
                    <tr>
                      <th>{s.cYr}</th><th>{s.cMmo}</th><th>{s.cRvT}</th>
                      <th>{s.cBRP}</th><th>{s.cOM}</th><th style={{color:"#A06FD8"}}>{lang==="sv"?"Arrende":"Land Lease"}</th><th>{s.cDSO}</th>
                      <th>{s.cEBI}</th>
                      {p.inclTax&&<th>{s.cTAX}</th>}
                      {p.finType!=="equity"&&<th>{s.cDBT}</th>}
                      <th>{s.cNCF}</th><th>{s.cCCF}</th><th>{s.cDEG}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r=>(
                      <tr key={r.year} style={{
                        borderTop:r.year===11?"2px solid #253A55":undefined,
                        background:(showMS&&(r.year===pb||r.year===msSoH80||r.year===msLoanEnd))
                          ?"rgba(245,166,35,0.04)":undefined
                      }}>
                        <td className="a">{r.year}</td>
                        <td>{dispK(r.mmo,lang).toLocaleString(lc)}</td>
                        <td className="g">{dispK(r.rev,lang).toLocaleString(lc)}</td>
                        <td className="r">({dispK(r.brp,lang).toLocaleString(lc)})</td>
                        <td className="r">({dispK(r.om,lang).toLocaleString(lc)})</td>
                        <td className="r">{r.ll>0?"("+dispK(r.ll,lang).toLocaleString(lc)+")":"—"}</td>
                        <td className="r">({dispK(r.dso,lang).toLocaleString(lc)})</td>
                        <td className={r.ebi>=0?"g":"r"}>{dispK(r.ebi,lang).toLocaleString(lc)}</td>
                        {p.inclTax&&<td className="r">{r.tax>0?`(${dispK(r.tax,lang).toLocaleString(lc)})`:"—"}</td>}
                        {p.finType!=="equity"&&<td className="r">{r.dbt>0?`(${dispK(r.dbt,lang).toLocaleString(lc)})`:"—"}</td>}
                        <td className={r.ncf>=0?"g":"r"}>{dispK(r.ncf,lang).toLocaleString(lc)}</td>
                        <td className={r.ccf>=0?"g":"r"}>{dispK(r.ccf,lang).toLocaleString(lc)}</td>
                        <td className="dm">{r.dg}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>}
          {activeTab==="bess" && showMS && (
            <div style={{borderTop:"1px solid #1C2E4A",padding:"8px 22px",background:"#060D1A",
              display:"flex",gap:20,alignItems:"center",flexWrap:"wrap"}}>
              <span style={{fontFamily:"var(--ff-num)",fontSize:13,color:"#4A6580",letterSpacing:1,textTransform:"uppercase"}}>◈ Milestones:</span>
              {pb&&<span style={{fontFamily:"var(--ff-num)",fontSize:13,color:"#F5A623"}}>◈ {s.msPayback}: yr{pb}</span>}
              {msSoH80&&<span style={{fontFamily:"var(--ff-num)",fontSize:13,color:"#4D9FFF"}}>◈ {s.msSoH80}: yr{msSoH80}</span>}
              {msSoH70&&<span style={{fontFamily:"var(--ff-num)",fontSize:13,color:"#4D9FFF",opacity:0.7}}>◈ {s.msSoH70}: yr{msSoH70}</span>}
              {msLoanEnd&&<span style={{fontFamily:"var(--ff-num)",fontSize:13,color:"#A06FD8"}}>◈ {s.msLoanEnd}: yr{msLoanEnd}</span>}
              {!msSoH80&&<span style={{fontFamily:"var(--ff-num)",fontSize:13,color:"#4A6580"}}>SoH {'>'} 80% over 15yr</span>}
            </div>
          )}

          {activeTab==="hybrid" && hybRes && (
          <div>
            <div style={{padding:"8px 22px",background:"#060D1A",borderBottom:"1px solid #1C2E4A",
              fontFamily:"var(--ff-num)",fontSize:12,color:"#4A6580",letterSpacing:2,textTransform:"uppercase"}}>
              {s.hybSub}
            </div>

            {/* Config — grouped into cards so rows stop reflowing */}
            <div style={{padding:"20px var(--gut)",borderBottom:"1px solid var(--bg3)",background:"var(--bg1)"}}>
              <div className="hyb-cards" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",
                gap:16,alignItems:"start"}}>

                {/* ── The plant ── */}
                <div style={{border:"1px solid var(--bg3)",borderRadius:"var(--r)",padding:"16px 18px",background:"var(--bg2)"}}>
                  <div style={{fontFamily:"var(--ff-ui)",fontSize:"var(--fs-cap)",fontWeight:700,letterSpacing:"0.07em",
                    textTransform:"uppercase",color:"var(--acc)",marginBottom:14}}>
                    {lang==="sv"?"1 · Produktionsanläggningen":"1 · The plant"}
                  </div>

                  <div style={{marginBottom:16}}>
                    <div style={{fontFamily:"var(--ff-ui)",fontSize:"var(--fs-cap)",fontWeight:600,color:"var(--tx2)",
                      textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:7}}>{s.hybRenType}</div>
                    <div style={{display:"flex"}}>
                      {[["wind",s.hybWind],["solar",s.hybSolar]].map(([v,lbl])=>(
                        <button key={v} onClick={()=>{ sdH("renType",v); sd("mw",suggestHybBESS(hyb.renMW,v,p.hrs));
                          sdH("curtPrice",v==="solar"?150:300); sdH("shiftPrice",v==="solar"?850:600); }} style={{
                          flex:1,padding:"10px 0",minHeight:38,fontFamily:"var(--ff-ui)",fontSize:"var(--fs-body)",
                          fontWeight:600,cursor:"pointer",
                          background:hyb.renType===v?"rgba(0,224,118,0.12)":"transparent",
                          border:"1px solid "+(hyb.renType===v?"var(--acc)":"var(--bg3)"),
                          borderRight:v==="wind"?"none":undefined,
                          color:hyb.renType===v?"var(--acc)":"var(--tx2)",
                        }}>{lbl}</button>
                      ))}
                    </div>
                  </div>

                  <div style={{marginBottom:16}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,fontFamily:"var(--ff-ui)",
                      fontSize:"var(--fs-cap)",fontWeight:600,color:"var(--tx2)",textTransform:"uppercase",letterSpacing:"0.06em"}}>
                      <span>{s.hybRenMW}</span><span className="num" style={{color:"var(--acc)"}}>{hyb.renMW} MW</span>
                    </div>
                    <input type="range" min={1} max={500} step={1} value={hyb.renMW}
                      onChange={e=>{ const v=Number(e.target.value); sdH("renMW",v);
                        if((hyb.gridMW??0)>v||!hyb.gridMW) sdH("gridMW",v); sd("mw",suggestHybBESS(v,hyb.renType,p.hrs)); }}/>
                    <div style={{fontFamily:"var(--ff-ui)",fontSize:"var(--fs-cap)",color:"var(--tx3)",marginTop:6}}>
                      {s.hybSuggest}: <span style={{color:"var(--warn)"}}>{suggestHybBESS(hyb.renMW,hyb.renType,p.hrs)} MW / {p.hrs}h</span>
                      {" "}<button onClick={()=>sd("mw",suggestHybBESS(hyb.renMW,hyb.renType,p.hrs))} style={{
                        background:"rgba(245,166,35,0.12)",border:"1px solid var(--warn)",color:"var(--warn)",
                        borderRadius:4,fontFamily:"var(--ff-ui)",fontSize:"var(--fs-cap)",fontWeight:600,
                        padding:"3px 9px",cursor:"pointer",marginLeft:4}}>{s.hybSuggestBtn}</button>
                    </div>
                  </div>

                  <div>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,fontFamily:"var(--ff-ui)",
                      fontSize:"var(--fs-cap)",fontWeight:600,color:"var(--tx2)",textTransform:"uppercase",letterSpacing:"0.06em"}}>
                      <span>{s.hybGridMW}</span><span className="num" style={{color:"var(--info)"}}>{hyb.gridMW??hyb.renMW} MW</span>
                    </div>
                    <input type="range" min={1} max={500} step={1} value={hyb.gridMW??hyb.renMW}
                      onChange={e=>sdH("gridMW",Number(e.target.value))}/>
                    <div style={{fontFamily:"var(--ff-ui)",fontSize:"var(--fs-cap)",color:"var(--tx3)",marginTop:6,lineHeight:1.6}}>
                      {s.hybGridMWHint}
                    </div>
                  </div>
                </div>

                {/* ── Price shifting, with the arithmetic shown ── */}
                <div style={{border:"1px solid rgba(255,107,107,0.35)",borderRadius:"var(--r)",padding:"16px 18px",background:"var(--bg2)"}}>
                  <div style={{fontFamily:"var(--ff-ui)",fontSize:"var(--fs-cap)",fontWeight:700,letterSpacing:"0.07em",
                    textTransform:"uppercase",color:"#FF6B6B",marginBottom:6}}>
                    {lang==="sv"?"2 · Prisförflyttning":"2 · Price shifting"}
                  </div>
                  <div style={{fontFamily:"var(--ff-ui)",fontSize:"var(--fs-cap)",color:"var(--tx3)",lineHeight:1.65,marginBottom:14}}>
                    {lang==="sv"
                      ? "El som annars hade curtailats eller sålts billigt lagras och säljs när priset är högre. Skillnaden mellan de två priserna är vad batteriet tjänar på varje flyttad MWh."
                      : "Energy that would otherwise be curtailed or sold cheap is stored and sold when the price is higher. The gap between the two prices is what the battery earns on every MWh it moves."}
                  </div>

                  {[[s.hybCurtPct||(lang==="sv"?"Curtailment av produktion (%)":"Curtailment of production (%)"),
                     hyb.curtPct||0,"curtPct",0,25,0.5,"%","var(--warn)"],
                    [lang==="sv"?"Pris vid curtailment (SEK/MWh)":"Price at curtailment (SEK/MWh)",
                     hyb.curtPrice||0,"curtPrice",-200,400,10,"","var(--err)"],
                    [lang==="sv"?"Pris efter förflyttning (SEK/MWh)":"Price after shifting (SEK/MWh)",
                     hyb.shiftPrice||0,"shiftPrice",200,2000,25,"","var(--acc)"],
                  ].map(([lbl,val,key,mn,mx,st,suf,col])=>(
                    <div key={key} style={{marginBottom:12}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:5,fontFamily:"var(--ff-ui)",
                        fontSize:"var(--fs-cap)",fontWeight:600,color:"var(--tx2)",textTransform:"uppercase",letterSpacing:"0.06em"}}>
                        <span>{lbl}</span><span className="num" style={{color:col}}>{val}{suf}</span>
                      </div>
                      <input type="range" min={mn} max={mx} step={st} value={val}
                        onChange={e=>sdH(key,Number(e.target.value))}/>
                    </div>
                  ))}

                  {/* The calculation, worked through with live numbers */}
                  {hybRes && (
                    <div style={{marginTop:14,padding:"12px 14px",background:"rgba(255,107,107,0.07)",
                      border:"1px solid rgba(255,107,107,0.25)",borderRadius:"var(--r)",
                      fontFamily:"var(--ff-ui)",fontSize:"var(--fs-cap)",color:"var(--tx1)",lineHeight:1.9}}>
                      <div>{lang==="sv"?"Curtailas idag":"Curtailed today"}: <span className="num" style={{color:"var(--warn)"}}>{Math.round(hybRes.curtailedMWh||0).toLocaleString(lc)} MWh</span></div>
                      <div>{lang==="sv"?"Batteriet hinner ta":"Battery can absorb"}: <span className="num" style={{color:"var(--acc)"}}>{Math.round(hybRes.recoveredMWh||0).toLocaleString(lc)} MWh</span>
                        <span style={{color:"var(--tx3)"}}> ({Math.round((hybRes.recoveryFrac||0)*100)}%)</span></div>
                      <div>{lang==="sv"?"Prisskillnad":"Price gap"}: <span className="num" style={{color:"var(--acc)"}}>{Math.round(hybRes.priceSpread||0)} SEK/MWh</span></div>
                      <div style={{borderTop:"1px solid rgba(255,107,107,0.25)",marginTop:8,paddingTop:8,fontWeight:600}}>
                        = <span className="num" style={{color:"#FF6B6B",fontSize:"var(--fs-lg)"}}>
                          {Math.round((hybRes.rows?.[0]?.capt)||0).toLocaleString(lc)} KSEK/{lang==="sv"?"år":"yr"}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Everything else ── */}
                <div style={{border:"1px solid var(--bg3)",borderRadius:"var(--r)",padding:"16px 18px",background:"var(--bg2)"}}>
                  <div style={{fontFamily:"var(--ff-ui)",fontSize:"var(--fs-cap)",fontWeight:700,letterSpacing:"0.07em",
                    textTransform:"uppercase",color:"var(--info)",marginBottom:14}}>
                    {lang==="sv"?"3 · Övriga intäkter":"3 · Other revenue"}
                  </div>

                  <div style={{marginBottom:16}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,fontFamily:"var(--ff-ui)",
                      fontSize:"var(--fs-cap)",fontWeight:600,color:"var(--tx2)",textTransform:"uppercase",letterSpacing:"0.06em"}}>
                      <span>{s.hybImbal}</span><span className="num" style={{color:"#A06FD8"}}>{hyb.imbal} SEK/MWh</span>
                    </div>
                    <input type="range" min={0} max={200} step={5} value={hyb.imbal} onChange={e=>sdH("imbal",Number(e.target.value))}/>
                    <div style={{fontFamily:"var(--ff-ui)",fontSize:"var(--fs-cap)",color:"var(--tx3)",marginTop:6,lineHeight:1.6}}>{s.hybImbalHint}</div>
                  </div>

                  <label style={{display:"flex",alignItems:"flex-start",gap:10,cursor:"pointer",marginBottom:8}}>
                    <input type="checkbox" checked={hyb.downEnabled===true}
                      onChange={e=>sdH("downEnabled",e.target.checked)}
                      style={{width:18,height:18,marginTop:1,accentColor:"var(--warn)",cursor:"pointer",flexShrink:0}}/>
                    <span style={{fontFamily:"var(--ff-ui)",fontSize:"var(--fs-body)",fontWeight:600,
                      color:hyb.downEnabled===true?"var(--warn)":"var(--tx2)",lineHeight:1.4}}>{s.hybDownOn}</span>
                  </label>
                  <div style={{fontFamily:"var(--ff-ui)",fontSize:"var(--fs-cap)",color:"var(--tx3)",marginBottom:12,lineHeight:1.6}}>{s.hybDownOnHint}</div>
                  {hyb.downEnabled===true && (
                    <div style={{marginBottom:16}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:5,fontFamily:"var(--ff-ui)",
                        fontSize:"var(--fs-cap)",fontWeight:600,color:"var(--tx2)",textTransform:"uppercase",letterSpacing:"0.06em"}}>
                        <span>{s.hybDownPart}</span><span className="num" style={{color:"var(--warn)"}}>{hyb.downPart??40}%</span>
                      </div>
                      <input type="range" min={0} max={100} step={5} value={hyb.downPart??40}
                        onChange={e=>sdH("downPart",Number(e.target.value))}/>
                    </div>
                  )}

                  <div style={{borderTop:"1px solid var(--bg3)",paddingTop:14}}>
                    <div style={{fontFamily:"var(--ff-ui)",fontSize:"var(--fs-cap)",fontWeight:600,color:"var(--tx2)",
                      textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>{lang==="sv"?"Hybridscenario":"Hybrid scenario"}</div>
                    <Tog value={hyb.hybScn||"base"} onChange={v=>sdH("hybScn",v)}
                      options={[{value:"conservative",label:s.cons},{value:"base",label:s.base},{value:"optimistic",label:s.opti}]} small/>
                  </div>
                </div>

              </div>

              {/* KPI strip */}
              <div style={{display:"flex",flexWrap:"wrap",gap:0,border:"1px solid #1C2E4A"}}>
                {[
                  {label:lang==="sv"?"Fornybar produktion":"Renewable production", val:Math.round(hybRes.renMWh).toLocaleString(lc)+" MWh/yr", c:"#00E076"},
                  {label:lang==="sv"?"Curtailad el":"Curtailed energy", val:Math.round(hybRes.curtailedMWh||0).toLocaleString(lc)+" MWh/yr", c:"#F5A623"},
                  {label:lang==="sv"?"Prisspridning":"Price spread", val:Math.round(hybRes.priceSpread||0)+" SEK/MWh", c:"#FF6B6B"},
                  {label:lang==="sv"?"BESS-optimeringsandel":"BESS optimisation share", val:Math.round((hybRes.ancFrac||0)*100)+"%", c:"var(--info)"},
                  {label:lang==="sv"?"Curtailment totalt":"Curtailment total", val:Math.round(hybRes.curtailedMWh||0).toLocaleString(lc)+" MWh", c:"var(--warn)"},
                  {label:lang==="sv"?"Varav klippt av nätet":"Of which clipped", val:Math.round(hybRes.clippedMWh||0).toLocaleString(lc)+" MWh", c:"var(--warn)"},
                  {label:lang==="sv"?"Återvunnet":"Recovered", val:Math.round(hybRes.recoveredMWh||0).toLocaleString(lc)+" MWh · "+Math.round((hybRes.recoveryFrac||0)*100)+"%", c:"var(--acc)"},
                  {label:lang==="sv"?"Urladdningsfönster":"Discharge window", val:Math.round((hybRes.dischargeMWh||0)/Math.max(1,p.mw)/8760*100)+"% "+(lang==="sv"?"av årets timmar":"of annual hours"), c:"var(--info)"},
                  {label:lang==="sv"?"Begränsas av":"Limited by", val:{available:lang==="sv"?"tillgänglig energi":"available energy",cycling:lang==="sv"?"cyklingsbudget":"cycling budget",export_window:lang==="sv"?"exportfönster":"export window"}[hybRes.bindingLimit]||"—", c:"var(--err)"},
                  {label:lang==="sv"?"Obalansreduktion":"Imbalance reduction", val:Math.round((hybRes.imbalCover||0)*100)+"%", c:"var(--acc)"},
                  ...(hyb.downEnabled!==false ? [
                    {label:lang==="sv"?"Nedregleringsbud":"Down-reg bid", val:(hybRes.downMW||0).toFixed(1)+" MW · "+Math.round(hybRes.downHours||0)+" h", c:"var(--warn)"},
                    {label:lang==="sv"?"Andel av potential":"Share of potential", val:Math.round((hybRes.downShare||0)*100)+"%", c:"var(--warn)"},
                    {label:lang==="sv"?"Nedregleringsprodukt":"Down-reg product", val:(hybRes.downProduct||"—")+" · "+(hybRes.downPrice||0).toFixed(2)+" EUR/MW/h", c:"var(--warn)"},
                  ] : []),
                  {label:"IRR (hybrid)", val:hybRes.irr!=null?hybRes.irr.toFixed(1)+"%":"N/A", c:"#00E076"},
                  {label:"NPV (hybrid)", val:Math.round(hybRes.npv/1e6).toLocaleString(lc)+" MSEK", c:"#4D9FFF"},
                  {label:lang==="sv"?"Återbetalningstid":"Payback", val:hybPb?"yr "+hybPb:">15yr", c:"#F5A623"},
                ].map((k,i)=>(
                  <div key={i} style={{flex:1,minWidth:120,padding:"8px 13px",borderRight:"1px solid #1C2E4A"}}>
                    <div style={{fontFamily:"var(--ff-num)",fontSize:12,color:"#4A6580",textTransform:"uppercase",letterSpacing:1,marginBottom:3}}>{k.label}</div>
                    <div style={{fontFamily:"var(--ff-num)",fontSize:16,fontWeight:700,color:k.c}}>{k.val}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Charts */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr"}}>
              <Panel title={s.hybChartRev}>
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart data={hybRows} margin={{left:-15,right:4,top:4}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--bg3)"/>
                    <XAxis dataKey="year" tick={{fill:"#8AACCA",fontSize:14,fontFamily:"var(--ff-num)"}}/>
                    <YAxis tick={{fill:"#8AACCA",fontSize:14,fontFamily:"var(--ff-num)"}} tickFormatter={v=>dispK(v,lang)}/>
                    <Tooltip content={<Tip/>}/>
                    <Legend wrapperStyle={{fontFamily:"var(--ff-num)",fontSize:13,color:"#4A6580"}}/>
                    <Bar dataKey="mmo"   name={s.hybRevMmo}   stackId="a" fill="#4D9FFF"/>
                    <Bar dataKey="imbal" name={s.hybRevImbal} stackId="a" fill="#A06FD8"/>
                    <Bar dataKey="capt"  name={s.hybRevCapt}  stackId="a" fill="#FF6B6B"/>
                    {hyb.downEnabled!==false && <Bar dataKey="down"  name={s.hybRevDown}  stackId="a" fill="#F5A623"/>}
                  </BarChart>
                </ResponsiveContainer>
              </Panel>

              <Panel title={s.hybChartCF}>
                <ResponsiveContainer width="100%" height={210}>
                  <AreaChart data={hybRows} margin={{left:-15,right:4,top:4}}>
                    <defs>
                      <linearGradient id="hybCfG" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#A06FD8" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="#A06FD8" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--bg3)"/>
                    <XAxis dataKey="year" tick={{fill:"#8AACCA",fontSize:14,fontFamily:"var(--ff-num)"}}/>
                    <YAxis tick={{fill:"#8AACCA",fontSize:14,fontFamily:"var(--ff-num)"}} tickFormatter={v=>dispK(v,lang)}/>
                    <Tooltip content={<Tip/>}/>
                    <ReferenceLine y={0} stroke="#FF4D6A" strokeDasharray="4 4"/>
                    {hybPb && <ReferenceLine x={hybPb} stroke="#F5A623" strokeWidth={1.5} strokeDasharray="5 3"
                      label={{value:"Payback yr"+hybPb,fill:"#F5A623",fontSize:12,fontFamily:"var(--ff-num)",position:"insideTopLeft"}}/>}
                    <Area type="monotone" dataKey="ccf" name={s.cumLeg} stroke="#A06FD8" fill="url(#hybCfG)" strokeWidth={2} dot={false}/>
                  </AreaChart>
                </ResponsiveContainer>
              </Panel>

              <Panel title={s.hybScnChart||"Hybrid Scenario Comparison"}>
                <ResponsiveContainer width="100%" height={210}>
                  <LineChart margin={{left:-15,right:4,top:4}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--bg3)"/>
                    <XAxis dataKey="year" type="number" domain={[1,15]}
                      tick={{fill:"#8AACCA",fontSize:14,fontFamily:"var(--ff-num)"}} allowDuplicatedCategory={false}/>
                    <YAxis tick={{fill:"#8AACCA",fontSize:14,fontFamily:"var(--ff-num)"}} tickFormatter={v=>dispK(v,lang)}/>
                    <Tooltip content={<Tip/>}/>
                    <Legend wrapperStyle={{fontFamily:"var(--ff-num)",fontSize:13,color:"#4A6580"}}/>
                    {["conservative","base","optimistic"].map((sc,i)=>{
                      const d=(hybScnData[sc]||[]).map(r=>({year:r.year,total:r.rev-r.brp}));
                      return <Line key={sc} data={d} type="monotone" dataKey="total"
                        name={[s.cons,s.base,s.opti][i]}
                        stroke={["#4D9FFF","#00E076","#F5A623"][i]}
                        strokeWidth={(hyb.hybScn||p.scn)===sc?2.5:1}
                        strokeDasharray={(hyb.hybScn||p.scn)===sc?"0":"5 3"} dot={false}/>;
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </Panel>

                            <Panel title={s.hybTitle} full>
                <div className="tbl-wrap" style={{overflowX:"auto"}}>
                  <table>
                    <thead><tr>
                      <th>{s.cYr}</th>
                      <th>{s.hybRevMmo}</th>
                      <th>{s.hybRevImbal}</th><th style={{color:"#FF6B6B"}}>{s.hybRevCapt}</th>{hyb.downEnabled!==false && <th style={{color:"var(--warn)"}}>{s.hybRevDown}</th>}
                      <th>{s.cRvT}</th><th>{s.cBRP}</th>
                      <th>{s.cOM}</th><th>{s.cDSO}</th><th>{s.cEBI}</th>
                      {p.finType!=="equity" && <th>{s.cDBT}</th>}
                      <th>{s.cNCF}</th><th>{s.cCCF}</th><th>{s.cDEG}</th>
                    </tr></thead>
                    <tbody>
                      {hybRows.map(r=>(
                        <tr key={r.year} style={{
                          borderTop:r.year===11?"2px solid #253A55":undefined,
                          background:r.year===hybPb?"rgba(245,166,35,0.04)":undefined,
                        }}>
                          <td className="a">{r.year}</td>
                          <td>{dispK(r.mmo,lang)}</td>
                          <td style={{color:"#A06FD8"}}>{dispK(r.imbal,lang)}</td>
                          <td style={{color:"#FF6B6B"}}>{dispK(r.capt||0,lang)}</td>
                          {hyb.downEnabled!==false && <td style={{color:"var(--warn)"}}>{dispK(r.down||0,lang)}</td>}
                          <td className="g">{dispK(r.rev,lang)}</td>
                          <td className="r">({dispK(r.brp,lang)})</td>
                          <td className="r">({dispK(r.om,lang)})</td>
                          <td className="r">({dispK(r.dso,lang)})</td>
                          <td className={r.ebi>=0?"g":"r"}>{dispK(r.ebi,lang)}</td>
                          {p.finType!=="equity" && <td className="r">{r.dbt>0?"("+dispK(r.dbt,lang)+")":"—"}</td>}
                          <td className={r.ncf>=0?"g":"r"}>{dispK(r.ncf,lang)}</td>
                          <td className={r.ccf>=0?"g":"r"}>{dispK(r.ccf,lang)}</td>
                          <td className="dm">{r.dg}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </div>

            {showOpex && <OpexPanel ob={opexBreak} s={s} lang={lang}/>}
            <div style={{padding:"10px 22px",borderTop:"1px solid #1C2E4A",background:"#060D1A",
              fontFamily:"var(--ff-num)",fontSize:12,color:"#4A6580",lineHeight:1.8}}>
              <span style={{color:"#A06FD8"}}>⚡ </span>{s.hybNote}
            </div>
          </div>
          )}
          <div style={{borderTop:"1px solid #1C2E4A",padding:"12px 22px",
            display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontFamily:"var(--ff-num)",fontSize:13,color:"var(--tx3)"}}>{s.footer} · v2.4</div>
            <div style={{fontFamily:"var(--ff-num)",fontSize:12,color:"#253A55"}}>
              {scnMap[p.scn]} · {p.area} · {p.powerUtil??60}% {lang==="sv"?"debiterad effekt":"billed power"} · {new Date().toLocaleDateString(lc)}
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Mobile: always-visible outcome + access to the controls */}
    <div className="sticky-bar">
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontFamily:"var(--ff-ui)",fontSize:11,color:"var(--tx3)",letterSpacing:"0.06em",textTransform:"uppercase"}}>IRR</div>
        <div className="num" style={{fontSize:20,color:res?.eqIRR>=12?"var(--acc)":res?.eqIRR>=8?"var(--warn)":"var(--err)",lineHeight:1.1}}>
          {res?fP(res.eqIRR,lang):"—"}
        </div>
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontFamily:"var(--ff-ui)",fontSize:11,color:"var(--tx3)",letterSpacing:"0.06em",textTransform:"uppercase"}}>{s.kPBK}</div>
        <div className="num" style={{fontSize:20,color:"var(--tx0)",lineHeight:1.1}}>
          {res?(res.pb?`${res.pb} ${s.pbYr}`:`>${p.yrs}`):"—"}
        </div>
      </div>
      <button onClick={()=>setSheetOpen(v=>!v)} style={{padding:"11px 18px",minHeight:44,
        background:sheetOpen?"var(--acc)":"rgba(0,224,118,0.12)",border:"1px solid var(--acc)",
        borderRadius:"var(--r)",color:sheetOpen?"#050D1A":"var(--acc)",fontFamily:"var(--ff-ui)",
        fontSize:13,fontWeight:700,letterSpacing:"0.04em",cursor:"pointer",whiteSpace:"nowrap"}}>
        {sheetOpen?(lang==="sv"?"Stäng":"Close"):(lang==="sv"?"Justera":"Adjust")}
      </button>
    </div>
    </>
  );
}

