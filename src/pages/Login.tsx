import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../services/auth';
import { APP } from '../config/app';
import { Card } from '../components/ui';
const eyeOpen = (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>);
const eyeOff = (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.6 10.6 0 0 1 12 19c-6.5 0-10-7-10-7a17.6 17.6 0 0 1 4.06-4.94M9.9 4.24A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17.7 17.7 0 0 1-2.16 3.19M9.88 9.88a3 3 0 1 0 4.24 4.24"/><line x1="2" y1="2" x2="22" y2="22"/></svg>);
export default function Login(){
  const { login } = useSession(); const nav=useNavigate();
  const [email,setEmail]=useState(''); const [pw,setPw]=useState(''); const [showPw,setShowPw]=useState(false); const [err,setErr]=useState(''); const [busy,setBusy]=useState(false);
  async function submit(e:React.FormEvent){ e.preventDefault(); setErr(''); setBusy(true);
    try { const s=await login(email,pw); nav(s.role==='super_admin'?'/admin':'/student'); }
    catch(ex:any){ setErr(ex.message||'Login failed'); } finally { setBusy(false); } }
  return <div className="max-w-md mx-auto px-4 py-12">
    <Card><h1 className="text-2xl font-extrabold text-indigo-700">{APP.name}</h1>
      <p className="text-sm text-slate-500">{APP.subtitle}</p>
      <form onSubmit={submit} className="mt-5 space-y-3">
        <div><label className="label" htmlFor="email">Email or Register No</label><input id="email" className="input" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@college.edu or 24CS021" autoComplete="username" /></div>
        <div><label className="label" htmlFor="pw">Password</label><div className="relative"><input id="pw" type={showPw?'text':'password'} className="input pr-10" value={pw} onChange={e=>setPw(e.target.value)} autoComplete="current-password" /><button type="button" onClick={()=>setShowPw(v=>!v)} aria-label={showPw?'Hide password':'Show password'} title={showPw?'Hide password':'Show password'} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800">{showPw?eyeOff:eyeOpen}</button></div></div>
        {err&&<p className="text-sm text-red-600" role="alert">{err}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy?'Signing in...':'Login'}</button>
      </form>
      <div className="text-xs text-slate-500 mt-4">Demo: admin@college.edu / Admin@123 · arun@college.edu (or 23CSE001) / Jjcet@2k26</div>
    </Card></div>;
}
