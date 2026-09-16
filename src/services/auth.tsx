import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { db, sha, type LocalUser } from '../lib/store';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { repo } from '../lib/repo';
export interface Session { uid: string; email: string; role: 'student'|'super_admin'; studentId?: string; name: string; }
const Ctx = createContext<{ session: Session|null; login:(e:string,p:string)=>Promise<Session>; logout:()=>void }>({ session: null, login: async()=>{throw new Error('no auth')}, logout: ()=>{} });
export const useSession = () => useContext(Ctx);
// Match a login identifier against email OR register no (studentId).
// Register nos can be alphanumeric (24CS021) or long digits (811324104023);
// the comparison is trimmed + case-insensitive so both forms just work
// (digits are unaffected by case folding). Email match takes precedence.
export function findUserByIdentifier(users: LocalUser[], identifier: string): LocalUser | undefined {
  const id = identifier.trim().toLowerCase();
  if(!id) return undefined;
  return users.find(x=>x.email.toLowerCase()===id)
      ?? users.find(x=>(x.studentId??'').toLowerCase()===id);
}
// Remote (Supabase) login: identifier may be email or register no.
// Register no is resolved to its email via the get_email_for_student_id RPC,
// then Supabase Auth signs in with email+password. Profiles table supplies role.
async function remoteLogin(identifier: string, password: string): Promise<Session> {
  const sb = supabase();
  const id = identifier.trim();
  let email = id;
  if(!id.includes('@')){
    const { data, error } = await sb.rpc('get_email_for_student_id', { reg: id });
    if(error || !data) throw new Error('Invalid credentials');
    email = data as string;
  }
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if(error || !data.user) throw new Error('Invalid credentials');
  const { data: prof, error: pErr } = await sb.from('profiles').select('*').eq('id', data.user.id).maybeSingle();
  if(pErr || !prof || !prof.active) { await sb.auth.signOut(); throw new Error(!prof ? 'Account not provisioned' : 'Account disabled'); }
  if(prof.role==='student'){
    const { data: st } = await sb.from('students').select('status').eq('student_id', prof.student_id ?? '').maybeSingle();
    if(st?.status==='disabled'){ await sb.auth.signOut(); throw new Error('Account disabled'); }
  }
  const s: Session = { uid: data.user.id, email: prof.email, role: prof.role, studentId: prof.student_id ?? undefined, name: prof.name };
  localStorage.setItem('examora_session', JSON.stringify(s));
  if(s.role==='super_admin'){
    await repo.put('auditLogs', { id: crypto.randomUUID(), adminId: s.uid, adminEmail: s.email, action:'ADMIN_LOGIN', targetType:'admin', targetId:s.uid, timestamp:Date.now(), metadata:{} });
  }
  return s;
}
async function localLogin(identifier: string, password: string): Promise<Session> {
  const users = db.all<LocalUser>('users');
  const u = findUserByIdentifier(users, identifier);
  if(!u) throw new Error('Invalid credentials');
  const h = await sha(password);
  if(h!==u.passHash) throw new Error('Invalid credentials');
  if(u.role==='student'){ const st = db.all<any>('students').find(s=>s.id===u.studentId); if(st?.status==='disabled') throw new Error('Account disabled'); }
  const s: Session = { uid: u.uid, email: u.email, role: u.role, studentId: u.studentId, name: u.name };
  localStorage.setItem('examora_session', JSON.stringify(s));
  // audit admin login
  if(s.role==='super_admin'){ const logs=db.all<any>('auditLogs'); logs.push({ id: crypto.randomUUID(), adminId: s.uid, adminEmail: s.email, action:'ADMIN_LOGIN', targetType:'admin', targetId:s.uid, timestamp:Date.now(), metadata:{} }); localStorage.setItem('examora_auditLogs', JSON.stringify(logs)); }
  return s;
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session|null>(null);
  useEffect(()=>{
    (async ()=>{
      try {
        if(isSupabaseConfigured){
          const { data } = await supabase().auth.getSession();
          if(data.session){
            const { data: prof } = await supabase().from('profiles').select('*').eq('id', data.session.user.id).maybeSingle();
            if(prof && prof.active){ setSession({ uid: data.session.user.id, email: prof.email, role: prof.role, studentId: prof.student_id ?? undefined, name: prof.name }); return; }
            await supabase().auth.signOut();
          }
          setSession(null); return;
        }
        const s = localStorage.getItem('examora_session'); if(s) setSession(JSON.parse(s));
      } catch { /* no session */ }
    })();
  },[]);
  async function login(identifier: string, password: string): Promise<Session> {
    const s = isSupabaseConfigured ? await remoteLogin(identifier, password) : await localLogin(identifier, password);
    setSession(s); return s;
  }
  function logout(){
    if(isSupabaseConfigured) supabase().auth.signOut().catch(()=>{});
    localStorage.removeItem('examora_session'); setSession(null);
  }
  return <Ctx.Provider value={{ session, login, logout }}>{children}</Ctx.Provider>;
}
