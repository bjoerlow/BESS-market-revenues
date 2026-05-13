import { useState, useMemo, useCallback, useEffect } from "react";
import { ComposedChart,Bar,Line,XAxis,YAxis,CartesianGrid,Tooltip,Legend,ResponsiveContainer,Cell } from "recharts";

const S = {
  fcrn:{l:"FCR-N",c:["#38bdf8","#0284c7"],s:"FCR-N"},
  fcrd:{l:"FCR-D upp+ned",c:["#fbbf24","#d97706"],s:"FCR-D"},
  fcrn_fcrd:{l:"FCR-N + FCR-D",c:["#22d3ee","#0891b2"],s:"N+D"},
  mfrr_conv:{l:"mFRR konventionell",c:["#fb923c","#ea580c"],s:"mFRR konv."},
  mfrr_id:{l:"mFRR+intradag",c:["#34d399","#059669"],s:"mFRR+ID"},
  intraday1:{l:"Intradag 1 cykel",c:["#c084fc","#9333ea"],s:"ID 1c"},
  intraday2:{l:"Intradag 2 cykler",c:["#a78bfa","#7c3aed"],s:"ID 2c"},
  dayahead:{l:"Day-ahead arbitrage",c:["#f472b6","#db2777"],s:"DA arb."},
};
const SIDS=Object.keys(S);
const DURS=[1,2,4];
const TR=[{k:6,l:"6 mån"},{k:12,l:"12 mån"},{k:24,l:"24 mån"},{k:0,l:"Alla"}];
const FH={1:16,2:20,4:24};
const IE={1:3,2:5,4:8},CH={1:12,2:16,4:20},CB={1:12,2:8,4:4},CE={1:2,2:3,4:5};
const EM={1:1.0,2:1.5,4:1.8};

function lo(a,b){return a<b?a:b;}

const dark={bg:"#080e1a",card:"#0d1520",cardAlt:"#0a1018",bdr:"#1a2a44",bdrL:"#243352",
  txt:"#dfe6f0",mut:"#6b7d9a",dim:"#3d4f6a",
  chartGrid:"#1a2a44",chartTick:"#6b7d9a"};
const light={bg:"#f5f4f0",card:"#ffffff",cardAlt:"#f0efeb",bdr:"#e0ddd5",bdrL:"#ccc9c0",
  txt:"#1a1a18",mut:"#7a786e",dim:"#a8a69c",
  chartGrid:"#e0ddd5",chartTick:"#7a786e"};

