'use client';
import Container from '@/components/Container'; import Tabs from '@/components/Tabs'; import Dropzone from '@/components/Dropzone';
import React,{useMemo,useState}from'react'; import {LineChart,Line,XAxis,YAxis,Tooltip,Legend,CartesianGrid,ResponsiveContainer}from'recharts';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'; import { parseXER_TASK, XERActivity } from '@/lib/xer/parse';

type Activity = XERActivity;
type CompareRow = Activity & { startUp?:string; finishUp?:string; floatUp?:number; deltaStart?:number; deltaFinish?:number; deltaFloat?:number; critBL?:boolean; critUP?:boolean; critChange?:'NC→C'|'C→NC'|'—'; status:'CHANGED'|'ADDED'|'DELETED' };

function fallback(): Activity[]{ return [
  { id:'A100', name:'Mobilize', start:'2025-01-02', finish:'2025-01-05', float:5 },
  { id:'A200', name:'Foundation', start:'2025-01-10', finish:'2025-01-25', float:10 },
  { id:'A300', name:'Steel', start:'2025-02-01', finish:'2025-02-20', float:-2 },
]; }

function compare(bl:Activity[], up:Activity[], label:string): CompareRow[]{ const byIdBL=new Map(bl.map(a=>[a.id,a])); const byIdUP=new Map(up.map(a=>[a.id,a])); const ids=new Set([...byIdBL.keys(),...byIdUP.keys()]); const out:CompareRow[]=[]; ids.forEach(id=>{ const b=byIdBL.get(id); const u=byIdUP.get(id); if(b&&u){ const dS=(new Date(u.start||'').getTime()-new Date(b.start||'').getTime())/86400000; const dF=(new Date(u.finish||'').getTime()-new Date(b.finish||'').getTime())/86400000; const dTf=( (u.float??0) - (b.float??0) ); const critBL=(b.float??0)<=0; const critUP=(u.float??0)<=0; const critChange=( !critBL&&critUP ? 'NC→C' : (critBL&&!critUP ? 'C→NC' : '—') ); out.push({...b,startUp:u.start,finishUp:u.finish,floatUp:u.float,deltaStart:dS,deltaFinish:dF,deltaFloat:dTf,critBL,critUP,critChange,status:'CHANGED'}); } else if(!b&&u){ out.push({...u,status:'ADDED'} as any); } else if(b&&!u){ out.push({...b,status:'DELETED'} as any); } }); return out; }

function dcma(acts:Activity[]){ const total=acts.length; const neg=acts.filter(a=>(a.float??0)<0).length; const zero=acts.filter(a=>(a.float??0)===0).length; const pNeg=total?Math.round(100*neg/total):0; const pZero=total?Math.round(100*zero/total):0; return [{id:'DCMA-01',name:'% negative float',value:`${pNeg}%`,pass:pNeg<5},{id:'DCMA-02',name:'% zero float',value:`${pZero}%`,pass:pZero<10}]; }

