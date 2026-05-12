import { useState, useMemo, useCallback, useEffect } from "react";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";

const STRATEGIES = {
  fcrn:{label:"FCR-N",color:"#38bdf8",short:"FCR-N"},
  fcrd:{label:"FCR-D upp+ned",color:"#fbbf24",short:"FCR-D"},
  fcrn_fcrd:{label:"FCR-N + FCR-D",color:"#22d3ee",short:"N+D"},
  mfrr_conv:{label:"mFRR konventionell",color:"#fb923c",short:"mFRR konv."},
  mfrr_id:{label:"mFRR+intradag",color:"#34d399",short:"mFRR+ID"},
  intraday1:{label:"Intradag 1 cykel",color:"#c084fc",short:"ID 1c"},
  intraday2:{label:"Intradag 2 cykler",color:"#a78bfa",short:"ID 2c"},
  dayahead:{label:"Day-ahead arbitrage",color:"#f472b6",short:"DA arb."},
};
const SIDS = Object.keys(STRATEGIES);
const DURATIONS = [1, 2, 4];
const TIME_RANGES = [{k:6,l:"6 mån"},{k:12,l:"12 mån"},{k:24,l:"24 mån"},{k:0,l:"Alla"}];
const FCRN_H = {1:16,2:20,4:24};
const ID_EAM = {1:3,2:5,4:8}, CONV_H = {1:12,2:16,4:20}, CONV_BF = {1:12,2:8,4:4}, CONV_EAM = {1:2,2:3,4:5};
// Diminishing returns on duration for intraday/DA (calibrated vs Clean Horizon)
const EFF_MWH = {1:1.0, 2:1.5, 4:1.8};

function lo(a,b){return a<b?a:b;}

function genSyntheticArea(){
  const S=[18,15,12,8,6,5,5,6,10,14,17,20], rows=[];
  let d=new Date(2024,0); const end=new Date(2026,5);
  while(d<end){
    const mo=d.getMonth(),yr=d.getFullYear(),days=new Date(yr,mo+1,0).getDate(),hours=days*24,rte=0.85;
    const fcrn=22+S[mo]+Math.sin(yr*7+mo*3)*3;
    const fcrdU=4+S[mo]*0.35+Math.sin(yr*5+mo*2)*1.2, fcrdD=3+S[mo]*0.3+Math.cos(yr*4+mo*5)*0.8;
    const cmU=3+S[mo]*0.35+Math.sin(yr*3+mo*7)*1, cmD=2+S[mo]*0.25+Math.cos(yr*6+mo*3)*0.8;
    const hasEAM=d>=new Date(2025,2);
    const eamU=hasEAM?40+Math.sin(yr*11+mo*4)*18:0, eamD=hasEAM?30+Math.cos(yr*8+mo*6)*12:0;
    const spread=8+S[mo]*0.6+Math.cos(yr*6+mo*9)*2.5;
    const daRng=15+S[mo]*1.8+Math.sin(yr*4+mo*8)*5, daAvg=35+S[mo]*2.2+Math.sin(yr*9+mo*5)*8;
    const daImbP=0.08+Math.cos(yr*3+mo*11)*0.03;
    const bestUp=cmU+eamU*0.3>=cmD+eamD*0.3, bestCM=bestUp?cmU:cmD, bestEAM=bestUp?eamU:eamD;
    const hasMfrr=bestCM>0||bestEAM>0;
    const row={year_month:`${yr}-${String(mo+1).padStart(2,"0")}`,days,hours,
      fcr_n_price:+fcrn.toFixed(2),fcr_d_up_price:+fcrdU.toFixed(2),fcr_d_down_price:+fcrdD.toFixed(2),
      mfrr_cm_up_price:+cmU.toFixed(2),mfrr_cm_down_price:+cmD.toFixed(2),mfrr_cm_best_direction:bestUp?"upp":"ned",
      mfrr_eam_up_price:+eamU.toFixed(2),mfrr_eam_down_price:+eamD.toFixed(2),
      intraday_spread:+spread.toFixed(2),da_avg_price:+daAvg.toFixed(2),da_range:+daRng.toFixed(2),da_imbalance_pct:+daImbP.toFixed(3)};
    DURATIONS.forEach(dur=>{
      const eff=EFF_MWH[dur], act=lo(dur,0.25);
      const v_fcrn=fcrn*0.5*FCRN_H[dur]*days;
      const v_fcrd=(fcrdU+fcrdD)*0.87*hours;
      const v_fcrn_fcrd=fcrn*0.5*FCRN_H[dur]*days+(fcrdU+fcrdD)*0.87*0.5*hours;
      const conv_cm=hasMfrr?bestCM*CONV_H[dur]*days:0;
      const conv_eam=hasMfrr&&bestEAM>0?CONV_EAM[dur]*act*bestEAM*days*rte:0;
      const conv_imb=(conv_cm+conv_eam)*0.06;
      const conv_fcrd=hasMfrr?(fcrdU+fcrdD)*0.87*CONV_BF[dur]*days:0;
      const v_conv=conv_cm+conv_eam-conv_imb+conv_fcrd;
      // mFRR+ID: 4h=BOTH directions, 1h/2h=best single direction
      const id_cm=hasMfrr?(dur>=4?(cmU+cmD)*hours:bestCM*hours):0;
      const id_eam_price=dur>=4?(eamU+eamD)/2:bestEAM;
      const id_eam=hasMfrr&&id_eam_price>0?ID_EAM[dur]*act*id_eam_price*days*rte:0;
      const id_cost=hasMfrr&&id_eam_price>0?ID_EAM[dur]*act*spread*days*0.5:0;
      const v_id=id_cm+id_eam-id_cost;
      const v_id1=eff*spread*rte*days*0.5;
      const v_id2=eff*spread*rte*days*0.8;
      const da_gross=eff*daRng*rte*days*0.45;
      const da_imb=da_gross*daImbP, v_da=da_gross-da_imb;
      row[`fcrn_${dur}h`]=Math.round(v_fcrn);row[`fcrd_${dur}h`]=Math.round(v_fcrd);
      row[`fcrn_fcrd_${dur}h`]=Math.round(v_fcrn_fcrd);
      row[`mfrr_conv_${dur}h`]=Math.round(v_conv);row[`mfrr_id_${dur}h`]=Math.round(v_id);
      row[`intraday1_${dur}h`]=Math.round(v_id1);row[`intraday2_${dur}h`]=Math.round(v_id2);
      row[`dayahead_${dur}h`]=Math.round(v_da);
      row[`conv_cm_${dur}h`]=Math.round(conv_cm);row[`conv_eam_${dur}h`]=Math.round(conv_eam);
      row[`conv_imb_${dur}h`]=Math.round(conv_imb);row[`conv_fcrd_${dur}h`]=Math.round(conv_fcrd);
      row[`id_cm_${dur}h`]=Math.round(id_cm);row[`id_eam_${dur}h`]=Math.round(id_eam);row[`id_cost_${dur}h`]=Math.round(id_cost);
      row[`da_gross_${dur}h`]=Math.round(da_gross);row[`da_imb_${dur}h`]=Math.round(da_imb);
      const cmU_r=cmU*hours,cmD_r=cmD*hours;
      const eamU_r=eamU>0?ID_EAM[dur]*act*eamU*days*rte:0;
      const eamD_r=eamD>0?ID_EAM[dur]*act*eamD*days*rte:0;
      row[`mfrr_up_total_${dur}h`]=Math.round(cmU_r+eamU_r);row[`mfrr_down_total_${dur}h`]=Math.round(cmD_r+eamD_r);
      const all={fcrn:v_fcrn,fcrd:v_fcrd,fcrn_fcrd:v_fcrn_fcrd,mfrr_conv:v_conv,mfrr_id:v_id,intraday1:v_id1,intraday2:v_id2,dayahead:v_da};
      let bV=-Infinity,bS="fcrn";Object.entries(all).forEach(([s,v])=>{if(v>bV){bV=v;bS=s;}});
      row[`optimal_${dur}h`]=Math.round(bV);row[`optimal_strategy_${dur}h`]=bS;
    });
    // Sanity: optimal must never decrease with duration
    [2,4].forEach(dur=>{const prev=dur===2?1:2;
      if((row[`optimal_${dur}h`]||0)<(row[`optimal_${prev}h`]||0)){
        row[`optimal_${dur}h`]=row[`optimal_${prev}h`];
        row[`optimal_strategy_${dur}h`]=row[`optimal_strategy_${prev}h`];}});
    rows.push(row);d=new Date(yr,mo+1);
  }
  return rows;
}
function genSynthetic(){const m=genSyntheticArea();return{SE1:m,SE2:m,SE3:m,SE4:m};}

