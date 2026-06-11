import { useState, useMemo, useCallback, useEffect } from "react";
import { ComposedChart,Bar,Line,XAxis,YAxis,CartesianGrid,Tooltip,Legend,ResponsiveContainer,Cell } from "recharts";

const S={
  fcrn:{l:"FCR-N",c:["#38bdf8","#0284c7"],s:"FCR-N"},
  fcrd:{l:"FCR-D upp+ned",c:["#fbbf24","#d97706"],s:"FCR-D"},
  fcrn_fcrd:{l:"FCR-N + FCR-D",c:["#22d3ee","#0891b2"],s:"N+D"},
  mfrr_conv:{l:"mFRR konventionell",c:["#fb923c","#ea580c"],s:"mFRR konv."},
  mfrr_opt:{l:"GreenVoltis mFRR",c:["#34d399","#059669"],s:"GV"},
  intraday1:{l:"Intradag 1 cykel",c:["#c084fc","#9333ea"],s:"ID 1c"},
  intraday2:{l:"Intradag 2 cykler",c:["#a78bfa","#7c3aed"],s:"ID 2c"},
  dayahead:{l:"Day-ahead arbitrage",c:["#f472b6","#db2777"],s:"DA arb."},
};
const SIDS=Object.keys(S),DURS=[1,2,4];
const TR=[{k:6,l:"6 mån"},{k:12,l:"12 mån"},{k:24,l:"24 mån"},{k:0,l:"Alla"}];
const FH={1:16,2:20,4:24},OE={1:3,2:5,4:8},CH={1:12,2:16,4:20},CB={1:12,2:8,4:4},CE={1:2,2:3,4:5};
const OH={1:16,2:24,4:24},OB={1:8,2:0,4:0},EM={1:1.0,2:1.8,4:3.2};
function lo(a,b){return a<b?a:b;}

const dk={bg:"#080e1a",card:"#0d1520",cA:"#0a1018",bd:"#1a2a44",bL:"#243352",tx:"#dfe6f0",mu:"#6b7d9a",dm:"#3d4f6a",cG:"#1a2a44",cT:"#6b7d9a"};
const lt={bg:"#f5f4f0",card:"#ffffff",cA:"#f0efeb",bd:"#e0ddd5",bL:"#ccc9c0",tx:"#1a1a18",mu:"#7a786e",dm:"#a8a69c",cG:"#e0ddd5",cT:"#7a786e"};

function genArea(){
  const SS=[18,15,12,8,6,5,5,6,10,14,17,20],rows=[];
  let d=new Date(2024,0);const end=new Date(2026,5);
  while(d<end){
    const mo=d.getMonth(),yr=d.getFullYear(),days=new Date(yr,mo+1,0).getDate(),hours=days*24,rte=0.85;
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
      const v5=ocm+oeam+obf;
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
    [2,4].forEach(dur=>{const p=dur===2?1:2;
      if((row[`optimal_${dur}h`]||0)<(row[`optimal_${p}h`]||0)){
        row[`optimal_${dur}h`]=row[`optimal_${p}h`];row[`optimal_strategy_${dur}h`]=row[`optimal_strategy_${p}h`];}});
    rows.push(row);d=new Date(yr,mo+1);
  }
  return rows;
}
function genSyn(){const m=genArea();return{SE1:m,SE2:m,SE3:m,SE4:m};}

function tx(raw,dur,mw){
  const label=(()=>{try{const[y,m]=raw.year_month.split("-");return new Date(+y,+m-1).toLocaleString("sv-SE",{year:"numeric",month:"short"});}catch{return raw.year_month;}})();
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
  return r;
}

