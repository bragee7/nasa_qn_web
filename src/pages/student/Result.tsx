import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { repo } from '../../lib/repo';
import { Card } from '../../components/ui';
import type { Attempt, Exam } from '../../types/models';
export default function StudentResult(){
  const { attemptId } = useParams();
  const [a,setA]=useState<Attempt|undefined>(undefined);
  const [e,setE]=useState<Exam|undefined>(undefined);
  const [loaded,setLoaded]=useState(false);
  useEffect(()=>{ (async()=>{
    const att=await repo.get<Attempt>('attempts', attemptId!); setA(att);
    if(att) setE(await repo.get<Exam>('exams', att.examId));
    setLoaded(true);
  })(); },[attemptId]);
  if(!loaded) return <div className="max-w-xl mx-auto p-10">Loading…</div>;
  if(!a||!e) return <div className="max-w-xl mx-auto p-10">Result not found.</div>;
  if(a.status==='IN_PROGRESS') return <div className="max-w-xl mx-auto p-10">Exam still in progress.</div>;
  const released = e.resultsReleaseMode==='IMMEDIATE' || a.score!==undefined;
  if(!released) return <div className="max-w-xl mx-auto p-10"><Card>Result pending release by admin.</Card></div>;
  const passed=(a.pct??0)>=(e.passPct??40);
  return <div className="max-w-xl mx-auto px-4 py-10"><Card><div className="text-center">
    <p className="text-sm text-slate-500">EXAM COMPLETED</p><h1 className="text-2xl font-extrabold">{e.title}</h1>
    <p className="text-5xl font-extrabold text-indigo-700 mt-4">{a.score} / {a.totalMarks}</p>
    <p className="mt-2 font-semibold">{passed?'Status: PASSED':'Status: FAILED'}</p>
    <Link className="btn-primary mt-6" to="/student">Back to dashboard</Link></div></Card></div>;
}
