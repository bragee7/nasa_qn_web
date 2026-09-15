import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Shell, SideLink } from '../../components/layout';
import { Card, Empty } from '../../components/ui';
import { db } from '../../lib/store';
import { useSession } from '../../services/auth';
export default function Students(){
  const { session }=useSession();
  const [q,setQ]=useState(''); const [dept,setDept]=useState('All'); const [year,setYear]=useState('All');
  const [list,setList]=useState(()=>db.all<any>('students'));
  const refresh=()=>setList([...db.all<any>('students')]);
  const filtered=list.filter(s=>(q===''||(s.studentId+s.name+s.email).toLowerCase().includes(q.toLowerCase()))&&(dept==='All'||s.department===dept)&&(year==='All'||String(s.year)===year));
  function audit(action:string,targetId:string,metadata:any={}){ const l=db.all<any>('auditLogs'); l.push({id:crypto.randomUUID(),adminId:session!.uid,adminEmail:session!.email,action,targetType:'student',targetId,timestamp:Date.now(),metadata}); localStorage.setItem('examora_auditLogs',JSON.stringify(l)); }
  return <Shell sidebar={<><SideLink to="/admin/dashboard" label="Dashboard" /><SideLink to="/admin/students" label="Students" /><SideLink to="/admin/exams" label="Exams" /><SideLink to="/admin/questions" label="Question Bank" /><SideLink to="/admin/results" label="Results" /></>}>
    <Card><div className="flex flex-wrap gap-2 items-center"><b className="mr-auto">Students</b>
      <input className="input !w-56" placeholder="Search reg no / name / email" value={q} onChange={e=>setQ(e.target.value)} />
      <select className="input !w-32" value={dept} onChange={e=>setDept(e.target.value)}><option>All</option><option>CSE</option><option>IT</option><option>ECE</option><option>EEE</option><option>MECH</option><option>CIVIL</option></select>
      <select className="input !w-28" value={year} onChange={e=>setYear(e.target.value)}><option>All</option><option>2</option><option>3</option></select>
      <Link className="btn-primary" to="/admin/students/import">Import Excel</Link></div></Card>
    {filtered.length===0?<Empty title="No students found." sub="Import your student list to get started." />:
    <Card><table className="table"><thead><tr><th>Reg No</th><th>Name</th><th>Dept</th><th>Year</th><th>Sec</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      {filtered.slice(0,200).map(s=><tr key={s.id}><td>{s.studentId}</td><td>{s.name}</td><td>{s.department}</td><td>{s.year}</td><td>{s.section}</td><td>{s.status}</td>
      <td><button className="btn-ghost !px-2 !py-1 text-xs" onClick={()=>{s.status=s.status==='active'?'disabled':'active'; s.updatedAt=Date.now(); db.put('students',s); audit('STUDENT_UPDATED',s.id,{status:s.status}); refresh();}}>{s.status==='active'?'Disable':'Enable'}</button></td></tr>)}
    </tbody></table></Card>}
  </Shell>;
}
