import { Shell, SideLink } from '../../components/layout';
import { Card, Empty } from '../../components/ui';
import { db } from '../../lib/store';
export default function Analytics(){
  const attempts=db.all<any>('attempts').filter(a=>a.status!=='IN_PROGRESS');
  const exams=db.all<any>('exams'); const bank=db.all<any>('questionBank');
  if(attempts.length===0) return <Shell sidebar={<><SideLink to="/admin/analytics" label="Analytics" /></>}><Empty title="No data yet." sub="Analytics appear after submissions." /></Shell>;
  const avg=Math.round(attempts.reduce((s,a)=>s+(a.pct||0),0)/attempts.length);
  const passed=attempts.filter(a=>(a.pct||0)>=40).length;
  // question accuracy
  const stats=bank.map(q=>{ let tot=0,ok=0;
    for(const a of attempts){ if(!(q.id in (a.answers||{}))) continue; tot++;
      const v=a.answers[q.id];
      if(q.type==='MCQ_SINGLE'&&v===q.correctAnswer) ok++;
      else if(q.type==='TRUE_FALSE'&&v===q.correctAnswer) ok++;
      else if(q.type==='SHORT_ANSWER'&&String(v).trim().toLowerCase()===String(q.correctAnswer).trim().toLowerCase()) ok++;
    }
    return { q, tot, acc: tot?Math.round(ok/tot*100):0 };
  });
  // histogram buckets
  const buckets=[0,0,0,0,0]; for(const a of attempts){ buckets[Math.min(4,Math.floor((a.pct||0)/20))]++; }
  return <Shell sidebar={<><SideLink to="/admin/analytics" label="Analytics" /><SideLink to="/admin/results" label="Results" /><SideLink to="/admin/dashboard" label="Dashboard" /></>}>
    <div className="grid sm:grid-cols-4 gap-4">
      <Card><p className="text-xs">ATTEMPTED</p><p className="text-3xl font-extrabold">{attempts.length}</p></Card>
      <Card><p className="text-xs">AVG SCORE</p><p className="text-3xl font-extrabold">{avg}%</p></Card>
      <Card><p className="text-xs">PASS RATE</p><p className="text-3xl font-extrabold">{Math.round(passed/attempts.length*100)}%</p></Card>
      <Card><p className="text-xs">EXAMS</p><p className="text-3xl font-extrabold">{exams.length}</p></Card>
    </div>
    <Card><b>Score distribution</b><div className="flex items-end gap-2 h-32 mt-3">{buckets.map((b,i)=><div key={i} className="bg-indigo-500 rounded-t flex-1" style={{height:`${Math.max(4,b/Math.max(1,...buckets)*100)}%`}} title={`${i*20}-${i*20+20}: ${b}`} />)}</div>
      <p className="text-xs text-slate-500">0-20 · 20-40 · 40-60 · 60-80 · 80-100</p></Card>
    <Card><b>Question accuracy</b>{stats.slice(0,50).map(s=><div key={s.q.id} className="text-sm flex gap-2 items-center mt-1"><span className="w-10 font-mono">{s.acc}%</span><div className="h-2 bg-slate-100 rounded flex-1"><div className="h-2 bg-green-500 rounded" style={{width:`${s.acc}%`}} /></div><span className="flex-1 truncate">{s.q.text}</span></div>)}</Card>
  </Shell>;
}
