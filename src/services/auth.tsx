import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { db, sha, type LocalUser } from '../lib/store';
export interface Session { uid: string; email: string; role: 'student'|'super_admin'; studentId?: string; name: string; }
const Ctx = createContext<{ session: Session|null; login:(e:string,p:string)=>Promise<Session>; logout:()=>void }>({ session: null, login: async()=>{throw new Error('no auth')}, logout: ()=>{} });
export const useSession = () => useContext(Ctx);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session|null>(null);
  useEffect(()=>{ try { const s = localStorage.getItem('examora_session'); if(s) setSession(JSON.parse(s)); } catch {} },[]);
  async function login(email: string, password: string): Promise<Session> {
    const users = db.all<LocalUser>('users');
    const u = users.find(x=>x.email.toLowerCase()===email.trim().toLowerCase());
    if(!u) throw new Error('Invalid credentials');
    const h = await sha(password);
    if(h!==u.passHash) throw new Error('Invalid credentials');
    if(u.role==='student'){ const st = db.all<any>('students').find(s=>s.id===u.studentId); if(st?.status==='disabled') throw new Error('Account disabled'); }
    const s: Session = { uid: u.uid, email: u.email, role: u.role, studentId: u.studentId, name: u.name };
    localStorage.setItem('examora_session', JSON.stringify(s));
    // audit admin login
    if(s.role==='super_admin'){ const logs=db.all<any>('auditLogs'); logs.push({ id: crypto.randomUUID(), adminId: s.uid, adminEmail: s.email, action:'ADMIN_LOGIN', targetType:'admin', targetId:s.uid, timestamp:Date.now(), metadata:{} }); localStorage.setItem('examora_auditLogs', JSON.stringify(logs)); }
    setSession(s); return s;
  }
  function logout(){ localStorage.removeItem('examora_session'); setSession(null); }
  return <Ctx.Provider value={{ session, login, logout }}>{children}</Ctx.Provider>;
}
