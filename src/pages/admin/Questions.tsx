import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Shell, SideLink } from '../../components/layout';
import { Card, Empty } from '../../components/ui';
import { uid } from '../../lib/utils';
import { repo } from '../../lib/repo';
import { audit } from '../../lib/audit';
import { useSession } from '../../services/auth';
import { allBanks, deleteQuestions, getBank, recomputeCount } from '../../services/banks';
import type { QuestionBank } from '../../types/models';
export default function Questions(){
  const { session }=useSession();
  const [q,setQ]=useState(''); const [subj,setSubj]=useState('All'); const [ans,setAns]=useState('All'); const [bankF,setBankF]=useState('All');
  const [sel,setSel]=useState<Set<string>>(new Set());
  const [banks,setBanks]=useState<QuestionBank[]>([]);
  const [bankNames,setBankNames]=useState<Record<string,string>>({});
  const [list,setList]=useState<any[]>([]);
  const [form,setForm]=useState({text:'',type:'MCQ_SINGLE',subject:'DBMS',topic:'General',difficulty:'Medium',o1:'',o2:'',o3:'',o4:'',correct:'0',marks:2,bankId:''});
  const refresh=async()=>{
    setList(await repo.all<any>('questionBank'));
    const bs=await allBanks(false); setBanks(bs);
    const names:Record<string,string>={}; for(const b of bs) names[b.id]=b.name; setBankNames(names);
  };
  useEffect(()=>{ refresh(); },[]);
  const LETTERS='ABCDE';
  function isCorrect(x:any,i:number):boolean{
    if(x.type==='TRUE_FALSE') return x.correctAnswer===(i===0);
    if(x.type==='MCQ_MULTIPLE') return Array.isArray(x.correctAnswer)&&x.correctAnswer.includes(i);
    return x.correctAnswer===i;
  }
  // Quick-set the correct answer A/B/C/D (admin assigns after import).
  async function setAnswer(x:any,i:number){
    let value:any=i;
    if(x.type==='TRUE_FALSE') value=(i===0);
    else if(x.type==='MCQ_MULTIPLE'){ const cur=Array.isArray(x.correctAnswer)?[...x.correctAnswer]:[]; const at=cur.indexOf(i); if(at>=0)cur.splice(at,1); else cur.push(i); value=cur.sort(); }
    await repo.put('questionBank',{...x,correctAnswer:value,needsAnswer:false,updatedAt:Date.now()});
    await audit('QUESTION_ANSWER_SET',x.id,{type:x.type,value},'question'); refresh();
  }
  async function setShortAnswer(x:any,v:string){
    await repo.put('questionBank',{...x,correctAnswer:v,needsAnswer:false,updatedAt:Date.now()});
    await audit('QUESTION_ANSWER_SET',x.id,{type:x.type},'question'); refresh();
  }
  function toggleSel(id:string){ setSel(prev=>{ const n=new Set(prev); if(n.has(id))n.delete(id); else n.add(id); return n; }); }
  async function bulkDel(ids:string[]){
    if(!ids.length) return;
    if(!confirm(`Permanently delete ${ids.length} selected question(s)? This cannot be undone.`)) return;
    const r=await deleteQuestions(ids);
    for(const id of ids) await audit('QUESTION_DELETED',id,{bulk:true},'question');
    setSel(new Set()); refresh();
    alert(`Deleted ${r.deleted} question(s).`);
  }
  async function save(){
    if(form.text.length<5) return alert('Question text too short');
    const opts=[form.o1,form.o2,form.o3,form.o4].filter(o=>o.trim());
    const row:any={id:uid('q'),text:form.text,type:form.type,subject:form.subject,topic:form.topic,difficulty:form.difficulty,options:form.type==='TRUE_FALSE'?['True','False']:opts,correctAnswer:form.type==='TRUE_FALSE'?(form.correct==='0'):Number(form.correct),marks:Number(form.marks),status:'active',createdBy:session!.uid,createdAt:Date.now(),updatedAt:Date.now()};
    if(form.bankId) row.questionBankId=form.bankId;
    await repo.put('questionBank',row);
    if(form.bankId) await recomputeCount(form.bankId);
    await audit('QUESTION_CREATED','new',{},'question'); setForm({text:'',type:'MCQ_SINGLE',subject:'DBMS',topic:'General',difficulty:'Medium',o1:'',o2:'',o3:'',o4:'',correct:'0',marks:2,bankId:''}); refresh();
  }
  const bankName=(id?:string)=>{ if(!id) return '—'; return bankNames[id] ?? '(deleted bank)'; };
  const filtered=list.filter(x=>(q===''||x.text.toLowerCase().includes(q.toLowerCase()))&&(subj==='All'||x.subject===subj)&&(ans==='All'||(ans==='Missing'?x.correctAnswer==null:x.correctAnswer!=null))&&(bankF==='All'||(bankF==='None'?!x.questionBankId:x.questionBankId===bankF)));
  return <Shell sidebar={<><SideLink to="/admin/question-banks" label="Question Banks" /><SideLink to="/admin/questions" label="All Questions" /><SideLink to="/admin/questions/import" label="Import File" /><SideLink to="/admin/imports" label="Import History" /><SideLink to="/admin/exams" label="Exams" /><SideLink to="/admin/dashboard" label="Dashboard" /></>}>
    <Card><div className="flex flex-wrap gap-2 items-center">
      <b className="mr-auto">Question bank</b>
      <Link className="btn-primary !text-xs" to="/admin/questions/import">⬆ Import File</Link>
      <Link className="btn-ghost !text-xs" to="/admin/imports">Import history</Link>
    </div></Card>
    <Card><b>Create question</b><div className="grid sm:grid-cols-2 gap-2 mt-2">
      <input className="input sm:col-span-2" placeholder="Question text" value={form.text} onChange={e=>setForm({...form,text:e.target.value})} />
      <select className="input" value={form.type} onChange={e=>setForm({...form,type:e.target.value})}><option>MCQ_SINGLE</option><option>MCQ_MULTIPLE</option><option>TRUE_FALSE</option><option>SHORT_ANSWER</option></select>
      <select className="input" value={form.difficulty} onChange={e=>setForm({...form,difficulty:e.target.value})}><option>Easy</option><option>Medium</option><option>Hard</option></select>
      <input className="input" placeholder="Subject" value={form.subject} onChange={e=>setForm({...form,subject:e.target.value})} />
      <input className="input" placeholder="Topic" value={form.topic} onChange={e=>setForm({...form,topic:e.target.value})} />
      {['o1','o2','o3','o4'].map(k=><input key={k} className="input" placeholder={`Option ${k}`} value={(form as any)[k]} onChange={e=>setForm({...form,[k]:e.target.value})} />)}
      <input className="input" placeholder="Correct option index (0-based) / text" value={form.correct} onChange={e=>setForm({...form,correct:e.target.value})} />
      <input type="number" className="input" value={form.marks} onChange={e=>setForm({...form,marks:Number(e.target.value)})} />
      <select className="input" value={form.bankId} onChange={e=>setForm({...form,bankId:e.target.value})}><option value="">No bank (unassigned)</option>{banks.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>
    </div><button className="btn-primary mt-3" onClick={save}>Save question</button></Card>
    <Card><div className="flex gap-2 flex-wrap"><input className="input" placeholder="Search questions..." value={q} onChange={e=>setQ(e.target.value)} />
      <select className="input !w-40" value={subj} onChange={e=>setSubj(e.target.value)}><option>All</option><option>DBMS</option><option>DSA</option><option>OS</option><option>CN</option><option>Java</option><option>Python</option></select>
      <select className="input !w-44" value={ans} onChange={e=>setAns(e.target.value)}><option value="All">All answers</option><option value="Missing">⏳ Missing answer</option><option value="Set">Answer set</option></select>
      <select className="input !w-52" value={bankF} onChange={e=>setBankF(e.target.value)}><option value="All">All banks</option><option value="None">No bank</option>{banks.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>
      <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={filtered.length>0&&filtered.every(x=>sel.has(x.id))} onChange={e=>setSel(e.target.checked?new Set(filtered.map(x=>x.id)):new Set())} /> Select all</label></div>
      {sel.size>0&&<div className="flex gap-2 items-center mt-2"><span className="text-xs">{sel.size} selected</span>
        <button className="btn-ghost !text-xs !text-red-600" onClick={()=>bulkDel(filtered.filter(x=>sel.has(x.id)).map(x=>x.id))}>Delete selected</button>
        <button className="btn-ghost !text-xs" onClick={()=>setSel(new Set())}>Clear</button></div>}</Card>
    {filtered.length===0?<Empty title="No questions." />:filtered.slice(0,200).map(x=><Card key={x.id}><div className="flex gap-2 items-start"><input type="checkbox" className="mt-1" checked={sel.has(x.id)} onChange={()=>toggleSel(x.id)} /><div className="mr-auto min-w-0">
      <p className="text-sm whitespace-pre-wrap"><b>[{x.subject}/{x.topic}/{x.difficulty}]</b>{x.sourceOrder!=null&&<span className="ml-1 px-1 rounded bg-slate-200 text-slate-700 text-xs">Q{x.sourceOrder}</span>}<span className="ml-1 px-1 rounded bg-indigo-100 text-indigo-700 text-xs">🏦 {bankName(x.questionBankId)}</span>{x.correctAnswer==null&&<span className="ml-1 px-1 rounded bg-violet-100 text-violet-700 text-xs">⏳ Answer pending</span>} {x.text} <span className="text-slate-500">({x.marks}m)</span></p>
      {x.type==='SHORT_ANSWER'
        ?<p className="text-xs mt-1">Expected: <b>{typeof x.correctAnswer==='string'&&x.correctAnswer?`“${x.correctAnswer}”`:'— missing —'}</b> <ShortSet x={x} onSet={v=>setShortAnswer(x,v)} /></p>
        :<ul className="text-sm mt-1 space-y-0.5">{(x.options||[]).map((o:string,i:number)=><li key={i} className={isCorrect(x,i)?'font-bold text-emerald-700':''}><span className="inline-block w-5">{LETTERS[i]}.</span> {o} {isCorrect(x,i)?'✓':''}</li>)}</ul>}
      {x.type!=='SHORT_ANSWER'&&<div className="flex gap-1 mt-1 items-center flex-wrap"><span className="text-xs text-slate-500">Set answer:</span>{(x.options||[]).map((_:string,i:number)=><button key={i} className={`btn-ghost !text-xs !px-2 ${isCorrect(x,i)?'!bg-emerald-100 !text-emerald-800 font-bold':''}`} onClick={()=>setAnswer(x,i)}>{LETTERS[i]}</button>)}</div>}
      </div>
      <div className="flex flex-col gap-1 shrink-0">
      <button className="btn-ghost !text-xs" onClick={async()=>{await repo.put('questionBank',{...x,text:x.text+' (copy)',id:uid('q')}); refresh();}}>Duplicate</button>
      <button className="btn-ghost !text-xs" onClick={async()=>{await repo.put('questionBank',{...x,status:x.status==='active'?'archived':'active'}); await audit('QUESTION_ARCHIVED',x.id,{},'question'); refresh();}}>{x.status==='active'?'Archive':'Restore'}</button></div></div></Card>)}
  </Shell>;
}

function ShortSet({ x, onSet }: { x: any; onSet: (v: string) => void }) {
  const [v, setV] = useState(typeof x.correctAnswer === 'string' ? x.correctAnswer : '');
  return <span className="inline-flex gap-1 ml-1">
    <input className="input !w-40 !py-1 !text-xs" placeholder="Type answer…" value={v} onChange={e => setV(e.target.value)} />
    <button className="btn-ghost !text-xs" onClick={() => { if (!v.trim()) return alert('Type the expected answer first.'); onSet(v.trim()); }}>Set</button>
  </span>;
}
