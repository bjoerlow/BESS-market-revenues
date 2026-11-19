import { useState, useMemo, useCallback, useEffect } from "react";
import { ComposedChart,Bar,Line,XAxis,YAxis,CartesianGrid,Tooltip,Legend,ResponsiveContainer,Cell,ReferenceLine } from "recharts";
import { createClient } from "@supabase/supabase-js";
import { computeBacktest, periodLabel, monthName, fmtPct, fmtHours, fmtNum } from "./backtest.mjs";

// Inloggning for rapportutskicket i "Ditt batteri": samma Supabase-projekt och
// samma magic link som BESS Simulation. Satts via Vercel-miljovariabler; utan
// dem doljs utskicket helt i stallet for att visa en knapp som inte fungerar.
function cleanSbUrl(u){const s=String(u||"").trim().replace(/\/+$/,"");
  const m=s.match(/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)/i);return m?m[0]:"";}
const SB_URL=cleanSbUrl(process.env.REACT_APP_SB_URL);
const SB_KEY=String(process.env.REACT_APP_SB_KEY||"").trim();
// Publishable key (sb_publishable_…) ar kort; legacy anon-nyckeln en lang JWT.
// Godta bada, aldrig en secret key.
const SB_KEY_OK=!SB_KEY.startsWith("sb_secret_")&&(SB_KEY.startsWith("sb_publishable_")||SB_KEY.length>40);
const supabase=SB_URL&&SB_KEY_OK?createClient(SB_URL,SB_KEY):null;
// Lank till BESS Simulation for framatblickande kalkyl (valfri).
const SIM_URL=String(process.env.REACT_APP_BESS_SIM_URL||"").trim();
const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE=/^\+?[0-9][0-9 ()-]{6,19}$/;

const S={
  fcrn:{l:{sv:"FCR-N",en:"FCR-N"},c:["#38bdf8","#0284c7"],s:{sv:"FCR-N",en:"FCR-N"}},
  fcrd:{l:{sv:"FCR-D upp+ned",en:"FCR-D up+down"},c:["#fbbf24","#d97706"],s:{sv:"FCR-D",en:"FCR-D"}},
  fcrn_fcrd:{l:{sv:"FCR-N + FCR-D",en:"FCR-N + FCR-D"},c:["#22d3ee","#0891b2"],s:{sv:"N+D",en:"N+D"}},
  mfrr_conv:{l:{sv:"mFRR konventionell",en:"mFRR conventional"},c:["#fb923c","#ea580c"],s:{sv:"mFRR konv.",en:"mFRR conv."}},
  mfrr_opt:{l:{sv:"GreenVoltis strategi",en:"GreenVoltis strategy"},c:["#34d399","#059669"],s:{sv:"GV",en:"GV"}},
  intraday1:{l:{sv:"Intradag 1 cykel",en:"Intraday 1 cycle"},c:["#c084fc","#9333ea"],s:{sv:"ID 1c",en:"ID 1c"}},
  intraday2:{l:{sv:"Intradag 2 cykler",en:"Intraday 2 cycles"},c:["#a78bfa","#7c3aed"],s:{sv:"ID 2c",en:"ID 2c"}},
  dayahead:{l:{sv:"Day-ahead arbitrage",en:"Day-ahead arbitrage"},c:["#f472b6","#db2777"],s:{sv:"DA arb.",en:"DA arb."}},
};
const SIDS=Object.keys(S),DURS=[1,2];
const TR=[{k:6,l:{sv:"6 mån",en:"6 mo"}},{k:12,l:{sv:"12 mån",en:"12 mo"}},{k:24,l:{sv:"24 mån",en:"24 mo"}},{k:0,l:{sv:"Alla",en:"All"}}];
const FH={1:24,2:24,4:24},FCR_DUAL=0.87,USABLE=0.90,LOT=0.1,NEM_N=0.12,NEM_D=0.02,ACC_N=0.95,ACC_D=0.95,OE={1:2.5,2:5,4:8},CH={1:12,2:16,4:20},CB={1:12,2:8,4:4},CE={1:2,2:3,4:5};
const OH={1:24,2:24,4:24},OB={1:0,2:0,4:0},EM={1:1.0,2:1.8,4:3.2};
function lo(a,b){return a<b?a:b;}
// FCR: budvolymen bär uthållighetseffekten. 87% av märkeffekt i båda
// riktningar, eller 100% i en. FCR-N kräver 1 h energitäckning, FCR-D 20 min.
function lot(x){return Math.floor(x/LOT+1e-9)*LOT;}          // 100 kW budsteg
// NEM: FCR flyttar energi som måste köpas tillbaka. Kostnad = omsatt energi
// x verkningsgradsförlust x energipris. Ej kalibrerad mot uppmätt churn.
function nemCost(n,dd,hours,rte,price){
  return (NEM_N*n+NEM_D*dd*2)*hours*(1-rte)*price;
}
function fcrnMax(dur){return lot(lo(FCR_DUAL,USABLE*dur/2));}
// Kombinationen är en diversifieringsstrategi, inte intäktsmaximering:
// fördela headroomet så jämnt som möjligt i budsteg över båda produkterna.
function fcrMix(pn,pd,dur){
  const e=USABLE*dur/2, cap=lot(FCR_DUAL);
  let N=0,D=0;
  const fits=(n,d)=>n+d<=cap+1e-9&&n+d/3<=e+1e-9;
  for(;;){
    const order=N<D-1e-9?["N","D"]:(D<N-1e-9?["D","N"]:(pn>=pd?["N","D"]:["D","N"]));
    let added=false;
    for(const w of order){
      if(w==="N"&&fits(N+LOT,D)){N+=LOT;added=true;break;}
      if(w==="D"&&fits(N,D+LOT)){D+=LOT;added=true;break;}
    }
    if(!added)break;
  }
  return {v:pn*N+pd*D,N:N,D:D};
}

