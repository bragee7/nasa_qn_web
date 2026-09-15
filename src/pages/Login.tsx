import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../services/auth';
import { APP } from '../config/app';
import { Card } from '../components/ui';
export default function Login(){
  const { login } = useSession(); const nav=useNavigate();
  const [email,setEmail]=useState(''); const [pw,setPw]=useState(''); const [err,setErr]=useState(''); const [busy,setBusy]=useState(false);
  async function submit(e:React.FormEvent){ e.preventDefault(); setErr(''); setBusy(true);
    try { const s=await login(email,pw); nav(s.role==='super_admin'?'/admin':'/student'); }
    catch(ex:any){ setErr(ex.message||'Login failed'); } finally { setBusy(false); } }
  return <div className="max-w-md mx-auto px-4 py-12">
    <Card><h1 className="text-2xl font-extrabold text-indigo-700">{APP.name}</h1>
      <p className="text-sm text-slate-500">{APP.subtitle}</p>
      <form onSubmit={submit} className="mt-5 space-y-3">
        <div><label className="label" htmlFor="email">Email</label><input id="email" className="input" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@college.edu" autoComplete="username" /></div>
        <div><label className="label" htmlFor="pw">Password</label><input id="pw" type="password" className="input" value={pw} onChange={e=>setPw(e.target.value)} autoComplete="current-password" /></div>
        {err&&<p className="text-sm text-red-600" role="alert">{err}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy?'Signing in...':'Login'}</button>
      </form>
      <div className="text-xs text-slate-500 mt-4">Demo: admin@college.edu / Admin@123 · arun@college.edu / Student@123</div>
    </Card></div>;
}