function transformRow(raw,dur,mw){
  const label=(()=>{try{const[y,m]=raw.year_month.split("-");return new Date(+y,+m-1).toLocaleString("sv-SE",{year:"numeric",month:"short"});}catch{return raw.year_month;}})();
  const r={label,ym:raw.year_month};
  SIDS.forEach(sid=>{r[sid]=Math.round((raw[`${sid}_${dur}h`]||0)*mw);});
  r.optimal=Math.round((raw[`optimal_${dur}h`]||0)*mw);
  r.optimalStrategy=raw[`optimal_strategy_${dur}h`]||"fcrn";
  r.mfrr_direction=raw.mfrr_cm_best_direction||"";
  r.mfrr_up=Math.round((raw[`mfrr_up_total_${dur}h`]||0)*mw);
  r.mfrr_down=Math.round((raw[`mfrr_down_total_${dur}h`]||0)*mw);
  r.conv_cm=Math.round((raw[`conv_cm_${dur}h`]||0)*mw);r.conv_eam=Math.round((raw[`conv_eam_${dur}h`]||0)*mw);
  r.conv_imb=Math.round((raw[`conv_imb_${dur}h`]||0)*mw);r.conv_fcrd=Math.round((raw[`conv_fcrd_${dur}h`]||0)*mw);
  r.id_cm=Math.round((raw[`id_cm_${dur}h`]||0)*mw);r.id_eam=Math.round((raw[`id_eam_${dur}h`]||0)*mw);
  r.id_cost=Math.round((raw[`id_cost_${dur}h`]||0)*mw);
  r.da_gross=Math.round((raw[`da_gross_${dur}h`]||0)*mw);r.da_imb=Math.round((raw[`da_imb_${dur}h`]||0)*mw);
  r.fcr_n_price=raw.fcr_n_price||0;r.fcr_d_up_price=raw.fcr_d_up_price||0;r.fcr_d_down_price=raw.fcr_d_down_price||0;
  r.mfrr_cm_up_price=raw.mfrr_cm_up_price||0;r.mfrr_cm_down_price=raw.mfrr_cm_down_price||0;
  r.mfrr_eam_up_price=raw.mfrr_eam_up_price||0;r.mfrr_eam_down_price=raw.mfrr_eam_down_price||0;
  r.intraday_spread=raw.intraday_spread||0;r.da_avg_price=raw.da_avg_price||0;r.da_imbalance_pct=raw.da_imbalance_pct||0;
  return r;
}