export default function AppPage(){ const [tab,setTab]=useState<'Upload & Compare'|'Critical Path'|'DCMA Checks'|'Export'>('Upload & Compare'); const [baseline,setBaseline]=useState<Activity[]|null>(null); const [updates,setUpdates]=useState<{label:string;rows:Activity[]}[]>([]); const [comps,setComps]=useState<{label:string;rows:CompareRow[]}[]>([]);
  async function onBL(fs:FileList){ const f=fs[0]; const txt=await f.text(); const rows=parseXER_TASK(txt); setBaseline(rows.length?rows:fallback()); }
  async function onUP(fs:FileList){ const arr:any[]=[]; for(const f of Array.from(fs)){ const txt=await f.text(); const rows=parseXER_TASK(txt); arr.push({label:f.name,rows:rows.length?rows:fallback()}); } setUpdates(arr); }
  function analyze(){ if(!baseline||!updates.length) return; setComps(updates.map(u=>({label:u.label,rows:compare(baseline,u.rows,u.label)}))); }
  const cpData=useMemo(()=> comps.map(c=>({name:c.label,crit:c.rows.filter(r=>r.critUP).length})),[comps]);
  async function exportPDF(){ const pdf=await PDFDocument.create(); const page=pdf.addPage([612,792]); const font=await pdf.embedFont(StandardFonts.Helvetica); const draw=(t:string,y:number,s=12)=>page.drawText(t,{x:48,y,size:s,font,color:rgb(0.1,0.1,0.1)}); let y=740; draw('NAVA Analytics — Executive Summary',y,18); y-=24; draw(`Baseline activities: ${baseline?.length??0}`,y); y-=16; draw(`Updates analyzed: ${updates.length}`,y); y-=16; const flips=comps.reduce((a,c)=>a+c.rows.filter(r=>r.critChange==='NC→C').length,0); draw(`Criticality flips (NC→C): ${flips}`,y); y-=16; const checks=baseline?dcma(baseline):[]; draw('DCMA (sample):',y); y-=16; for(const ck of checks){ draw(`• ${ck.id} ${ck.name}: ${ck.value} (${ck.pass?'PASS':'FAIL'})`,y); y-=14; if(y<72){ y=740; pdf.addPage([612,792]); } } const bytes=await pdf.save(); const blob=new Blob([bytes],{type:'application/pdf'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='NAVA_Executive_Report.pdf'; a.click(); URL.revokeObjectURL(url); }
  return (<Container>
    <h1 className='text-2xl mt-6'>NAVA App — Rich Demo (XER)</h1>
    <Tabs tabs={['Upload & Compare','Critical Path','DCMA Checks','Export']} current={tab} onChange={setTab} />
    {tab==='Upload & Compare' && (<div className='grid gap-3'>
      <Dropzone label='Upload Baseline (.xer)' onFiles={onBL} accept='.xer,.txt'/>
      <Dropzone label='Upload Updates (one or more)' onFiles={onUP} multiple accept='.xer,.txt'/>
      <button className='bg-[var(--cta)] px-3 py-2 rounded w-max' onClick={analyze} disabled={!baseline||!updates.length}>Analyze</button>
      {comps.length>0 && comps.map(c=>(<div key={c.label} className='card'><h3 className='text-lg'>Baseline vs {c.label}</h3>
        <div className='overflow-auto mt-2'><table className='w-full text-sm'><thead><tr className='text-left text-slate-300'>
          <th className='pr-3 py-1'>ID</th><th className='pr-3'>Name</th><th className='pr-3'>Status</th>
          <th className='pr-3'>Δ Start (d)</th><th className='pr-3'>Δ Finish (d)</th><th className='pr-3'>Δ Float (d)</th><th>Crit Flip</th>
        </tr></thead><tbody>{c.rows.map(r=>(<tr key={r.id} className='border-t border-[var(--line)]'>
          <td className='pr-3 py-1'>{r.id}</td><td className='pr-3'>{r.name}</td><td className='pr-3'>{r.status}</td>
          <td className='pr-3'>{r.deltaStart??'—'}</td><td className='pr-3'>{r.deltaFinish??'—'}</td><td className='pr-3'>{r.deltaFloat??'—'}</td><td>{r.critChange??'—'}</td>
        </tr>))}</tbody></table></div></div>))}
    </div>)}
    {tab==='Critical Path' && (<div className='card'><h3 className='text-lg mb-3'>CP Shift — Critical Activities per Update</h3>
      <div style={{width:'100%',height:360}}><ResponsiveContainer><LineChart data={cpData}><CartesianGrid strokeDasharray='3 3'/><XAxis dataKey='name'/><YAxis/><Tooltip/><Legend/><Line type='monotone' dataKey='crit' stroke='#82ca9d' name='# Critical Activities'/></LineChart></ResponsiveContainer></div></div>)}
    {tab==='DCMA Checks' && (<div className='card'><h3 className='text-lg mb-2'>DCMA 14‑Point (sample)</h3><div className='text-slate-300 text-sm mb-2'>Demo subset. Full scoring in production build.</div>
      <table className='w-full text-sm'><thead><tr className='text-left text-slate-300'><th className='pr-3 py-1'>ID</th><th className='pr-3'>Check</th><th className='pr-3'>Value</th><th>Pass</th></tr></thead>
      <tbody>{(baseline?dcma(baseline):[]).map(ck=>(<tr key={ck.id} className='border-t border-[var(--line)]'><td className='pr-3 py-1'>{ck.id}</td><td className='pr-3'>{ck.name}</td><td className='pr-3'>{ck.value}</td><td>{ck.pass?'✅':'❌'}</td></tr>))}</tbody></table></div>)}
    {tab==='Export' && (<div className='card'><h3 className='text-lg mb-2'>Executive PDF Export</h3><button className='mt-2 bg-[var(--cta)] px-3 py-2 rounded' onClick={exportPDF}>Download PDF</button></div>)}
  </Container>);
}