const fmt=v=>v!=null?Math.round(v).toLocaleString("sv-SE"):"—";
const fmtE=v=>v!=null?`€${Math.round(v).toLocaleString("sv-SE")}`:"—";

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
  const[tr,setTr]=useState(12),[isDark,setIsDark]=useState(true);
  const t=isDark?dk:lt;

  useEffect(()=>{
    fetch("/monthly_revenue_all.json").then(r=>{if(!r.ok)throw new Error();return r.json();})
      .then(d=>{setRawData(d.areas);setDs("pipeline");})
      .catch(()=>{
        Promise.all(["SE1","SE2","SE3","SE4","FI"].map(a=>
          fetch(`/monthly_revenue_${a}.json`).then(r=>{if(!r.ok)throw new Error();return r.json();}).then(d=>[a,d.months]).catch(()=>[a,null])
        )).then(res=>{const areas={};let f=false;res.forEach(([a,m])=>{if(m){areas[a]=m;f=true;}});
          if(f){setRawData(areas);setDs("pipeline");}else{setRawData(genSyn());setDs("syntetisk");}});
      });
  },[]);

  const toggle=useCallback(id=>{setSel(p=>{const n=new Set(p);n.has(id)?(n.size>1&&n.delete(id)):n.add(id);return n;});},[]);
  const aD=useMemo(()=>rawData?(rawData[area]||rawData["SE3"]||Object.values(rawData)[0]||[]):null,[rawData,area]);
  const allM=useMemo(()=>aD?aD.map(r=>tx(r,dur,mw)):[],[aD,dur,mw]);
  const months=useMemo(()=>tr===0?allM:allM.slice(-tr),[allM,tr]);
  const N=months.length; // dynamic period length for KPIs
  const ann=useMemo(()=>{const r={};SIDS.forEach(s=>{r[s]=months.reduce((a,m)=>a+(m[s]||0),0);});r.optimal=months.reduce((a,m)=>a+(m.optimal||0),0);return r;},[months]);
  const oc=useMemo(()=>{const c={};months.forEach(m=>{c[m.optimalStrategy]=(c[m.optimalStrategy]||0)+1;});return c;},[months]);
  const durC=useMemo(()=>{if(!aD)return[];const src=tr===0?aD:aD.slice(-tr);
    return src.map(r=>{const lb=tx(r,2,1).label;const row={label:lb};DURS.forEach(d=>{row[`opt_${d}h`]=Math.round((r[`optimal_${d}h`]||0)*mw);});return row;});},[aD,mw,tr]);
  const noMfrr=useMemo(()=>aD?aD.every(r=>(r.mfrr_cm_up_price||0)===0&&(r.mfrr_cm_down_price||0)===0):false,[aD]);

  if(!rawData)return(<div style={{background:t.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:t.mu,fontFamily:"'Plus Jakarta Sans'"}}>Laddar data…</div>);

  const sc=sid=>isDark?S[sid].c[0]:S[sid].c[1];
  const thS={padding:"5px 6px",textAlign:"right",fontSize:8,textTransform:"uppercase",letterSpacing:"0.05em",color:t.mu};
  const xP={dataKey:"label",tick:{fill:t.cT,fontSize:9,fontFamily:"'Plus Jakarta Sans'"},angle:-45,textAnchor:"end",height:50};
  const yP={tick:{fill:t.cT,fontSize:10},tickFormatter:v=>`€${(v/1000).toFixed(0)}k`};
  const red=isDark?"#ef4444":"#dc2626",grn=isDark?"#34d399":"#059669",amb=isDark?"#fbbf24":"#d97706";

  return(
    <div style={{background:t.bg,minHeight:"100vh",fontFamily:"'Plus Jakarta Sans',sans-serif",color:t.tx,transition:"background 0.3s ease"}}>
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      <header style={{borderBottom:`1px solid ${t.bd}`,padding:"16px 24px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
          <div><h1 style={{margin:0,fontSize:18,fontWeight:600,letterSpacing:"-0.03em"}}>BESS Revenue Intelligence</h1>
            <div style={{fontSize:11,color:t.mu,marginTop:3}}>Intäktsanalys per tjänst och strategi · {area}
              {ds==="syntetisk"&&<span style={{color:red}}> · ⚠ Syntetisk data</span>}
              {ds==="pipeline"&&<span style={{color:grn}}> · ✓ Pipeline-data</span>}</div></div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <span style={{fontSize:9,color:t.dm,textTransform:"uppercase"}}>Elområde</span>
            {["SE1","SE2","SE3","SE4","FI"].map(a=><Pill key={a} active={area===a} onClick={()=>setArea(a)} t={t}>{a}</Pill>)}
            <div style={{width:1,height:18,background:t.bd,margin:"0 4px"}}/>
            <span style={{fontSize:9,color:t.dm,textTransform:"uppercase"}}>MW</span>
            <input type="number" min={0.5} max={200} step={0.5} value={mw} onChange={e=>setMw(Number(e.target.value)||1)}
              style={{width:52,background:t.card,border:`1px solid ${t.bd}`,borderRadius:6,color:t.tx,padding:"4px 8px",fontSize:13,fontFamily:"'JetBrains Mono'",textAlign:"center"}}/>
            <button onClick={()=>setIsDark(!isDark)} style={{background:t.cA,border:`1px solid ${t.bd}`,borderRadius:20,padding:"4px 14px",cursor:"pointer",color:t.mu,fontSize:11}}>
              {isDark?"☀ Ljust":"● Mörkt"}</button>
          </div>
        </div>
      </header>
      <div style={{padding:"16px 24px",maxWidth:1440,margin:"0 auto"}}>
        <div style={{display:"flex",gap:8,marginBottom:16,alignItems:"center",flexWrap:"wrap"}}>
          <span style={{fontSize:9,color:t.dm,textTransform:"uppercase",letterSpacing:"0.08em"}}>Uthållighet</span>
          {DURS.map(d=>(<button key={d} onClick={()=>setDur(d)} style={{background:dur===d?(isDark?"#38bdf8":"#0891b2"):t.card,
            color:dur===d?(isDark?"#000":"#fff"):t.mu,border:`1px solid ${dur===d?(isDark?"#38bdf8":"#0891b2"):t.bd}`,
            borderRadius:8,padding:"7px 20px",fontSize:14,cursor:"pointer",fontWeight:600,fontFamily:"'JetBrains Mono'"}}>{d}h</button>))}
          <div style={{width:1,height:18,background:t.bd,margin:"0 8px"}}/>
          <span style={{fontSize:9,color:t.dm,textTransform:"uppercase",letterSpacing:"0.08em"}}>Period</span>
          {TR.map(r=><Pill key={r.k} active={tr===r.k} onClick={()=>setTr(r.k)} small t={t}>{r.l}</Pill>)}
          <div style={{flex:1}}/><span style={{fontSize:11,color:t.mu,fontFamily:"'JetBrains Mono'"}}>{mw} MW · {mw*dur} MWh · C/{dur}</span>
        </div>
        {noMfrr&&(<div style={{marginBottom:16,padding:"12px 16px",background:amb+"12",border:`1px solid ${amb}30`,borderRadius:8,fontSize:11,color:amb}}>
          ⚠ <strong>mFRR CM/EAM-data saknas</strong> — ladda ner CSV från mimer.svk.se → data/manual/</div>)}
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
          <KPI label={`Optimal ${N} mån (${dur}h)`} value={fmtE(ann.optimal)} sub="bästa strategi/mån" color={red} t={t}/>
          <KPI label="FCR-N+D" value={fmtE(ann.fcrn_fcrd)} sub={`${oc.fcrn_fcrd||0}/${N} optimal`} color={sc("fcrn_fcrd")} t={t}/>
          <KPI label="GreenVoltis" value={fmtE(ann.mfrr_opt)} sub={`${oc.mfrr_opt||0}/${N} optimal${dur===2?" · 2,5h BESS":dur>=4?" · båda riktn.":""}`} color={sc("mfrr_opt")} t={t}/>
          <KPI label="FCR-N" value={fmtE(ann.fcrn)} sub={`${oc.fcrn||0}/${N} optimal`} color={sc("fcrn")} t={t}/>
          <KPI label="Day-ahead" value={fmtE(ann.dayahead)} sub={`${oc.dayahead||0}/${N} · inkl. obalans`} color={sc("dayahead")} warn t={t}/>
        </div>
        <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
          {[{k:"comparison",l:"Strategijämförelse"},{k:"mfrr",l:"mFRR upp vs ned"},
            {k:"dayahead",l:"Day-ahead & obalans"},{k:"duration",l:"1h / 2h / 4h"},{k:"optimal",l:"Optimal strategi"},{k:"table",l:"Månadstabell"}
          ].map(v=><Pill key={v.k} active={view===v.k} onClick={()=>setView(v.k)} t={t}>{v.l}</Pill>)}</div>
        {(view==="comparison"||view==="table")&&(<div style={{display:"flex",gap:5,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{fontSize:9,color:t.dm,textTransform:"uppercase"}}>Visa</span>
          {SIDS.map(sid=><Pill key={sid} active={sel.has(sid)} color={sc(sid)} onClick={()=>toggle(sid)} t={t}>{S[sid].l}</Pill>)}</div>)}

        {view==="comparison"&&(<Card title={`Strategijämförelse — ${dur}h (${mw*dur} MWh)`} sub={`EUR/mån · ${tr?`Senaste ${tr}`:"Alla"} månader`} t={t}>
          <ResponsiveContainer width="100%" height={400}><ComposedChart data={months} margin={{top:8,right:12,bottom:5,left:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke={t.cG}/><XAxis {...xP}/><YAxis {...yP}/>
            <Tooltip content={<TT theme={t}/>}/><Legend wrapperStyle={{fontSize:10,fontFamily:"'Plus Jakarta Sans'"}}/>
            {SIDS.filter(s=>sel.has(s)).map(sid=>(<Bar key={sid} dataKey={sid} name={S[sid].l} fill={sc(sid)} opacity={0.6} radius={[2,2,0,0]}/>))}
            <Line dataKey="optimal" name="Optimal" stroke={red} strokeWidth={2.5} dot={{r:2,fill:red}}/>
          </ComposedChart></ResponsiveContainer></Card>)}

        {view==="mfrr"&&(()=>{
          const mD=months.map(m=>({label:m.label,"mFRR upp":m.mfrr_up,"mFRR ned":m.mfrr_down,delta:m.mfrr_up-m.mfrr_down}));
          const sU=mD.reduce((s,d)=>s+d["mFRR upp"],0),sD2=mD.reduce((s,d)=>s+d["mFRR ned"],0);
          const cvn=months.map(m=>({label:m.label,Konventionell:m.mfrr_conv,"GreenVoltis mFRR":m.mfrr_opt,delta:m.mfrr_opt-m.mfrr_conv}));
          const sC=cvn.reduce((s,d)=>s+d.Konventionell,0),sN=cvn.reduce((s,d)=>s+d["GreenVoltis mFRR"],0);
          return(<div style={{display:"flex",flexDirection:"column",gap:16}}>
            <Card title={`mFRR upp vs ned — ${area} · ${dur}h`} sub="CM+EAM per riktning" t={t}>
              <ResponsiveContainer width="100%" height={320}><ComposedChart data={mD} margin={{top:8,right:12,bottom:5,left:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke={t.cG}/><XAxis {...xP}/><YAxis {...yP}/>
                <Tooltip content={<TT theme={t}/>}/><Legend wrapperStyle={{fontSize:10}}/>
                <Bar dataKey="mFRR upp" fill={grn} opacity={0.7} radius={[2,2,0,0]}/>
                <Bar dataKey="mFRR ned" fill={amb} opacity={0.7} radius={[2,2,0,0]}/>
                <Line dataKey="delta" name="Δ (upp−ned)" stroke={t.tx} strokeWidth={1.5} strokeDasharray="4 2" dot={{r:2,fill:t.tx}}/>
              </ComposedChart></ResponsiveContainer>
              <div style={{marginTop:12,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                <SB label={`mFRR upp ${N}m`} value={fmtE(sU)} color={grn} t={t}/>
                <SB label={`mFRR ned ${N}m`} value={fmtE(sD2)} color={amb} t={t}/>
                <SB label="Bäst" value={sU>sD2?"UPP":"NED"} color={sU>sD2?grn:amb} t={t}/></div></Card>
            <Card title={`Konventionell vs GreenVoltis mFRR — ${dur}h`} sub="Samma riktning, olika deltagande" t={t}>
              <ResponsiveContainer width="100%" height={300}><ComposedChart data={cvn} margin={{top:8,right:12,bottom:5,left:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke={t.cG}/><XAxis {...xP}/><YAxis {...yP}/>
                <Tooltip content={<TT theme={t}/>}/><Legend wrapperStyle={{fontSize:10}}/>
                <Bar dataKey="Konventionell" fill={sc("mfrr_conv")} opacity={0.7} radius={[2,2,0,0]}/>
                <Bar dataKey="GreenVoltis mFRR" fill={sc("mfrr_opt")} opacity={0.7} radius={[2,2,0,0]}/>
                <Line dataKey="delta" name="Δ opt−konv." stroke={t.tx} strokeWidth={1.5} strokeDasharray="4 2" dot={{r:2,fill:t.tx}}/>
              </ComposedChart></ResponsiveContainer>
              <div style={{marginTop:10,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                <SB label={`Konventionell ${N}m`} value={fmtE(sC)} color={sc("mfrr_conv")} t={t}/>
                <SB label={`mFRR optimerad ${N}m`} value={fmtE(sN)} color={sc("mfrr_opt")} t={t}/>
                <SB label="Skillnad" value={sC>0?`+${((sN-sC)/sC*100).toFixed(0)}%`:"—"} color={t.tx} t={t}/></div>
              <IB color={grn} t={t}><strong style={{color:t.tx}}>Konventionell:</strong> {CH[dur]}h/dygn mFRR CM. SoC via elhandlare → pauser, ~6% obalans. {CB[dur]}h/dygn FCR-D backfill.
                <br/><br/><strong style={{color:t.tx}}>GreenVoltis mFRR:</strong> {OH[dur]}h/dygn CM, {OE[dur]} EAM-akt/dag vs {CE[dur]}.{OB[dur]>0?` ${OB[dur]}h/dygn FCR-D backfill.`:""}
                {dur===2&&<><br/><em style={{color:amb}}>Not: 2h GreenVoltis mFRR förutsätter ett 2,5h BESS.</em></>}
                {dur>=4&&<><br/><em style={{color:grn}}>4h: Fullt deltagande på BÅDE mFRR upp OCH ned.</em></>}</IB></Card></div>);})()}

        {view==="dayahead"&&(()=>{
          const dD=months.map(m=>({label:m.label,Bruttoarbitrage:Math.round(m.dayahead/0.92),Obalanskostnad:-Math.round(m.dayahead/0.92*0.08),Nettointäkt:m.dayahead,"Intradag 2c (jmf)":m.intraday2}));
          const tG=dD.reduce((s,d)=>s+d.Bruttoarbitrage,0),tI=dD.reduce((s,d)=>s+Math.abs(d.Obalanskostnad),0);
          const tD=dD.reduce((s,d)=>s+d.Nettointäkt,0),tID=dD.reduce((s,d)=>s+d["Intradag 2c (jmf)"],0);
          return(<Card title={`Day-ahead arbitrage — ${dur}h (${mw*dur} MWh)`} sub="85% capture · ~8% obalanskostnad" t={t}>
            <ResponsiveContainer width="100%" height={350}><ComposedChart data={dD} margin={{top:8,right:12,bottom:5,left:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke={t.cG}/><XAxis {...xP}/><YAxis {...yP}/>
              <Tooltip content={<TT theme={t}/>}/><Legend wrapperStyle={{fontSize:10}}/>
              <Bar dataKey="Bruttoarbitrage" fill={sc("dayahead")} opacity={0.5} radius={[2,2,0,0]}/>
              <Bar dataKey="Obalanskostnad" fill={red} opacity={0.7} radius={[0,0,2,2]}/>
              <Line dataKey="Nettointäkt" name="DA netto" stroke={sc("dayahead")} strokeWidth={2.5} dot={{r:3,fill:sc("dayahead")}}/>
              <Line dataKey="Intradag 2c (jmf)" stroke={sc("intraday2")} strokeWidth={1.5} strokeDasharray="5 3" dot={false}/>
            </ComposedChart></ResponsiveContainer>
            <div style={{marginTop:12,display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
              <SB label={`DA brutto ${N}m`} value={fmtE(tG)} color={sc("dayahead")} t={t}/>
              <SB label="Obalanskostnad" value={`−${fmtE(tI)}`} color={red} t={t}/>
              <SB label={`DA netto ${N}m`} value={fmtE(tD)} color={sc("dayahead")} t={t}/>
              <SB label="Intradag 2c" value={fmtE(tID)} color={sc("intraday2")} t={t}/></div></Card>);})()}

        {view==="duration"&&(<Card title="Optimal intäkt: 1h vs 2h vs 4h" sub={`${tr?`Senaste ${tr}`:"Alla"} mån · Eff. MWh: 1.0 / 1.8 / 3.2`} t={t}>
          <ResponsiveContainer width="100%" height={350}><ComposedChart data={durC} margin={{top:8,right:12,bottom:5,left:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke={t.cG}/><XAxis {...xP}/><YAxis {...yP}/>
            <Tooltip content={<TT theme={t}/>}/><Legend wrapperStyle={{fontSize:10}}/>
            <Line dataKey="opt_1h" name="1h optimal" stroke={isDark?"#38bdf8":"#0284c7"} strokeWidth={2} dot={{r:3}}/>
            <Line dataKey="opt_2h" name="2h optimal" stroke={isDark?"#f472b6":"#db2777"} strokeWidth={2.5} dot={{r:3}}/>
            <Line dataKey="opt_4h" name="4h optimal" stroke={isDark?"#a3e635":"#65a30d"} strokeWidth={2} dot={{r:3}}/>
          </ComposedChart></ResponsiveContainer>
          <div style={{marginTop:14,display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
            {DURS.map(d=>{const a=durC.reduce((s,r)=>s+(r[`opt_${d}h`]||0),0);
              return(<div key={d} style={{background:t.cA,border:`1px solid ${t.bd}`,borderRadius:10,padding:14,textAlign:"center"}}>
                <div style={{fontSize:28,fontWeight:600,fontFamily:"'JetBrains Mono'",color:d===dur?(isDark?"#38bdf8":"#0891b2"):t.tx}}>{d}h</div>
                <div style={{fontSize:10,color:t.mu}}>{mw} MW / {mw*d} MWh</div>
                <div style={{fontSize:18,fontWeight:500,fontFamily:"'JetBrains Mono'",color:grn,marginTop:8}}>{fmtE(a)}</div>
                <div style={{fontSize:10,color:t.mu}}>Optimal {N} mån</div></div>);})}</div></Card>)}

        {view==="optimal"&&(<Card title={`Optimal strategi per månad — ${dur}h`} sub="Färg = vinnande strategi" t={t}>
          <ResponsiveContainer width="100%" height={360}><ComposedChart data={months} margin={{top:8,right:12,bottom:5,left:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke={t.cG}/><XAxis {...xP}/><YAxis {...yP}/><Tooltip content={<TT theme={t}/>}/>
            <Bar dataKey="optimal" name="Optimal intäkt">{months.map((m,i)=><Cell key={i} fill={sc(m.optimalStrategy)} opacity={0.8}/>)}</Bar>
          </ComposedChart></ResponsiveContainer>
          <div style={{marginTop:14,display:"flex",gap:6,flexWrap:"wrap"}}>
            {SIDS.map(sid=>{const cnt=months.filter(m=>m.optimalStrategy===sid).length;if(!cnt)return null;
              return(<div key={sid} style={{background:sc(sid)+"12",border:`1px solid ${sc(sid)}30`,borderRadius:6,padding:"5px 10px",display:"flex",alignItems:"center",gap:6,fontSize:11}}>
                <div style={{width:8,height:8,borderRadius:2,background:sc(sid)}}/><span>{S[sid].l}</span>
                <span style={{fontWeight:500,fontFamily:"'JetBrains Mono'",color:sc(sid)}}>{cnt}/{N} mån</span></div>);})}</div></Card>)}

        {view==="table"&&(<Card title={`Månadstabell — ${dur}h · ${mw} MW`} t={t}>
          <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11,fontFamily:"'JetBrains Mono'"}}>
            <thead><tr style={{borderBottom:`2px solid ${t.bd}`}}>
              <th style={{...thS,textAlign:"left"}}>Mån</th>
              {SIDS.filter(s=>sel.has(s)).map(sid=>(<th key={sid} style={{...thS,color:sc(sid)}}>{S[sid].s}</th>))}
              <th style={{...thS,color:red}}>Optimal</th><th style={{...thS,textAlign:"left"}}>Bäst</th>
            </tr></thead>
            <tbody>{months.map((m,i)=>(<tr key={i} style={{borderBottom:`1px solid ${t.bd}`,background:i%2?t.bg+"66":"transparent"}}>
              <td style={{padding:"5px 6px",fontWeight:500,fontSize:10,fontFamily:"'Plus Jakarta Sans'"}}>{m.label}</td>
              {SIDS.filter(s=>sel.has(s)).map(sid=>(<td key={sid} style={{padding:"5px 6px",textAlign:"right",color:m.optimalStrategy===sid?sc(sid):t.dm,fontWeight:m.optimalStrategy===sid?500:400}}>{fmt(m[sid])}</td>))}
              <td style={{padding:"5px 6px",textAlign:"right",color:red,fontWeight:500}}>{fmt(m.optimal)}</td>
              <td style={{padding:"5px 6px",color:sc(m.optimalStrategy),fontSize:9,fontWeight:500}}>{S[m.optimalStrategy]?.s}</td></tr>))}</tbody>
            <tfoot><tr style={{borderTop:`2px solid ${t.bL}`}}>
              <td style={{padding:"6px",fontWeight:500,fontFamily:"'Plus Jakarta Sans'"}}>SUMMA</td>
              {SIDS.filter(s=>sel.has(s)).map(sid=>(<td key={sid} style={{padding:"6px",textAlign:"right",fontWeight:500}}>{fmt(months.reduce((a,m)=>a+(m[sid]||0),0))}</td>))}
              <td style={{padding:"6px",textAlign:"right",fontWeight:500,color:red}}>{fmt(months.reduce((a,m)=>a+(m.optimal||0),0))}</td><td/>
            </tr></tfoot></table></div></Card>)}

        <div style={{marginTop:20,padding:16,background:t.card,border:`1px solid ${t.bd}`,borderRadius:12,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:16,fontSize:10,color:t.mu,lineHeight:1.7}}>
          <div><div style={{color:t.tx,fontWeight:500,marginBottom:4}}>Uthållighetsfysik</div>
            FCR-N: 1h→16h, 2h→20h, 4h→24h<br/>FCR-D: oberoende av uthållighet<br/>FCR-N+D: 0.5 MW vardera<br/>GV 2h: kräver 2,5h BESS<br/>GV 4h: båda riktningar</div>
          <div><div style={{color:t.tx,fontWeight:500,marginBottom:4}}>mFRR deltagande</div>
            Konv: 1h→12h, 2h→16h, 4h→20h/dygn<br/>Opt: 1h→16h+8h FCR-D, 2h→24h, 4h→24h<br/>4h: bud på BÅDE upp OCH ned</div>
          <div><div style={{color:t.tx,fontWeight:500,marginBottom:4}}>Datakällor</div>
            FCR-N/D: Mimer (SVK)<br/>mFRR CM/EAM: Mimer CSV (manuell)<br/>Intraday: Nord Pool / DA-proxy<br/>Day-ahead: ENTSO-E TP</div>
          <div><div style={{color:t.tx,fontWeight:500,marginBottom:4}}>Beräkning</div>
            8 strategier × 3 uthålligheter<br/>RTE: 85% · FCR-D dual: 87%<br/>Intradag: 75%/50% capture<br/>DA: 85% capture, ~8% obalans</div>
        </div>
      </div>
    </div>
  );
}
