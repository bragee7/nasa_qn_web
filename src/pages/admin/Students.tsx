import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Shell, SideLink } from '../../components/layout';
import { Card, Empty } from '../../components/ui';
import { db, sha } from '../../lib/store';
import { useSession } from '../../services/auth';
export default function Students(){
  const { session }=useSession();
  const [q,setQ]=useState(''); const [dept,setDept]=useState('All'); const [year,setYear]=useState('All');
  const [list,setList]=useState(()=>db.all<any>('students'));
  const [sel,setSel]=useState<Set<string>>(new Set());
  const refresh=()=>{ setList([...db.all<any>('students')]); setSel(new Set()); };
  // add form
  const [reg,setReg]=useState(''); const [name,setName]=useState(''); const [email,setEmail]=useState('');
  const [dpt,setDpt]=useState('CSE'); const [yr,setYr]=useState('2'); const [sec,setSec]=useState('A');
  const [msg,setMsg]=useState(''); const [err,setErr]=useState(''); const [openAdd,setOpenAdd]=useState(false);
  function audit(action:string,targetId:string,metadata:any={}){ const l=db.all<any>('auditLogs'); l.push({id:crypto.randomUUID(),adminId:session!.uid,adminEmail:session!.email,action,targetType:'student',targetId,timestamp:Date.now(),metadata}); localStorage.setItem('examora_auditLogs',JSON.stringify(l)); }
  const filtered=useMemo(()=> list.filter((s:any)=>(q===''||(s.studentId+s.name+s.email).toLowerCase().includes(q.toLowerCase()))&&(dept==='All'||s.department===dept)&&(year==='All'||String(s.year)===String(year))),[list,q,dept,year]);
  const toggleSel=(id:string)=> setSel(prev=>{ const n=new Set(prev); if(n.has(id)) n.delete(id); else n.add(id); return n; });
  async function handleAdd(){
    setErr(''); setMsg('');
    const r=reg.trim(), n=name.trim(), e=email.trim().toLowerCase();
    if(!r) return setErr('Register No is required.');
    if(!n) return setErr('Name is required.');
    if(!e || !e.includes('@')) return setErr('Valid Email is required.');
    const all=db.all<any>('students');
    if(all.some((s:any)=>s.studentId===r || s.id===r)) return setErr(`Register No "${r}" already exists.`);
    if(all.some((s:any)=>s.email.toLowerCase()===e)) return setErr(`Email "${e}" already exists.`);
    const rec:any={ id:r, studentId:r, name:n, email:e, department:dpt, year:Number(yr), section:sec||'A', status:'active', createdAt:Date.now(), updatedAt:Date.now(), uid:'u_'+r };
    db.put('students', rec);
    if(!db.all<any>('users').some((u:any)=>u.email.toLowerCase()===e)){
      db.put('users',{uid:'u_'+r,email:e,passHash:await sha('Student@123'),role:'student',studentId:r,name:n});
    }
    audit('STUDENT_CREATED',r,{source:'students-page'});
    setMsg(`Added ${n} (${r}) — password: Student@123`);
    setReg(''); setName(''); setEmail('');
    refresh();
  }
  function handleDelete(id:string){
    if(!confirm(`Delete student ${id}? This removes the student and login (cannot be undone).`)) return;
    const s=db.get<any>('students',id);
    db.remove('students', id);
    const users=db.all<any>('users');
    for(const u of users.filter((u:any)=>u.studentId===id || u.uid==='u_'+id)){
      const cur=db.all<any>('users'); localStorage.setItem('examora_users', JSON.stringify(cur.filter((x:any)=>x.uid!==u.uid)));
    }
    audit('STUDENT_DELETED', id, {name:s?.name});
    refresh();
  }
  function bulkDelete(){
    if(sel.size===0) return;
    if(!confirm(`Delete ${sel.size} selected student(s)? This will also remove their logins.`)) return;
    for(const id of sel){
      db.remove('students', id);
      const users=db.all<any>('users');
      for(const u of users.filter((u:any)=>u.studentId===id || u.uid==='u_'+id)){
        const cur=db.all<any>('users'); localStorage.setItem('examora_users', JSON.stringify(cur.filter((x:any)=>x.uid!==u.uid)));
      }
      audit('STUDENT_DELETED', id, {bulk:true});
    }
    refresh();
  }
  return <Shell sidebar={<><SideLink to="/admin/dashboard" label="Dashboard" /><SideLink to="/admin/students" label="Students" /><SideLink to="/admin/exams" label="Exams" /><SideLink to="/admin/questions" label="Question Bank" /><SideLink to="/admin/question-banks" label="Banks" /><SideLink to="/admin/results" label="Results" /><SideLink to="/admin/monitoring" label="Monitoring" /><SideLink to="/admin/analytics" label="Analytics" /><SideLink to="/admin/audit-logs" label="Audit Logs" /><SideLink to="/admin/settings" label="Settings" /></>}>
    <Card>
      <div className="flex flex-wrap gap-2 items-center">
        <b className="mr-auto">Students</b>
        <button className="btn-primary !px-3 !py-1 text-sm" onClick={()=>setOpenAdd(v=>!v)}>{openAdd?'Close':'＋ Add Student'}</button>
        <Link className="btn-ghost !px-3 !py-1 text-sm" to="/admin/students/import">Import Excel</Link>
        <Link className="btn-ghost !px-3 !py-1 text-sm" to="/admin/dashboard">Dashboard →</Link>
      </div>
      {openAdd && <div className="mt-3 border-t pt-3">
        <p className="text-xs text-slate-500">Add one student instantly. Default password: <code>Student@123</code></p>
        <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-2">
          <div><label className="label">Register No *</label><input className="input" placeholder="22CSE001" value={reg} onChange={e=>setReg(e.target.value)} /></div>
          <div><label className="label">Name *</label><input className="input" placeholder="Full name" value={name} onChange={e=>setName(e.target.value)} /></div>
          <div className="sm:col-span-2"><label className="label">Email *</label><input className="input" placeholder="student@college.edu" value={email} onChange={e=>setEmail(e.target.value)} /></div>
          <div><label className="label">Department</label><select className="input" value={dpt} onChange={e=>setDpt(e.target.value)}><option>CSE</option><option>IT</option><option>ECE</option><option>EEE</option><option>MECH</option><option>CIVIL</option><option>CS-Cyber</option><option>AI&DS</option><option>AERO</option></select></div>
          <div><label className="label">Year</label><select className="input" value={yr} onChange={e=>setYr(e.target.value)}><option value="2">2</option><option value="3">3</option></select></div>
          <div><label className="label">Section</label><input className="input" placeholder="A" value={sec} onChange={e=>setSec(e.target.value)} /></div>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <button className="btn-primary" onClick={handleAdd}>Add Student</button>
          <button className="btn-ghost" onClick={()=>{setReg('');setName('');setEmail('');setErr('');setMsg('');}}>Clear</button>
          {err && <span className="text-sm text-red-600">{err}</span>}
          {msg && <span className="text-sm text-green-700">{msg}</span>}
        </div>
      </div>}
      <div className="flex flex-wrap gap-2 items-center mt-3">
        <input className="input !w-56" placeholder="Search reg no / name / email" value={q} onChange={e=>setQ(e.target.value)} />
        <select className="input !w-32" value={dept} onChange={e=>setDept(e.target.value)}><option>All</option><option>CSE</option><option>IT</option><option>ECE</option><option>EEE</option><option>MECH</option><option>CIVIL</option><option>CS-Cyber</option><option>AI&DS</option><option>AERO</option></select>
        <select className="input !w-28" value={year} onChange={e=>setYear(e.target.value)}><option>All</option><option>2</option><option>3</option></select>
        <span className="text-xs text-slate-500 ml-auto">{filtered.length} of {list.length}</span>
      </div>
      {sel.size>0 && <div className="mt-3 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-sm">
        <span>{sel.size} selected</span><button className="btn-danger !px-3 !py-1 text-xs ml-auto" onClick={bulkDelete}>Delete selected</button><button className="btn-ghost !px-3 !py-1 text-xs" onClick={()=>setSel(new Set())}>Clear</button>
      </div>}
    </Card>
    {filtered.length===0?<Empty title="No students found." sub={q||dept!=='All'||year!=='All' ? 'Try a different search.' : 'Add a student or import your list to get started.'} />:
    <Card><div className="overflow-auto"><table className="table"><thead><tr><th><input type="checkbox" checked={filtered.length>0 && filtered.every((s:any)=>sel.has(s.id))} onChange={e=> setSel(e.target.checked ? new Set(filtered.map((s:any)=>s.id)) : new Set())} /></th><th>Reg No</th><th>Name</th><th>Email</th><th>Dept</th><th>Year</th><th>Sec</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      {filtered.slice(0,300).map((s:any)=><tr key={s.id}><td><input type="checkbox" checked={sel.has(s.id)} onChange={()=>toggleSel(s.id)} /></td><td className="font-mono text-xs">{s.studentId}</td><td>{s.name}</td><td className="text-xs">{s.email}</td><td>{s.department}</td><td>{s.year}</td><td>{s.section}</td><td><span className={`badge ${s.status==='active'?'bg-green-100 text-green-700':'bg-slate-200 text-slate-600'}`}>{s.status}</span></td>
      <td className="flex gap-1 flex-wrap"><button className="btn-ghost !px-2 !py-1 text-xs" onClick={()=>{s.status=s.status==='active'?'disabled':'active'; s.updatedAt=Date.now(); db.put('students',s); audit('STUDENT_UPDATED',s.id,{status:s.status}); refresh();}}>{s.status==='active'?'Disable':'Enable'}</button><button className="btn-danger !px-2 !py-1 text-xs" onClick={()=>handleDelete(s.id)}>Delete</button></td></tr>)}
    </tbody></table></div>{filtered.length>300 && <p className="text-xs text-slate-500 mt-2">Showing 300 of {filtered.length} — use search to narrow.</p>}</Card>}
  </Shell>;
}