const T={bg:"#06090f",card:"#0d1520",cardAlt:"#0a1018",border:"#182438",borderLight:"#243352",text:"#dfe6f0",textMuted:"#6b7d9a",textDim:"#3d4f6a",accent:"#38bdf8",red:"#ef4444",green:"#34d399",amber:"#fbbf24",pink:"#f472b6"};
const fmt=v=>v!=null?Math.round(v).toLocaleString("sv-SE"):"—";
const fmtE=v=>v!=null?`€${Math.round(v).toLocaleString("sv-SE")}`:"—";
const fmtP=v=>v!=null?`€${Number(v).toFixed(2)}`:"—";

function CTooltip({active,payload,label}){
  if(!active||!payload?.length)return null;
  return(<div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 14px",fontSize:12,fontFamily:"'DM Mono',monospace",boxShadow:"0 8px 32px rgba(0,0,0,0.5)"}}>
    <div style={{color:T.text,fontWeight:700,marginBottom:6,fontSize:11,fontFamily:"'Outfit'"}}>{label}</div>
    {payload.filter(p=>p.value!=null&&p.value!==0).map((p,i)=>(<div key={i} style={{color:p.color||T.text,margin:"3px 0",display:"flex",justifyContent:"space-between",gap:20}}>
      <span style={{fontFamily:"'Outfit'",fontSize:11,opacity:0.85}}>{p.name}</span><span style={{fontWeight:600}}>{fmtE(p.value)}</span></div>))}
  </div>);
}
function Pill({active,onClick,children,color,small}){
  return(<button onClick={onClick} style={{background:active?(color||T.accent)+"18":"transparent",color:active?(color||T.accent):T.textMuted,
    border:`1px solid ${active?(color||T.accent)+"40":T.border}`,borderRadius:6,padding:small?"3px 8px":"5px 12px",
    fontSize:small?10:11.5,cursor:"pointer",fontWeight:active?600:400,fontFamily:"'Outfit'",whiteSpace:"nowrap"}}>{children}</button>);
}
function KPI({label,value,sub,color,warn}){
  return(<div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,padding:"12px 14px",flex:1,minWidth:140,position:"relative"}}>
    <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:color,borderRadius:"10px 10px 0 0",opacity:0.8}}/>
    <div style={{color:T.textMuted,fontSize:9,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3,fontFamily:"'Outfit'"}}>{label}</div>
    <div style={{color:T.text,fontSize:18,fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{value}</div>
    {sub&&<div style={{color:warn?T.red:color,fontSize:10,marginTop:2,fontFamily:"'Outfit'"}}>{sub}</div>}
  </div>);
}
function Card({title,sub,children}){
  return(<div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:18}}>
    {title&&<h3 style={{margin:"0 0 2px",fontSize:14,fontWeight:600,fontFamily:"'Outfit'"}}>{title}</h3>}
    {sub&&<div style={{color:T.textMuted,fontSize:10,marginBottom:10,fontFamily:"'Outfit'"}}>{sub}</div>}{children}</div>);
}
function StatBox({label,value,color}){
  return(<div style={{background:T.cardAlt,border:`1px solid ${T.border}`,borderRadius:7,padding:10,textAlign:"center"}}>
    <div style={{fontSize:9,color:T.textMuted,marginBottom:3}}>{label}</div>
    <div style={{fontSize:16,fontWeight:700,fontFamily:"'DM Mono',monospace",color}}>{value}</div></div>);
}
function InfoBox({color,children}){
  return(<div style={{marginTop:12,padding:12,background:(color||T.accent)+"0a",border:`1px solid ${(color||T.accent)}22`,borderRadius:8,fontSize:11,lineHeight:1.7,color:T.textMuted}}>{children}</div>);
}

