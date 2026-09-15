import { useState } from 'react';
import { Shell, SideLink } from '../../components/layout';
import { Card, Empty } from '../../components/ui';
import { db } from '../../lib/store';
import { exportResultsWorkbook } from '../../lib/exporter';
import { useSession } from '../../services/auth';
export default function Results(){
  const { session }=useSession();
  const [examF,setExamF]=useState('All'); const [dep,setDep]=useState('All');
  const exams=db.all<any>('exams'); const attempts=db.all<any>('attempts').filter(a=>a.status!=='IN_PROGRESS');
  const students=new Map(db.all<any>('students').map(s=>[s.id,s]));
  const rows=attempts.filter(a=>(examF==='All'||a.examId===examF)).filter(a=>{ const s=students.get(a.studentId); return s&&(dep==='All'||s.department===dep); });
  return <Shell sidebar={<><SideLink to="/admin/results" label="Results" /><SideLink to="/admin/monitoring" label="Monitoring" /><SideLink to="/admin/analytics" label="Analytics" /><SideLink to="/admin/dashboard" label="Dashboard" /></>}>
    <Card><div className="flex flex-wrap gap-2 items-center"><b className="mr-auto">Results</b>
      <select className="input !w-48" value={examF} onChange={e=>setExamF(e.target.value)}><option>All</option>{exams.map(x=><option key={x.id} value={x.id}>{x.title}</option>)}</select>
      <select className="input !w-32" value={dep} onChange={e=>setDep(e.target.value)}><option>All</option><option>CSE</option><option>IT</option><option>ECE</option></select>
      <button className="btn-primary" onClick={()=>{ exportResultsWorkbook(rows,students,exams);
        const l=db.all<any>('auditLogs'); l.push({id:crypto.randomUUID(),adminId:session!.uid,adminEmail:session!.email,action:'EXCEL_EXPORTED',targetType:'results',targetId:examF,timestamp:Date.now(),metadata:{count:rows.length}}); localStorage.setItem('examora_auditLogs',JSON.stringify(l)); }}>Export Excel</button></div></Card>
     {rows.length===0?<Empty title="No results." />:<Card><table className="table"><thead><tr><th>Reg No</th><th>Name</th><th>Dept</th><th>Score</th><th>Monitoring</th><th>Actions</th></tr></thead><tbody>
       {rows.slice(0,300).map(a=>{ const s=students.get(a.studentId); const tot=(a.tabSwitchCount||0)+(a.fsExitCount||0)+(a.refreshCount||0)+(a.netDiscCount||0);
         return <tr key={a.id}><td>{s?.studentId}</td><td>{s?.name}</td><td>{s?.department}·{s?.year}·{s?.section}</td><td>{a.score}/{a.totalMarks}</td><td>{tot}</td>
        <td className="flex gap-1"><button className="btn-ghost !text-xs !px-2" onClick={()=>{ if(confirm('Reset attempt? Student can retake.')){ a.status='IN_PROGRESS'; delete a.score; delete a.submittedAt; a.updatedAt=Date.now(); db.put('attempts',a); const l=db.all<any>('auditLogs'); l.push({id:crypto.randomUUID(),adminId:session!.uid,adminEmail:session!.email,action:'ATTEMPT_RESET',targetType:'attempt',targetId:a.id,timestamp:Date.now(),metadata:{}}); localStorage.setItem('examora_auditLogs',JSON.stringify(l)); location.reload(); } }}>Reset</button></td></tr>; })}
    </tbody></table></Card>}
  </Shell>;
}
