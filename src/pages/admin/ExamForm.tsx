import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Shell, SideLink } from '../../components/layout';
import { Card } from '../../components/ui';
import { hashPassword, uid, examDepartments, DEPT_OPTIONS } from '../../lib/utils';
import { repo } from '../../lib/repo';
import { audit } from '../../lib/audit';
import { useSession } from '../../services/auth';
import { allBanks, bankQuestions, snapshotBank } from '../../services/banks';
import type { QuestionBank, Question } from '../../types/models';
export default function ExamForm(){
  const { examId }=useParams(); const nav=useNavigate(); const { session }=useSession();
  const [existing,setExisting]=useState<any>(null);
  const [bank,setBank]=useState<any[]>([]);
  const [banks,setBanks]=useState<QuestionBank[]>([]);
  const [bankQs,setBankQs]=useState<Question[]>([]);
  const [f,setF]=useState({ title:'', subject:'DBMS', year:'all', section:'all', durationMin:60, startAt:'', endAt:'', password:'', randomizeQuestions:true, randomizeOptions:true });
  const [depts,setDepts]=useState<string[]>([...DEPT_OPTIONS]);
  const [sel,setSel]=useState<string[]>([]);
  const [bankId,setBankId]=useState<string>('');
  const [preview,setPreview]=useState(false);
  const [err,setErr]=useState('');
  useEffect(()=>{ (async()=>{
    const bs=await allBanks(false); setBanks(bs);
    const b=(await repo.all<any>('questionBank')).filter(q=>q.status==='active'); setBank(b);
    if(examId){
      const ex=await repo.get<any>('exams',examId);
      if(ex){
        setExisting(ex);
        setF({ title:ex.title??'', subject:ex.subject??'DBMS', year:String(ex.year??'all'), section:ex.section??'all', durationMin:ex.durationMin??60, startAt:new Date(ex.startAt).toISOString().slice(0,16), endAt:new Date(ex.endAt).toISOString().slice(0,16), password:'', randomizeQuestions:ex.randomizeQuestions??true, randomizeOptions:ex.randomizeOptions??true });
        const id2=examDepartments(ex); setDepts(id2.length?id2:[...DEPT_OPTIONS]);
        setSel(ex.manualQids??[]);
        setBankId(ex.questionBankId??bs[0]?.id??'');
      } else setBankId(bs[0]?.id??'');
    } else setBankId(bs[0]?.id??'');
  })(); },[examId]);
  useEffect(()=>{ (async()=>{ setBankQs(bankId?await bankQuestions(bankId):[]); })(); },[bankId]);
  // Legacy exams (manualQids, no bank) keep the old per-question picker; all new/converted exams use one bank.
  const legacyMode=!!(existing?.manualQids?.length&&!existing?.questionBankId);
  const allChecked = depts.length===DEPT_OPTIONS.length;
  const toggleDept=(d:string)=>setDepts(s=>s.includes(d)?s.filter(x=>x!==d):[...s,d]);
  const toggleAll=()=>setDepts(s=>s.length===DEPT_OPTIONS.length?[]:[...DEPT_OPTIONS]);
  const noAnsCount=legacyMode?0:bankQs.filter(q=>q.correctAnswer==null).length;
  const bankTotal=bankQs.reduce((s,q)=>s+(q.marks??0),0);
  const set=(k:string,v:any)=>setF(s=>({...s,[k]:v}));
  async function save(publish:boolean){
    if(!f.title||!f.startAt||!f.endAt){ setErr('Title, start and end required'); return; }
    const start=new Date(f.startAt).getTime(), end=new Date(f.endAt).getTime();
    if(end<=start){ setErr('End must be after start'); return; }
    if(!existing&&!f.password){ setErr('Set an exam password'); return; }
    if(depts.length===0){ setErr('Select at least one department'); return; }
    if(!legacyMode&&!bankId){ setErr('Select a question bank'); return; }
    const qs=legacyMode?bank.filter(q=>sel.includes(q.id)):bankQs;
    if(qs.length===0){ setErr(legacyMode?'Select at least one question':'Selected bank has no active questions'); return; }
    const noAns=qs.filter(q=>q.correctAnswer==null);
    if(noAns.length>0 && !confirm(`${noAns.length} question(s) have no correct answer yet — they will score 0 for every student. Continue anyway?`)) return;
    const pwHash=existing?.passwordHash??await hashPassword(f.password);
    const total=qs.reduce((s,q)=>s+(q.marks??0),0);
    const rec:any={ id:existing?.id??uid('exam'), title:f.title, description:'', subject:f.subject, department:depts, year:f.year==='all'?'all':Number(f.year), section:f.section, durationMin:Number(f.durationMin), startAt:start, endAt:end, passwordHash:pwHash, status:publish?'SCHEDULED':(existing?.status??'DRAFT'), totalMarks:total, randomizeQuestions:!!f.randomizeQuestions, randomizeOptions:!!f.randomizeOptions, oneAttemptOnly:true, negativeMarking:false, negativeMarks:0, resultsReleaseMode:'IMMEDIATE', passPct:40, manualQids:legacyMode?sel:undefined, questionBankId:legacyMode?undefined:bankId, questionSnapshot:legacyMode?existing?.questionSnapshot:await snapshotBank(bankId), createdBy:session!.uid, createdAt:existing?.createdAt??Date.now(), updatedAt:Date.now() };
    await repo.put('exams',rec);
    await audit(existing?'EXAM_UPDATED':'EXAM_CREATED',rec.id,{title:rec.title},'exam');
    nav('/admin/exams');
  }
  return <Shell sidebar={<><SideLink to="/admin/exams" label="Exams" /><SideLink to="/admin/question-banks" label="Question Banks" /><SideLink to="/admin/questions" label="All Questions" /></>}>
    <Card><b>{existing?'Edit exam':'Create exam'}</b>
      <div className="grid sm:grid-cols-2 gap-3 mt-3">
        <div><label className="label">Title</label><input className="input" value={f.title} onChange={e=>set('title',e.target.value)} /></div>
        <div><label className="label">Subject</label><input className="input" value={f.subject} onChange={e=>set('subject',e.target.value)} /></div>
        <fieldset><legend className="label">Departments</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2 mt-1">
            <label className="text-sm flex gap-2 items-center font-semibold"><input type="checkbox" checked={allChecked} onChange={toggleAll} /> All</label>
            {DEPT_OPTIONS.map(d=><label key={d} className="text-sm flex gap-2 items-center"><input type="checkbox" checked={depts.includes(d)} onChange={()=>toggleDept(d)} /> {d}</label>)}
          </div></fieldset>
        <div><label className="label">Year</label><select className="input" value={String(f.year)} onChange={e=>set('year',e.target.value)}><option value="all">All</option><option value="2">2nd Year</option><option value="3">3rd Year</option></select></div>
        <div><label className="label">Section</label><select className="input" value={f.section} onChange={e=>set('section',e.target.value)}><option value="all">All</option><option>A</option><option>B</option><option>C</option></select></div>
        <div><label className="label">Duration (min)</label><input type="number" className="input" value={f.durationMin} onChange={e=>set('durationMin',e.target.value)} /></div>
        <div><label className="label">Start</label><input type="datetime-local" className="input" value={f.startAt} onChange={e=>set('startAt',e.target.value)} /></div>
        <div><label className="label">End</label><input type="datetime-local" className="input" value={f.endAt} onChange={e=>set('endAt',e.target.value)} /></div>
        {!existing&&<div><label className="label">Exam password</label><input type="password" className="input" value={f.password} onChange={e=>set('password',e.target.value)} /></div>}
        <label className="text-sm flex gap-2 items-center"><input type="checkbox" checked={!!f.randomizeQuestions} onChange={e=>set('randomizeQuestions',e.target.checked)} /> Randomize questions</label>
        <label className="text-sm flex gap-2 items-center"><input type="checkbox" checked={!!f.randomizeOptions} onChange={e=>set('randomizeOptions',e.target.checked)} /> Randomize options</label>
      </div>
      {legacyMode?<>
        <b className="block mt-4">Select questions ({sel.length}) — legacy manual set</b>
        <div className="max-h-64 overflow-auto border rounded-xl mt-2 divide-y">{bank.map(q=><label key={q.id} className="flex gap-2 p-2 text-sm"><input type="checkbox" checked={sel.includes(q.id)} onChange={()=>setSel(s=>s.includes(q.id)?s.filter(x=>x!==q.id):[...s,q.id])} /><span>[{q.subject}/{q.difficulty}/{q.marks}m]{q.correctAnswer==null&&<span className="ml-1 px-1 rounded bg-violet-100 text-violet-700 text-xs">⏳ no answer</span>} {q.text}</span></label>)}</div>
      </>:<>
        <div className="mt-4"><label className="label">Question bank — all questions auto-included</label>
          <select className="input" value={bankId} onChange={e=>setBankId(e.target.value)}>
            {banks.length===0&&<option value="">No banks yet — create one first</option>}
            {banks.map(b=><option key={b.id} value={b.id}>{b.name} ({b.questionCount} questions)</option>)}
          </select></div>
        {bankId&&<div className="text-sm text-slate-600 mt-2">{bankQs.length} active questions · Total {bankTotal} marks
          {noAnsCount>0&&<span className="ml-1 px-1 rounded bg-violet-100 text-violet-700 text-xs">⏳ {noAnsCount} without answer</span>}
          <button className="btn-ghost !text-xs ml-2" onClick={()=>setPreview(p=>!p)}>{preview?'Hide questions':'View questions'}</button></div>}
        {preview&&<div className="max-h-64 overflow-auto border rounded-xl mt-2 divide-y">{bankQs.map((q,i)=><div key={q.id} className="p-2 text-sm"><b>Q{i+1}.</b> {q.text} <span className="text-slate-500">({q.marks}m)</span>{q.correctAnswer==null&&<span className="ml-1 px-1 rounded bg-violet-100 text-violet-700 text-xs">⏳ no answer</span>}</div>)}</div>}
      </>}
      {err&&<p className="text-sm text-red-600 mt-2">{err}</p>}
      <div className="flex gap-2 mt-4"><button className="btn-ghost" onClick={()=>save(false)}>Save draft</button><button className="btn-primary" onClick={()=>save(true)}>Publish</button></div>
    </Card></Shell>;
}