export default function Dashboard(){
  const[area,setArea]=useState("SE3"),[duration,setDuration]=useState(2),[mw,setMw]=useState(1);
  const[view,setView]=useState("comparison"),[selected,setSelected]=useState(new Set(SIDS));
  const[rawData,setRawData]=useState(null),[dataSource,setDataSource]=useState("syntetisk");
  const[timeRange,setTimeRange]=useState(12);

  useEffect(()=>{
    fetch("/monthly_revenue_all.json").then(r=>{if(!r.ok)throw new Error();return r.json();})
      .then(d=>{setRawData(d.areas);setDataSource("pipeline");})
      .catch(()=>{
        Promise.all(["SE1","SE2","SE3","SE4"].map(a=>
          fetch(`/monthly_revenue_${a}.json`).then(r=>{if(!r.ok)throw new Error();return r.json();}).then(d=>[a,d.months]).catch(()=>[a,null])
        )).then(results=>{const areas={};let found=false;
          results.forEach(([a,m])=>{if(m){areas[a]=m;found=true;}});
          if(found){setRawData(areas);setDataSource("pipeline");}else{setRawData(genSynthetic());setDataSource("syntetisk");}
        });
      });
  },[]);

  const toggle=useCallback(id=>{setSelected(prev=>{const n=new Set(prev);n.has(id)?(n.size>1&&n.delete(id)):n.add(id);return n;});},[]);
  const areaData=useMemo(()=>rawData?(rawData[area]||rawData["SE3"]||Object.values(rawData)[0]||[]):null,[rawData,area]);
  const allMonths=useMemo(()=>areaData?areaData.map(r=>transformRow(r,duration,mw)):[], [areaData,duration,mw]);
  const months=useMemo(()=>timeRange===0?allMonths:allMonths.slice(-timeRange),[allMonths,timeRange]);
  const last12=allMonths.slice(-12);
  const annuals=useMemo(()=>{const r={};SIDS.forEach(sid=>{r[sid]=last12.reduce((s,m)=>s+(m[sid]||0),0);});r.optimal=last12.reduce((s,m)=>s+(m.optimal||0),0);return r;},[last12]);
  const optCounts=useMemo(()=>{const c={};last12.forEach(m=>{c[m.optimalStrategy]=(c[m.optimalStrategy]||0)+1;});return c;},[last12]);
  const durComp=useMemo(()=>{if(!areaData)return[];const src=timeRange===0?areaData:areaData.slice(-timeRange);
    return src.map(r=>{const label=transformRow(r,2,1).label;const row={label};DURATIONS.forEach(dur=>{row[`opt_${dur}h`]=Math.round((r[`optimal_${dur}h`]||0)*mw);});return row;});},[areaData,mw,timeRange]);
  const mfrrMissing=useMemo(()=>areaData?areaData.every(r=>(r.mfrr_cm_up_price||0)===0&&(r.mfrr_cm_down_price||0)===0):false,[areaData]);

  if(!rawData)return(<div style={{background:T.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:T.textMuted,fontFamily:"'Outfit'"}}>Laddar data…</div>);
  const thS={padding:"5px 6px",textAlign:"right",fontSize:8,textTransform:"uppercase",letterSpacing:"0.05em",color:T.textMuted,fontFamily:"'Outfit'"};
  const xP={dataKey:"label",tick:{fill:T.textMuted,fontSize:9,fontFamily:"'Outfit'"},angle:-45,textAnchor:"end",height:50};
  const yP={tick:{fill:T.textMuted,fontSize:10},tickFormatter:v=>`€${(v/1000).toFixed(0)}k`};

  return(
    <div style={{background:T.bg,minHeight:"100vh",fontFamily:"'Outfit',sans-serif",color:T.text}}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      <header style={{borderBottom:`1px solid ${T.border}`,padding:"14px 20px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
          <div><h1 style={{margin:0,fontSize:17,fontWeight:700,letterSpacing:"-0.03em"}}>BESS Revenue Intelligence</h1>
            <div style={{fontSize:10,color:T.textMuted,marginTop:2}}>Batterilagring — intäktsanalys per tjänst och strategi · {area}
              {dataSource==="syntetisk"&&<span style={{color:T.red}}> · ⚠ Syntetisk data</span>}
              {dataSource==="pipeline"&&<span style={{color:T.green}}> · ✓ Pipeline-data</span>}</div></div>
          <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
            <span style={{fontSize:9,color:T.textDim,textTransform:"uppercase"}}>Elområde</span>
            {["SE1","SE2","SE3","SE4"].map(a=><Pill key={a} active={area===a} onClick={()=>setArea(a)}>{a}</Pill>)}
            <div style={{width:1,height:16,background:T.border,margin:"0 4px"}}/>
            <span style={{fontSize:9,color:T.textDim,textTransform:"uppercase"}}>MW</span>
            <input type="number" min={0.5} max={200} step={0.5} value={mw} onChange={e=>setMw(Number(e.target.value)||1)}
              style={{width:52,background:T.card,border:`1px solid ${T.border}`,borderRadius:5,color:T.text,padding:"3px 6px",fontSize:13,fontFamily:"'DM Mono',monospace",textAlign:"center"}}/>
          </div>
        </div>
      </header>
      <div style={{padding:"14px 20px",maxWidth:1440,margin:"0 auto"}}>
        <div style={{display:"flex",gap:8,marginBottom:14,alignItems:"center",flexWrap:"wrap"}}>
          <span style={{fontSize:9,color:T.textDim,textTransform:"uppercase",letterSpacing:"0.08em"}}>Uthållighet</span>
          {DURATIONS.map(dur=>(<button key={dur} onClick={()=>setDuration(dur)} style={{background:duration===dur?T.accent:T.card,color:duration===dur?"#000":T.textMuted,
            border:`1px solid ${duration===dur?T.accent:T.border}`,borderRadius:7,padding:"6px 18px",fontSize:14,cursor:"pointer",fontWeight:700,fontFamily:"'DM Mono',monospace"}}>{dur}h</button>))}
          <div style={{width:1,height:16,background:T.border,margin:"0 6px"}}/>
          <span style={{fontSize:9,color:T.textDim,textTransform:"uppercase",letterSpacing:"0.08em"}}>Period</span>
          {TIME_RANGES.map(tr=><Pill key={tr.k} active={timeRange===tr.k} onClick={()=>setTimeRange(tr.k)} small>{tr.l}</Pill>)}
          <div style={{flex:1}}/><span style={{fontSize:11,color:T.textMuted,fontFamily:"'DM Mono',monospace"}}>{mw} MW · {mw*duration} MWh · C/{duration}</span>
        </div>
        {mfrrMissing&&(<div style={{marginBottom:14,padding:"10px 14px",background:T.amber+"12",border:`1px solid ${T.amber}30`,borderRadius:8,fontSize:11,color:T.amber}}>
          ⚠ <strong>mFRR CM/EAM-data saknas</strong> — pipelinen fick ingen data. mFRR-strategier visar €0. Kör pipelinen med ENTSO-E API-nyckel.</div>)}
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
          <KPI label={`Optimal 12 mån (${duration}h)`} value={fmtE(annuals.optimal)} sub="bästa strategi/mån" color={T.red}/>
          <KPI label="FCR-N" value={fmtE(annuals.fcrn)} sub={`${optCounts.fcrn||0}/12 optimal`} color={STRATEGIES.fcrn.color}/>
          <KPI label="FCR-N+D" value={fmtE(annuals.fcrn_fcrd)} sub={`${optCounts.fcrn_fcrd||0}/12 optimal`} color={STRATEGIES.fcrn_fcrd.color}/>
          <KPI label="mFRR+intradag" value={fmtE(annuals.mfrr_id)} sub={`${optCounts.mfrr_id||0}/12 optimal`} color={STRATEGIES.mfrr_id.color}/>
          <KPI label="Day-ahead" value={fmtE(annuals.dayahead)} sub={`${optCounts.dayahead||0}/12 · inkl. obalans`} color={STRATEGIES.dayahead.color} warn/>
        </div>
        <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
          {[{k:"comparison",l:"Strategijämförelse"},{k:"services",l:"Intäkt per tjänst"},{k:"mfrr",l:"mFRR upp vs ned"},
            {k:"dayahead",l:"Day-ahead & obalans"},{k:"duration",l:"1h / 2h / 4h"},{k:"optimal",l:"Optimal strategi"},{k:"table",l:"Månadstabell"}
          ].map(v=><Pill key={v.k} active={view===v.k} onClick={()=>setView(v.k)}>{v.l}</Pill>)}
        </div>
        {(view==="comparison"||view==="table")&&(<div style={{display:"flex",gap:5,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{fontSize:9,color:T.textDim,textTransform:"uppercase"}}>Visa</span>
          {SIDS.map(sid=><Pill key={sid} active={selected.has(sid)} color={STRATEGIES[sid].color} onClick={()=>toggle(sid)}>{STRATEGIES[sid].label}</Pill>)}</div>)}

        {view==="comparison"&&(<Card title={`Strategijämförelse — ${duration}h (${mw*duration} MWh)`} sub={`EUR/mån · ${timeRange?`Senaste ${timeRange}`:"Alla"} månader`}>
          <ResponsiveContainer width="100%" height={380}><ComposedChart data={months} margin={{top:8,right:12,bottom:5,left:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.border}/><XAxis {...xP}/><YAxis {...yP}/>
            <Tooltip content={<CTooltip/>}/><Legend wrapperStyle={{fontSize:10,fontFamily:"'Outfit'"}}/>
            {SIDS.filter(s=>selected.has(s)).map(sid=>(<Bar key={sid} dataKey={sid} name={STRATEGIES[sid].label} fill={STRATEGIES[sid].color} opacity={0.55} radius={[2,2,0,0]}/>))}
            <Line dataKey="optimal" name="Optimal" stroke={T.red} strokeWidth={2.5} dot={{r:2,fill:T.red}}/>
          </ComposedChart></ResponsiveContainer></Card>)}

        {view==="services"&&(()=>{
          const sC={"FCR-N":"#38bdf8","FCR-D upp":"#fbbf24","FCR-D ned":"#f59e0b","mFRR CM":"#34d399","mFRR EAM":"#10b981","Intradag":"#a78bfa","Day-ahead":"#f472b6"};
          const sD=months.map(m=>{const d=m.ym?new Date(+m.ym.slice(0,4),+m.ym.slice(5,7),0).getDate():30;
            return{label:m.label,"FCR-N":Math.round(m.fcr_n_price*0.5*FCRN_H[duration]*d*mw),"FCR-D upp":Math.round(m.fcr_d_up_price*0.87*d*24*mw),
              "FCR-D ned":Math.round(m.fcr_d_down_price*0.87*d*24*mw),"mFRR CM":m.id_cm,"mFRR EAM":m.id_eam,"Intradag":m.intraday2,"Day-ahead":m.dayahead};});
          return(<Card title={`Intäkt per tjänst — ${duration}h`} sub={`${timeRange?`Senaste ${timeRange}`:"Alla"} månader`}>
            <ResponsiveContainer width="100%" height={380}><ComposedChart data={sD} margin={{top:8,right:12,bottom:5,left:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border}/><XAxis {...xP}/><YAxis {...yP}/>
              <Tooltip content={<CTooltip/>}/><Legend wrapperStyle={{fontSize:10,fontFamily:"'Outfit'"}}/>
              {Object.entries(sC).map(([n,c],i,a)=>(<Bar key={n} dataKey={n} stackId="svc" fill={c} opacity={0.7} radius={i===a.length-1?[2,2,0,0]:[0,0,0,0]}/>))}
            </ComposedChart></ResponsiveContainer>
            <div style={{marginTop:16,overflowX:"auto"}}><div style={{color:T.text,fontSize:12,fontWeight:600,marginBottom:8}}>Marknadspriser — senaste 6 mån</div>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:10,fontFamily:"'DM Mono',monospace"}}><thead><tr style={{borderBottom:`2px solid ${T.border}`}}>
                {["Mån","FCR-N","FCR-D↑","FCR-D↓","CM↑","CM↓","EAM↑","EAM↓","ID spr.","DA"].map((h,i)=>(
                  <th key={h} style={{...thS,textAlign:i===0?"left":"right"}}>{h}</th>))}
              </tr></thead><tbody>{allMonths.slice(-6).map((m,i)=>(
                <tr key={i} style={{borderBottom:`1px solid ${T.border}`}}><td style={{padding:"4px 6px",fontFamily:"'Outfit'",fontSize:10}}>{m.label}</td>
                  {[m.fcr_n_price,m.fcr_d_up_price,m.fcr_d_down_price,m.mfrr_cm_up_price,m.mfrr_cm_down_price,m.mfrr_eam_up_price,m.mfrr_eam_down_price,m.intraday_spread,m.da_avg_price].map((v,j)=>(
                    <td key={j} style={{padding:"4px 6px",textAlign:"right",color:v===0?T.red+"88":T.text}}>{fmtP(v)}</td>))}</tr>))}</tbody></table></div></Card>);})()}

        {view==="mfrr"&&(()=>{
          const mD=months.map(m=>({label:m.label,"mFRR upp":m.mfrr_up,"mFRR ned":m.mfrr_down,delta:m.mfrr_up-m.mfrr_down}));
          const t12=mD.slice(-12),sU=t12.reduce((s,d)=>s+d["mFRR upp"],0),sD=t12.reduce((s,d)=>s+d["mFRR ned"],0);
          const dC={};months.forEach(m=>{dC[m.mfrr_direction]=(dC[m.mfrr_direction]||0)+1;});
          const cvn=months.map(m=>({label:m.label,Konventionell:m.mfrr_conv,"mFRR+intradag":m.mfrr_id,delta:m.mfrr_id-m.mfrr_conv}));
          const cv12=cvn.slice(-12),sC=cv12.reduce((s,d)=>s+d.Konventionell,0),sN=cv12.reduce((s,d)=>s+d["mFRR+intradag"],0);
          return(<div style={{display:"flex",flexDirection:"column",gap:14}}>
            <Card title={`mFRR upp vs ned — ${area} · ${duration}h`} sub={`CM+EAM per riktning · ${Object.entries(dC).map(([d,c])=>`${d} ${c} mån`).join(", ")}`}>
              <ResponsiveContainer width="100%" height={320}><ComposedChart data={mD} margin={{top:8,right:12,bottom:5,left:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border}/><XAxis {...xP}/><YAxis {...yP}/>
                <Tooltip content={<CTooltip/>}/><Legend wrapperStyle={{fontSize:10}}/>
                <Bar dataKey="mFRR upp" fill={T.green} opacity={0.7} radius={[2,2,0,0]}/>
                <Bar dataKey="mFRR ned" fill={T.amber} opacity={0.7} radius={[2,2,0,0]}/>
                <Line dataKey="delta" name="Δ (upp−ned)" stroke="#fff" strokeWidth={1.5} strokeDasharray="4 2" dot={{r:2,fill:"#fff"}}/>
              </ComposedChart></ResponsiveContainer>
              <div style={{marginTop:12,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                <StatBox label="mFRR upp 12m" value={fmtE(sU)} color={T.green}/><StatBox label="mFRR ned 12m" value={fmtE(sD)} color={T.amber}/>
                <StatBox label="Bäst" value={sU>sD?"UPP":"NED"} color={sU>sD?T.green:T.amber}/></div>
              <InfoBox color={T.accent}><strong style={{color:T.text}}>Riktningslogik:</strong> SE1/SE2 (norr): mFRR ned bättre (överskott). SE3/SE4 (söder): mFRR upp bättre (underskott). Auto-valt per månad.</InfoBox></Card>
            <Card title={`Konventionell vs mFRR+intradag — ${duration}h`} sub="Samma riktning, olika återställningsmetod">
              <ResponsiveContainer width="100%" height={300}><ComposedChart data={cvn} margin={{top:8,right:12,bottom:5,left:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border}/><XAxis {...xP}/><YAxis {...yP}/>
                <Tooltip content={<CTooltip/>}/><Legend wrapperStyle={{fontSize:10}}/>
                <Bar dataKey="Konventionell" fill={STRATEGIES.mfrr_conv.color} opacity={0.7} radius={[2,2,0,0]}/>
                <Bar dataKey="mFRR+intradag" fill={STRATEGIES.mfrr_id.color} opacity={0.7} radius={[2,2,0,0]}/>
                <Line dataKey="delta" name="Δ ID−konv." stroke="#fff" strokeWidth={1.5} strokeDasharray="4 2" dot={{r:2,fill:"#fff"}}/>
              </ComposedChart></ResponsiveContainer>
              <div style={{marginTop:10,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                <StatBox label="Konventionell 12m" value={fmtE(sC)} color={STRATEGIES.mfrr_conv.color}/>
                <StatBox label="mFRR+intradag 12m" value={fmtE(sN)} color={STRATEGIES.mfrr_id.color}/>
                <StatBox label="Skillnad" value={sC>0?`+${((sN-sC)/sC*100).toFixed(0)}%`:"—"} color="#fff"/></div>
              <InfoBox color={T.green}><strong style={{color:T.text}}>Konventionell:</strong> {CONV_H[duration]}h/dygn mFRR CM. SoC via elhandlare → pauser, ~6% obalans, resterande timmar FCR-D.
                <br/><br/><strong style={{color:T.text}}>mFRR+intradag:</strong> 24/7 CM. SoC via intradagsmarknaden → inga pauser, {ID_EAM[duration]} EAM-akt/dag vs {CONV_EAM[duration]}.
                {duration===2&&<><br/><em style={{color:T.amber}}>Not: 2h mFRR+intradag förutsätter ett 2,5h BESS (extra marginal för SoC-hantering).</em></>}
                {duration>=4&&<><br/><em style={{color:T.green}}>4h: Fullt deltagande på BÅDE mFRR upp OCH ned. CM = (upp+ned) × 24h.</em></>}</InfoBox></Card></div>);})()}

        {view==="dayahead"&&(()=>{
          const dD=months.map(m=>({label:m.label,Bruttoarbitrage:m.da_gross,Obalanskostnad:-m.da_imb,Nettointäkt:m.dayahead,"Intradag 2c (jmf)":m.intraday2}));
          const t12=dD.slice(-12),tG=t12.reduce((s,d)=>s+d.Bruttoarbitrage,0),tI=t12.reduce((s,d)=>s+Math.abs(d.Obalanskostnad),0);
          const tD=t12.reduce((s,d)=>s+d.Nettointäkt,0),tID=t12.reduce((s,d)=>s+d["Intradag 2c (jmf)"],0);
          return(<Card title={`Day-ahead arbitrage — ${duration}h (${mw*duration} MWh)`} sub="Obalanskostnad highlightad">
            <ResponsiveContainer width="100%" height={350}><ComposedChart data={dD} margin={{top:8,right:12,bottom:5,left:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border}/><XAxis {...xP}/><YAxis {...yP}/>
              <Tooltip content={<CTooltip/>}/><Legend wrapperStyle={{fontSize:10}}/>
              <Bar dataKey="Bruttoarbitrage" fill={T.pink} opacity={0.5} radius={[2,2,0,0]}/>
              <Bar dataKey="Obalanskostnad" fill={T.red} opacity={0.7} radius={[0,0,2,2]}/>
              <Line dataKey="Nettointäkt" name="DA netto" stroke={T.pink} strokeWidth={2.5} dot={{r:3,fill:T.pink}}/>
              <Line dataKey="Intradag 2c (jmf)" stroke={STRATEGIES.intraday2.color} strokeWidth={1.5} strokeDasharray="5 3" dot={false}/>
            </ComposedChart></ResponsiveContainer>
            <div style={{marginTop:12,display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
              <StatBox label="DA brutto 12m" value={fmtE(tG)} color={T.pink}/><StatBox label="Obalanskostnad" value={`−${fmtE(tI)}`} color={T.red}/>
              <StatBox label="DA netto 12m" value={fmtE(tD)} color={T.pink}/><StatBox label="Intradag 2c" value={fmtE(tID)} color={STRATEGIES.intraday2.color}/></div>
            <InfoBox color={T.red}><strong style={{color:T.red}}>⚠ Obalanskostnad:</strong> DA-bud sker dagen innan. Avvikelser → obalanser. ~{(allMonths.slice(-1)[0]?.da_imbalance_pct*100||8).toFixed(0)}% av brutto.
              <br/><br/><strong style={{color:T.text}}>Jmf intradag:</strong> Handlas närmare leverans → lägre obalansrisk. Streckad linje = ID 2 cykler.</InfoBox></Card>);})()}

        {view==="duration"&&(<Card title="Optimal intäkt: 1h vs 2h vs 4h" sub={`${timeRange?`Senaste ${timeRange}`:"Alla"} mån · Effektiv MWh: 1h→1.0, 2h→1.5, 4h→1.8 (avtagande marginalnytta)`}>
          <ResponsiveContainer width="100%" height={350}><ComposedChart data={durComp} margin={{top:8,right:12,bottom:5,left:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.border}/><XAxis {...xP}/><YAxis {...yP}/>
            <Tooltip content={<CTooltip/>}/><Legend wrapperStyle={{fontSize:10}}/>
            <Line dataKey="opt_1h" name="1h optimal" stroke="#38bdf8" strokeWidth={2} dot={{r:3,fill:"#38bdf8"}}/>
            <Line dataKey="opt_2h" name="2h optimal" stroke="#f472b6" strokeWidth={2.5} dot={{r:3,fill:"#f472b6"}}/>
            <Line dataKey="opt_4h" name="4h optimal" stroke="#a3e635" strokeWidth={2} dot={{r:3,fill:"#a3e635"}}/>
          </ComposedChart></ResponsiveContainer>
          <div style={{marginTop:12,display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
            {DURATIONS.map(dur=>{const ann=durComp.slice(-12).reduce((s,r)=>s+(r[`opt_${dur}h`]||0),0);
              return(<div key={dur} style={{background:T.cardAlt,border:`1px solid ${T.border}`,borderRadius:8,padding:12,textAlign:"center"}}>
                <div style={{fontSize:26,fontWeight:800,fontFamily:"'DM Mono',monospace",color:dur===duration?T.accent:T.text}}>{dur}h</div>
                <div style={{fontSize:10,color:T.textMuted}}>{mw} MW / {mw*dur} MWh</div>
                <div style={{fontSize:17,fontWeight:700,fontFamily:"'DM Mono',monospace",color:T.green,marginTop:6}}>{fmtE(ann)}</div>
                <div style={{fontSize:10,color:T.textMuted}}>Optimal 12 mån</div></div>);})}</div>
          <InfoBox color={T.accent}><strong style={{color:T.text}}>Avtagande marginalnytta:</strong> Kalibrerat mot Clean Horizon Storage Index. 4h BESS ger ~10-20% mer än 2h (inte 100% mer). Längre uthållighet ger fler FCR-N-timmar och fler mFRR-aktiveringar, men intradags-/DA-arbitrage har avtagande returns pga sämre marginella prispoäng.</InfoBox></Card>)}

        {view==="optimal"&&(<Card title={`Optimal strategi per månad — ${duration}h`} sub="Färg = vinnande strategi">
          <ResponsiveContainer width="100%" height={360}><ComposedChart data={months} margin={{top:8,right:12,bottom:5,left:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.border}/><XAxis {...xP}/><YAxis {...yP}/><Tooltip content={<CTooltip/>}/>
            <Bar dataKey="optimal" name="Optimal intäkt">{months.map((m,i)=><Cell key={i} fill={STRATEGIES[m.optimalStrategy]?.color||T.accent} opacity={0.8}/>)}</Bar>
          </ComposedChart></ResponsiveContainer>
          <div style={{marginTop:12,display:"flex",gap:6,flexWrap:"wrap"}}>
            {SIDS.map(sid=>{const cnt=months.filter(m=>m.optimalStrategy===sid).length;if(!cnt)return null;
              return(<div key={sid} style={{background:STRATEGIES[sid].color+"12",border:`1px solid ${STRATEGIES[sid].color}30`,borderRadius:6,padding:"5px 10px",display:"flex",alignItems:"center",gap:6,fontSize:11}}>
                <div style={{width:8,height:8,borderRadius:2,background:STRATEGIES[sid].color}}/><span>{STRATEGIES[sid].label}</span>
                <span style={{fontWeight:700,fontFamily:"'DM Mono',monospace",color:STRATEGIES[sid].color}}>{cnt} mån</span></div>);})}</div>
          <div style={{marginTop:10,display:"flex",gap:2,flexWrap:"wrap"}}>
            {months.map((m,i)=>(<div key={i} title={`${m.label}: ${STRATEGIES[m.optimalStrategy]?.label} — ${fmtE(m.optimal)}`}
              style={{flex:1,minWidth:18,height:28,borderRadius:3,background:STRATEGIES[m.optimalStrategy]?.color,opacity:0.7,display:"flex",alignItems:"flex-end",justifyContent:"center",fontSize:6,color:"#000",fontWeight:700,paddingBottom:2}}>
              {m.label.split(" ")[1]?.substring(0,3)}</div>))}</div></Card>)}

        {view==="table"&&(<Card title={`Månadstabell — ${duration}h · ${mw} MW`}>
          <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11,fontFamily:"'DM Mono',monospace"}}>
            <thead><tr style={{borderBottom:`2px solid ${T.border}`}}>
              <th style={{...thS,textAlign:"left"}}>Mån</th>
              {SIDS.filter(s=>selected.has(s)).map(sid=>(<th key={sid} style={{...thS,color:STRATEGIES[sid].color}}>{STRATEGIES[sid].short}</th>))}
              <th style={{...thS,color:T.red}}>Optimal</th><th style={{...thS,textAlign:"left"}}>Bäst</th><th style={{...thS,textAlign:"left"}}>mFRR</th>
            </tr></thead>
            <tbody>{months.map((m,i)=>(<tr key={i} style={{borderBottom:`1px solid ${T.border}`,background:i%2?T.bg+"66":"transparent"}}>
              <td style={{padding:"4px 6px",fontWeight:500,fontSize:10,fontFamily:"'Outfit'"}}>{m.label}</td>
              {SIDS.filter(s=>selected.has(s)).map(sid=>(<td key={sid} style={{padding:"4px 6px",textAlign:"right",color:m.optimalStrategy===sid?STRATEGIES[sid].color:T.textDim,fontWeight:m.optimalStrategy===sid?700:400}}>{fmt(m[sid])}</td>))}
              <td style={{padding:"4px 6px",textAlign:"right",color:T.red,fontWeight:700}}>{fmt(m.optimal)}</td>
              <td style={{padding:"4px 6px",color:STRATEGIES[m.optimalStrategy]?.color,fontSize:9,fontWeight:600}}>{STRATEGIES[m.optimalStrategy]?.short}</td>
              <td style={{padding:"4px 6px",fontSize:9,color:T.textMuted}}>{m.mfrr_direction}</td></tr>))}</tbody>
            <tfoot><tr style={{borderTop:`2px solid ${T.borderLight}`}}>
              <td style={{padding:"5px 6px",fontWeight:700,fontFamily:"'Outfit'"}}>SUMMA</td>
              {SIDS.filter(s=>selected.has(s)).map(sid=>(<td key={sid} style={{padding:"5px 6px",textAlign:"right",fontWeight:700}}>{fmt(months.reduce((a,m)=>a+(m[sid]||0),0))}</td>))}
              <td style={{padding:"5px 6px",textAlign:"right",fontWeight:700,color:T.red}}>{fmt(months.reduce((a,m)=>a+(m.optimal||0),0))}</td><td/><td/>
            </tr></tfoot></table></div></Card>)}

        <div style={{marginTop:16,padding:14,background:T.card,border:`1px solid ${T.border}`,borderRadius:10,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:14,fontSize:10,color:T.textMuted,lineHeight:1.7}}>
          <div><div style={{color:T.text,fontWeight:600,marginBottom:3}}>Uthållighetsfysik</div>
            FCR-N: 1h→16h, 2h→20h, 4h→24h<br/>FCR-D: oberoende av uthållighet<br/>FCR-N+D: 0.5 MW vardera<br/>mFRR+ID 4h: båda riktningar<br/>2h mFRR+ID kräver 2,5h BESS</div>
          <div><div style={{color:T.text,fontWeight:600,marginBottom:3}}>mFRR riktning</div>
            SE1/SE2: ned bättre (överskott norr)<br/>SE3/SE4: upp bättre (underskott söder)<br/>4h: bud på BÅDE upp OCH ned<br/>Auto-valt per månad baserat på priser</div>
          <div><div style={{color:T.text,fontWeight:600,marginBottom:3}}>Datakällor</div>
            FCR-N/D, mFRR CM: Mimer + ENTSO-E<br/>mFRR EAM: Mimer + ENTSO-E TP<br/>Intraday: Nord Pool / DA-proxy<br/>Day-ahead: ENTSO-E TP</div>
          <div><div style={{color:T.text,fontWeight:600,marginBottom:3}}>Beräkning</div>
            8 strategier × 3 uthålligheter<br/>RTE: 85% · FCR-D dual: 87%<br/>Intradag: 50%/30% capture<br/>DA: 45% capture, ~8% obalans</div></div>
        </div>
      </div>
    </div>
  );
}
