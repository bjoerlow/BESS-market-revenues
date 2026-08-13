import { useState, useMemo, useCallback, useEffect } from "react";
import { ComposedChart,Bar,Line,XAxis,YAxis,CartesianGrid,Tooltip,Legend,ResponsiveContainer,Cell,ReferenceLine } from "recharts";

const S={
  fcrn:{l:{sv:"FCR-N",en:"FCR-N"},c:["#38bdf8","#0284c7"],s:{sv:"FCR-N",en:"FCR-N"}},
  fcrd:{l:{sv:"FCR-D upp+ned",en:"FCR-D up+down"},c:["#fbbf24","#d97706"],s:{sv:"FCR-D",en:"FCR-D"}},
  fcrn_fcrd:{l:{sv:"FCR-N + FCR-D",en:"FCR-N + FCR-D"},c:["#22d3ee","#0891b2"],s:{sv:"N+D",en:"N+D"}},
  mfrr_conv:{l:{sv:"mFRR konventionell",en:"mFRR conventional"},c:["#fb923c","#ea580c"],s:{sv:"mFRR konv.",en:"mFRR conv."}},
  mfrr_opt:{l:{sv:"GreenVoltis strategi",en:"GreenVoltis strategy"},c:["#34d399","#059669"],s:{sv:"GV strategi",en:"GV strategy"}},
  intraday1:{l:{sv:"Intradag 1 cykel",en:"Intraday 1 cycle"},c:["#c084fc","#9333ea"],s:{sv:"ID 1c",en:"ID 1c"}},
  intraday2:{l:{sv:"Intradag 2 cykler",en:"Intraday 2 cycles"},c:["#a78bfa","#7c3aed"],s:{sv:"ID 2c",en:"ID 2c"}},
  dayahead:{l:{sv:"Day-ahead arbitrage",en:"Day-ahead arbitrage"},c:["#f472b6","#db2777"],s:{sv:"DA arb.",en:"DA arb."}},
};
const SIDS=Object.keys(S),DURS=[1,2];
const TR=[{k:6,l:{sv:"6 mån",en:"6 mo"}},{k:12,l:{sv:"12 mån",en:"12 mo"}},{k:24,l:{sv:"24 mån",en:"24 mo"}},{k:0,l:{sv:"Alla",en:"All"}}];
const FH={1:16,2:20,4:24},OE={1:2.5,2:5,4:8},CH={1:12,2:16,4:20},CB={1:12,2:8,4:4},CE={1:2,2:3,4:5};
const OH={1:24,2:24,4:24},OB={1:0,2:0,4:0},EM={1:1.0,2:1.8,4:3.2};
function lo(a,b){return a<b?a:b;}

