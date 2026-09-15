import { Shell, SideLink } from '../../components/layout';
import { Card } from '../../components/ui';
import { db } from '../../lib/store';
export default function AdminDashboard(){
  const students=db.all<any>('students'), exams=db.all<any>('exams'), attempts=db.all<any>('attempts');
  const completed=attempts.filter(a=>a.status!=='IN_PROGRESS');
  const avg=completed.length?Math.round(completed.reduce((s,a)=>s+(a.pct||0),0)/completed.length):0;
  return <Shell sidebar={<><SideLink to="/admin/dashboard" label="Dashboard" /><SideLink to="/admin/students" label="Students" /><SideLink to="/admin/exams" label="Exams" /><SideLink to="/admin/questions" label="Question Bank" /><SideLink to="/admin/results" label="Results" /><SideLink to="/admin/monitoring" label="Monitoring" /><SideLink to="/admin/analytics" label="Analytics" /><SideLink to="/admin/audit-logs" label="Audit Logs" /><SideLink to="/admin/settings" label="Settings" /></>}>
    <div className="grid sm:grid-cols-4 gap-4">
      <Card><p className="text-xs text-slate-500">TOTAL STUDENTS</p><p className="text-3xl font-extrabold">{students.length}</p></Card>
      <Card><p className="text-xs text-slate-500">ACTIVE EXAMS</p><p className="text-3xl font-extrabold">{exams.filter(e=>e.status==='ACTIVE').length}</p></Card>
      <Card><p className="text-xs text-slate-500">COMPLETED ATTEMPTS</p><p className="text-3xl font-extrabold">{completed.length}</p></Card>
      <Card><p className="text-xs text-slate-500">AVG SCORE</p><p className="text-3xl font-extrabold">{avg}%</p></Card>
    </div>
    <Card><b>Upcoming exams</b>{exams.filter(e=>e.status==='SCHEDULED').map(e=><p key={e.id} className="text-sm">{e.title} — {new Date(e.startAt).toLocaleString()}</p>)||null}{exams.filter(e=>e.status==='SCHEDULED').length===0&&<p className="text-sm text-slate-500">None scheduled.</p>}</Card>
  </Shell>;
}
