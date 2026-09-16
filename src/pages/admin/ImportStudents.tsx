import { useState } from 'react';
import * as XLSX from 'xlsx';
import { Shell, SideLink } from '../../components/layout';
import { Card } from '../../components/ui';
import { sha } from '../../lib/store';
import { repo } from '../../lib/repo';
import { audit } from '../../lib/audit';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { DEFAULT_STUDENT_PASSWORD } from '../../config/app';
export default function ImportStudents(){
  const [rows,setRows]=useState<any[]>([]); const [errors,setErrors]=useState<string[]>([]); const [done,setDone]=useState('');
  async function onFile(f:File){
    const buf=await f.arrayBuffer(); const wb=XLSX.read(buf); const ws=wb.Sheets[wb.SheetNames[0]];
    const raw:any[][]=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:false}) as any[][];
    if(!raw.length||raw[0].every((c:any)=>String(c).trim()==='')){ setErrors(['Empty sheet — add header row: Register No, Name, Email, Department, Year, Section']); setRows([]); return; }
    const headers=raw[0].map((h:any)=>String(h).trim());
    const norm=(s:string)=>s.toLowerCase().replace(/[\s._\/\\-]+/g,'');
    const alias:Record<string,string[]>={ registerNo:['registerno','registernumber','regno','regnumber','rollno','studentid','register','regn','regno.'], name:['name','studentname','fullname'], email:['email','emailid','mail'], department:['department','dept','branch'], year:['year','yr'], section:['section','sec','class'] };
    const findIdx=(canon:string)=>{ const al=alias[canon].map(norm); for(let i=0;i<headers.length;i++) if(al.includes(norm(headers[i]))) return i; return -1; };
    const idx={ registerNo:findIdx('registerNo'), name:findIdx('name'), email:findIdx('email'), department:findIdx('department'), year:findIdx('year'), section:findIdx('section') };
    if(idx.registerNo===-1){ setErrors([`Could not find Register No column. Detected headers: [${headers.filter(Boolean).join(', ')}]. Rename one header to "Register No" (also accepts: Register Number, Reg No, Roll No, Student ID).`]); setRows([]); return; }
    if(idx.name===-1||idx.email===-1){ const miss=[idx.name===-1?'Name':'',idx.email===-1?'Email':''].filter(Boolean).join(' and '); setErrors([`Could not find ${miss} column. Detected headers: [${headers.filter(Boolean).join(', ')}]. Expected headers: Register No, Name, Email, Department, Year, Section.`]); setRows([]); return; }
    const errs:string[]=[]; const ok:any[]=[];
    for(let r=1;r<raw.length;r++){ const row=raw[r]; if(row.every((c:any)=>String(c).trim()==='')) continue; const n=r+1;
      const get=(i:number)=>String(row[i]??'').trim();
      const reg=get(idx.registerNo), name=get(idx.name), email=get(idx.email);
      const dept=idx.department!==-1?get(idx.department):'CSE', yrRaw=idx.year!==-1?get(idx.year):'', sec=idx.section!==-1?get(idx.section):'A';
      if(!reg) errs.push(`Row ${n}: Missing Register Number`);
      else if(!email.includes('@')) errs.push(`Row ${n}: Invalid Email (“${email}”)`);
      else {
        // Year: accept 2/3, "2nd year", "II", "III" etc — normalize to 2 or 3
        let yr:number|string=yrRaw; const yNorm=norm(yrRaw);
        if(['2','2ndyear','ii','secondyear','year2'].includes(yNorm)) yr=2;
        else if(['3','3rdyear','iii','thirdyear','year3'].includes(yNorm)) yr=3;
        if(![2,3,'2','3'].includes(yr as any)){ errs.push(`Row ${n}: Invalid Year (“${yrRaw}” — use 2 or 3)`); continue; }
        ok.push({ id:reg, studentId:reg, name:name||reg, email, department:dept||'CSE', year:Number(yr), section:sec||'A' });
      }
    }
    setRows(ok); setErrors(errs);
  }
  async function confirm(){
    let authCreated=0, authFailed=0;
    for(const r of rows){
      await repo.put('students',{...r,uid:'u_'+r.id,status:'active',createdAt:Date.now(),updatedAt:Date.now()});
      if (!isSupabaseConfigured) {
        if(!(await repo.all<any>('users')).some(u=>u.email===r.email)) await repo.put('users',{uid:'u_'+r.id,email:r.email,passHash:await sha(DEFAULT_STUDENT_PASSWORD),role:'student',studentId:r.id,name:r.name});
      } else {
        const { error } = await supabase().rpc('create_student_user', {
          p_email: r.email, p_password: DEFAULT_STUDENT_PASSWORD, p_student_id: r.studentId, p_name: r.name,
        });
        if (error) authFailed++; else authCreated++;
      }
    }
    await audit('STUDENT_IMPORTED',`batch:${rows.length}`,{count:rows.length},'students');
    if (isSupabaseConfigured) {
      setDone(`Imported ${rows.length} students. ${authCreated} logins created.${authFailed ? ` ${authFailed} failed (check Supabase Dashboard).` : ''}`);
    } else {
      setDone(`Imported ${rows.length} students. Default password: ${DEFAULT_STUDENT_PASSWORD}`);
    }
    setRows([]);
  }
  return <Shell sidebar={<><SideLink to="/admin/students" label="Students" /><SideLink to="/admin/dashboard" label="Dashboard" /></>}>
    <Card><b>Bulk import students (.xlsx)</b><p className="text-sm text-slate-500">Columns: Register No, Name, Email, Department, Year, Section</p>
      <input type="file" accept=".xlsx,.xls,.csv" className="mt-3" onChange={e=>e.target.files&&onFile(e.target.files[0])} />
      {errors.length>0&&<div className="mt-3 text-sm text-red-600">{errors.length} rows contain errors<ul className="list-disc ml-5">{errors.slice(0,20).map((e,i)=><li key={i}>{e}</li>)}</ul></div>}
      {rows.length>0&&<><p className="text-sm mt-3">{rows.length} valid rows ready.</p><button className="btn-primary mt-2" onClick={confirm}>Confirm import</button></>}
      {done&&<p className="text-sm text-green-700 mt-3">{done}</p>}</Card>
  </Shell>;
}