const TXT={
 sv:{sub:"Intäktsanalys per tjänst och strategi",synth:"Syntetisk data",pipe:"Pipeline-data",
  zone:"Elområde",dura:"Uthållighet",period:"Period",light:"☀ Ljust",dark:"● Mörkt",show:"Visa",
  loading:"Laddar data…",mo:"mån",months:"månader",last:"Senaste",allMonths:"Alla månader",eurMo:"EUR/mån",
  noData:"mFRR CM/EAM-data saknas",noDataRest:"— ladda ner CSV från mimer.svk.se → data/manual/",
  ceiling:"Marknadstak",foresight:"perfekt framförhållning",ofCeil:"av tak",reqBess:"2,5h BESS",
  inclImb:"inkl. obalans",
  tComparison:"Strategijämförelse",tMfrr:"mFRR upp vs ned",tDa:"Day-ahead & obalans",tTable:"Månadstabell",
  mfrrUp:"mFRR upp",mfrrDown:"mFRR ned",dUpDown:"Δ (upp−ned)",perDir:"CM+EAM per riktning",
  best:"Bäst",up:"UPP",down:"NED",conv:"Konventionell",vsTitle:"Konventionell vs GreenVoltis strategi",
  sameDir:"Samma riktning, olika deltagande",dOptConv:"Δ opt−konv.",diff:"Skillnad",
  convExpl1:"h/dygn mFRR CM. SoC via elhandlare → pauser, ~6% obalans.",convExpl2:"h/dygn FCR-D backfill.",
  gvExpl1:"h/dygn CM,",gvExpl2:"EAM-akt/dag vs",gvBf:"h/dygn FCR-D backfill.",
  gvNote:"Not: 2h GreenVoltis strategi förutsätter ett 2,5h BESS.",
  daTitle:"Day-ahead arbitrage",daSub:"85% capture · ~8% obalanskostnad",
  grossArb:"Bruttoarbitrage",imbCost:"Obalanskostnad",netRev:"Nettointäkt",id2ref:"Intradag 2c (jmf)",
  daNet:"DA netto",daGross:"DA brutto",id2c:"Intradag 2c",
  durTitle:"Bästa strategi: 1h vs 2h",effMwh:"Eff. MWh",optimal:"Optimal",
  cmUp:"mFRR CM upp",cmDown:"mFRR CM ned",energy:"Energi (spot/EAM)",
  ceilSub:"Perfekt framförhållning per kvart · SoC, uthållighet och cykelbudget respekterade · referensvärde, ej uppnåeligt",
  shareCeil:"Andel av tak",convShare:"Konventionell andel",
  ceilMissing:"theoretical_max_all.json saknas i public/",ceilRun:"Kör",ceilPut:"och lägg filen i dashboardens public-mapp.",
  ceilExpl:"Taket väljer fritt bästa marknad i varje kvart med facit i hand och begränsas av batteriets SoC, uthållighetskrav per tjänst (mFRR 1 h, FCR 20 min), verkningsgrad och cykelbudget. Det är alltså inte ett realistiskt mål utan ett mått på hur stor del av marknadens värde en strategi fångar. Kapacitetsintäkt kräver ingen framförhållning — därför ligger andelen högt när mFRR CM dominerar månaden.",
  monthCol:"Mån",sum:"SUMMA",actual:"Faktiskt utfall",modelDev:"Modellen ligger inom",avail:"tillgänglighet",
  adjNote:"justerat för tillgänglighet",
  measured:"mätt intradagsdata",proxyDev:"proxymånader",
  proxyNote:"härledd intradagsspread (day-ahead × 1,2) — osäker när marknaderna frikopplas",
  manualNote:"manuellt satt intradagsspread — ingår ej i valideringen",
  ofActual:"av faktiskt utfall",monthsShort:"mån",validatedIn:"validerat mot",
  notModelled:"ny strategigeneration — ej modellerad",
  fPhys:"Uthållighetsfysik",fPhysB:"FCR-N: 1h→16h, 2h→20h|FCR-D: oberoende av uthållighet|FCR-N+D: 0.5 MW vardera|GV mFRR 2h: kräver 2,5h BESS|4h utelämnad tills benchmark finns",
  fPart:"mFRR deltagande",fPartB:"Konv: 1h→12h, 2h→16h/dygn|GV: 24h/dygn CM båda uthålligheterna|1h: färre aktiveringar och halva MWh intradag|Riktning vald på faktisk månadsintäkt",
  fSrc:"Datakällor",fSrcB:"FCR-N/D: Mimer (SVK)|mFRR CM/EAM: Mimer CSV (manuell)|Intraday: Nord Pool / DA-proxy|Day-ahead: ENTSO-E TP",
  fCalc:"Beräkning",fCalcB:"8 strategier × 2 uthålligheter|RTE: 90% · FCR-D upp/ned: 87%|Intradag: 75%/50% capture|GV intradag: 90%/75% capture|DA: 85% capture, ~8% obalans|Marknadstak: LP per kvart, 1,3 cykler/dygn"},
 en:{sub:"Revenue analysis by service and strategy",synth:"Synthetic data",pipe:"Pipeline data",
  zone:"Bidding zone",dura:"Duration",period:"Period",light:"☀ Light",dark:"● Dark",show:"Show",
  loading:"Loading data…",mo:"mo",months:"months",last:"Last",allMonths:"All months",eurMo:"EUR/month",
  noData:"mFRR CM/EAM data missing",noDataRest:"— download CSV from mimer.svk.se → data/manual/",
  ceiling:"Market ceiling",foresight:"perfect foresight",ofCeil:"of ceiling",reqBess:"2.5h BESS",
  inclImb:"incl. imbalance",
  tComparison:"Strategy comparison",tMfrr:"mFRR up vs down",tDa:"Day-ahead & imbalance",tTable:"Monthly table",
  mfrrUp:"mFRR up",mfrrDown:"mFRR down",dUpDown:"Δ (up−down)",perDir:"CM+EAM per direction",
  best:"Best",up:"UP",down:"DOWN",conv:"Conventional",vsTitle:"Conventional vs GreenVoltis strategy",
  sameDir:"Same direction, different participation",dOptConv:"Δ opt−conv.",diff:"Difference",
  convExpl1:"h/day mFRR CM. SoC restored via retailer → pauses, ~6% imbalance.",convExpl2:"h/day FCR-D backfill.",
  gvExpl1:"h/day CM,",gvExpl2:"EAM activations/day vs",gvBf:"h/day FCR-D backfill.",
  gvNote:"Note: 2h GreenVoltis strategy assumes a 2.5h BESS.",
  daTitle:"Day-ahead arbitrage",daSub:"85% capture · ~8% imbalance cost",
  grossArb:"Gross arbitrage",imbCost:"Imbalance cost",netRev:"Net revenue",id2ref:"Intraday 2c (ref)",
  daNet:"DA net",daGross:"DA gross",id2c:"Intraday 2c",
  durTitle:"Best strategy: 1h vs 2h",effMwh:"Eff. MWh",optimal:"Optimal",
  cmUp:"mFRR CM up",cmDown:"mFRR CM down",energy:"Energy (spot/EAM)",
  ceilSub:"Perfect foresight per quarter-hour · SoC, endurance and cycle budget respected · reference value, not attainable",
  shareCeil:"Share of ceiling",convShare:"Conventional share",
  ceilMissing:"theoretical_max_all.json missing in public/",ceilRun:"Run",ceilPut:"and place the file in the dashboard public folder.",
  ceilExpl:"The ceiling picks the best market in every quarter-hour with hindsight, constrained by state of charge, endurance requirements per service (mFRR 1 h, FCR 20 min), round-trip efficiency and cycle budget. It is not a realistic target but a measure of how much of the market value a strategy captures. Capacity revenue requires no foresight — which is why the share runs high in months dominated by mFRR CM.",
  monthCol:"Month",sum:"TOTAL",actual:"Actual outcome",modelDev:"Model within",avail:"availability",
  adjNote:"adjusted for availability",
  measured:"measured intraday data",proxyDev:"proxy months",
  proxyNote:"derived intraday spread (day-ahead × 1.2) — unreliable when the markets decouple",
  manualNote:"manually set intraday spread — excluded from validation",
  ofActual:"of actual outcome",monthsShort:"mo",validatedIn:"validated against",
  notModelled:"new strategy generation — not modelled",
  fPhys:"Duration physics",fPhysB:"FCR-N: 1h→16h, 2h→20h|FCR-D: independent of duration|FCR-N+D: 0.5 MW each|GV mFRR 2h: requires 2.5h BESS|4h omitted until benchmark exists",
  fPart:"mFRR participation",fPartB:"Conv: 1h→12h, 2h→16h/day|GV: 24h/day CM at both durations|1h: fewer activations, half the intraday MWh|Direction chosen on actual monthly revenue",
  fSrc:"Data sources",fSrcB:"FCR-N/D: Mimer (SVK)|mFRR CM/EAM: Mimer CSV (manual)|Intraday: Nord Pool / DA proxy|Day-ahead: ENTSO-E TP",
  fCalc:"Calculation",fCalcB:"8 strategies × 2 durations|RTE: 90% · FCR-D up/down: 87%|Intraday: 75%/50% capture|GV intraday: 90%/75% capture|DA: 85% capture, ~8% imbalance|Ceiling: LP per quarter, 1.3 cycles/day"}
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
      const v1=fn*0.5*FH[dur]*days;
      const v2=(fu+fd)*0.87*hours;
      const v3=fn*0.5*FH[dur]*days+(fu+fd)*0.87*0.5*hours;
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
  const[area,setArea]=useState("SE3"),[dur,setDur]=useState(2),[mw,setMw]=useState(1);
  const[view,setView]=useState("comparison"),[sel,setSel]=useState(new Set(SIDS));
  const[rawData,setRawData]=useState(null),[ds,setDs]=useState("syntetisk");
  const[tmax,setTmax]=useState(null);
  const[acts,setActs]=useState(null);
  const[tr,setTr]=useState(12),[isDark,setIsDark]=useState(true);
  const[lang,setLang]=useState("sv");
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
    fetch("/actuals.json").then(r=>{if(!r.ok)throw new Error();return r.json();})
      .then(d=>setActs(d)).catch(()=>setActs(null));
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
           actualNorm:Math.round(a.total/av/(a.mw||1)*mw),actAvail:av,actNote:a.note||""};}),
    [months,mAct,mw]);
  const hasAct=monthsA.some(m=>m.actual!=null);
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
            <span style={{fontSize:9,color:t.dm,textTransform:"uppercase"}}>MW</span>
            <input type="number" min={0.5} max={200} step={0.5} value={mw} onChange={e=>setMw(Number(e.target.value)||1)}
              style={{width:52,background:t.card,border:`1px solid ${t.bd}`,borderRadius:6,color:t.tx,padding:"4px 8px",fontSize:13,fontFamily:"'JetBrains Mono'",textAlign:"center"}}/>
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
        <div style={{display:"flex",gap:8,marginBottom:16,alignItems:"center",flexWrap:"wrap"}}>
          <span style={{fontSize:9,color:t.dm,textTransform:"uppercase",letterSpacing:"0.08em"}}>{L.dura}</span>
          {DURS.map(d=>(<button key={d} onClick={()=>setDur(d)} style={{background:dur===d?(isDark?"#38bdf8":"#0891b2"):t.card,
            color:dur===d?(isDark?"#000":"#fff"):t.mu,border:`1px solid ${dur===d?(isDark?"#38bdf8":"#0891b2"):t.bd}`,
            borderRadius:8,padding:"7px 20px",fontSize:14,cursor:"pointer",fontWeight:600,fontFamily:"'JetBrains Mono'"}}>{d}h</button>))}
          <div style={{width:1,height:18,background:t.bd,margin:"0 8px"}}/>
          <span style={{fontSize:9,color:t.dm,textTransform:"uppercase",letterSpacing:"0.08em"}}>{L.period}</span>
          {TR.map(r=><Pill key={r.k} active={tr===r.k} onClick={()=>setTr(r.k)} small t={t}>{r.l[lang]}</Pill>)}
          <div style={{flex:1}}/><span style={{fontSize:11,color:t.mu,fontFamily:"'JetBrains Mono'"}}>{mw} MW · {mw*dur} MWh · C/{dur}</span>
        </div>
        {noMfrr&&(<div style={{marginBottom:16,padding:"12px 16px",background:amb+"12",border:`1px solid ${amb}30`,borderRadius:8,fontSize:11,color:amb}}>
          ⚠ <strong>{L.noData}</strong> {L.noDataRest}</div>)}
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
          <KPI label={`${L.ceiling} ${N} ${L.mo} (${dur}h)`} value={hasT?fmtE(ann.tmax):"—"} sub={L.foresight} color={isDark?"#94a3b8":"#64748b"} t={t}/>
          <KPI label={S.mfrr_opt.l[lang]} value={fmtE(ann.mfrr_opt)} sub={hasT?`${(ann.mfrr_opt/ann.tmax*100).toFixed(0)}% ${L.ofCeil}${dur===2?` · ${L.reqBess}`:""}`:(dur===2?L.reqBess:"")} color={sc("mfrr_opt")} t={t}/>
          <KPI label={S.mfrr_conv.l[lang]} value={fmtE(ann.mfrr_conv)} sub={hasT?`${(ann.mfrr_conv/ann.tmax*100).toFixed(0)}% ${L.ofCeil}`:""} color={sc("mfrr_conv")} t={t}/>
          <KPI label="FCR-N + FCR-D" value={fmtE(ann.fcrn_fcrd)} sub={hasT?`${(ann.fcrn_fcrd/ann.tmax*100).toFixed(0)}% ${L.ofCeil}`:""} color={sc("fcrn_fcrd")} t={t}/>
          <KPI label="Day-ahead" value={fmtE(ann.dayahead)} sub={L.inclImb} color={sc("dayahead")} warn t={t}/>
        </div>

        {valid&&(<div style={{marginBottom:16,padding:"10px 14px",background:t.cA,
          border:`1px solid ${grn}33`,borderRadius:8,fontSize:11,color:t.mu,
          display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <span style={{width:7,height:7,borderRadius:"50%",background:grn,flexShrink:0}}/>
          <span><strong style={{color:t.tx}}>{L.modelDev} ±{valid.max.toFixed(1)}%</strong> {L.ofActual}
            {" · "}{valid.n} {L.monthsShort}{valid.onlyProxy?"":` ${L.measured}`} · {valid.site} {valid.spec}
            {valid.adj?` · ${L.adjNote}`:""}
            {valid.proxyN>0&&!valid.onlyProxy&&(<span style={{color:t.dm}}>
              {" · "}{L.proxyDev}: ±{valid.proxyMax.toFixed(1)}% ({valid.proxyN} {L.monthsShort})</span>)}</span>
        </div>)}

        <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
          {[{k:"comparison",l:L.tComparison},{k:"mfrr",l:L.tMfrr},
            {k:"dayahead",l:L.tDa},{k:"tmax",l:L.ceiling},{k:"duration",l:"1h / 2h"},{k:"table",l:L.tTable}
          ].map(v=><Pill key={v.k} active={view===v.k} onClick={()=>setView(v.k)} t={t}>{v.l}</Pill>)}</div>
        {(view==="comparison"||view==="table")&&(<div style={{display:"flex",gap:5,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{fontSize:9,color:t.dm,textTransform:"uppercase"}}>{L.show}</span>
          {SIDS.map(sid=><Pill key={sid} active={sel.has(sid)} color={sc(sid)} onClick={()=>toggle(sid)} t={t}>{S[sid].l[lang]}</Pill>)}</div>)}

        {view==="comparison"&&(<Card title={`${L.tComparison} — ${dur}h (${mw*dur} MWh)`} sub={`${L.eurMo} · ${tr?`${L.last} ${tr}`:L.allMonths.split(" ")[0]} ${L.months}`} t={t}>
          <ResponsiveContainer width="100%" height={400}><ComposedChart data={monthsA} margin={{top:18,right:12,bottom:5,left:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke={t.cG}/><XAxis {...xP}/><YAxis {...yP}/>
            <Tooltip content={<TT theme={t}/>}/><Legend wrapperStyle={{fontSize:10,fontFamily:"'Plus Jakarta Sans'"}}/>
            {vers.map(v=>(<ReferenceLine key={v.from} x={v.at} stroke={t.mu} strokeDasharray="2 4"
              label={{value:v.label,position:"top",fill:t.mu,fontSize:9}}/>))}
            {SIDS.filter(s=>sel.has(s)).map(sid=>(<Bar key={sid} dataKey={sid} name={S[sid].l[lang]} fill={sc(sid)} opacity={0.6} radius={[2,2,0,0]}/>))}
            {hasT&&<Line dataKey="tmax" name={L.ceiling} stroke={T_GREY} strokeWidth={2} strokeDasharray="6 3" dot={false}/>}
            {hasAct&&<Line dataKey="actual" name={L.actual} stroke={t.tx} strokeWidth={0}
              dot={p=>{if(p.payload?.actual==null)return<g key={p.index}/>;
                const full=(p.payload.actAvail??1)>=0.999;
                return<circle key={p.index} cx={p.cx} cy={p.cy} r={5}
                  fill={full?t.tx:"none"} stroke={full?t.bg:t.tx} strokeWidth={2}/>;}}
              connectNulls={false} legendType="circle"/>}
          </ComposedChart></ResponsiveContainer>
          {vers.length>0&&(<div style={{marginTop:10,display:"flex",gap:14,flexWrap:"wrap",fontSize:10,color:t.dm}}>
            {vers.map(v=>(<span key={v.from}><strong style={{color:t.mu}}>{v.label}</strong> {v.at} — {v.note}</span>))}</div>)}
          {proxyMonths.length>0&&(<div style={{marginTop:6,fontSize:10,color:t.dm}}>
            ⚠ {proxyMonths.map(m=>m.label).join(", ")} — {L.proxyNote}</div>)}
          {manualMonths.length>0&&(<div style={{marginTop:4,fontSize:10,color:amb}}>
            ✎ {manualMonths.map(m=>m.label).join(", ")} — {L.manualNote}</div>)}
          {monthsA.filter(m=>m.actAvail!=null&&m.actAvail<0.999).map(m=>(
            <div key={m.ym} style={{marginTop:6,fontSize:10,color:t.dm}}>
              ○ {m.label} · {L.avail} {(m.actAvail*100).toFixed(0)}% · {m.actNote} · {L.adjNote}: {fmtE(m.actualNorm)}</div>))}
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
              <IB color={grn} t={t}><strong style={{color:t.tx}}>{L.conv}:</strong> {CH[dur]}{L.convExpl1} {CB[dur]}{L.convExpl2}
                <br/><br/><strong style={{color:t.tx}}>{S.mfrr_opt.l[lang]}:</strong> {OH[dur]}{L.gvExpl1} {OE[dur]} {L.gvExpl2} {CE[dur]}.{OB[dur]>0?` ${OB[dur]}${L.gvBf}`:""}
                {dur===2&&<><br/><em style={{color:amb}}>{L.gvNote}</em></>}</IB></Card></div>);})()}

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

        {view==="tmax"&&(()=>{
          const dTot=months.reduce((a,m)=>a+(m.tmax||0),0);
          const gv=months.reduce((a,m)=>a+(m.mfrr_opt||0),0);
          const cv=months.reduce((a,m)=>a+(m.mfrr_conv||0),0);
          const comp=[["tmax_fcrn","FCR-N",sc("fcrn")],["tmax_fcrd","FCR-D",sc("fcrd")],
                      ["tmax_cm_up",L.cmUp,sc("mfrr_opt")],["tmax_cm_down",L.cmDown,amb],
                      ["tmax_energy",L.energy,sc("intraday2")]];
          const kGv=S.mfrr_opt.l[lang],kCv=L.conv;
          const data=months.map(m=>{const o={label:m.label,[kGv]:m.mfrr_opt,[kCv]:m.mfrr_conv};
            comp.forEach(([k,l])=>{o[l]=m[k]||0;});return o;});
          if(!hasT)return(<Card title={L.ceiling} t={t}>
            <div style={{fontSize:11,color:t.mu,lineHeight:1.8}}>
              <strong style={{color:amb}}>{L.ceilMissing}</strong><br/><br/>
              {L.ceilRun} <code>python theoretical_max.py --area all --from 2026-01 --to 2026-08</code><br/>
              {L.ceilPut}</div></Card>);
          return(<Card title={`${L.ceiling} — ${dur}h (${mw*dur} MWh)`} sub={L.ceilSub} t={t}>
            <ResponsiveContainer width="100%" height={380}><ComposedChart data={data} margin={{top:8,right:12,bottom:5,left:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke={t.cG}/><XAxis {...xP}/><YAxis {...yP}/>
              <Tooltip content={<TT theme={t}/>}/><Legend wrapperStyle={{fontSize:10}}/>
              {comp.map(([k,l,c],i)=>(<Bar key={l} dataKey={l} stackId="tk" fill={c} opacity={0.55} radius={i===comp.length-1?[2,2,0,0]:[0,0,0,0]}/>))}
              <Line dataKey={kGv} stroke={sc("mfrr_opt")} strokeWidth={2.5} dot={{r:3,fill:sc("mfrr_opt")}}/>
              <Line dataKey={kCv} stroke={sc("mfrr_conv")} strokeWidth={2} strokeDasharray="4 2" dot={false}/>
            </ComposedChart></ResponsiveContainer>
            <div style={{marginTop:12,display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
              <SB label={`${L.ceiling} ${N} ${L.mo}`} value={fmtE(dTot)} color={T_GREY} t={t}/>
              <SB label="GreenVoltis" value={fmtE(gv)} color={sc("mfrr_opt")} t={t}/>
              <SB label={L.shareCeil} value={dTot?`${(gv/dTot*100).toFixed(0)}%`:"—"} color={sc("mfrr_opt")} t={t}/>
              <SB label={L.convShare} value={dTot?`${(cv/dTot*100).toFixed(0)}%`:"—"} color={sc("mfrr_conv")} t={t}/></div>
            <IB color={T_GREY} t={t}>{L.ceilExpl}</IB>
          </Card>);})()}

        {view==="table"&&(<Card title={`${L.tTable} — ${dur}h · ${mw} MW`} t={t}>
          <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11,fontFamily:"'JetBrains Mono'"}}>
            <thead><tr style={{borderBottom:`2px solid ${t.bd}`}}>
              <th style={{...thS,textAlign:"left"}}>{L.monthCol}</th>
              {SIDS.filter(s=>sel.has(s)).map(sid=>(<th key={sid} style={{...thS,color:sc(sid)}}>{S[sid].s[lang]}</th>))}
            </tr></thead>
            <tbody>{months.map((m,i)=>(<tr key={i} style={{borderBottom:`1px solid ${t.bd}`,background:i%2?t.bg+"66":"transparent"}}>
              <td style={{padding:"5px 6px",fontWeight:500,fontSize:10,fontFamily:"'Plus Jakarta Sans'"}}>{m.label}</td>
              {(()=>{const vis=SIDS.filter(s=>sel.has(s));const bs=vis.reduce((a,s)=>(m[s]||0)>(m[a]||0)?s:a,vis[0]);
                return vis.map(sid=>(<td key={sid} style={{padding:"5px 6px",textAlign:"right",color:sid===bs?sc(sid):t.dm,fontWeight:sid===bs?500:400}}>{fmt(m[sid])}</td>));})()}</tr>))}</tbody>
            <tfoot><tr style={{borderTop:`2px solid ${t.bL}`}}>
              <td style={{padding:"6px",fontWeight:500,fontFamily:"'Plus Jakarta Sans'"}}>{L.sum}</td>
              {SIDS.filter(s=>sel.has(s)).map(sid=>(<td key={sid} style={{padding:"6px",textAlign:"right",fontWeight:500}}>{fmt(months.reduce((a,m)=>a+(m[sid]||0),0))}</td>))}
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