function genArea(){
  const SS=[18,15,12,8,6,5,5,6,10,14,17,20],rows=[];
  let d=new Date(2024,0);const end=new Date(2026,5);
  while(d<end){
    const mo=d.getMonth(),yr=d.getFullYear(),days=new Date(yr,mo+1,0).getDate(),hours=days*24,rte=0.85;
    const fcrn=22+SS[mo]+Math.sin(yr*7+mo*3)*3;
    const fu=4+SS[mo]*0.35+Math.sin(yr*5+mo*2)*1.2,fd=3+SS[mo]*0.3+Math.cos(yr*4+mo*5)*0.8;
    const cu=3+SS[mo]*0.35+Math.sin(yr*3+mo*7)*1,cd=2+SS[mo]*0.25+Math.cos(yr*6+mo*3)*0.8;
    const hasE=d>=new Date(2025,2);
    const eu=hasE?40+Math.sin(yr*11+mo*4)*18:0,ed=hasE?30+Math.cos(yr*8+mo*6)*12:0;
    const sp=8+SS[mo]*0.6+Math.cos(yr*6+mo*9)*2.5;
    const dr=15+SS[mo]*1.8+Math.sin(yr*4+mo*8)*5;
    const bU=cu+eu*0.3>=cd+ed*0.3,bCM=bU?cu:cd,bEAM=bU?eu:ed;
    const has=bCM>0||bEAM>0;
    const row={year_month:`${yr}-${String(mo+1).padStart(2,"0")}`,days,hours,
      fcr_n_price:+fcrn.toFixed(2),fcr_d_up_price:+fu.toFixed(2),fcr_d_down_price:+fd.toFixed(2),
      mfrr_cm_up_price:+cu.toFixed(2),mfrr_cm_down_price:+cd.toFixed(2),mfrr_cm_best_direction:bU?"upp":"ned",
      mfrr_eam_up_price:+eu.toFixed(2),mfrr_eam_down_price:+ed.toFixed(2),
      intraday_spread:+sp.toFixed(2),da_range:+dr.toFixed(2),da_imbalance_pct:0.08};
    DURS.forEach(dur=>{
      const eff=EM[dur],act=lo(dur,0.25);
      const v1=fcrn*0.5*FH[dur]*days;
      const v2=(fu+fd)*0.87*hours;
      const v3=fcrn*0.5*FH[dur]*days+(fu+fd)*0.87*0.5*hours;
      const ccm=has?bCM*CH[dur]*days:0;
      const ceam=has&&bEAM>0?CE[dur]*act*bEAM*days*rte:0;
      const cimb=(ccm+ceam)*0.06;
      const cfcrd=has?(fu+fd)*0.87*CB[dur]*days:0;
      const v4=ccm+ceam-cimb+cfcrd;
      const icm=has?(dur>=4?(cu+cd)*hours:bCM*hours):0;
      const iep=dur>=4?(eu+ed)/2:bEAM;
      const ieam=has&&iep>0?IE[dur]*act*iep*days*rte:0;
      const icost=has&&iep>0?IE[dur]*act*sp*days*0.5:0;
      const v5=icm+ieam-icost;
      const v6=eff*sp*rte*days*0.5;
      const v7=eff*sp*rte*days*0.8;
      const dg=eff*dr*rte*days*0.45,di=dg*0.08;
      const v8=dg-di;
      row[`fcrn_${dur}h`]=Math.round(v1);row[`fcrd_${dur}h`]=Math.round(v2);
      row[`fcrn_fcrd_${dur}h`]=Math.round(v3);
      row[`mfrr_conv_${dur}h`]=Math.round(v4);row[`mfrr_id_${dur}h`]=Math.round(v5);
      row[`intraday1_${dur}h`]=Math.round(v6);row[`intraday2_${dur}h`]=Math.round(v7);
      row[`dayahead_${dur}h`]=Math.round(v8);
      row[`mfrr_up_total_${dur}h`]=Math.round(cu*hours+(eu>0?IE[dur]*act*eu*days*rte:0));
      row[`mfrr_down_total_${dur}h`]=Math.round(cd*hours+(ed>0?IE[dur]*act*ed*days*rte:0));
      const all={fcrn:v1,fcrd:v2,fcrn_fcrd:v3,mfrr_conv:v4,mfrr_id:v5,intraday1:v6,intraday2:v7,dayahead:v8};
      let bV=-Infinity,bS="fcrn";Object.entries(all).forEach(([s,v])=>{if(v>bV){bV=v;bS=s;}});
      row[`optimal_${dur}h`]=Math.round(bV);row[`optimal_strategy_${dur}h`]=bS;
    });
    [2,4].forEach(dur=>{const p=dur===2?1:2;
      if((row[`optimal_${dur}h`]||0)<(row[`optimal_${p}h`]||0)){
        row[`optimal_${dur}h`]=row[`optimal_${p}h`];
        row[`optimal_strategy_${dur}h`]=row[`optimal_strategy_${p}h`];}});
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
  r.fcr_n_price=raw.fcr_n_price||0;r.fcr_d_up_price=raw.fcr_d_up_price||0;
  r.fcr_d_down_price=raw.fcr_d_down_price||0;
  r.mfrr_cm_up_price=raw.mfrr_cm_up_price||0;r.mfrr_cm_down_price=raw.mfrr_cm_down_price||0;
  r.mfrr_eam_up_price=raw.mfrr_eam_up_price||0;r.mfrr_eam_down_price=raw.mfrr_eam_down_price||0;
  r.intraday_spread=raw.intraday_spread||0;r.da_imbalance_pct=raw.da_imbalance_pct||0;
  return r;
}

const fmt=v=>v!=null?Math.round(v).toLocaleString("sv-SE"):"—";
const fmtE=v=>v!=null?`€${Math.round(v).toLocaleString("sv-SE")}`:"—";
const fmtP=v=>v!=null?`€${Number(v).toFixed(2)}`:"—";

function TT({active,payload,label,theme:t}){
  if(!active||!payload?.length)return null;
  return(<div style={{background:t.card,border:`1px solid ${t.bdr}`,borderRadius:8,padding:"10px 14px",fontSize:12,fontFamily:"'JetBrains Mono',monospace",boxShadow:"0 8px 32px rgba(0,0,0,0.3)"}}>
    <div style={{color:t.txt,fontWeight:500,marginBottom:6,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{label}</div>
    {payload.filter(p=>p.value!=null&&p.value!==0).map((p,i)=>(<div key={i} style={{color:p.color||t.txt,margin:"3px 0",display:"flex",justifyContent:"space-between",gap:20}}>
      <span style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:11,opacity:0.85}}>{p.name}</span>
      <span style={{fontWeight:500}}>{fmtE(p.value)}</span></div>))}
  </div>);
}
function Pill({active,onClick,children,color,small,t}){
  const c=color||(t===dark?"#38bdf8":"#0891b2");
  return(<button onClick={onClick} style={{background:active?c+"18":"transparent",color:active?c:t.mut,
    border:`1px solid ${active?c+"40":t.bdr}`,borderRadius:6,padding:small?"3px 8px":"5px 12px",
    fontSize:small?10:11.5,cursor:"pointer",fontWeight:active?500:400,fontFamily:"'Plus Jakarta Sans',sans-serif",whiteSpace:"nowrap",
    transition:"all 0.2s ease"}}>{children}</button>);
}
function KPI({label,value,sub,color,warn,t}){
  return(<div style={{background:t.card,border:`1px solid ${t.bdr}`,borderRadius:10,padding:"14px 16px",flex:1,minWidth:140,position:"relative",transition:"background 0.3s ease"}}>
    <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:color,borderRadius:"10px 10px 0 0",opacity:0.8}}/>
    <div style={{color:t.mut,fontSize:9,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>{label}</div>
    <div style={{color:t.txt,fontSize:18,fontWeight:500,fontFamily:"'JetBrains Mono',monospace"}}>{value}</div>
    {sub&&<div style={{color:warn?"#ef4444":color,fontSize:10,marginTop:3}}>{sub}</div>}
  </div>);
}
function Card({title,sub,children,t}){
  return(<div style={{background:t.card,border:`1px solid ${t.bdr}`,borderRadius:12,padding:20,transition:"background 0.3s ease"}}>
    {title&&<h3 style={{margin:"0 0 3px",fontSize:14,fontWeight:500,color:t.txt}}>{title}</h3>}
    {sub&&<div style={{color:t.mut,fontSize:10,marginBottom:12}}>{sub}</div>}{children}</div>);
}
function SB({label,value,color,t}){
  return(<div style={{background:t.cardAlt,border:`1px solid ${t.bdr}`,borderRadius:8,padding:12,textAlign:"center"}}>
    <div style={{fontSize:9,color:t.mut,marginBottom:3}}>{label}</div>
    <div style={{fontSize:16,fontWeight:500,fontFamily:"'JetBrains Mono',monospace",color}}>{value}</div></div>);
}
function IB({color,children,t}){
  return(<div style={{marginTop:14,padding:14,background:(color||"#38bdf8")+"08",border:`1px solid ${(color||"#38bdf8")}18`,borderRadius:8,fontSize:11,lineHeight:1.7,color:t.mut}}>{children}</div>);
}

export default function Dashboard(){
  const[area,setArea]=useState("SE3"),[dur,setDur]=useState(2),[mw,setMw]=useState(1);
  const[view,setView]=useState("comparison"),[sel,setSel]=useState(new Set(SIDS));
  const[rawData,setRawData]=useState(null),[ds,setDs]=useState("syntetisk");
  const[tr,setTr]=useState(12);
  const[isDark,setIsDark]=useState(true);
  const t=isDark?dark:light;

  useEffect(()=>{
    fetch("/monthly_revenue_all.json").then(r=>{if(!r.ok)throw new Error();return r.json();})
      .then(d=>{setRawData(d.areas);setDs("pipeline");})
      .catch(()=>{
        Promise.all(["SE1","SE2","SE3","SE4"].map(a=>
          fetch(`/monthly_revenue_${a}.json`).then(r=>{if(!r.ok)throw new Error();return r.json();}).then(d=>[a,d.months]).catch(()=>[a,null])
        )).then(res=>{const areas={};let f=false;
          res.forEach(([a,m])=>{if(m){areas[a]=m;f=true;}});
          if(f){setRawData(areas);setDs("pipeline");}else{setRawData(genSyn());setDs("syntetisk");}
        });
      });
  },[]);

  const toggle=useCallback(id=>{setSel(p=>{const n=new Set(p);n.has(id)?(n.size>1&&n.delete(id)):n.add(id);return n;});},[]);
  const aD=useMemo(()=>rawData?(rawData[area]||rawData["SE3"]||Object.values(rawData)[0]||[]):null,[rawData,area]);
  const allM=useMemo(()=>aD?aD.map(r=>tx(r,dur,mw)):[],[aD,dur,mw]);
  const months=useMemo(()=>tr===0?allM:allM.slice(-tr),[allM,tr]);
  const l12=allM.slice(-12);
  const ann=useMemo(()=>{const r={};SIDS.forEach(s=>{r[s]=l12.reduce((a,m)=>a+(m[s]||0),0);});r.optimal=l12.reduce((a,m)=>a+(m.optimal||0),0);return r;},[l12]);
  const oc=useMemo(()=>{const c={};l12.forEach(m=>{c[m.optimalStrategy]=(c[m.optimalStrategy]||0)+1;});return c;},[l12]);
  const durC=useMemo(()=>{if(!aD)return[];const src=tr===0?aD:aD.slice(-tr);
    return src.map(r=>{const lb=tx(r,2,1).label;const row={label:lb};DURS.forEach(d=>{row[`opt_${d}h`]=Math.round((r[`optimal_${d}h`]||0)*mw);});return row;});},[aD,mw,tr]);
  const noMfrr=useMemo(()=>aD?aD.every(r=>(r.mfrr_cm_up_price||0)===0&&(r.mfrr_cm_down_price||0)===0):false,[aD]);

  if(!rawData)return(<div style={{background:t.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:t.mut,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Laddar data…</div>);

  const sc=(sid)=>isDark?S[sid].c[0]:S[sid].c[1];
  const thS={padding:"5px 6px",textAlign:"right",fontSize:8,textTransform:"uppercase",letterSpacing:"0.05em",color:t.mut,fontFamily:"'Plus Jakarta Sans',sans-serif"};
  const xP={dataKey:"label",tick:{fill:t.chartTick,fontSize:9,fontFamily:"'Plus Jakarta Sans'"},angle:-45,textAnchor:"end",height:50};
  const yP={tick:{fill:t.chartTick,fontSize:10},tickFormatter:v=>`€${(v/1000).toFixed(0)}k`};
  const red=isDark?"#ef4444":"#dc2626";
  const grn=isDark?"#34d399":"#059669";
  const amb=isDark?"#fbbf24":"#d97706";

  return(
    <div style={{background:t.bg,minHeight:"100vh",fontFamily:"'Plus Jakarta Sans',sans-serif",color:t.txt,transition:"background 0.3s ease, color 0.3s ease"}}>
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>

      <header style={{borderBottom:`1px solid ${t.bdr}`,padding:"16px 24px",transition:"border-color 0.3s ease"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
          <div>
            <h1 style={{margin:0,fontSize:18,fontWeight:600,letterSpacing:"-0.03em",color:t.txt}}>BESS Revenue Intelligence</h1>
            <div style={{fontSize:11,color:t.mut,marginTop:3}}>
              Batterilagring — intäktsanalys per tjänst och strategi · {area}
              {ds==="syntetisk"&&<span style={{color:red}}> · ⚠ Syntetisk data</span>}
              {ds==="pipeline"&&<span style={{color:grn}}> · ✓ Pipeline-data</span>}
            </div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <span style={{fontSize:9,color:t.dim,textTransform:"uppercase"}}>Elområde</span>
            {["SE1","SE2","SE3","SE4"].map(a=><Pill key={a} active={area===a} onClick={()=>setArea(a)} t={t}>{a}</Pill>)}
            <div style={{width:1,height:18,background:t.bdr,margin:"0 4px"}}/>
            <span style={{fontSize:9,color:t.dim,textTransform:"uppercase"}}>MW</span>
            <input type="number" min={0.5} max={200} step={0.5} value={mw} onChange={e=>setMw(Number(e.target.value)||1)}
              style={{width:52,background:t.card,border:`1px solid ${t.bdr}`,borderRadius:6,color:t.txt,padding:"4px 8px",fontSize:13,fontFamily:"'JetBrains Mono',monospace",textAlign:"center"}}/>
            <div style={{width:1,height:18,background:t.bdr,margin:"0 4px"}}/>
            <button onClick={()=>setIsDark(!isDark)} style={{background:t.cardAlt,border:`1px solid ${t.bdr}`,borderRadius:20,padding:"4px 12px",cursor:"pointer",color:t.mut,fontSize:11,display:"flex",alignItems:"center",gap:4}}>
              {isDark?"☀ Ljust":"● Mörkt"}
            </button>
          </div>
        </div>
      </header>

      <div style={{padding:"16px 24px",maxWidth:1440,margin:"0 auto"}}>
        <div style={{display:"flex",gap:8,marginBottom:16,alignItems:"center",flexWrap:"wrap"}}>
          <span style={{fontSize:9,color:t.dim,textTransform:"uppercase",letterSpacing:"0.08em"}}>Uthållighet</span>
          {DURS.map(d=>(<button key={d} onClick={()=>setDur(d)} style={{
            background:dur===d?(isDark?"#38bdf8":"#0891b2"):t.card,color:dur===d?(isDark?"#000":"#fff"):t.mut,
            border:`1px solid ${dur===d?(isDark?"#38bdf8":"#0891b2"):t.bdr}`,borderRadius:8,padding:"7px 20px",
            fontSize:14,cursor:"pointer",fontWeight:600,fontFamily:"'JetBrains Mono',monospace",transition:"all 0.2s ease"}}>{d}h</button>))}
          <div style={{width:1,height:18,background:t.bdr,margin:"0 8px"}}/>
          <span style={{fontSize:9,color:t.dim,textTransform:"uppercase",letterSpacing:"0.08em"}}>Period</span>
          {TR.map(r=><Pill key={r.k} active={tr===r.k} onClick={()=>setTr(r.k)} small t={t}>{r.l}</Pill>)}
          <div style={{flex:1}}/><span style={{fontSize:11,color:t.mut,fontFamily:"'JetBrains Mono',monospace"}}>{mw} MW · {mw*dur} MWh · C/{dur}</span>
        </div>

        {noMfrr&&(<div style={{marginBottom:16,padding:"12px 16px",background:amb+"12",border:`1px solid ${amb}30`,borderRadius:8,fontSize:11,color:amb}}>
          ⚠ <strong>mFRR CM/EAM-data saknas</strong> — ladda ner CSV från mimer.svk.se → data/manual/</div>)}

        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
          <KPI label={`Optimal 12 mån (${dur}h)`} value={fmtE(ann.optimal)} sub="bästa strategi/mån" color={red} t={t}/>
          <KPI label="FCR-N+D" value={fmtE(ann.fcrn_fcrd)} sub={`${oc.fcrn_fcrd||0}/12 optimal`} color={sc("fcrn_fcrd")} t={t}/>
          <KPI label="mFRR+intradag" value={fmtE(ann.mfrr_id)} sub={`${oc.mfrr_id||0}/12 optimal${dur===2?" · kräver 2,5h BESS":dur>=4?" · båda riktningar":""}`} color={sc("mfrr_id")} t={t}/>
          <KPI label="FCR-N" value={fmtE(ann.fcrn)} sub={`${oc.fcrn||0}/12 optimal`} color={sc("fcrn")} t={t}/>
          <KPI label="Day-ahead" value={fmtE(ann.dayahead)} sub={`${oc.dayahead||0}/12 · inkl. obalans`} color={sc("dayahead")} warn t={t}/>
        </div>

        <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
          {[{k:"comparison",l:"Strategijämförelse"},{k:"services",l:"Intäkt per tjänst"},{k:"mfrr",l:"mFRR upp vs ned"},
            {k:"dayahead",l:"Day-ahead & obalans"},{k:"duration",l:"1h / 2h / 4h"},{k:"optimal",l:"Optimal strategi"},{k:"table",l:"Månadstabell"}
          ].map(v=><Pill key={v.k} active={view===v.k} onClick={()=>setView(v.k)} t={t}>{v.l}</Pill>)}
        </div>

        {(view==="comparison"||view==="table")&&(<div style={{display:"flex",gap:5,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{fontSize:9,color:t.dim,textTransform:"uppercase"}}>Visa</span>
          {SIDS.map(sid=><Pill key={sid} active={sel.has(sid)} color={sc(sid)} onClick={()=>toggle(sid)} t={t}>{S[sid].l}</Pill>)}</div>)}

        {view==="comparison"&&(<Card title={`Strategijämförelse — ${dur}h (${mw*dur} MWh)`} sub={`EUR/mån · ${tr?`Senaste ${tr}`:"Alla"} månader`} t={t}>
          <ResponsiveContainer width="100%" height={400}><ComposedChart data={months} margin={{top:8,right:12,bottom:5,left:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke={t.chartGrid}/><XAxis {...xP}/><YAxis {...yP}/>
            <Tooltip content={<TT theme={t}/>}/><Legend wrapperStyle={{fontSize:10,fontFamily:"'Plus Jakarta Sans'"}}/>
            {SIDS.filter(s=>sel.has(s)).map(sid=>(<Bar key={sid} dataKey={sid} name={S[sid].l} fill={sc(sid)} opacity={0.6} radius={[2,2,0,0]}/>))}
            <Line dataKey="optimal" name="Optimal" stroke={red} strokeWidth={2.5} dot={{r:2,fill:red}}/>
          </ComposedChart></ResponsiveContainer></Card>)}

        {view==="services"&&(()=>{
          const sC={"FCR-N":sc("fcrn"),"FCR-D upp":sc("fcrd"),"FCR-D ned":isDark?"#f59e0b":"#b45309",
            "mFRR CM":sc("mfrr_id"),"mFRR EAM":isDark?"#10b981":"#047857","Intradag":sc("intraday2"),"Day-ahead":sc("dayahead")};
          const sD=months.map(m=>{const d=m.ym?new Date(+m.ym.slice(0,4),+m.ym.slice(5,7),0).getDate():30;
            const cmBest=m.mfrr_cm_up_price+m.mfrr_eam_up_price*0.3>=m.mfrr_cm_down_price+m.mfrr_eam_down_price*0.3;
            const cmP=cmBest?m.mfrr_cm_up_price:m.mfrr_cm_down_price;
            const eamP=cmBest?m.mfrr_eam_up_price:m.mfrr_eam_down_price;
            return{label:m.label,"FCR-N":Math.round(m.fcr_n_price*0.5*FH[dur]*d*mw),
              "FCR-D upp":Math.round(m.fcr_d_up_price*0.87*d*24*mw),"FCR-D ned":Math.round(m.fcr_d_down_price*0.87*d*24*mw),
              "mFRR CM":Math.round(cmP*d*24*mw),"mFRR EAM":Math.round(IE[dur]*0.25*eamP*d*0.85*mw),
              "Intradag":m.intraday2,"Day-ahead":m.dayahead};});
          return(<Card title={`Intäkt per tjänst — ${dur}h`} sub={`${tr?`Senaste ${tr}`:"Alla"} månader`} t={t}>
            <ResponsiveContainer width="100%" height={400}><ComposedChart data={sD} margin={{top:8,right:12,bottom:5,left:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke={t.chartGrid}/><XAxis {...xP}/><YAxis {...yP}/>
              <Tooltip content={<TT theme={t}/>}/><Legend wrapperStyle={{fontSize:10,fontFamily:"'Plus Jakarta Sans'"}}/>
              {Object.entries(sC).map(([n,c],i,a)=>(<Bar key={n} dataKey={n} stackId="svc" fill={c} opacity={0.7} radius={i===a.length-1?[2,2,0,0]:[0,0,0,0]}/>))}
            </ComposedChart></ResponsiveContainer></Card>);})()}

        {view==="mfrr"&&(()=>{
          const mD=months.map(m=>({label:m.label,"mFRR upp":m.mfrr_up,"mFRR ned":m.mfrr_down,delta:m.mfrr_up-m.mfrr_down}));
          const t12=mD.slice(-12),sU=t12.reduce((s,d)=>s+d["mFRR upp"],0),sD2=t12.reduce((s,d)=>s+d["mFRR ned"],0);
          const cvn=months.map(m=>({label:m.label,Konventionell:m.mfrr_conv,"mFRR+intradag":m.mfrr_id,delta:m.mfrr_id-m.mfrr_conv}));
          const cv12=cvn.slice(-12),sC=cv12.reduce((s,d)=>s+d.Konventionell,0),sN=cv12.reduce((s,d)=>s+d["mFRR+intradag"],0);
          return(<div style={{display:"flex",flexDirection:"column",gap:16}}>
            <Card title={`mFRR upp vs ned — ${area} · ${dur}h`} sub="CM+EAM per riktning" t={t}>
              <ResponsiveContainer width="100%" height={320}><ComposedChart data={mD} margin={{top:8,right:12,bottom:5,left:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke={t.chartGrid}/><XAxis {...xP}/><YAxis {...yP}/>
                <Tooltip content={<TT theme={t}/>}/><Legend wrapperStyle={{fontSize:10}}/>
                <Bar dataKey="mFRR upp" fill={grn} opacity={0.7} radius={[2,2,0,0]}/>
                <Bar dataKey="mFRR ned" fill={amb} opacity={0.7} radius={[2,2,0,0]}/>
                <Line dataKey="delta" name="Δ (upp−ned)" stroke={t.txt} strokeWidth={1.5} strokeDasharray="4 2" dot={{r:2,fill:t.txt}}/>
              </ComposedChart></ResponsiveContainer>
              <div style={{marginTop:12,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                <SB label="mFRR upp 12m" value={fmtE(sU)} color={grn} t={t}/>
                <SB label="mFRR ned 12m" value={fmtE(sD2)} color={amb} t={t}/>
                <SB label="Bäst" value={sU>sD2?"UPP":"NED"} color={sU>sD2?grn:amb} t={t}/></div></Card>
            <Card title={`Konventionell vs mFRR+intradag — ${dur}h`} sub="Samma riktning, olika återställningsmetod" t={t}>
              <ResponsiveContainer width="100%" height={300}><ComposedChart data={cvn} margin={{top:8,right:12,bottom:5,left:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke={t.chartGrid}/><XAxis {...xP}/><YAxis {...yP}/>
                <Tooltip content={<TT theme={t}/>}/><Legend wrapperStyle={{fontSize:10}}/>
                <Bar dataKey="Konventionell" fill={sc("mfrr_conv")} opacity={0.7} radius={[2,2,0,0]}/>
                <Bar dataKey="mFRR+intradag" fill={sc("mfrr_id")} opacity={0.7} radius={[2,2,0,0]}/>
                <Line dataKey="delta" name="Δ ID−konv." stroke={t.txt} strokeWidth={1.5} strokeDasharray="4 2" dot={{r:2,fill:t.txt}}/>
              </ComposedChart></ResponsiveContainer>
              <div style={{marginTop:10,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                <SB label="Konventionell 12m" value={fmtE(sC)} color={sc("mfrr_conv")} t={t}/>
                <SB label="mFRR+intradag 12m" value={fmtE(sN)} color={sc("mfrr_id")} t={t}/>
                <SB label="Skillnad" value={sC>0?`+${((sN-sC)/sC*100).toFixed(0)}%`:"—"} color={t.txt} t={t}/></div>
              <IB color={grn} t={t}><strong style={{color:t.txt}}>Konventionell:</strong> {CH[dur]}h/dygn mFRR CM. SoC via elhandlare → pauser, ~6% obalans, resterande timmar FCR-D.
                <br/><br/><strong style={{color:t.txt}}>mFRR+intradag:</strong> 24/7 CM. SoC via intradagsmarknaden → inga pauser, {IE[dur]} EAM-akt/dag vs {CE[dur]}.
                {dur===2&&<><br/><em style={{color:amb}}>Not: 2h mFRR+intradag förutsätter ett 2,5h BESS.</em></>}
                {dur>=4&&<><br/><em style={{color:grn}}>4h: Fullt deltagande på BÅDE mFRR upp OCH ned. CM = (upp+ned) × 24h.</em></>}</IB></Card></div>);})()}

        {view==="dayahead"&&(()=>{
          const dD=months.map(m=>({label:m.label,Bruttoarbitrage:m.da_gross||m.dayahead*1.087,Obalanskostnad:-(m.da_imb||m.dayahead*0.087),Nettointäkt:m.dayahead,"Intradag 2c (jmf)":m.intraday2}));
          const t12=dD.slice(-12),tG=t12.reduce((s,d)=>s+d.Bruttoarbitrage,0),tI=t12.reduce((s,d)=>s+Math.abs(d.Obalanskostnad),0);
          const tD=t12.reduce((s,d)=>s+d.Nettointäkt,0),tID=t12.reduce((s,d)=>s+d["Intradag 2c (jmf)"],0);
          return(<Card title={`Day-ahead arbitrage — ${dur}h`} sub="Obalanskostnad highlightad" t={t}>
            <ResponsiveContainer width="100%" height={350}><ComposedChart data={dD} margin={{top:8,right:12,bottom:5,left:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke={t.chartGrid}/><XAxis {...xP}/><YAxis {...yP}/>
              <Tooltip content={<TT theme={t}/>}/><Legend wrapperStyle={{fontSize:10}}/>
              <Bar dataKey="Bruttoarbitrage" fill={sc("dayahead")} opacity={0.5} radius={[2,2,0,0]}/>
              <Bar dataKey="Obalanskostnad" fill={red} opacity={0.7} radius={[0,0,2,2]}/>
              <Line dataKey="Nettointäkt" name="DA netto" stroke={sc("dayahead")} strokeWidth={2.5} dot={{r:3,fill:sc("dayahead")}}/>
              <Line dataKey="Intradag 2c (jmf)" stroke={sc("intraday2")} strokeWidth={1.5} strokeDasharray="5 3" dot={false}/>
            </ComposedChart></ResponsiveContainer>
            <div style={{marginTop:12,display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
              <SB label="DA brutto 12m" value={fmtE(tG)} color={sc("dayahead")} t={t}/>
              <SB label="Obalanskostnad" value={`−${fmtE(tI)}`} color={red} t={t}/>
              <SB label="DA netto 12m" value={fmtE(tD)} color={sc("dayahead")} t={t}/>
              <SB label="Intradag 2c" value={fmtE(tID)} color={sc("intraday2")} t={t}/></div>
          </Card>);})()}

        {view==="duration"&&(<Card title="Optimal intäkt: 1h vs 2h vs 4h" sub={`${tr?`Senaste ${tr}`:"Alla"} mån · Eff. MWh: 1.0 / 1.5 / 1.8`} t={t}>
          <ResponsiveContainer width="100%" height={350}><ComposedChart data={durC} margin={{top:8,right:12,bottom:5,left:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke={t.chartGrid}/><XAxis {...xP}/><YAxis {...yP}/>
            <Tooltip content={<TT theme={t}/>}/><Legend wrapperStyle={{fontSize:10}}/>
            <Line dataKey="opt_1h" name="1h optimal" stroke={isDark?"#38bdf8":"#0284c7"} strokeWidth={2} dot={{r:3}}/>
            <Line dataKey="opt_2h" name="2h optimal" stroke={isDark?"#f472b6":"#db2777"} strokeWidth={2.5} dot={{r:3}}/>
            <Line dataKey="opt_4h" name="4h optimal" stroke={isDark?"#a3e635":"#65a30d"} strokeWidth={2} dot={{r:3}}/>
          </ComposedChart></ResponsiveContainer>
          <div style={{marginTop:14,display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
            {DURS.map(d=>{const a=durC.slice(-12).reduce((s,r)=>s+(r[`opt_${d}h`]||0),0);
              return(<div key={d} style={{background:t.cardAlt,border:`1px solid ${t.bdr}`,borderRadius:10,padding:14,textAlign:"center"}}>
                <div style={{fontSize:28,fontWeight:600,fontFamily:"'JetBrains Mono',monospace",color:d===dur?(isDark?"#38bdf8":"#0891b2"):t.txt}}>{d}h</div>
                <div style={{fontSize:10,color:t.mut}}>{mw} MW / {mw*d} MWh</div>
                <div style={{fontSize:18,fontWeight:500,fontFamily:"'JetBrains Mono',monospace",color:grn,marginTop:8}}>{fmtE(a)}</div>
                <div style={{fontSize:10,color:t.mut}}>Optimal 12 mån</div></div>);})}</div></Card>)}

        {view==="optimal"&&(<Card title={`Optimal strategi per månad — ${dur}h`} sub="Färg = vinnande strategi" t={t}>
          <ResponsiveContainer width="100%" height={360}><ComposedChart data={months} margin={{top:8,right:12,bottom:5,left:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke={t.chartGrid}/><XAxis {...xP}/><YAxis {...yP}/><Tooltip content={<TT theme={t}/>}/>
            <Bar dataKey="optimal" name="Optimal intäkt">{months.map((m,i)=><Cell key={i} fill={sc(m.optimalStrategy)||t.mut} opacity={0.8}/>)}</Bar>
          </ComposedChart></ResponsiveContainer>
          <div style={{marginTop:14,display:"flex",gap:6,flexWrap:"wrap"}}>
            {SIDS.map(sid=>{const cnt=months.filter(m=>m.optimalStrategy===sid).length;if(!cnt)return null;
              return(<div key={sid} style={{background:sc(sid)+"12",border:`1px solid ${sc(sid)}30`,borderRadius:6,padding:"5px 10px",display:"flex",alignItems:"center",gap:6,fontSize:11}}>
                <div style={{width:8,height:8,borderRadius:2,background:sc(sid)}}/><span>{S[sid].l}</span>
                <span style={{fontWeight:500,fontFamily:"'JetBrains Mono',monospace",color:sc(sid)}}>{cnt} mån</span></div>);})}</div>
          <div style={{marginTop:10,display:"flex",gap:2,flexWrap:"wrap"}}>
            {months.map((m,i)=>(<div key={i} title={`${m.label}: ${S[m.optimalStrategy]?.l} — ${fmtE(m.optimal)}`}
              style={{flex:1,minWidth:18,height:28,borderRadius:3,background:sc(m.optimalStrategy),opacity:0.7,display:"flex",alignItems:"flex-end",justifyContent:"center",fontSize:6,color:isDark?"#000":"#fff",fontWeight:600,paddingBottom:2}}>
              {m.label.split(" ")[1]?.substring(0,3)}</div>))}</div></Card>)}

        {view==="table"&&(<Card title={`Månadstabell — ${dur}h · ${mw} MW`} t={t}>
          <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11,fontFamily:"'JetBrains Mono',monospace"}}>
            <thead><tr style={{borderBottom:`2px solid ${t.bdr}`}}>
              <th style={{...thS,textAlign:"left"}}>Mån</th>
              {SIDS.filter(s=>sel.has(s)).map(sid=>(<th key={sid} style={{...thS,color:sc(sid)}}>{S[sid].s}</th>))}
              <th style={{...thS,color:red}}>Optimal</th><th style={{...thS,textAlign:"left"}}>Bäst</th>
            </tr></thead>
            <tbody>{months.map((m,i)=>(<tr key={i} style={{borderBottom:`1px solid ${t.bdr}`,background:i%2?t.bg+"66":"transparent"}}>
              <td style={{padding:"5px 6px",fontWeight:500,fontSize:10,fontFamily:"'Plus Jakarta Sans'"}}>{m.label}</td>
              {SIDS.filter(s=>sel.has(s)).map(sid=>(<td key={sid} style={{padding:"5px 6px",textAlign:"right",color:m.optimalStrategy===sid?sc(sid):t.dim,fontWeight:m.optimalStrategy===sid?500:400}}>{fmt(m[sid])}</td>))}
              <td style={{padding:"5px 6px",textAlign:"right",color:red,fontWeight:500}}>{fmt(m.optimal)}</td>
              <td style={{padding:"5px 6px",color:sc(m.optimalStrategy),fontSize:9,fontWeight:500}}>{S[m.optimalStrategy]?.s}</td></tr>))}</tbody>
            <tfoot><tr style={{borderTop:`2px solid ${t.bdrL}`}}>
              <td style={{padding:"6px",fontWeight:500,fontFamily:"'Plus Jakarta Sans'"}}>SUMMA</td>
              {SIDS.filter(s=>sel.has(s)).map(sid=>(<td key={sid} style={{padding:"6px",textAlign:"right",fontWeight:500}}>{fmt(months.reduce((a,m)=>a+(m[sid]||0),0))}</td>))}
              <td style={{padding:"6px",textAlign:"right",fontWeight:500,color:red}}>{fmt(months.reduce((a,m)=>a+(m.optimal||0),0))}</td><td/>
            </tr></tfoot></table></div></Card>)}

        <div style={{marginTop:20,padding:16,background:t.card,border:`1px solid ${t.bdr}`,borderRadius:12,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:16,fontSize:10,color:t.mut,lineHeight:1.7,transition:"background 0.3s ease"}}>
          <div><div style={{color:t.txt,fontWeight:500,marginBottom:4}}>Uthållighetsfysik</div>
            FCR-N: 1h→16h, 2h→20h, 4h→24h<br/>FCR-D: oberoende av uthållighet<br/>FCR-N+D: 0.5 MW vardera<br/>mFRR+ID 2h: kräver 2,5h BESS<br/>mFRR+ID 4h: båda riktningar</div>
          <div><div style={{color:t.txt,fontWeight:500,marginBottom:4}}>mFRR riktning</div>
            SE1/SE2: ned bättre (överskott norr)<br/>SE3/SE4: upp bättre (underskott söder)<br/>4h: bud på BÅDE upp OCH ned</div>
          <div><div style={{color:t.txt,fontWeight:500,marginBottom:4}}>Datakällor</div>
            FCR-N/D: Mimer (SVK)<br/>mFRR CM/EAM: Mimer CSV (manuell)<br/>Intraday: Nord Pool / DA-proxy<br/>Day-ahead: ENTSO-E TP</div>
          <div><div style={{color:t.txt,fontWeight:500,marginBottom:4}}>Beräkning</div>
            8 strategier × 3 uthålligheter<br/>RTE: 85% · FCR-D dual: 87%<br/>Intradag: 50%/30% capture<br/>DA: 45% capture, ~8% obalans</div>
        </div>
      </div>
    </div>
  );
}