const TXT={
 sv:{sub:"Intäktsanalys per tjänst och strategi",synth:"Syntetisk data",pipe:"Pipeline-data",
  zone:"Elområde",dura:"Uthållighet",period:"Period",light:"☀ Ljust",dark:"● Mörkt",show:"Visa",
  loading:"Laddar data…",mo:"mån",months:"månader",last:"Senaste",allMonths:"Alla månader",eurMo:"EUR/mån",
  noData:"mFRR CM/EAM-data saknas",noDataRest:"— ladda ner CSV från mimer.svk.se → data/manual/",
  ceiling:"Marknadstak",foresight:"perfekt framförhållning",ofCeil:"av tak",
  inclImb:"inkl. obalans",
  tComparison:"Intäkt & benchmark",tMfrr:"mFRR upp vs ned",tDa:"Day-ahead & obalans",tTable:"Månadstabell",
  mfrrUp:"mFRR upp",mfrrDown:"mFRR ned",dUpDown:"Δ (upp−ned)",perDir:"CM+EAM per riktning",
  samePer:"samma månader",
  calcTitle:"Så räknar vi",
  calcBody:"GreenVoltis siffror är intäkter efter kostnader för elinköp, obalanser och Nord Pool-avgifter — det batteriet faktiskt tjänar, före GreenVoltis optimeringsavgift. Elnätsavgifter ingår inte. Clean Horizons index redovisas före sådana kostnader, så jämförelsen är försiktigt räknad för vår del.",
  convIB:"återställer laddningsnivån efter en aktivering via elhandlaren. Det ger pauser i budgivningen och kostnader för avgifter, obalanser och elhandlarens marginal på omkring 10 öre/kWh.",
  gvIB:"återställer laddningsnivån direkt på intradagsmarknaden — utan pauser och utan elhandlarens påslag.",
  fcrExpl:"Visar hur mycket FCR-D och FCR-N bidrar till strategins intäkt, beräknat som samma modell med och utan respektive tjänst.",
  extraExpl:"Ett batteri som redan ligger på mFRR kan handla på intradag i de kvartar det inte aktiveras. Används i SE3 och SE4, där intradagsspreaden är störst.",
  best:"Bäst",up:"UPP",down:"NED",conv:"Konventionell",vsTitle:"Konventionell vs GreenVoltis strategi",
  sameDir:"Samma riktning, olika deltagande",dOptConv:"Δ opt−konv.",diff:"Skillnad",
  convExpl1:"h/dygn mFRR CM. SoC via elhandlare → pauser, ~6% obalans.",convExpl2:"h/dygn FCR-D backfill.",
  gvExpl1:"h/dygn CM,",gvExpl2:"EAM-akt/dag vs",gvBf:"h/dygn FCR-D backfill.",
  daTitle:"Day-ahead arbitrage",daSub:"85% capture · ~8% obalanskostnad",
  grossArb:"Bruttoarbitrage",imbCost:"Obalanskostnad",netRev:"Nettointäkt",id2ref:"Intradag 2c (jmf)",
  daNet:"DA netto",daGross:"DA brutto",id2c:"Intradag 2c",
  durTitle:"Bästa strategi: 1h vs 2h",effMwh:"Eff. MWh",optimal:"Optimal",
  cmUp:"mFRR CM upp",cmDown:"mFRR CM ned",energy:"Energi (spot/EAM)",
  ceilSub:"Perfekt framförhållning per kvart · SoC, uthållighet och cykelbudget respekterade · referensvärde, ej uppnåeligt",
  shareCeil:"Andel av tak",convShare:"Konventionell andel",
  hComparison:"Vår intäkt månad för månad, med Clean Horizons index och marknadens tak som referens. Punkterna är faktiskt utfall från anläggning i drift.",
  hMfrr:"Hur intäkten fördelas mellan mFRR upp och ned, och vad en konventionell aggregator hade fått med samma priser.",
  hCeil:"Vad en perfekt optimerare hade tjänat med facit i hand. Visar hur stor del av marknadens värde vi faktiskt fångar.",
  hBattery:"Ange ditt batteris effekt, energi och elprisområde och se vad det hade tjänat under 2026 med GreenVoltis optimering.",
  tBattery:"Ditt batteri 2026",batTitle:"Så hade ditt batteri presterat 2026",
  batSub:"Historiskt utfall med GreenVoltis optimering · EUR",batZone:"Elprisområde",batDur:"Uthållighet",
  batEarned:p=>`hade ditt batteri tjänat ${p}`,batPerMw:"Per MW",batPerMwh:"Per MWh",
  batVsCh:"Mot Clean Horizon",batChSub:n=>`${n} månader med index`,batCeil:"Av marknadstaket",batCeilSub:"perfekt framförhållning",
  batBest:"Starkaste månad",batWorst:"Svagaste månad",batYou:"Ditt batteri",
  batChNote:"Clean Horizon visas de månader där indexet finns för ditt batteris uthållighet.",
  batLow:"Uthålligheten är kortare än 1 timme. Ange minst lika många MWh som MW.",
  batHigh:"Uthålligheten är längre än 2,5 timmar. Där finns ännu inget faktiskt utfall att kalibrera mot.",
  batNoData:"Marknadsdata för 2026 saknas.",
  batHist:"Siffrorna visar vad batteriet hade tjänat under perioden — inte en prognos.",
  batSim:"Vill du se framtida intäkter och återbetalningstid?",batSimLink:"Öppna BESS Simulation →",
  batYear:"Per MW och år",batYearSub:"i årstakt, inte en prognos",
  accTitle:"Spara och ladda ner",accSubOut:"Logga in för att spara dina projekt och ladda ner rapporten som PDF.",
  accSubIn:"Namnge och spara projektet, och ladda ner rapporten som PDF.",
  pfTitle:"Dina uppgifter",pfHow:e=>`Inloggad som ${e}. Fyll i namn och telefonnummer så kan vi följa upp din rapport.`,
  pfName:"Namn",pfPhone:"Telefon",pfCompany:"Företag (valfritt)",pfSave:"Spara uppgifter",pfSaving:"Sparar…",
  pfEditLnk:"Ändra uppgifter",cancel:"Avbryt",pfErrName:"Ange ditt namn.",
  pfErrPhone:"Ange ett giltigt telefonnummer, t.ex. +46 70 123 45 67.",pfErrSave:"Det gick inte att spara uppgifterna. Försök igen.",
  prName:"Projektnamn",prNamePh:"t.ex. Batteri Kvarnby",prSave:"Spara projekt",prUpdate:"Spara ändringar",
  prSaveNew:"Spara som nytt",prSaving:"Sparar…",prSaved:"Projektet är sparat.",prMine:"Mina projekt",prOpen:"Öppna",
  prDel:"Ta bort",prDelSure:"Bekräfta borttagning",prOpenNow:"ÖPPET",prErrName:"Ge projektet ett namn.",
  prErrSave:"Det gick inte att spara projektet. Försök igen.",prErrTable:"Projekt kan inte sparas ännu — databastabellen saknas.",
  prNone:"Inga sparade projekt ännu.",
  repTitle:"Ladda ner rapporten som PDF",repSub:"En PDF med ditt batteris resultat, att spara eller dela.",
  repHow:"Ange din e-postadress så får du en inloggningslänk — inget lösenord behövs. Du kommer tillbaka hit med dina värden ifyllda och kan ladda ner PDF:en.",
  repEmail:"E-postadress",repEmailPh:"namn@foretag.se",repLink:"Skicka inloggningslänk",repLinking:"Skickar…",
  repLinkSent:e=>`Kolla inkorgen hos ${e} och klicka på länken. Du kommer tillbaka hit med dina värden ifyllda.`,
  repSigned:"Inloggad som",repSend:"Ladda ner PDF",repSending:"Skapar PDF…",
  repSent:()=>"PDF:en är nedladdad.",repOut:"Logga ut",repAgain:"Ladda ner igen",
  repPrivacy:"Vi sparar dina kontaktuppgifter och projekt för att kunna följa upp din rapport. De delas inte med någon annan.",
  repBadEmail:"Ange en giltig e-postadress.",repLinkErr:"Det gick inte att skicka länken. Försök igen.",
  repSendErr:"Det gick inte att skapa PDF:en. Försök igen om en stund.",
  repRate:"Du har laddat ner flera rapporter nyligen. Försök igen om en timme.",repAuth:"Inloggningen har gått ut. Logga in igen.",
  hTable:"Samma siffror som diagrammet, månad för månad i tabellform.",
  ceilGap:"Outnyttjat",ceilTake:"Fångat av taket",ceilWhat:"Takets sammansättning",
  ceilMissing:"theoretical_max_all.json saknas i public/",ceilRun:"Kör",ceilPut:"och lägg filen i dashboardens public-mapp.",
  ceilExpl:"Taket väljer fritt bästa marknad i varje kvart med facit i hand och begränsas av batteriets SoC, uthållighetskrav per tjänst (mFRR 1 h, FCR 20 min), verkningsgrad och cykelbudget. Det är alltså inte ett realistiskt mål utan ett mått på hur stor del av marknadens värde en strategi fångar. Kapacitetsintäkt kräver ingen framförhållning — därför ligger andelen högt när mFRR CM dominerar månaden.",
  monthCol:"Mån",sum:"SUMMA",actual:"Faktiskt utfall",modelDev:"Modellen ligger inom",avail:"tillgänglighet",
  adjNote:"justerat för tillgänglighet",
  measured:"mätt intradagsdata",proxyDev:"proxymånader",
  tSystem:"Systemkalkyl",effect:"Effekt",energy:"Energi",crate:"C-tal",
  sysTitle:"Intäkt för ett specifikt system",
  sysSub:"Ange effekt och energi. Beräkningen använder samma strategimodell som zonjämförelsen.",
  sysTotal:"Totalt",sysPerMw:"per MW",sysPerMwh:"per MWh",
  sysModelled:"Över C/2,5 finns ingen anläggning att kalibrera mot — siffran är enbart modellerad.",
  sysMax:"Maximalt C/2,5 — längre uthållighet finns det ännu inget utfall att kalibrera mot. Ange mer effekt eller mindre energi.",
  sysNoGrid:"Kör om pipelinen för att få C-talsrutnätet i monthly_revenue_all.json.",
  benchNote:"Indexet antar 85 % verkningsgrad, 1,5 cykler per dygn och full användbar energi. Värdena visas oförändrade.",
  vsIndex:"mot index",benchPartial:"korrigerat värde ur CH:s annualiserade tal",
  altTitle:"Vad alternativen hade gett",
  altSub:"Samma priser, samma batteri, andra strategival · hela perioden",
  altNote:"Staplarna visar vad varje enskild strategi hade gett över perioden med samma priser och samma batteri. GreenVoltis strategi väljer och kombinerar marknader efter vad som betalar bäst i varje elprisområde — den är därför inte summan av de andra.",
  altShow:"Visa i diagrammet",
  proxyNote:"härledd intradagsspread (day-ahead × 1,2) — osäker när marknaderna frikopplas",
  manualNote:"manuellt satt intradagsspread — ingår ej i valideringen",
  ofActual:"av faktiskt utfall",monthsShort:"mån",validatedIn:"validerat mot",
  notModelled:"ny strategigeneration — ej modellerad",
  fPhys:"Batteriet",fPhysB:"Intäkt per MW · 1h och 2h|Verkningsgrad 90 %, 90 % användbar energi|Bud i steg om 100 kW|Full tillgänglighet om inget annat anges",
  fPart:"Marknader",fPartB:"mFRR kapacitet och aktivering|FCR-N och FCR-D|Intradag och day-ahead|Strategin väljs per elprisområde och månad",
  fSrc:"Datakällor",fSrcB:"Marknadspriser: Aether (Svenska kraftnät, Nord Pool)|Benchmark: Clean Horizon Storage Index|Utfall: GreenVoltis anläggningar i drift",
  fCalc:"Referenser",fCalcB:"Konventionell: aggregator som återställer laddning via elhandlare|Marknadstak: perfekt framförhållning per kvart, 1,5 cykler/dygn|Taket är ett mått, inte ett mål|Modellen kalibreras mot faktiskt utfall"},
 en:{sub:"Revenue analysis by service and strategy",synth:"Synthetic data",pipe:"Pipeline data",
  zone:"Bidding zone",dura:"Duration",period:"Period",light:"☀ Light",dark:"● Dark",show:"Show",
  loading:"Loading data…",mo:"mo",months:"months",last:"Last",allMonths:"All months",eurMo:"EUR/month",
  noData:"mFRR CM/EAM data missing",noDataRest:"— download CSV from mimer.svk.se → data/manual/",
  ceiling:"Market ceiling",foresight:"perfect foresight",ofCeil:"of ceiling",
  inclImb:"incl. imbalance",
  tComparison:"Revenue & benchmark",tMfrr:"mFRR up vs down",tDa:"Day-ahead & imbalance",tTable:"Monthly table",
  mfrrUp:"mFRR up",mfrrDown:"mFRR down",dUpDown:"Δ (up−down)",perDir:"CM+EAM per direction",
  samePer:"same months",
  calcTitle:"How we count",
  calcBody:"GreenVoltis figures are revenue after the cost of power purchases, imbalances and Nord Pool fees — what the battery actually earns, before the GreenVoltis optimisation fee. Grid tariffs are not included. The Clean Horizon index is reported before such costs, so the comparison is conservative on our side.",
  convIB:"restores state of charge after an activation through the electricity retailer. That causes pauses in bidding and costs for fees, imbalances and the retailer's margin of around SEK 0.10/kWh.",
  gvIB:"restores state of charge directly on the intraday market — without pauses and without the retailer's mark-up.",
  fcrExpl:"Shows how much FCR-D and FCR-N contribute to the strategy's revenue, computed as the same model with and without each service.",
  extraExpl:"A battery already committed to mFRR can trade intraday in the quarters it is not activated. Used in SE3 and SE4, where the intraday spread is widest.",
  best:"Best",up:"UP",down:"DOWN",conv:"Conventional",vsTitle:"Conventional vs GreenVoltis strategy",
  sameDir:"Same direction, different participation",dOptConv:"Δ opt−conv.",diff:"Difference",
  convExpl1:"h/day mFRR CM. SoC restored via retailer → pauses, ~6% imbalance.",convExpl2:"h/day FCR-D backfill.",
  gvExpl1:"h/day CM,",gvExpl2:"EAM activations/day vs",gvBf:"h/day FCR-D backfill.",
  daTitle:"Day-ahead arbitrage",daSub:"85% capture · ~8% imbalance cost",
  grossArb:"Gross arbitrage",imbCost:"Imbalance cost",netRev:"Net revenue",id2ref:"Intraday 2c (ref)",
  daNet:"DA net",daGross:"DA gross",id2c:"Intraday 2c",
  durTitle:"Best strategy: 1h vs 2h",effMwh:"Eff. MWh",optimal:"Optimal",
  cmUp:"mFRR CM up",cmDown:"mFRR CM down",energy:"Energy (spot/EAM)",
  ceilSub:"Perfect foresight per quarter-hour · SoC, endurance and cycle budget respected · reference value, not attainable",
  shareCeil:"Share of ceiling",convShare:"Conventional share",
  hComparison:"Our revenue month by month, with the Clean Horizon index and the market ceiling as references. Dots are realised outcomes from an operating site.",
  hMfrr:"How revenue splits between mFRR up and down, and what a conventional aggregator would have earned on the same prices.",
  hCeil:"What a perfect optimiser would have earned with hindsight. Shows how much of the market value we actually capture.",
  hBattery:"Enter your battery's power, energy and bidding zone to see what it would have earned in 2026 with GreenVoltis optimisation.",
  tBattery:"Your battery 2026",batTitle:"How your battery would have performed in 2026",
  batSub:"Historical result with GreenVoltis optimisation · EUR",batZone:"Bidding zone",batDur:"Duration",
  batEarned:p=>`your battery would have earned over ${p}`,batPerMw:"Per MW",batPerMwh:"Per MWh",
  batVsCh:"Versus Clean Horizon",batChSub:n=>`${n} months with index`,batCeil:"Of market ceiling",batCeilSub:"perfect foresight",
  batBest:"Strongest month",batWorst:"Weakest month",batYou:"Your battery",
  batChNote:"Clean Horizon is shown for the months where the index exists for your battery's duration.",
  batLow:"The duration is shorter than 1 hour. Enter at least as many MWh as MW.",
  batHigh:"The duration is longer than 2.5 hours. There are no actual results yet to calibrate against.",
  batNoData:"Market data for 2026 is missing.",
  batHist:"The figures show what the battery would have earned over the period — not a forecast.",
  batSim:"Want to see future revenue and payback?",batSimLink:"Open BESS Simulation →",
  batYear:"Per MW per year",batYearSub:"annualised, not a forecast",
  accTitle:"Save and download",accSubOut:"Sign in to save your projects and download the report as a PDF.",
  accSubIn:"Name and save the project, and download the report as a PDF.",
  pfTitle:"Your details",pfHow:e=>`Signed in as ${e}. Add your name and phone number so we can follow up on your report.`,
  pfName:"Name",pfPhone:"Phone",pfCompany:"Company (optional)",pfSave:"Save details",pfSaving:"Saving…",
  pfEditLnk:"Edit details",cancel:"Cancel",pfErrName:"Enter your name.",
  pfErrPhone:"Enter a valid phone number, e.g. +46 70 123 45 67.",pfErrSave:"Your details could not be saved. Please try again.",
  prName:"Project name",prNamePh:"e.g. Kvarnby battery",prSave:"Save project",prUpdate:"Save changes",
  prSaveNew:"Save as new",prSaving:"Saving…",prSaved:"The project is saved.",prMine:"My projects",prOpen:"Open",
  prDel:"Delete",prDelSure:"Confirm delete",prOpenNow:"OPEN",prErrName:"Give the project a name.",
  prErrSave:"The project could not be saved. Please try again.",prErrTable:"Projects cannot be saved yet — the database table is missing.",
  prNone:"No saved projects yet.",
  repTitle:"Download the report as a PDF",repSub:"A PDF with your battery's results, to keep or share.",
  repHow:"Enter your email and we send you a sign-in link — no password needed. You return here with your values filled in and can download the PDF.",
  repEmail:"Email address",repEmailPh:"name@company.com",repLink:"Send sign-in link",repLinking:"Sending…",
  repLinkSent:e=>`Check the inbox for ${e} and click the link. You return here with your values filled in.`,
  repSigned:"Signed in as",repSend:"Download PDF",repSending:"Creating PDF…",
  repSent:()=>"The PDF has been downloaded.",repOut:"Sign out",repAgain:"Download again",
  repPrivacy:"We keep your contact details and projects so we can follow up on your report. They are not shared with anyone else.",
  repBadEmail:"Enter a valid email address.",repLinkErr:"The link could not be sent. Please try again.",
  repSendErr:"The PDF could not be created. Please try again shortly.",
  repRate:"You have downloaded several reports recently. Please try again in an hour.",repAuth:"Your sign-in has expired. Please sign in again.",
  hTable:"The same figures as the chart, month by month.",
  ceilGap:"Unused",ceilTake:"Captured",ceilWhat:"What the ceiling is made of",
  ceilMissing:"theoretical_max_all.json missing in public/",ceilRun:"Run",ceilPut:"and place the file in the dashboard public folder.",
  ceilExpl:"The ceiling picks the best market in every quarter-hour with hindsight, constrained by state of charge, endurance requirements per service (mFRR 1 h, FCR 20 min), round-trip efficiency and cycle budget. It is not a realistic target but a measure of how much of the market value a strategy captures. Capacity revenue requires no foresight — which is why the share runs high in months dominated by mFRR CM.",
  monthCol:"Month",sum:"TOTAL",actual:"Actual outcome",modelDev:"Model within",avail:"availability",
  adjNote:"adjusted for availability",
  measured:"measured intraday data",proxyDev:"proxy months",
  tSystem:"System calculator",effect:"Power",energy:"Energy",crate:"C-rate",
  sysTitle:"Revenue for a specific system",
  sysSub:"Enter power and energy. Uses the same strategy model as the zone comparison.",
  sysTotal:"Total",sysPerMw:"per MW",sysPerMwh:"per MWh",
  sysModelled:"Above C/2.5 there is no site to calibrate against — the figure is modelled only.",
  sysMax:"Maximum C/2.5 — there are no outcomes yet to calibrate longer durations against. Increase power or reduce energy.",
  sysNoGrid:"Re-run the pipeline to get the C-rate grid into monthly_revenue_all.json.",
  benchNote:"The index assumes 85% round-trip efficiency, 1.5 cycles per day and full usable energy. Values are shown unmodified.",
  vsIndex:"vs index",benchPartial:"value corrected from CH annualised figure",
  altTitle:"What the alternatives would have given",
  altSub:"Same prices, same battery, different strategy · whole period",
  altNote:"The bars show what each single strategy would have earned over the period on the same prices and the same battery. The GreenVoltis strategy selects and combines markets by what pays best in each bidding zone — it is therefore not the sum of the others.",
  altShow:"Show in chart",
  proxyNote:"derived intraday spread (day-ahead × 1.2) — unreliable when the markets decouple",
  manualNote:"manually set intraday spread — excluded from validation",
  ofActual:"of actual outcome",monthsShort:"mo",validatedIn:"validated against",
  notModelled:"new strategy generation — not modelled",
  fPhys:"The battery",fPhysB:"Revenue per MW · 1h and 2h|Round-trip efficiency 90%, 90% usable energy|Bids in 100 kW steps|Full availability unless stated",
  fPart:"Markets",fPartB:"mFRR capacity and activation|FCR-N and FCR-D|Intraday and day-ahead|Strategy chosen per bidding zone and month",
  fSrc:"Data sources",fSrcB:"Market prices: Aether (Svenska kraftnät, Nord Pool)|Benchmark: Clean Horizon Storage Index|Outcomes: GreenVoltis operating sites",
  fCalc:"References",fCalcB:"Conventional: aggregator restoring charge via a retailer|Ceiling: perfect foresight per quarter, 1.5 cycles/day|The ceiling is a yardstick, not a target|The model is calibrated against actual outcomes"}
};


