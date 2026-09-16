import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Shell, SideLink } from '../../components/layout';
import { Card, Badge, Empty, statusColor } from '../../components/ui';
import { repo } from '../../lib/repo';
import { audit } from '../../lib/audit';
import { snapshotBank } from '../../services/banks';
export default function Exams(){
  const [exams,setExams]=useState<any[]>([]);
  const [attempts,setAttempts]=useState<any[]>([]);
  useEffect(()=>{ (async()=>{ setExams(await repo.all<any>('exams')); setAttempts(await repo.all<any>('attempts')); })(); },[]);
  async function setStatus(e:any,s:string){
    // Publish-time snapshot refresh: bank questions were auto-included at creation,
    // but the bank may have changed since — re-freeze the CURRENT bank content so
    // the published exam always runs the latest approved set (spec: snapshot on publish).
    if(s==='SCHEDULED'&&e.questionBankId){ e.questionSnapshot=await snapshotBank(e.questionBankId); const qs=e.questionSnapshot??[]; e.totalMarks=qs.reduce((t:number,q:any)=>t+(q.marks??0),0); }
    e.status=s; e.updatedAt=Date.now(); await repo.put('exams',e);
    await audit(s==='ARCHIVED'?'EXAM_ARCHIVED':'EXAM_PUBLISHED',e.id,{status:s},'exam');
    setExams(await repo.all<any>('exams')); }
  async function delExam(e:any){
    const atts=(await repo.all<any>('attempts')).filter((a:any)=>a.examId===e.id);
    const warn=atts.length? ` — ${atts.length} attempt(s) exist and will stay in Results (exam record removed).`:'';
    if(!confirm(`Delete exam "${e.title}" [${e.status}]? This cannot be undone.${warn}`)) return;
    await repo.remove('exams', e.id);
    await audit('EXAM_DELETED',e.id,{title:e.title,status:e.status,attempts:atts.length},'exam');
    setExams(await repo.all<any>('exams'));
  }
  return <Shell sidebar={<><SideLink to="/admin/dashboard" label="Dashboard" /><SideLink to="/admin/exams" label="Exams" /><SideLink to="/admin/questions" label="Question Bank" /></>}>
    <Card><div className="flex items-center"><b className="mr-auto">Exams</b><Link className="btn-primary" to="/admin/exams/create">+ New exam</Link></div></Card>
    {exams.length===0?<Empty title="No exams yet." />:exams.map(e=>{ const atts=attempts.filter(a=>a.examId===e.id&&a.status!=='IN_PROGRESS');
      const avg=atts.length?Math.round(atts.reduce((s,a)=>s+(a.pct||0),0)/atts.length):0;
      return <Card key={e.id}><div className="flex flex-wrap gap-2 items-center"><b>{e.title}</b><Badge color={statusColor(e.status)}>{e.status}</Badge>
        <span className="text-xs text-slate-500">{e.subject} · {e.durationMin}m · Attempts {atts.length} · Avg {avg}%</span>
        <span className="ml-auto flex gap-2"><Link className="btn-ghost" to={`/admin/exams/${e.id}`}>Edit</Link>
        {e.status==='DRAFT'&&<button className="btn-primary" onClick={()=>setStatus(e,'SCHEDULED')}>Publish</button>}
        {e.status!=='ARCHIVED'&&<button className="btn-ghost" onClick={()=>setStatus(e,'ARCHIVED')}>Archive</button>}
        <button className="btn-danger !px-3 !py-1 text-xs" onClick={()=>delExam(e)} title="Delete exam — cannot be undone">Delete</button></span></div></Card>;})}
  </Shell>;
}
