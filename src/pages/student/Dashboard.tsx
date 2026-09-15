import { Link } from 'react-router-dom';
import { useSession } from '../../services/auth';
import { db } from '../../lib/store';
import { examDepartments } from '../../lib/utils';
import { Shell, SideLink } from '../../components/layout';
import { Card, Badge, Empty, statusColor } from '../../components/ui';
import type { Exam, Attempt, Student } from '../../types/models';
export default function StudentDashboard(){
  const { session } = useSession();
  const me = db.all<Student>('students').find(s=>s.id===session?.studentId);
  const exams = db.all<Exam>('exams').filter(e=>['SCHEDULED','ACTIVE'].includes(e.status))
    .filter(e=>{ const ds=examDepartments(e); return (ds.length===0||ds.includes(me?.department??''))&&(e.year==='all'||e.year===me?.year)&&(e.section==='all'||e.section===me?.section); });
  const myAttempts = db.all<Attempt>('attempts').filter(a=>a.uid===session?.uid);
  const nowT=Date.now();
  const upcoming=exams.filter(e=>e.startAt>nowT), active=exams.filter(e=>e.startAt<=nowT&&e.endAt>=nowT);
  return <Shell sidebar={<><SideLink to="/student/dashboard" label="Dashboard" /><SideLink to="/student/exams" label="My Exams" /><SideLink to="/student/profile" label="Profile" /></>}>
    <Card><h2 className="text-xl font-bold">Welcome, {me?.name}</h2>
      <p className="text-sm text-slate-500">Department: {me?.department} · Year: {me?.year}{me?.year===2?'nd':'rd'} Year · Section: {me?.section} · {me?.studentId}</p></Card>
    <h3 className="font-bold">Available Exams</h3>
    {active.length===0&&<Empty title="No active exams right now." sub="Your assigned exams will appear here." />}
    <div className="grid sm:grid-cols-2 gap-4">{active.map(e=>{
      const att=myAttempts.find(a=>a.examId===e.id);
      const done=att&&att.status!=='IN_PROGRESS';
      return <Card key={e.id}><div className="flex justify-between"><b>{e.title}</b><Badge color={statusColor(e.status)}>{e.status}</Badge></div>
        <p className="text-sm text-slate-500">{e.subject} · {e.durationMin} min</p>
        {done?<Link className="btn-ghost mt-3" to={`/student/result/${att!.id}`}>View score</Link>
        :att?<Link className="btn-primary mt-3" to={`/student/exam/${e.id}`}>Resume exam</Link>
        :<Link className="btn-primary mt-3" to={`/student/exam/${e.id}`}>Start exam</Link>}</Card>;})}</div>
    <h3 className="font-bold">Upcoming Exams</h3>
    {upcoming.length===0?<Empty title="No upcoming exams." />:upcoming.map(e=><Card key={e.id}><b>{e.title}</b><p className="text-sm text-slate-500">{new Date(e.startAt).toLocaleString()} · {e.durationMin} min · {e.subject}</p></Card>)}
    <h3 className="font-bold">Completed</h3>
    {myAttempts.filter(a=>a.status!=='IN_PROGRESS').length===0?<Empty title="No completed exams yet." />:myAttempts.filter(a=>a.status!=='IN_PROGRESS').map(a=>{
      const e=db.get<Exam>('exams',a.examId);
      return <Card key={a.id}><b>{e?.title}</b><p className="text-sm">Score: {a.score} / {a.totalMarks} ({a.pct}%)</p><Link className="btn-ghost mt-2" to={`/student/result/${a.id}`}>View score</Link></Card>;})}
  </Shell>;
}