const dk={bg:"#080e1a",card:"#0d1520",cA:"#0a1018",bd:"#1a2a44",bL:"#243352",tx:"#dfe6f0",mu:"#6b7d9a",dm:"#3d4f6a",cG:"#1a2a44",cT:"#6b7d9a"};
const lt={bg:"#f5f4f0",card:"#ffffff",cA:"#f0efeb",bd:"#e0ddd5",bL:"#ccc9c0",tx:"#1a1a18",mu:"#7a786e",dm:"#a8a69c",cG:"#e0ddd5",cT:"#7a786e"};

function genArea(){
  const SS=[18,15,12,8,6,5,5,6,10,14,17,20],rows=[];
  let d=new Date(2024,0);const end=new Date(2026,5);
  while(d<end){
    const mo=d.getMonth(),yr=d.getFullYear(),days=new Date(yr,mo+1,0).getDate(),hours=days*24,rte=0.90;
    const fn=22+SS[mo]+Math.sin(yr*7+mo*3)*3;
    const fu=4+SS[mo]*0.35+Math.sin(yr*5+mo*2)*1.2,fd=3+SS[mo]*0.3+Math.cos(yr*4+mo*5)*0.8;
    const cu=3+SS[mo]*0.35+Math.sin(yr*3+mo*7)*1,cd=2+SS[mo]*0.25+Math.cos(yr*6+mo*3)*0.8;
    const hE=d>=new Date(2025,2);
    const eu=hE?40+Math.sin(yr*11+mo*4)*18:0,ed=hE?30+Math.cos(yr*8+mo*6)*12:0;
    const sp=8+SS[mo]*0.6+Math.cos(yr*6+mo*9)*2.5,dr=15+SS[mo]*1.8+Math.sin(yr*4+mo*8)*5;
    const bU=cu+eu*0.3>=cd+ed*0.3,bC=bU?cu:cd,bE=bU?eu:ed,has=bC>0||bE>0;
    const row={year_month:`${yr}-${String(mo+1).padStart(2,"0")}`,days,hours,
      fcr_n_price:+fn.toFixed(2),fcr_d_up_price:+fu.toFixed(2),fcr_d_down_price:+fd.toFixed(2),
      mfrr_cm_up_price:+cu.toFixed(2),mfrr_cm_down_price:+cd.toFixed(2),mfrr_cm_best_direction:bU?"upp":"ned",
      mfrr_eam_up_price:+eu.toFixed(2),mfrr_eam_down_price:+ed.toFixed(2),
      intraday_spread:+sp.toFixed(2),da_range:+dr.toFixed(2),da_imbalance_pct:0.08};
    DURS.forEach(dur=>{
      const eff=EM[dur],act=lo(dur,0.25);
      const nMax=fcrnMax(dur), dMax=lot(FCR_DUAL), ePx=dr*0.6||40;
      const nA=nMax*ACC_N, dA=dMax*ACC_D;
      const v1=fn*nA*FH[dur]*days-nemCost(nA,0,hours,rte,ePx);
      const v2=(fu+fd)*dA*hours-nemCost(0,dA,hours,rte,ePx);
      const mx=fcrMix(fn,fu+fd,dur), mN=mx.N*ACC_N, mD=mx.D*ACC_D;
      const v3=(fn*mN+(fu+fd)*mD)*hours-nemCost(mN,mD,hours,rte,ePx);
      const ccm=has?bC*CH[dur]*days:0,ceam=has&&bE>0?CE[dur]*act*bE*days*rte:0;
      const v4=ccm+ceam-(ccm+ceam)*0.06+(has?(fu+fd)*0.87*CB[dur]*days:0);
      // mFRR opt: no netting cost, 1h gets FCR-D backfill
      const oh=OH[dur];
      const ocm=has?(dur>=4?(cu+cd)*oh*days:bC*oh*days):0;
      const oep=dur>=4?(eu+ed)/2:bE;
      const oeam=has&&oep>0?OE[dur]*act*oep*days*rte:0;
      const obf=(fu+fd)*0.87*OB[dur]*days;
      const gvid=dur*sp*rte*days*(0.90+0.75);
      const v5=ocm+oeam+obf+gvid;
      const v6=eff*sp*rte*days*0.75;
      const v7=eff*sp*rte*days*1.25;
      const dg=eff*dr*rte*days*0.85;
      const v8=dg*(1-0.08);
      row[`fcrn_${dur}h`]=Math.round(v1);row[`fcrd_${dur}h`]=Math.round(v2);row[`fcrn_fcrd_${dur}h`]=Math.round(v3);
      row[`mfrr_conv_${dur}h`]=Math.round(v4);row[`mfrr_opt_${dur}h`]=Math.round(v5);
      row[`intraday1_${dur}h`]=Math.round(v6);row[`intraday2_${dur}h`]=Math.round(v7);row[`dayahead_${dur}h`]=Math.round(v8);
      row[`mfrr_up_total_${dur}h`]=Math.round(cu*hours+(eu>0?OE[dur]*act*eu*days*rte:0));
      row[`mfrr_down_total_${dur}h`]=Math.round(cd*hours+(ed>0?OE[dur]*act*ed*days*rte:0));
      const all={fcrn:v1,fcrd:v2,fcrn_fcrd:v3,mfrr_conv:v4,mfrr_opt:v5,intraday1:v6,intraday2:v7,dayahead:v8};
      let bV=-Infinity,bS="fcrn";Object.entries(all).forEach(([s,v])=>{if(v>bV){bV=v;bS=s;}});
      row[`optimal_${dur}h`]=Math.round(bV);row[`optimal_strategy_${dur}h`]=bS;
    });
    [2].forEach(dur=>{const p=dur===2?1:2;
      if((row[`optimal_${dur}h`]||0)<(row[`optimal_${p}h`]||0)){
        row[`optimal_${dur}h`]=row[`optimal_${p}h`];row[`optimal_strategy_${dur}h`]=row[`optimal_strategy_${p}h`];}});
    rows.push(row);d=new Date(yr,mo+1);
  }
  return rows;
}
function genSyn(){const m=genArea();return{SE1:m,SE2:m,SE3:m,SE4:m};}

function tx(raw,dur,mw,lang){
  const label=(()=>{try{const[y,m]=raw.year_month.split("-");return new Date(+y,+m-1).toLocaleString(lang==="en"?"en-GB":"sv-SE",{year:"numeric",month:"short"});}catch{return raw.year_month;}})();
  const r={label,ym:raw.year_month};
  SIDS.forEach(sid=>{r[sid]=Math.round((raw[`${sid}_${dur}h`]||0)*mw);});
  r.optimal=Math.round((raw[`optimal_${dur}h`]||0)*mw);
  r.optimalStrategy=raw[`optimal_strategy_${dur}h`]||"fcrn";
  r.mfrr_direction=raw.mfrr_cm_best_direction||"";
  r.mfrr_up=Math.round((raw[`mfrr_up_total_${dur}h`]||0)*mw);
  r.mfrr_down=Math.round((raw[`mfrr_down_total_${dur}h`]||0)*mw);
  r.fcr_n_price=raw.fcr_n_price||0;r.fcr_d_up_price=raw.fcr_d_up_price||0;r.fcr_d_down_price=raw.fcr_d_down_price||0;
  r.mfrr_cm_up_price=raw.mfrr_cm_up_price||0;r.mfrr_cm_down_price=raw.mfrr_cm_down_price||0;
  r.mfrr_eam_up_price=raw.mfrr_eam_up_price||0;r.mfrr_eam_down_price=raw.mfrr_eam_down_price||0;
  r.intraday_spread=raw.intraday_spread||0;r.da_imbalance_pct=raw.da_imbalance_pct||0;
  r.spreadSrc=raw.spread_source||"unknown";
  // FCR-bidraget i GV-strategin: samma optimerare utan FCR som jamforelse
  r.fcrGain=Math.round((raw[`fcr_gain_${dur}h`]||0)*mw);
  r.fcrGainPct=raw[`fcr_gain_pct_${dur}h`]||0;
  r.fcrBasis=raw.fcr_basis||"";
  r.idExtra=Math.round((raw[`gv_id_extra_${dur}h`]||0)*mw);
  r.fcrnPot=Math.round((raw[`fcrn_potential_${dur}h`]||0)*mw);
  r.fcrnIn=raw.fcrn_in_model!==false;
  return r;
}

let LOC="sv-SE";
const fmt=v=>v!=null?Math.round(v).toLocaleString(LOC):"—";
const fmtE=v=>v!=null?`€${Math.round(v).toLocaleString(LOC)}`:"—";

function TT({active,payload,label,theme:t}){
  if(!active||!payload?.length)return null;
  return(<div style={{background:t.card,border:`1px solid ${t.bd}`,borderRadius:8,padding:"10px 14px",fontSize:12,fontFamily:"'JetBrains Mono',monospace",boxShadow:"0 8px 32px rgba(0,0,0,0.3)"}}>
    <div style={{color:t.tx,fontWeight:500,marginBottom:6,fontSize:11,fontFamily:"'Plus Jakarta Sans'"}}>{label}</div>
    {payload.filter(p=>p.value!=null&&p.value!==0).map((p,i)=>(<div key={i} style={{color:p.color||t.tx,margin:"3px 0",display:"flex",justifyContent:"space-between",gap:20}}>
      <span style={{fontFamily:"'Plus Jakarta Sans'",fontSize:11,opacity:0.85}}>{p.name}</span><span style={{fontWeight:500}}>{fmtE(p.value)}</span></div>))}
  </div>);
}
function Pill({active,onClick,children,color,small,t}){
  const c=color||(t===dk?"#38bdf8":"#0891b2");
  return(<button onClick={onClick} style={{background:active?c+"18":"transparent",color:active?c:t.mu,
    border:`1px solid ${active?c+"40":t.bd}`,borderRadius:6,padding:small?"3px 8px":"5px 12px",
    fontSize:small?10:11.5,cursor:"pointer",fontWeight:active?500:400,fontFamily:"'Plus Jakarta Sans'",whiteSpace:"nowrap"}}>{children}</button>);
}

// Vyvaljaren sag inte klickbar ut - den liknade etiketter. Tabben far nu
// bakgrundsplatta, tydlig aktiv flik med understreck, och en ledtext som
// sager vad varje vy innehaller.
function Tab({active,onClick,label,hint,t}){
  const c=active?(t===dk?"#34d399":"#059669"):t.mu;
  return(<button onClick={onClick} title={hint} style={{
    background:active?t.card:"transparent",color:c,
    border:`1px solid ${active?(t===dk?"#34d399":"#059669")+"55":"transparent"}`,
    borderRadius:8,padding:"8px 14px",fontSize:12,cursor:"pointer",
    fontWeight:active?600:500,fontFamily:"'Plus Jakarta Sans'",whiteSpace:"nowrap",
    boxShadow:active?"0 1px 3px rgba(0,0,0,0.25)":"none",transition:"all .12s"}}>
    {label}</button>);
}
function KPI({label,value,sub,color,warn,t}){
  return(<div style={{background:t.card,border:`1px solid ${t.bd}`,borderRadius:10,padding:"14px 16px",flex:1,minWidth:140,position:"relative"}}>
    <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:color,borderRadius:"10px 10px 0 0",opacity:0.8}}/>
    <div style={{color:t.mu,fontSize:9,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>{label}</div>
    <div style={{color:t.tx,fontSize:18,fontWeight:500,fontFamily:"'JetBrains Mono',monospace"}}>{value}</div>
    {sub&&<div style={{color:warn?"#ef4444":color,fontSize:10,marginTop:3}}>{sub}</div>}
  </div>);
}
function Card({title,sub,children,t}){
  return(<div style={{background:t.card,border:`1px solid ${t.bd}`,borderRadius:12,padding:20}}>
    {title&&<h3 style={{margin:"0 0 3px",fontSize:14,fontWeight:500,color:t.tx}}>{title}</h3>}
    {sub&&<div style={{color:t.mu,fontSize:10,marginBottom:12}}>{sub}</div>}{children}</div>);
}
function SB({label,value,color,t}){
  return(<div style={{background:t.cA,border:`1px solid ${t.bd}`,borderRadius:8,padding:12,textAlign:"center"}}>
    <div style={{fontSize:9,color:t.mu,marginBottom:3}}>{label}</div>
    <div style={{fontSize:16,fontWeight:500,fontFamily:"'JetBrains Mono',monospace",color}}>{value}</div></div>);
}
function IB({color,children,t}){
  return(<div style={{marginTop:14,padding:14,background:(color||"#38bdf8")+"08",border:`1px solid ${(color||"#38bdf8")}18`,borderRadius:8,fontSize:11,lineHeight:1.7,color:t.mu}}>{children}</div>);
}

