import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSession } from '../../services/auth';
import { repo } from '../../lib/repo';
import { hashPassword, fmtClock } from '../../lib/utils';
import { buildAttempt, scoreAttempt, logEvent, submitAttemptServer } from '../../services/engine';
import { Card } from '../../components/ui';
import type { Attempt, Exam, Question } from '../../types/models';

// IndexedDB-lite: localStorage outbox for offline answers
const OUTBOX = (aid:string)=>`examora_outbox_${aid}`;
function queueAnswer(aid:string, qid:string, val:any){ const o=JSON.parse(localStorage.getItem(OUTBOX(aid))||'{}'); o[qid]={val,opId:crypto.randomUUID(),t:Date.now()}; localStorage.setItem(OUTBOX(aid),JSON.stringify(o)); }
async function flushOutbox(a:Attempt){ const o=JSON.parse(localStorage.getItem(OUTBOX(a.id))||'{}'); let changed=false;
  for(const [qid,r] of Object.entries<any>(o)){ if(a.answers[qid]!==r.val){ a.answers[qid]=r.val; changed=true; } }
  if(changed){ a.updatedAt=Date.now(); await repo.put('attempts',a); } localStorage.setItem(OUTBOX(a.id),'{}'); }

export default function ExamTake(){
  const { examId } = useParams(); const nav=useNavigate(); const { session } = useSession();
  const [phase,setPhase]=useState<'gate'|'exam'>('gate');
  const [pw,setPw]=useState(''); const [err,setErr]=useState('');
  const [exam,setExam]=useState<Exam|null>(null);
  const [bank,setBank]=useState<Question[]>([]);
  const [loaded,setLoaded]=useState(false);
  const [attempt,setAttempt]=useState<Attempt|null>(null);
  const [idx,setIdx]=useState(0); const [saveState,setSaveState]=useState<'saved'|'saving'|'offline'>('saved');
  const [online,setOnline]=useState(navigator.onLine); const [left,setLeft]=useState(0);
  useEffect(()=>{ (async()=>{
    setExam(await repo.get<Exam>('exams',examId!) ?? null);
    setBank(await repo.all<Question>('questionBank'));
    setLoaded(true);
  })(); },[examId]);
  const attemptRef=useRef<Attempt|null>(null); attemptRef.current=attempt;

  async function start(){
    setErr('');
    if(!exam||!session) return;
    if(exam.passwordHash!==(await hashPassword(pw))){ setErr('Incorrect exam password'); return; }
    const nowT=Date.now();
    if(nowT<exam.startAt){ setErr('Exam has not started yet'); return; }
    if(nowT>exam.endAt){ setErr('Exam window has ended'); return; }
    // idempotent: reuse active attempt (no duplicate on refresh)
    const mine=await repo.query<Attempt>('attempts',x=>x.examId===exam.id&&x.uid===session.uid);
    let a=mine.find(x=>x.status==='IN_PROGRESS');
    if(!a && exam.oneAttemptOnly && mine.some(x=>x.status!=='IN_PROGRESS')){ setErr('Already attempted'); return; }
    if(!a){ a=buildAttempt(exam,bank,session.studentId!,session.uid); await repo.put('attempts',a); logEvent(a.id,exam.id,a.studentId,'EXAM_STARTED'); }
    else { a.refreshCount++; a.updatedAt=Date.now(); await repo.put('attempts',a); logEvent(a.id,exam.id,a.studentId,'EXAM_RESUMED',{reason:'reopen'}); }
    setAttempt(a); setIdx(a.currentIndex||0); setPhase('exam');
    try{ await document.documentElement.requestFullscreen(); logEvent(a.id,exam.id,a.studentId,'FULLSCREEN_ENTER'); }catch{}
  }

  // timer (server deadline authoritative) + auto-submit
  useEffect(()=>{
    if(phase!=='exam'||!attempt) return;
    const t=setInterval(async ()=>{
      const a=await repo.get<Attempt>('attempts',attempt.id);
      if(!a) return;
      const rem=Math.max(0,(a.serverDeadline??(a.startedAt+60*60000))-Date.now());
      setLeft(rem);
      if(rem<=0){ submit('AUTO'); }
      else { setAttempt({...a}); }
    },1000);
    return ()=>clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[phase,attempt?.id]);

  // fullscreen + visibility + network listeners
  useEffect(()=>{
    if(phase!=='exam'||!attempt||!exam) return;
    const onFs=()=>{ if(!document.fullscreenElement) logEvent(attempt.id,exam.id,attempt.studentId,'FULLSCREEN_EXIT'); else logEvent(attempt.id,exam.id,attempt.studentId,'FULLSCREEN_ENTER'); };
    const onVis=()=>{ logEvent(attempt.id,exam.id,attempt.studentId,document.hidden?'TAB_SWITCH':'TAB_RETURN',{visibilityState:document.visibilityState}); };
    const onOff=()=>{ setOnline(false); setSaveState('offline'); logEvent(attempt.id,exam.id,attempt.studentId,'NETWORK_DISCONNECTED'); };
    const onOn=async()=>{ setOnline(true); const a=await repo.get<Attempt>('attempts',attempt.id); if(a){await flushOutbox(a); setAttempt({...a});} logEvent(attempt.id,exam.id,attempt.studentId,'NETWORK_RECONNECTED'); setSaveState('saved'); };
    const onUnload=()=>{ logEvent(attempt.id,exam.id,attempt.studentId,'BROWSER_REFRESH'); void (async()=>{ const a=await repo.get<Attempt>('attempts',attempt.id); if(a){a.currentIndex=idx; a.updatedAt=Date.now(); await repo.put('attempts',a);} })(); };
    document.addEventListener('fullscreenchange',onFs); document.addEventListener('visibilitychange',onVis);
    window.addEventListener('offline',onOff); window.addEventListener('online',onOn); window.addEventListener('beforeunload',onUnload);
    return ()=>{ document.removeEventListener('fullscreenchange',onFs); document.removeEventListener('visibilitychange',onVis); window.removeEventListener('offline',onOff); window.removeEventListener('online',onOn); window.removeEventListener('beforeunload',onUnload); };
  },[phase,attempt?.id]);

  const safeQs=useMemo(()=>{ if(!attempt) return [];
    const byId=new Map(bank.map(q=>[q.id,q]));
    const snap=new Map((exam?.questionSnapshot??[]).map(s=>[s.qid,s]));
    return attempt.questionOrder.map(qid=>{ const q=byId.get(qid); const s=snap.get(qid);
      const text=q?.text??s?.text??''; const type=(q?.type??s?.type??'MCQ_SINGLE') as Question['type'];
      const marks=q?.marks??s?.marks??0; const opts=q?.options??s?.options??[];
      if(!text||!opts.length) return null;
      const order=attempt.optionOrder[qid]??opts.map((_,i)=>i);
      return { qid, text, type, marks, options:order.map(i=>opts[i]), map:order };
    }).filter(Boolean) as {qid:string;text:string;type:string;marks:number;options:string[];map:number[]}[];
  },[attempt,bank,exam]);

  async function answer(qid:string, val:any, map?:number[]){
    if(!attempt) return;
    // translate displayed index -> original index for MCQ_SINGLE
    let stored=val; if(map&&typeof val==='number') stored=map[val];
    setSaveState('saving');
    queueAnswer(attempt.id,qid,stored);
    const a=await repo.get<Attempt>('attempts',attempt.id)!;
    if(!a) return;
    if(navigator.onLine){ await flushOutbox(a); a.currentIndex=idx; a.updatedAt=Date.now(); await repo.put('attempts',a); setAttempt({...a}); setSaveState('saved'); }
    else { a.currentIndex=idx; await repo.put('attempts',a); setAttempt({...a}); setSaveState('offline'); }
  }

  async function submit(kind:'MANUAL'|'AUTO'){
    const cur=attemptRef.current?await repo.get<Attempt>('attempts',attemptRef.current.id):null;
    if(!cur||!exam||cur.status!=='IN_PROGRESS') return;
    await flushOutbox(cur);
    // authoritative deadline check
    if(kind==='MANUAL'&&Date.now()>cur.serverDeadline) kind='AUTO';
    // Server-side scoring when connected (RPC hides answers + scores authoritatively);
    // fall back to local scoring offline / unconfigured.
    const remote = await submitAttemptServer(cur.id, cur.answers);
    if(remote){
      logEvent(cur.id,exam.id,cur.studentId,kind==='AUTO'?'AUTO_SUBMIT':'MANUAL_SUBMIT');
    } else {
      const r=scoreAttempt(exam,bank,cur.answers);
      cur.status=kind==='AUTO'?'AUTO_SUBMITTED':'SUBMITTED'; cur.submissionType=kind; cur.submittedAt=Date.now();
      cur.score=r.score; cur.totalMarks=r.total; cur.pct=r.pct; cur.updatedAt=Date.now(); await repo.put('attempts',cur);
      logEvent(cur.id,exam.id,cur.studentId,kind==='AUTO'?'AUTO_SUBMIT':'MANUAL_SUBMIT');
    }
    try{ if(document.fullscreenElement) document.exitFullscreen(); }catch{}
    nav(`/student/result/${cur.id}`);
  }

  if(!loaded) return <div className="p-10">Loading…</div>;
  if(!exam) return <div className="p-10">Exam not found</div>;
  if(phase==='gate') return <div className="max-w-xl mx-auto px-4 py-10"><Card>
    <h1 className="text-xl font-bold">Ready to begin</h1><p className="font-semibold mt-2">{exam.title}</p>
    <p className="text-sm text-slate-500">Questions: {exam.questionSnapshot?.length??exam.manualQids?.length??'bank'} · Duration: {exam.durationMin} min</p>
    <ul className="text-sm mt-3 space-y-1 text-slate-600"><li>✓ Fullscreen will be requested</li><li>✓ Tab switches & fullscreen exits are recorded (not blocked)</li><li>✓ Answers auto-save; offline answers sync later</li><li>✓ One attempt only</li></ul>
    <label className="label mt-4" htmlFor="expw">Exam password</label>
    <input id="expw" type="password" className="input" value={pw} onChange={e=>setPw(e.target.value)} />
    {err&&<p className="text-sm text-red-600 mt-2">{err}</p>}
    <button className="btn-primary w-full mt-4" onClick={start}>Enter exam</button></Card></div>;

  const cur=safeQs[idx];
  const answered=attempt?Object.keys(attempt.answers).length:0;
  return <div className="min-h-screen bg-white">
    <div className="border-b px-4 py-2 flex items-center justify-between sticky top-0 bg-white z-10">
      <b>{exam.title}</b>
      <div className="flex items-center gap-3 text-sm"><span>{saveState==='saved'?'✓ Saved':saveState==='saving'?'⟳ Saving...':'⚠ Waiting to sync'}</span>
      {!online&&<span className="text-amber-600">⚠ Connection lost — answers saved locally</span>}
      <span className="font-mono font-bold text-lg">{fmtClock(left)}</span></div>
    </div>
    <div className="max-w-5xl mx-auto grid md:grid-cols-[1fr_220px] gap-4 p-4">
      <Card>{!cur?<p>Loading...</p>:<>
        <p className="text-sm text-slate-500">Question {idx+1} of {safeQs.length} · {cur.marks} marks</p>
        <h2 className="text-lg font-semibold mt-1 whitespace-pre-wrap">{cur.text}</h2>
        <div className="mt-4 space-y-2">{cur.options.map((op,i)=>{
          const stored=attempt?.answers[cur.qid];
          const checked=cur.type==='MCQ_MULTIPLE'?Array.isArray(stored)&&(stored as number[]).includes(cur.map[i]):stored===cur.map[i];
          return <label key={i} className="flex items-center gap-2 border rounded-xl px-3 py-2 cursor-pointer hover:bg-slate-50">
            <input type={cur.type==='MCQ_MULTIPLE'?'checkbox':'radio'} name={cur.qid} checked={!!checked} onChange={()=>{
              if(cur.type==='MCQ_MULTIPLE'){ const s=new Set<number>(Array.isArray(stored)?stored:[]); const orig=cur.map[i]; s.has(orig)?s.delete(orig):s.add(orig); answer(cur.qid,[...s]); }
              else answer(cur.qid,i,cur.map);
            }} /> <span>{op}</span></label>;})}
          {cur.type==='SHORT_ANSWER'&&<input className="input" defaultValue={attempt?.answers[cur.qid]??''} onBlur={e=>answer(cur.qid,e.target.value)} placeholder="Your answer" />}
          {cur.type==='TRUE_FALSE'&&null}
        </div>
        <div className="flex justify-between mt-6"><button className="btn-ghost" disabled={idx===0} onClick={()=>setIdx(i=>i-1)}>Previous</button>
        {idx<safeQs.length-1?<button className="btn-primary" onClick={async()=>{setIdx(i=>i+1); const a=await repo.get<Attempt>('attempts',attempt!.id)!; if(a){a.currentIndex=idx+1; await repo.put('attempts',a);}}}>Next</button>
        :<button className="btn-danger" onClick={()=>{if(confirm(`Submit exam? Answered ${answered}/${safeQs.length}`)) submit('MANUAL');}}>Submit</button>}</div>
      </>}</Card>
      <Card><p className="font-bold text-sm mb-2">Questions</p>
        <div className="grid grid-cols-5 gap-1">{safeQs.map((q,i)=><button key={q.qid} onClick={()=>setIdx(i)} className={`rounded-lg text-xs py-1.5 ${i===idx?'bg-indigo-600 text-white':attempt?.answers[q.qid]!==undefined?'bg-green-100 text-green-800':'bg-slate-100'}`}>{i+1}</button>)}</div>
        <p className="text-xs text-slate-500 mt-2">Answered {answered}/{safeQs.length}</p></Card>
    </div>
  </div>;
}