export default function Dashboard(){
  const[area,setArea]=useState("SE4"),[dur,setDur]=useState(2),[mw,setMw]=useState(1);
  // Lasarvyn visar EN strategi: var egen. Benchmark ar Clean Horizons index och
  // det teoretiska maxtaket. De ovriga strategierna finns kvar i berakningen och
  // i konkurrentfliken, men listas inte sida vid sida langre - fardre siffror,
  // tydligare budskap.
  const[view,setView]=useState("comparison"),[sel,setSel]=useState(new Set(["mfrr_opt"]));
  const[rawData,setRawData]=useState(null),[ds,setDs]=useState("syntetisk");
  const[tmax,setTmax]=useState(null);
  const[acts,setActs]=useState(null);
  const[bench,setBench]=useState(null);
  // Ljust lage ar standard - det ar lasarens vy och den bar tryckas och delas.
  const[tr,setTr]=useState(12),[isDark,setIsDark]=useState(false);
  const[lang,setLang]=useState("sv");
  const[batMw,setBatMw]=useState(1),[batMwh,setBatMwh]=useState(2);
  const[user,setUser]=useState(null),[repOn,setRepOn]=useState(false);
  const[repEmail,setRepEmail]=useState(""),[repState,setRepState]=useState("idle");
  const[repErr,setRepErr]=useState(""),[repTo,setRepTo]=useState("");
  // Profil (namn, telefon, foretag) ligger i Supabase user_metadata och delas
  // med BESS Simulation. Projekten ligger i tabellen ri_projects (se supabase/).
  const[pf,setPf]=useState({name:"",phone:"",company:""}),[pfEdit,setPfEdit]=useState(false);
  const[pfState,setPfState]=useState("idle"),[pfErr,setPfErr]=useState("");
  const[projects,setProjects]=useState([]),[projName,setProjName]=useState(""),[projId,setProjId]=useState(null);
  const[projState,setProjState]=useState("idle"),[projErr,setProjErr]=useState(""),[delId,setDelId]=useState(null);

  // Indata ligger i adressen: lanken gar att dela, och den overlever magic
  // linkens tur och retur via e-posten.
  useEffect(()=>{try{
    const q=new URLSearchParams(window.location.search);
    if(q.get("vy")==="batteri")setView("battery");
    const z=q.get("zon");if(["SE1","SE2","SE3","SE4"].includes(z))setArea(z);
    const m=parseFloat(q.get("mw")),e=parseFloat(q.get("mwh"));
    if(m>0&&m<=1000)setBatMw(m);if(e>0&&e<=2500)setBatMwh(e);
    if(q.get("lang")==="en")setLang("en");
    if(q.get("projekt"))setProjName(q.get("projekt").slice(0,80));
  }catch(_){}},[]);
  useEffect(()=>{try{
    const q=new URLSearchParams(window.location.search);
    if(view==="battery"){q.set("vy","batteri");q.set("zon",area);q.set("mw",String(batMw));q.set("mwh",String(batMwh));q.delete("drift");
      if(projName.trim())q.set("projekt",projName.trim());else q.delete("projekt");}
    else["vy","zon","mw","mwh","drift","projekt"].forEach(k=>q.delete(k));
    const qs=q.toString();
    window.history.replaceState(null,"",window.location.pathname+(qs?"?"+qs:"")+window.location.hash);
  }catch(_){}},[view,area,batMw,batMwh,projName]);

  useEffect(()=>{
    if(!supabase)return;
    fetch("/api/report").then(r=>r.ok?r.json():{enabled:false})
      .then(d=>setRepOn(Boolean(d&&d.enabled))).catch(()=>setRepOn(false));
    supabase.auth.getSession().then(({data})=>{
      setUser(data?.session?.user||null);
      // Token i adressfaltet ska inte ligga kvar - en omladdning ska inte
      // spela upp en forbrukad lank, och adressen ska ga att dela.
      if(/access_token=|error_description=/.test(window.location.hash))
        window.history.replaceState(null,"",window.location.pathname+window.location.search);
    });
    const{data:{subscription}}=supabase.auth.onAuthStateChange((_e,ses)=>setUser(ses?.user||null));
    return()=>subscription.unsubscribe();
  },[]);
  useEffect(()=>{if(repState==="sent")setRepState("idle");},[area,batMw,batMwh,lang,projName]);
  const meta=user?.user_metadata||{};
  const profileOk=Boolean(meta.full_name&&meta.phone_number);
  useEffect(()=>{
    const m=user?.user_metadata||{};
    setPf({name:m.full_name||"",phone:m.phone_number||"",company:m.company||""});
    setPfEdit(false);setPfErr("");
  },[user]);
  const loadProjects=useCallback(async()=>{
    if(!supabase||!user){setProjects([]);return;}
    const{data,error}=await supabase.from("ri_projects").select("id,name,area,mw,mwh,updated_at")
      .order("updated_at",{ascending:false});
    if(error){setProjects([]);if(/relation|does not exist|schema cache/i.test(error.message||""))setProjErr("table");return;}
    setProjects(data||[]);
  },[user]);
  useEffect(()=>{loadProjects();},[loadProjects]);

  const saveProfile=async()=>{
    const name=pf.name.trim(),phone=pf.phone.trim(),company=pf.company.trim();
    if(name.length<2){setPfErr("name");return;}
    if(!PHONE_RE.test(phone)){setPfErr("phone");return;}
    setPfErr("");setPfState("saving");
    const{data,error}=await supabase.auth.updateUser({data:{full_name:name,phone_number:phone,company}});
    setPfState("idle");
    if(error){setPfErr("save");return;}
    if(data?.user)setUser(data.user);
    setPfEdit(false);
  };
  const saveProject=async(asNew)=>{
    const name=projName.trim();
    if(!name){setProjErr("noname");return;}
    setProjErr("");setProjState("saving");
    const row={name:name.slice(0,80),area,mw:batMw,mwh:batMwh,user_email:user.email,
      full_name:meta.full_name||null,phone:meta.phone_number||null,company:meta.company||null,
      updated_at:new Date().toISOString()};
    const q=projId&&!asNew
      ?supabase.from("ri_projects").update(row).eq("id",projId).select("id").single()
      :supabase.from("ri_projects").insert(row).select("id").single();
    const{data,error}=await q;
    if(error){setProjState("idle");
      setProjErr(/relation|does not exist|schema cache/i.test(error.message||"")?"table":"save");return;}
    setProjId(data?.id||projId);setProjState("saved");loadProjects();
  };
  const openProject=pr=>{
    setArea(pr.area);setBatMw(Number(pr.mw));setBatMwh(Number(pr.mwh));
    setProjName(pr.name);setProjId(pr.id);setProjState("idle");setProjErr("");setDelId(null);
  };
  const deleteProject=async id=>{
    const{error}=await supabase.from("ri_projects").delete().eq("id",id);
    setDelId(null);
    if(error){setProjErr("save");return;}
    if(id===projId)setProjId(null);
    loadProjects();
  };
  useEffect(()=>{if(projState==="saved")setProjState("idle");},[area,batMw,batMwh,projName]);

  const sendLink=async()=>{
    const e=repEmail.trim();
    if(!EMAIL_RE.test(e)){setRepErr("bad");return;}
    setRepErr("");setRepState("linking");
    const back=window.location.origin+window.location.pathname+window.location.search;
    const{error}=await supabase.auth.signInWithOtp({email:e,options:{emailRedirectTo:back}});
    if(error){setRepState("idle");setRepErr("link");}else{setRepTo(e);setRepState("linkSent");}
  };
  const sendReport=async()=>{
    setRepErr("");setRepState("sending");
    try{
      const{data}=await supabase.auth.getSession();
      const tok=data?.session?.access_token;
      const r=await fetch("/api/report",{method:"POST",
        headers:{"Content-Type":"application/json",Authorization:`Bearer ${tok||""}`},
        body:JSON.stringify({area,mw:batMw,mwh:batMwh,lang,name:projName.trim()})});
      if(r.ok){
        // PDF:en laddas ned direkt. Filnamnet kommer fran servern.
        const blob=await r.blob();
        const cd=r.headers.get("Content-Disposition")||"";
        const fn=(cd.match(/filename="([^"]+)"/)||[])[1]||"GreenVoltis-batteri-2026.pdf";
        const url=URL.createObjectURL(blob);
        const a=document.createElement("a");a.href=url;a.download=fn;
        document.body.appendChild(a);a.click();a.remove();
        setTimeout(()=>URL.revokeObjectURL(url),10000);
        setRepState("sent");return;}
      const j=await r.json().catch(()=>({}));
      setRepState("idle");
      if(j.error==="unauthorized"){await supabase.auth.signOut();setRepErr("auth");}
      else if(j.error==="profile")setPfEdit(true);
      else setRepErr(j.error==="rate_limited"?"rate":"send");
    }catch(_){setRepState("idle");setRepErr("send");}
  };
  const t=isDark?dk:lt;
  const L=TXT[lang];LOC=lang==="en"?"en-GB":"sv-SE";

  useEffect(()=>{
    fetch("/monthly_revenue_all.json").then(r=>{if(!r.ok)throw new Error();return r.json();})
      .then(d=>{setRawData(d.areas);setDs("pipeline");})
      .catch(()=>{
        Promise.all(["SE1","SE2","SE3","SE4"].map(a=>
          fetch(`/monthly_revenue_${a}.json`).then(r=>{if(!r.ok)throw new Error();return r.json();}).then(d=>[a,d.months]).catch(()=>[a,null])
        )).then(res=>{const areas={};let f=false;res.forEach(([a,m])=>{if(m){areas[a]=m;f=true;}});
          if(f){setRawData(areas);setDs("pipeline");}else{setRawData(genSyn());setDs("syntetisk");}});
      });
  },[]);

  useEffect(()=>{
    fetch("/theoretical_max_all.json").then(r=>{if(!r.ok)throw new Error();return r.json();})
      .then(d=>setTmax(d.areas)).catch(()=>setTmax(null));
    fetch("/actuals.json").then(r=>{if(!r.ok)throw new Error("HTTP "+r.status);return r.json();})
      .then(d=>setActs(d))
      .catch(e=>{console.warn("actuals.json kunde inte läsas:",e.message);setActs(null);});
    fetch("/benchmark.json").then(r=>{if(!r.ok)throw new Error("HTTP "+r.status);return r.json();})
      .then(d=>setBench(d))
      .catch(e=>{console.warn("benchmark.json kunde inte läsas:",e.message);setBench(null);});
  },[]);

  const toggle=useCallback(id=>{setSel(p=>{const n=new Set(p);n.has(id)?(n.size>1&&n.delete(id)):n.add(id);return n;});},[]);
  const aD=useMemo(()=>rawData?(rawData[area]||rawData["SE3"]||Object.values(rawData)[0]||[]):null,[rawData,area]);
  const allM=useMemo(()=>aD?aD.map(r=>tx(r,dur,mw,lang)):[],[aD,dur,mw,lang]);
  const tArea=useMemo(()=>tmax?(tmax[area]||[]):[],[tmax,area]);
  const months=useMemo(()=>{
    const base=tr===0?allM:allM.slice(-tr);
    if(!tArea.length)return base;
    const map={};tArea.forEach(r=>{map[r.year_month]=r;});
    return base.map(m=>{const t=map[m.ym];if(!t)return m;
      const k=s=>`${s}_${dur}h`;
      return{...m,
        tmax:Math.round((t[k("tmax")]||0)*mw),
        tmax_fcrn:Math.round((t[k("tmax_fcrn")]||0)*mw),
        tmax_fcrd:Math.round((t[k("tmax_fcrd")]||0)*mw),
        tmax_cm_up:Math.round((t[k("tmax_cm_up")]||0)*mw),
        tmax_cm_down:Math.round((t[k("tmax_cm_down")]||0)*mw),
        tmax_energy:Math.round((t[k("tmax_energy")]||0)*mw),
        tmax_cycles:t[k("tmax_cycles")]||0};});
  },[allM,tr,tArea,dur,mw]);
  const hasT=months.some(m=>m.tmax>0);

  // faktiskt utfall: skalas linjärt med MW, aldrig med uthållighet
  const actArea=useMemo(()=>(acts&&acts.actuals&&acts.actuals[area])||[],[acts,area]);
  const actShown=useMemo(()=>{
    if(!actArea.length)return[];
    const near=a=>DURS.reduce((x,y)=>Math.abs(y-(a.duration_h||2))<Math.abs(x-(a.duration_h||2))?y:x);
    return actArea.filter(a=>near(a)===dur);
  },[actArea,dur]);
  const mAct=useMemo(()=>{const o={};actShown.forEach(a=>{o[a.year_month]=a;});return o;},[actShown]);
  const monthsA=useMemo(()=>months.map(m=>{const a=mAct[m.ym];if(!a)return m;
    const av=a.availability==null?1:a.availability;
    return{...m,actual:Math.round(a.total/(a.mw||1)*mw),
           actualNorm:Math.round(a.total/av/(a.mw||1)*mw),actAvail:av,actNote:a[`note_${lang}`]||a.note||""};}),
    [months,mAct,mw,lang]);
  const hasAct=monthsA.some(m=>m.actual!=null);

  // Clean Horizon-index: visas oförändrat, skalas bara med MW
  const bArea=useMemo(()=>(bench&&bench.index&&bench.index[area])||[],[bench,area]);
  const monthsB=useMemo(()=>{
    if(!bArea.length)return monthsA;
    const map={};bArea.forEach(r=>{map[r.year_month]=r;});
    return monthsA.map(m=>{const b=map[m.ym];if(!b)return m;
      const v=b[`h${dur}`];
      return v==null?m:{...m,bench:Math.round(v*mw),benchFlag:b.flag||null,
        benchNote:b[lang==="en"?"note_en":"note_sv"]||null};});
  },[monthsA,bArea,dur,mw,lang]);
  const hasBench=monthsB.some(m=>m.bench>0);
  const benchSum=useMemo(()=>{
    const p=monthsB.filter(m=>m.bench>0&&m.mfrr_opt>0);
    if(!p.length)return null;
    return{n:p.length,idx:p.reduce((a,m)=>a+m.bench,0),gv:p.reduce((a,m)=>a+m.mfrr_opt,0),
           corr:p.filter(m=>m.benchFlag==="corrected")};
  },[monthsB]);
  const valid=useMemo(()=>{
    const p=monthsA.filter(m=>m.actualNorm>0&&m.mfrr_opt>0);
    if(!p.length)return null;
    const dev=x=>Math.abs(x.mfrr_opt/x.actualNorm-1)*100;
    const meas=p.filter(m=>m.spreadSrc==="measured");
    const prox=p.filter(m=>m.spreadSrc!=="measured");
    const base=meas.length?meas:p;                     // mätt om det finns, annars allt
    return{n:base.length,max:Math.max(...base.map(dev)),
           onlyProxy:!meas.length,
           proxyN:prox.length,proxyMax:prox.length?Math.max(...prox.map(dev)):0,
           site:actShown[0]?.site||"",
           spec:actShown[0]?`${actShown[0].mw} MW / ${actShown[0].duration_h} MWh`:"",
           adj:base.some(m=>m.actAvail<0.999)};
  },[monthsA,actShown]);
  const proxyMonths=useMemo(()=>monthsA.filter(m=>m.spreadSrc==="da_proxy"),[monthsA]);

  // Systemkalkyl: interpolera mellan närmaste C-tal i rutnätet, skala med MW.
  // Max C/2,5: det ar vad som finns att kalibrera mot (Skynet 2,5 MWh).
  const bt=useMemo(()=>rawData&&ds==="pipeline"
    ?computeBacktest({revenue:{areas:rawData},benchmark:bench,ceiling:tmax?{areas:tmax}:null,area,mw:batMw,mwh:batMwh})
    :null,[rawData,ds,bench,tmax,area,batMw,batMwh]);
  const manualMonths=useMemo(()=>monthsA.filter(m=>m.spreadSrc==="manual"),[monthsA]);
  const vers=useMemo(()=>{
    if(!acts||!acts.strategy_versions)return[];
    return acts.strategy_versions.map(v=>({...v,at:months.find(m=>m.ym===v.from)?.label}))
      .filter(v=>v.at);
  },[acts,months]);
  const N=months.length; // dynamic period length for KPIs
  const ann=useMemo(()=>{const r={};SIDS.forEach(s=>{r[s]=months.reduce((a,m)=>a+(m[s]||0),0);});r.tmax=months.reduce((a,m)=>a+(m.tmax||0),0);return r;},[months]);
  const durC=useMemo(()=>{if(!aD)return[];const src=tr===0?aD:aD.slice(-tr);
    return src.map(r=>{const lb=tx(r,2,1,lang).label;const row={label:lb};DURS.forEach(d=>{row[`opt_${d}h`]=Math.round((r[`optimal_${d}h`]||0)*mw);});return row;});},[aD,mw,tr,lang]);
  const noMfrr=useMemo(()=>aD?aD.every(r=>(r.mfrr_cm_up_price||0)===0&&(r.mfrr_cm_down_price||0)===0):false,[aD]);

  if(!rawData)return(<div style={{background:t.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:t.mu,fontFamily:"'Plus Jakarta Sans'"}}>{L.loading}</div>);

  const sc=sid=>isDark?S[sid].c[0]:S[sid].c[1];
  const thS={padding:"5px 6px",textAlign:"right",fontSize:8,textTransform:"uppercase",letterSpacing:"0.05em",color:t.mu};
  const xP={dataKey:"label",tick:{fill:t.cT,fontSize:9,fontFamily:"'Plus Jakarta Sans'"},angle:-45,textAnchor:"end",height:50};
  const yP={tick:{fill:t.cT,fontSize:10},tickFormatter:v=>`€${(v/1000).toFixed(0)}k`};
  const red=isDark?"#ef4444":"#dc2626",grn=isDark?"#34d399":"#059669",amb=isDark?"#fbbf24":"#d97706";
  const T_GREY=isDark?"#94a3b8":"#64748b";
  // Clean Horizon ar huvudjamforelsen och ska synas ovanpa staplarna:
  // mork heldragen linje. Taket ar en ljusare streckad referens.
  const CH_C=isDark?"#cbd5e1":"#334155";
  // Faktiskt utfall far egen form och farg - samma morka ton som indexet
  // gjorde punkterna omojliga att skilja fran Clean Horizon-linjen.
  const ACT_C=isDark?"#38bdf8":"#0369a1";

  return(
    <div style={{background:t.bg,minHeight:"100vh",fontFamily:"'Plus Jakarta Sans',sans-serif",color:t.tx,transition:"background 0.3s ease"}}>
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      <header style={{borderBottom:`1px solid ${t.bd}`,padding:"16px 24px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
          <div><h1 style={{margin:0,fontSize:18,fontWeight:600,letterSpacing:"-0.03em"}}>BESS Revenue Intelligence</h1>
            <div style={{fontSize:11,color:t.mu,marginTop:3}}>{L.sub} · {area}
              {ds==="syntetisk"&&<span style={{color:red}}> · ⚠ {L.synth}</span>}
              {ds==="pipeline"&&<span style={{color:grn}}> · ✓ {L.pipe}</span>}</div></div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <span style={{fontSize:9,color:t.dm,textTransform:"uppercase"}}>{L.zone}</span>
            {["SE1","SE2","SE3","SE4"].map(a=><Pill key={a} active={area===a} onClick={()=>setArea(a)} t={t}>{a}</Pill>)}
            <div style={{width:1,height:18,background:t.bd,margin:"0 4px"}}/>
            {view!=="battery"&&<><span style={{fontSize:9,color:t.dm,textTransform:"uppercase"}}>MW</span>
            <input type="number" min={0.5} max={200} step={0.5} value={mw} onChange={e=>setMw(Number(e.target.value)||1)}
              style={{width:52,background:t.card,border:`1px solid ${t.bd}`,borderRadius:6,color:t.tx,padding:"4px 8px",fontSize:13,fontFamily:"'JetBrains Mono'",textAlign:"center"}}/></>}
            <button onClick={()=>setIsDark(!isDark)} style={{background:t.cA,border:`1px solid ${t.bd}`,borderRadius:20,padding:"4px 14px",cursor:"pointer",color:t.mu,fontSize:11}}>
              {isDark?L.light:L.dark}</button>
            <div style={{display:"flex",background:t.cA,border:`1px solid ${t.bd}`,borderRadius:20,overflow:"hidden"}}>
              {["sv","en"].map(lc=>(<button key={lc} onClick={()=>setLang(lc)} style={{
                background:lang===lc?(isDark?"#38bdf8":"#0891b2"):"transparent",
                color:lang===lc?(isDark?"#000":"#fff"):t.mu,border:"none",padding:"4px 11px",
                cursor:"pointer",fontSize:11,fontWeight:lang===lc?600:400,letterSpacing:"0.03em"}}>
                {lc.toUpperCase()}</button>))}</div>
          </div>
        </div>
      </header>
      <div style={{padding:"16px 24px",maxWidth:1440,margin:"0 auto"}}>
        {view!=="battery"&&<div style={{display:"flex",gap:8,marginBottom:16,alignItems:"center",flexWrap:"wrap"}}>
          <span style={{fontSize:9,color:t.dm,textTransform:"uppercase",letterSpacing:"0.08em"}}>{L.dura}</span>
          {DURS.map(d=>(<button key={d} onClick={()=>setDur(d)} style={{background:dur===d?(isDark?"#38bdf8":"#0891b2"):t.card,
            color:dur===d?(isDark?"#000":"#fff"):t.mu,border:`1px solid ${dur===d?(isDark?"#38bdf8":"#0891b2"):t.bd}`,
            borderRadius:8,padding:"7px 20px",fontSize:14,cursor:"pointer",fontWeight:600,fontFamily:"'JetBrains Mono'"}}>{d}h</button>))}
          <div style={{width:1,height:18,background:t.bd,margin:"0 8px"}}/>
          <span style={{fontSize:9,color:t.dm,textTransform:"uppercase",letterSpacing:"0.08em"}}>{L.period}</span>
          {TR.map(r=><Pill key={r.k} active={tr===r.k} onClick={()=>setTr(r.k)} small t={t}>{r.l[lang]}</Pill>)}
          <div style={{flex:1}}/><span style={{fontSize:11,color:t.mu,fontFamily:"'JetBrains Mono'"}}>{mw} MW · {mw*dur} MWh · C/{dur}</span>
        </div>}
        {noMfrr&&(<div style={{marginBottom:16,padding:"12px 16px",background:amb+"12",border:`1px solid ${amb}30`,borderRadius:8,fontSize:11,color:amb}}>
          ⚠ <strong>{L.noData}</strong> {L.noDataRest}</div>)}
        {view!=="battery"&&<div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
          <KPI label={`${L.ceiling} ${N} ${L.mo} (${dur}h)`} value={hasT?fmtE(ann.tmax):"—"} sub={L.foresight} color={isDark?"#94a3b8":"#64748b"} t={t}/>
          <KPI label={S.mfrr_opt.l[lang]} value={fmtE(ann.mfrr_opt)} sub={[hasT?`${(ann.mfrr_opt/ann.tmax*100).toFixed(0)}% ${L.ofCeil}`:null,
                 benchSum?`${(benchSum.gv/benchSum.idx*100).toFixed(0)}% ${L.vsIndex}`:null,
                 ].filter(Boolean).join(" · ")} color={sc("mfrr_opt")} t={t}/>
          {benchSum&&<KPI label={bench?.source?.[lang==="en"?"label_en":"label_sv"]||"Clean Horizon Index"}
            value={fmtE(benchSum.idx)} sub={`${benchSum.n} ${L.monthsShort} · GreenVoltis ${L.samePer} ${fmtE(benchSum.gv)}`}
            color={isDark?"#94a3b8":"#64748b"} t={t}/>}
        </div>}

        <div style={{marginBottom:12,padding:"11px 14px",background:t.card,
          border:`1px solid ${t.bd}`,borderLeft:`3px solid ${sc("mfrr_opt")}`,borderRadius:8,
          fontSize:11.5,color:t.mu,lineHeight:1.6,display:"flex",gap:10,alignItems:"flex-start"}}>
          <span aria-hidden style={{flexShrink:0,width:17,height:17,borderRadius:"50%",
            border:`1.5px solid ${sc("mfrr_opt")}`,color:sc("mfrr_opt"),fontSize:11,fontWeight:700,
            display:"flex",alignItems:"center",justifyContent:"center",marginTop:1,
            fontFamily:"Georgia,serif"}}>i</span>
          <span><strong style={{color:t.tx}}>{L.calcTitle}.</strong> {L.calcBody}</span>
        </div>
        {valid&&view!=="battery"&&(<div style={{marginBottom:16,padding:"10px 14px",background:t.cA,
          border:`1px solid ${grn}33`,borderRadius:8,fontSize:11,color:t.mu,
          display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <span style={{width:7,height:7,borderRadius:"50%",background:grn,flexShrink:0}}/>
          <span><strong style={{color:t.tx}}>{L.modelDev} ±{valid.max.toFixed(1)}%</strong> {L.ofActual}
            {" · "}{valid.n} {L.monthsShort}{valid.onlyProxy?"":` ${L.measured}`} · {valid.site} {valid.spec}
            {valid.adj?` · ${L.adjNote}`:""}
            {valid.proxyN>0&&!valid.onlyProxy&&(<span style={{color:t.dm}}>
              {" · "}{L.proxyDev}: ±{valid.proxyMax.toFixed(1)}% ({valid.proxyN} {L.monthsShort})</span>)}</span>
        </div>)}

        <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap",
          background:t.bg==="#0a0f1a"?"#0f1626":t.cA,padding:6,borderRadius:10,
          border:`1px solid ${t.bd}`}}>
          {[{k:"comparison",l:L.tComparison,h:L.hComparison},{k:"battery",l:L.tBattery,h:L.hBattery},
            {k:"mfrr",l:L.tMfrr,h:L.hMfrr},{k:"table",l:L.tTable,h:L.hTable}
          ].map(v=><Tab key={v.k} active={view===v.k} onClick={()=>setView(v.k)} label={v.l} hint={v.h} t={t}/>)}</div>
        <div style={{marginTop:-6,marginBottom:16,fontSize:11,color:t.mu,lineHeight:1.6}}>
          {{comparison:L.hComparison,mfrr:L.hMfrr,battery:L.hBattery,table:L.hTable}[view]}</div>

        {view==="comparison"&&(<Card title={`${L.tComparison} — ${dur}h (${mw*dur} MWh)`} sub={`${L.eurMo} · ${N} ${L.months}${months.length?` (${months[0].label} – ${months[months.length-1].label})`:""}`} t={t}>
          <ResponsiveContainer width="100%" height={400}><ComposedChart data={monthsB} margin={{top:18,right:12,bottom:5,left:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke={t.cG}/><XAxis {...xP}/><YAxis {...yP}/>
            <Tooltip content={<TT theme={t}/>}/><Legend wrapperStyle={{fontSize:10,fontFamily:"'Plus Jakarta Sans'"}}/>
            {vers.map(v=>(<ReferenceLine key={v.from} x={v.at} stroke={t.mu} strokeDasharray="2 4"
              label={{value:v.label,position:"top",fill:t.mu,fontSize:9}}/>))}
            {SIDS.filter(s=>sel.has(s)).map(sid=>(<Bar key={sid} dataKey={sid} name={S[sid].l[lang]} fill={sc(sid)} opacity={0.6} radius={[2,2,0,0]}/>))}
            {hasT&&<Line dataKey="tmax" name={L.ceiling} stroke={T_GREY} strokeWidth={1.5} strokeOpacity={0.7} strokeDasharray="6 4" dot={false}/>}
            {hasBench&&<Line dataKey="bench" name={bench?.source?.[lang==="en"?"label_en":"label_sv"]||"Clean Horizon Index"}
              stroke={CH_C} strokeWidth={2.25}
              dot={{r:3.5,fill:CH_C,stroke:t.card,strokeWidth:1.5}} activeDot={{r:5}}
              connectNulls={false}/>}
            {hasAct&&<Line dataKey="actual" name={L.actual} stroke={ACT_C} strokeWidth={0}
              activeDot={false}
              dot={p=>{if(p.payload?.actual==null||p.cx==null)return<g key={p.index}/>;
                const full=(p.payload.actAvail??1)>=0.999, r=7;
                const d=`M${p.cx},${p.cy-r} L${p.cx+r},${p.cy} L${p.cx},${p.cy+r} L${p.cx-r},${p.cy} Z`;
                return<path key={p.index} d={d} data-actual="1"
                  fill={full?ACT_C:t.card} stroke={full?t.card:ACT_C} strokeWidth={full?1.5:2.25}/>;}}
              connectNulls={false} legendType="diamond"/>}
          </ComposedChart></ResponsiveContainer>
          {vers.length>0&&(<div style={{marginTop:10,display:"flex",gap:14,flexWrap:"wrap",fontSize:10.5,color:t.mu}}>
            {vers.map(v=>(<span key={v.from}><strong style={{color:t.mu}}>{v.label}</strong> {v.at} — {v.note}</span>))}</div>)}
          {hasBench&&bench&&(<div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${t.bd}`,
            fontSize:10.5,color:t.mu,lineHeight:1.65}}>
            <span style={{color:t.tx,fontWeight:500}}>{bench.source?.name} {bench.source?.copyright}</span>
            {bench.source?.delivered_by?` · ${bench.source.delivered_by}`:""}
            {benchSum&&<> · {L.vsIndex}: {fmtE(benchSum.gv)} / {fmtE(benchSum.idx)}
              {" = "}<strong style={{color:t.mu}}>{(benchSum.gv/benchSum.idx*100).toFixed(0)}%</strong></>}
            <br/>{bench.methodology?.[lang==="en"?"note_en":"note_sv"]||L.benchNote}
          </div>)}
          {benchSum?.corr?.map(m=>(
            <div key={m.ym} style={{marginTop:8,padding:"9px 12px",background:amb+"12",
              border:`1px solid ${amb}33`,borderRadius:8,fontSize:10.5,color:t.mu,lineHeight:1.65}}>
              <strong style={{color:amb}}>✎ {m.label}</strong> — {m.benchNote||L.benchPartial}</div>))}
          {proxyMonths.length>0&&(<div style={{marginTop:6,fontSize:10.5,color:t.mu}}>
            ⚠ {proxyMonths.map(m=>m.label).join(", ")} — {L.proxyNote}</div>)}
          {manualMonths.length>0&&(<div style={{marginTop:4,fontSize:10,color:amb}}>
            ✎ {manualMonths.map(m=>m.label).join(", ")} — {L.manualNote}</div>)}
          {monthsA.filter(m=>m.actAvail!=null&&m.actAvail<0.999).map(m=>(
            <div key={m.ym} style={{marginTop:6,fontSize:10.5,color:t.mu}}>
              ○ {m.label} · {L.avail} {(m.actAvail*100).toFixed(0)}% · {m.actNote} · {L.adjNote}: {fmtE(m.actualNorm)}</div>))}
          {(()=>{
            // Alternativen som KONTEXT, inte som konkurrenter: en kompakt
            // liggande ranking for hela perioden i stallet for atta staplar
            // per manad. Lasaren far veta vad som fanns att valja pa utan att
            // behova lasa 72 tal.
            const tot=SIDS.map(sid=>[sid,months.reduce((a,m)=>a+(m[sid]||0),0)])
                          .filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]);
            if(tot.length<2)return null;
            const top=tot[0][1];
            return(<div style={{marginTop:16,paddingTop:14,borderTop:`1px solid ${t.bd}`}}>
              <div style={{display:"flex",alignItems:"baseline",gap:10,marginBottom:3}}>
                <span style={{fontSize:11.5,color:t.tx,fontWeight:600}}>{L.altTitle}</span>
                <span style={{fontSize:10,color:t.dm}}>{L.altSub}</span></div>
              <div style={{marginTop:9,display:"flex",flexDirection:"column",gap:5}}>
                {tot.map(([sid,v])=>{
                  const me=sid==="mfrr_opt";
                  return(<div key={sid} style={{display:"flex",alignItems:"center",gap:9}}>
                    <span style={{width:132,flexShrink:0,fontSize:10.5,textAlign:"right",
                      color:me?t.tx:t.mu,fontWeight:me?600:400}}>{S[sid].l[lang]}</span>
                    <div style={{flex:1,height:me?15:11,background:t.cA,borderRadius:3,overflow:"hidden"}}>
                      <div style={{width:`${v/top*100}%`,height:"100%",background:sc(sid),
                        opacity:me?0.95:0.42,borderRadius:3}}/></div>
                    <span style={{width:74,flexShrink:0,fontSize:10.5,textAlign:"right",
                      fontFamily:"'JetBrains Mono'",color:me?t.tx:t.mu,
                      fontWeight:me?600:400}}>{fmtE(v)}</span>
                    <span style={{width:40,flexShrink:0,fontSize:10,textAlign:"right",color:t.dm}}>
                      {me?"":`${(v/tot.find(x=>x[0]==="mfrr_opt")[1]*100).toFixed(0)}%`}</span>
                  </div>);})}
              </div>
              <div style={{marginTop:10,fontSize:10.5,color:t.mu,lineHeight:1.65}}>{L.altNote}</div>
            </div>);})()}
          </Card>)}

        {view==="mfrr"&&(()=>{
          const kU=L.mfrrUp,kD=L.mfrrDown,kC=L.conv,kG=S.mfrr_opt.l[lang];
          const mD=months.map(m=>({label:m.label,[kU]:m.mfrr_up,[kD]:m.mfrr_down,delta:m.mfrr_up-m.mfrr_down}));
          const sU=mD.reduce((s,d)=>s+d[kU],0),sD2=mD.reduce((s,d)=>s+d[kD],0);
          const cvn=months.map(m=>({label:m.label,[kC]:m.mfrr_conv,[kG]:m.mfrr_opt,delta:m.mfrr_opt-m.mfrr_conv}));
          const sC=cvn.reduce((s,d)=>s+d[kC],0),sN=cvn.reduce((s,d)=>s+d[kG],0);
          return(<div style={{display:"flex",flexDirection:"column",gap:16}}>
            <Card title={`${L.tMfrr} — ${area} · ${dur}h`} sub={L.perDir} t={t}>
              <ResponsiveContainer width="100%" height={320}><ComposedChart data={mD} margin={{top:8,right:12,bottom:5,left:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke={t.cG}/><XAxis {...xP}/><YAxis {...yP}/>
                <Tooltip content={<TT theme={t}/>}/><Legend wrapperStyle={{fontSize:10}}/>
                <Bar dataKey={kU} fill={grn} opacity={0.7} radius={[2,2,0,0]}/>
                <Bar dataKey={kD} fill={amb} opacity={0.7} radius={[2,2,0,0]}/>
                <Line dataKey="delta" name={L.dUpDown} stroke={t.tx} strokeWidth={1.5} strokeDasharray="4 2" dot={{r:2,fill:t.tx}}/>
              </ComposedChart></ResponsiveContainer>
              <div style={{marginTop:12,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                <SB label={`${L.mfrrUp} ${N}${L.mo}`} value={fmtE(sU)} color={grn} t={t}/>
                <SB label={`${L.mfrrDown} ${N}${L.mo}`} value={fmtE(sD2)} color={amb} t={t}/>
                <SB label={L.best} value={sU>sD2?L.up:L.down} color={sU>sD2?grn:amb} t={t}/></div></Card>
            <Card title={`${L.vsTitle} — ${dur}h`} sub={L.sameDir} t={t}>
              <ResponsiveContainer width="100%" height={300}><ComposedChart data={cvn} margin={{top:8,right:12,bottom:5,left:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke={t.cG}/><XAxis {...xP}/><YAxis {...yP}/>
                <Tooltip content={<TT theme={t}/>}/><Legend wrapperStyle={{fontSize:10}}/>
                <Bar dataKey={kC} fill={sc("mfrr_conv")} opacity={0.7} radius={[2,2,0,0]}/>
                <Bar dataKey={kG} fill={sc("mfrr_opt")} opacity={0.7} radius={[2,2,0,0]}/>
                <Line dataKey="delta" name={L.dOptConv} stroke={t.tx} strokeWidth={1.5} strokeDasharray="4 2" dot={{r:2,fill:t.tx}}/>
              </ComposedChart></ResponsiveContainer>
              <div style={{marginTop:10,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                <SB label={`${L.conv} ${N}${L.mo}`} value={fmtE(sC)} color={sc("mfrr_conv")} t={t}/>
                <SB label={`${S.mfrr_opt.l[lang]} ${N}${L.mo}`} value={fmtE(sN)} color={sc("mfrr_opt")} t={t}/>
                <SB label={L.diff} value={sC>0?`+${((sN-sC)/sC*100).toFixed(0)}%`:"—"} color={t.tx} t={t}/></div>
              {(()=>{
                const fg=months.reduce((s,m)=>s+(m.fcrGain||0),0);
                const base=sN-fg;
                const fp=months.reduce((s,m)=>s+(m.fcrnPot||0),0);
                const fin=months.length>0&&months[months.length-1].fcrnIn!==false;
                const mdl=months.filter(m=>m.fcrBasis==="modellerad").length;
                const top=[...months].filter(m=>(m.fcrGain||0)>0)
                  .sort((a,b)=>b.fcrGain-a.fcrGain).slice(0,3);
                if(!fg&&!fp)return null;
                return(<div style={{marginTop:10}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                    <SB label={lang==="en"?"Without FCR-D":"Utan FCR-D"} value={fmtE(base)} color={t.mu} t={t}/>
                    <SB label={lang==="en"?"FCR-D contribution":"Varav FCR-D"} value={`+${fmtE(fg)}`} color={grn} t={t}/>
                    <SB label={fin?(lang==="en"?"of which FCR-N":"Varav FCR-N")
                                   :(lang==="en"?"If FCR-N prequalified":"FCR-N om prekval.")}
                        value={fp?`+${fmtE(fp)}`:"—"} color={fin?grn:amb} t={t}/></div>
                  <div style={{marginTop:8,fontSize:10.5,color:t.mu,lineHeight:1.6}}>
                    {L.fcrExpl}
                    {top.length>0&&<><br/>{lang==="en"?"Largest months: ":"Störst bidrag: "}
                      {top.map(m=>`${m.label} +${fmtE(m.fcrGain)} (${m.fcrGainPct.toFixed(0)}%)`).join(" · ")}</>}
                    {mdl>0&&<><br/><em style={{color:amb}}>{lang==="en"
                      ? `${mdl} of ${months.length} months are modelled: prequalification for FCR and mFRR on the same site completed in July 2026, so earlier months show what FCR would have added, not what was realised.`
                      : `${mdl} av ${months.length} månader är modellerade: prekvalificering för FCR och mFRR på samma anläggning blev klar i juli 2026, så tidigare månader visar vad FCR hade tillfört — inte realiserat utfall.`}</em></>}
                  </div></div>);})()}
              {(()=>{
                const ie=months.reduce((s,m)=>s+(m.idExtra||0),0);
                const n=months.filter(m=>(m.idExtra||0)>0).length;
                if(!ie)return null;
                return(<div style={{marginTop:8,fontSize:10.5,color:t.mu,lineHeight:1.6}}>
                  <strong style={{color:grn}}>{lang==="en"?"Extra intraday arbitrage":"Extra intradagsarbitrage"}: +{fmtE(ie)}</strong>
                  {" "}({n}{L.mo}). {L.extraExpl}
                  </div>);})()}
              <IB color={grn} t={t}><strong style={{color:t.tx}}>{L.conv}:</strong> {L.convIB}
                <br/><br/><strong style={{color:t.tx}}>{S.mfrr_opt.l[lang]}:</strong> {L.gvIB}</IB></Card></div>);})()}

        {/* Day-ahead och 1h/2h-vyerna har ingen flik langre - de listade andra
            strategier sida vid sida. Koden star kvar for internt bruk; lagg
            tillbaka {k:"dayahead"} respektive {k:"duration"} i flikraden ovan. */}
        {view==="dayahead"&&(()=>{
          const kGr=L.grossArb,kIm=L.imbCost,kNe=L.netRev,kRf=L.id2ref;
          const dD=months.map(m=>({label:m.label,[kGr]:Math.round(m.dayahead/0.92),[kIm]:-Math.round(m.dayahead/0.92*0.08),[kNe]:m.dayahead,[kRf]:m.intraday2}));
          const tG=dD.reduce((s,d)=>s+d[kGr],0),tI=dD.reduce((s,d)=>s+Math.abs(d[kIm]),0);
          const tD=dD.reduce((s,d)=>s+d[kNe],0),tID=dD.reduce((s,d)=>s+d[kRf],0);
          return(<Card title={`${L.daTitle} — ${dur}h (${mw*dur} MWh)`} sub={L.daSub} t={t}>
            <ResponsiveContainer width="100%" height={350}><ComposedChart data={dD} margin={{top:8,right:12,bottom:5,left:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke={t.cG}/><XAxis {...xP}/><YAxis {...yP}/>
              <Tooltip content={<TT theme={t}/>}/><Legend wrapperStyle={{fontSize:10}}/>
              <Bar dataKey={kGr} fill={sc("dayahead")} opacity={0.5} radius={[2,2,0,0]}/>
              <Bar dataKey={kIm} fill={red} opacity={0.7} radius={[0,0,2,2]}/>
              <Line dataKey={kNe} name={L.daNet} stroke={sc("dayahead")} strokeWidth={2.5} dot={{r:3,fill:sc("dayahead")}}/>
              <Line dataKey={kRf} stroke={sc("intraday2")} strokeWidth={1.5} strokeDasharray="5 3" dot={false}/>
            </ComposedChart></ResponsiveContainer>
            <div style={{marginTop:12,display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
              <SB label={`${L.daGross} ${N}${L.mo}`} value={fmtE(tG)} color={sc("dayahead")} t={t}/>
              <SB label={L.imbCost} value={`−${fmtE(tI)}`} color={red} t={t}/>
              <SB label={`${L.daNet} ${N}${L.mo}`} value={fmtE(tD)} color={sc("dayahead")} t={t}/>
              <SB label={L.id2c} value={fmtE(tID)} color={sc("intraday2")} t={t}/></div></Card>);})()}

        {view==="duration"&&(<Card title={L.durTitle} sub={`${tr?`${L.last} ${tr}`:L.allMonths.split(" ")[0]} ${L.mo} · ${L.effMwh}: 1.0 / 1.8`} t={t}>
          <ResponsiveContainer width="100%" height={350}><ComposedChart data={durC} margin={{top:8,right:12,bottom:5,left:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke={t.cG}/><XAxis {...xP}/><YAxis {...yP}/>
            <Tooltip content={<TT theme={t}/>}/><Legend wrapperStyle={{fontSize:10}}/>
            <Line dataKey="opt_1h" name={`1h ${L.optimal.toLowerCase()}`} stroke={isDark?"#38bdf8":"#0284c7"} strokeWidth={2} dot={{r:3}}/>
            <Line dataKey="opt_2h" name={`2h ${L.optimal.toLowerCase()}`} stroke={isDark?"#f472b6":"#db2777"} strokeWidth={2.5} dot={{r:3}}/>
          </ComposedChart></ResponsiveContainer>
          <div style={{marginTop:14,display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
            {DURS.map(d=>{const a=durC.reduce((s,r)=>s+(r[`opt_${d}h`]||0),0);
              return(<div key={d} style={{background:t.cA,border:`1px solid ${t.bd}`,borderRadius:10,padding:14,textAlign:"center"}}>
                <div style={{fontSize:28,fontWeight:600,fontFamily:"'JetBrains Mono'",color:d===dur?(isDark?"#38bdf8":"#0891b2"):t.tx}}>{d}h</div>
                <div style={{fontSize:10,color:t.mu}}>{mw} MW / {mw*d} MWh</div>
                <div style={{fontSize:18,fontWeight:500,fontFamily:"'JetBrains Mono'",color:grn,marginTop:8}}>{fmtE(a)}</div>
                <div style={{fontSize:10,color:t.mu}}>{L.optimal} {N} {L.mo}</div></div>);})}</div></Card>)}

        {/* Marknadstaksfliken ar borttagen: den krävde en paragraf for att
            forklaras och sa for lite. Taket finns kvar som referenslinje i
            huvudvyn och som nyckeltal, och theoretical_max.py kors vidare for
            intern analys. Lagg tillbaka {k:"tmax"} i flikraden for att ateroppna. */}
        {view==="tmax"&&(()=>{
          const dTot=months.reduce((a,m)=>a+(m.tmax||0),0);
          const gv=months.reduce((a,m)=>a+(m.mfrr_opt||0),0);
          const cv=months.reduce((a,m)=>a+(m.mfrr_conv||0),0);
          const comp=[["tmax_fcrn","FCR-N",sc("fcrn")],["tmax_fcrd","FCR-D",sc("fcrd")],
                      ["tmax_cm_up",L.cmUp,sc("mfrr_opt")],["tmax_cm_down",L.cmDown,amb],
                      ["tmax_energy",L.energy,sc("intraday2")]];
          const kGv=S.mfrr_opt.l[lang],kGap=L.ceilGap;
          // Staplade delkomponenter var obegripliga: lasaren sag fem lager
          // utan att forsta att det var TAKETS sammansattning, inte var egen.
          // Nu tva tydliga lager - vad vi tog och vad som lamnades kvar -
          // sa stapelns hojd ar taket och den grona delen ar var andel.
          const data=months.map(m=>({label:m.label,
            [kGv]:m.mfrr_opt||0,
            [kGap]:Math.max(0,(m.tmax||0)-(m.mfrr_opt||0)),
            andel:(m.tmax>0?(m.mfrr_opt/m.tmax*100):null)}));
          const compTot=comp.map(([k,l,c])=>[l,c,months.reduce((a,m)=>a+(m[k]||0),0)])
                            .filter(x=>x[2]>0).sort((a,b)=>b[2]-a[2]);
          const compSum=compTot.reduce((a,x)=>a+x[2],0);
          if(!hasT)return(<Card title={L.ceiling} t={t}>
            <div style={{fontSize:11,color:t.mu,lineHeight:1.8}}>
              <strong style={{color:amb}}>{L.ceilMissing}</strong><br/><br/>
              {L.ceilRun} <code>python theoretical_max.py --area all --from 2026-01 --to 2026-08</code><br/>
              {L.ceilPut}</div></Card>);
          return(<Card title={`${L.ceiling} — ${dur}h (${mw*dur} MWh)`} sub={L.ceilSub} t={t}>
            <ResponsiveContainer width="100%" height={380}><ComposedChart data={data} margin={{top:8,right:12,bottom:5,left:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke={t.cG}/><XAxis {...xP}/>
              <YAxis {...yP}/><YAxis yAxisId="r" orientation="right" domain={[0,100]}
                tick={{fontSize:9,fill:t.dm}} axisLine={false} tickLine={false} unit="%"/>
              <Tooltip content={<TT theme={t}/>}/><Legend wrapperStyle={{fontSize:10}}/>
              <Bar dataKey={kGv} stackId="tk" fill={sc("mfrr_opt")} opacity={0.85} radius={[0,0,0,0]}/>
              <Bar dataKey={kGap} stackId="tk" fill={T_GREY} opacity={0.18} radius={[2,2,0,0]}/>
              <Line yAxisId="r" dataKey="andel" name={L.shareCeil} stroke={t.tx} strokeWidth={1.5}
                strokeDasharray="3 3" dot={{r:2.5,fill:t.tx}} unit="%"/>
            </ComposedChart></ResponsiveContainer>
            <div style={{marginTop:12,display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
              <SB label={`${L.ceiling} ${N} ${L.mo}`} value={fmtE(dTot)} color={T_GREY} t={t}/>
              <SB label="GreenVoltis" value={fmtE(gv)} color={sc("mfrr_opt")} t={t}/>
              <SB label={L.shareCeil} value={dTot?`${(gv/dTot*100).toFixed(0)}%`:"—"} color={sc("mfrr_opt")} t={t}/>
              <SB label={L.ceilGap} value={fmtE(Math.max(0,dTot-gv))} color={T_GREY} t={t}/></div>
            {compTot.length>0&&(<div style={{marginTop:12,paddingTop:10,borderTop:`1px solid ${t.bd}`}}>
              <div style={{fontSize:10,color:t.dm,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:7}}>
                {L.ceilWhat}</div>
              <div style={{display:"flex",height:9,borderRadius:5,overflow:"hidden",marginBottom:7}}>
                {compTot.map(([l,c,v])=>(<div key={l} style={{width:`${v/compSum*100}%`,background:c,opacity:0.75}}/>))}</div>
              <div style={{display:"flex",gap:14,flexWrap:"wrap",fontSize:10.5,color:t.mu}}>
                {compTot.map(([l,c,v])=>(<span key={l} style={{display:"flex",alignItems:"center",gap:5}}>
                  <span style={{width:8,height:8,borderRadius:2,background:c,opacity:0.75}}/>
                  {l} {(v/compSum*100).toFixed(0)}%</span>))}</div></div>)}
            <IB color={T_GREY} t={t}>{L.ceilExpl}</IB>
          </Card>);})()}

        {view==="battery"&&(()=>{
          const inp={background:t.cA,border:`1px solid ${t.bd}`,borderRadius:8,color:t.tx,
            padding:"8px 10px",fontSize:16,width:96,fontFamily:"'JetBrains Mono'",textAlign:"right"};
          const lbl={fontSize:10,color:t.mu,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6};
          const c=batMwh/batMw;
          const p=bt&&!bt.error?periodLabel(bt.first,bt.last,lang):"";
          const cap=x=>x.charAt(0).toUpperCase()+x.slice(1);
          const data=bt&&!bt.error?bt.months.map(m=>({label:cap(monthName(m.ym,lang,false).slice(0,3)),
            rev:Math.round(m.rev),ch:m.ch!=null?Math.round(m.ch):null,ceil:m.ceil!=null?Math.round(m.ceil):null})):[];
          const errTxt={bad:L.repBadEmail,link:L.repLinkErr,send:L.repSendErr,rate:L.repRate,auth:L.repAuth}[repErr];
          const btn=(on)=>({background:on?sc("mfrr_opt"):t.cA,color:on?"#fff":t.mu,
            border:`1px solid ${on?sc("mfrr_opt"):t.bd}`,borderRadius:8,padding:"9px 16px",fontSize:13,
            fontWeight:600,cursor:on?"pointer":"default",fontFamily:"'Plus Jakarta Sans'"});
          return(<div style={{display:"grid",gap:16}}>
          <Card title={L.batTitle} sub={L.batSub} t={t}>
            <div style={{display:"flex",gap:22,alignItems:"flex-end",flexWrap:"wrap",marginBottom:18}}>
              <div><div style={lbl}>{L.batZone}</div>
                <div style={{display:"flex",gap:6}}>{["SE1","SE2","SE3","SE4"].map(a=>
                  <Pill key={a} active={area===a} onClick={()=>setArea(a)} t={t}>{a}</Pill>)}</div></div>
              <div><div style={lbl}>{L.effect}</div>
                <input aria-label={L.effect} type="number" min={0.1} max={1000} step={0.1} value={batMw}
                  onChange={e=>setBatMw(Math.max(0.1,Number(e.target.value)||0.1))} style={inp}/>
                <span style={{color:t.mu,fontSize:12,marginLeft:6}}>MW</span></div>
              <div><div style={lbl}>{L.energy}</div>
                <input aria-label={L.energy} type="number" min={0.1} max={2500} step={0.1} value={batMwh}
                  onChange={e=>setBatMwh(Math.max(0.1,Number(e.target.value)||0.1))} style={inp}/>
                <span style={{color:t.mu,fontSize:12,marginLeft:6}}>MWh</span></div>
              <div><div style={lbl}>{L.batDur}</div>
                <div style={{fontSize:20,fontWeight:700,fontFamily:"'JetBrains Mono'",padding:"5px 0",
                  color:bt&&bt.error&&/^c/.test(bt.error)?red:t.tx}}>{fmtHours(c,lang)}</div></div>
            </div>
            {!bt?<div style={{fontSize:12,color:t.mu}}>{ds==="pipeline"?L.loading:L.batNoData}</div>
             :bt.error?<div style={{fontSize:12.5,color:red,padding:"10px 0"}}>⚠ {
               {cLow:L.batLow,cHigh:L.batHigh}[bt.error]||L.batNoData}</div>
             :(<>
              <div style={{display:"flex",alignItems:"baseline",gap:12,flexWrap:"wrap",margin:"4px 0 16px"}}>
                <span style={{fontSize:34,fontWeight:600,fontFamily:"'JetBrains Mono'",color:sc("mfrr_opt"),letterSpacing:"-0.02em"}}>{fmtE(bt.total)}</span>
                <span style={{fontSize:14,color:t.mu}}>{L.batEarned(p)}</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8,marginBottom:16}}>
                <KPI label={L.batPerMw} value={fmtE(bt.perMw)} sub={`${fmtE(bt.perMwh)} per MWh`} color={t.mu} t={t}/>
                <KPI label={L.batYear} value={fmtE(bt.perMwYear)} sub={L.batYearSub} color={t.mu} t={t}/>
                <KPI label={L.batVsCh} value={bt.ch?fmtPct(bt.ch.ratio-1,lang,true):"—"} sub={bt.ch?L.batChSub(bt.ch.n):null} color={CH_C} t={t}/>
                <KPI label={L.batCeil} value={bt.ceil?fmtPct(bt.ceil.share,lang):"—"} sub={L.batCeilSub} color={T_GREY} t={t}/>
                <KPI label={L.batBest} value={fmtE(bt.best.rev)} sub={cap(monthName(bt.best.ym,lang))} color={sc("mfrr_opt")} t={t}/>
                <KPI label={L.batWorst} value={fmtE(bt.worst.rev)} sub={cap(monthName(bt.worst.ym,lang))} color={t.mu} t={t}/>
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={data} margin={{top:12,right:12,bottom:0,left:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={t.cG}/>
                  <XAxis dataKey="label" tick={{fill:t.cT,fontSize:10,fontFamily:"'Plus Jakarta Sans'"}}/>
                  <YAxis {...yP}/>
                  <Tooltip content={<TT theme={t}/>}/>
                  <Legend wrapperStyle={{fontSize:11}}/>
                  <Bar dataKey="rev" name={L.batYou} fill={sc("mfrr_opt")} opacity={0.8} radius={[3,3,0,0]}/>
                  <Line dataKey="ceil" name={L.ceiling} stroke={T_GREY} strokeWidth={1.5} strokeOpacity={0.7} strokeDasharray="6 4" dot={false} connectNulls={false}/>
                  <Line dataKey="ch" name={bench?.source?.[lang==="en"?"label_en":"label_sv"]||"Clean Horizon Index"}
                    stroke={CH_C} strokeWidth={2.25} dot={{r:3.5,fill:CH_C,stroke:t.card,strokeWidth:1.5}} connectNulls={false}/>
                </ComposedChart>
              </ResponsiveContainer>
              <div style={{fontSize:10.5,color:t.dm,marginTop:6}}>{L.batChNote}</div>
             </>)}
          </Card>

          {supabase&&repOn&&(<Card title={L.accTitle} sub={user?L.accSubIn:L.accSubOut} t={t}>
            {!user?(repState==="linkSent"
              ?(<div style={{fontSize:13,color:grn,lineHeight:1.6}}>✓ {L.repLinkSent(repTo)}</div>)
              :(<><div style={{fontSize:12,color:t.mu,marginBottom:10,lineHeight:1.6}}>{L.repHow}</div>
                <form onSubmit={e=>{e.preventDefault();sendLink();}} style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  <input type="email" aria-label={L.repEmail} placeholder={L.repEmailPh} value={repEmail}
                    onChange={e=>setRepEmail(e.target.value)} autoComplete="email"
                    style={{...inp,width:280,maxWidth:"100%",textAlign:"left",fontFamily:"'Plus Jakarta Sans'",fontSize:14}}/>
                  <button type="submit" disabled={repState==="linking"} style={btn(repState!=="linking")}>
                    {repState==="linking"?L.repLinking:L.repLink}</button>
                </form></>))
            :(!profileOk||pfEdit)?(<form onSubmit={e=>{e.preventDefault();saveProfile();}}>
                <div style={{fontSize:13,fontWeight:600,color:t.tx,marginBottom:4}}>{L.pfTitle}</div>
                <div style={{fontSize:12,color:t.mu,marginBottom:12,lineHeight:1.6}}>{L.pfHow(user.email)}</div>
                <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:12}}>
                  {[["name",L.pfName,"name","text",200],["phone",L.pfPhone,"tel","tel",170],["company",L.pfCompany,"organization","text",200]]
                    .map(([k,lab,ac,typ,w])=>(<label key={k} style={{display:"flex",flexDirection:"column",gap:4}}>
                      <span style={lbl}>{lab}</span>
                      <input type={typ} value={pf[k]} autoComplete={ac} onChange={e=>setPf({...pf,[k]:e.target.value})}
                        style={{...inp,width:w,maxWidth:"100%",textAlign:"left",fontFamily:"'Plus Jakarta Sans'",fontSize:14}}/></label>))}
                </div>
                <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                  <button type="submit" disabled={pfState==="saving"} style={btn(pfState!=="saving")}>
                    {pfState==="saving"?L.pfSaving:L.pfSave}</button>
                  {profileOk&&<button type="button" onClick={()=>{setPfEdit(false);setPfErr("");}} style={btn(false)}>{L.cancel}</button>}
                  <button type="button" onClick={()=>supabase.auth.signOut()} style={{background:"none",border:"none",
                    color:t.mu,fontSize:11,cursor:"pointer",textDecoration:"underline"}}>{L.repOut}</button>
                </div>
                {pfErr&&<div style={{marginTop:10,fontSize:12,color:red}}>⚠ {{name:L.pfErrName,phone:L.pfErrPhone,save:L.pfErrSave}[pfErr]}</div>}
              </form>)
            :(<>
              <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",marginBottom:14,fontSize:12,color:t.mu}}>
                <span>{L.repSigned} <strong style={{color:t.tx}}>{meta.full_name}</strong> · {user.email}</span>
                <button onClick={()=>setPfEdit(true)} style={{background:"none",border:"none",color:t.mu,fontSize:11,cursor:"pointer",textDecoration:"underline"}}>{L.pfEditLnk}</button>
                <button onClick={()=>supabase.auth.signOut()} style={{background:"none",border:"none",color:t.mu,fontSize:11,cursor:"pointer",textDecoration:"underline"}}>{L.repOut}</button>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"flex-end",flexWrap:"wrap"}}>
                <label style={{display:"flex",flexDirection:"column",gap:4}}>
                  <span style={lbl}>{L.prName}</span>
                  <input type="text" value={projName} maxLength={80} placeholder={L.prNamePh}
                    onChange={e=>setProjName(e.target.value)}
                    style={{...inp,width:260,maxWidth:"100%",textAlign:"left",fontFamily:"'Plus Jakarta Sans'",fontSize:14}}/></label>
                {(()=>{const can=bt&&!bt.error&&projState!=="saving";return(<>
                  <button onClick={()=>saveProject(false)} disabled={!can} style={btn(can)}>
                    {projState==="saving"?L.prSaving:projId?L.prUpdate:L.prSave}</button>
                  {projId&&<button onClick={()=>saveProject(true)} disabled={!can} style={btn(false)}>{L.prSaveNew}</button>}
                  <button onClick={sendReport} disabled={!bt||bt.error||repState==="sending"}
                    style={btn(Boolean(bt&&!bt.error&&repState!=="sending"))}>
                    {repState==="sending"?L.repSending:repState==="sent"?L.repAgain:L.repSend}</button></>);})()}
              </div>
              <div style={{minHeight:18,marginTop:8,fontSize:12}}>
                {projState==="saved"&&<span style={{color:grn,fontWeight:600}}>✓ {L.prSaved}</span>}
                {repState==="sent"&&<span style={{color:grn,fontWeight:600,marginLeft:projState==="saved"?12:0}}>✓ {L.repSent()}</span>}
                {projErr&&<span style={{color:red}}>⚠ {{noname:L.prErrName,save:L.prErrSave,table:L.prErrTable}[projErr]}</span>}
              </div>
              <div style={{marginTop:14,borderTop:`1px solid ${t.bd}`,paddingTop:12}}>
                <div style={{...lbl,marginBottom:8}}>{L.prMine}</div>
                {projects.length===0?<div style={{fontSize:12,color:t.dm}}>{L.prNone}</div>
                 :projects.map(pr=>(<div key={pr.id} style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",
                    padding:"7px 0",borderBottom:`1px solid ${t.bd}`,fontSize:13}}>
                    <span style={{fontWeight:600,color:t.tx,minWidth:140,flex:"1 1 160px"}}>{pr.name}
                      {pr.id===projId&&<span style={{marginLeft:8,fontSize:10,color:grn,fontWeight:700}}>{L.prOpenNow}</span>}</span>
                    <span style={{color:t.mu,fontSize:12,fontFamily:"'JetBrains Mono'"}}>
                      {pr.area} · {fmtNum(Number(pr.mw),lang)} MW / {fmtNum(Number(pr.mwh),lang)} MWh</span>
                    <span style={{color:t.dm,fontSize:11}}>{new Date(pr.updated_at).toLocaleDateString(LOC)}</span>
                    <button onClick={()=>openProject(pr)} style={{...btn(false),padding:"5px 12px",fontSize:12}}>{L.prOpen}</button>
                    {delId===pr.id
                      ?<button onClick={()=>deleteProject(pr.id)} style={{...btn(false),padding:"5px 12px",fontSize:12,color:red,borderColor:red}}>{L.prDelSure}</button>
                      :<button onClick={()=>setDelId(pr.id)} style={{background:"none",border:"none",color:t.mu,fontSize:11,cursor:"pointer",textDecoration:"underline"}}>{L.prDel}</button>}
                  </div>))}
              </div>
            </>)}
            {errTxt&&<div style={{marginTop:10,fontSize:12,color:red}}>⚠ {errTxt}</div>}
            <div style={{marginTop:12,fontSize:10.5,color:t.dm}}>{L.repPrivacy}</div>
          </Card>)}

          <IB color={T_GREY} t={t}>{L.batHist}{SIM_URL&&<>{" "}{L.batSim}{" "}
            <a href={SIM_URL} target="_blank" rel="noopener noreferrer" style={{color:sc("mfrr_opt"),fontWeight:600}}>{L.batSimLink}</a></>}</IB>
          </div>);})()}

        {view==="table"&&(<Card title={`${L.tTable} — ${dur}h · ${mw} MW`} t={t}>
          <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11,fontFamily:"'JetBrains Mono'"}}>
            <thead><tr style={{borderBottom:`2px solid ${t.bd}`}}>
              <th style={{...thS,textAlign:"left"}}>{L.monthCol}</th>
              {SIDS.filter(s=>sel.has(s)).map(sid=>(<th key={sid} style={{...thS,color:sc(sid)}}>{S[sid].s[lang]}</th>))}
              {hasBench&&<th style={{...thS,color:t.dm}}>Index</th>}
              {hasT&&<th style={{...thS,color:T_GREY}}>{L.ceiling}</th>}
            </tr></thead>
            <tbody>{monthsB.map((m,i)=>(<tr key={i} style={{borderBottom:`1px solid ${t.bd}`,background:i%2?t.bg+"66":"transparent"}}>
              <td style={{padding:"5px 6px",fontWeight:500,fontSize:10,fontFamily:"'Plus Jakarta Sans'"}}>{m.label}</td>
              {SIDS.filter(s=>sel.has(s)).map(sid=>(<td key={sid} style={{padding:"5px 6px",textAlign:"right",color:sc(sid),fontWeight:500}}>{fmt(m[sid])}</td>))}
              {hasBench&&<td style={{padding:"5px 6px",textAlign:"right",color:t.dm}}>{m.bench?fmt(m.bench):"—"}</td>}
              {hasT&&<td style={{padding:"5px 6px",textAlign:"right",color:t.dm}}>{m.tmax?fmt(m.tmax):"—"}</td>}</tr>))}</tbody>
            <tfoot><tr style={{borderTop:`2px solid ${t.bL}`}}>
              <td style={{padding:"6px",fontWeight:500,fontFamily:"'Plus Jakarta Sans'"}}>{L.sum}</td>
              {SIDS.filter(s=>sel.has(s)).map(sid=>(<td key={sid} style={{padding:"6px",textAlign:"right",fontWeight:500}}>{fmt(monthsB.reduce((a,m)=>a+(m[sid]||0),0))}</td>))}
              {hasBench&&<td style={{padding:"6px",textAlign:"right",color:t.dm}}>{fmt(monthsB.reduce((a,m)=>a+(m.bench||0),0))}</td>}
              {hasT&&<td style={{padding:"6px",textAlign:"right",color:t.dm}}>{fmt(monthsB.reduce((a,m)=>a+(m.tmax||0),0))}</td>}
            </tr></tfoot></table></div></Card>)}

        <div style={{marginTop:20,padding:16,background:t.card,border:`1px solid ${t.bd}`,borderRadius:12,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:16,fontSize:10,color:t.mu,lineHeight:1.7}}>
          {[[L.fPhys,L.fPhysB],[L.fPart,L.fPartB],[L.fSrc,L.fSrcB],[L.fCalc,L.fCalcB]].map(([h,b],i)=>(
            <div key={i}><div style={{color:t.tx,fontWeight:500,marginBottom:4}}>{h}</div>
              {b.split("|").map((x,j)=><span key={j}>{x}<br/></span>)}</div>))}
        </div>
      </div>
    </div>
  );
}
