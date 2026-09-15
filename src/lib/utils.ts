import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export const cn = (...i: ClassValue[]) => twMerge(clsx(i));
export const uid = (p='id') => `${p}_${Math.random().toString(36).slice(2,9)}${Date.now().toString(36)}`;
export const now = () => Date.now();
// Simple SHA-256 hash for exam password (prod: bcrypt in Cloud Function)
export async function hashPassword(pw: string, salt='examora'): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt+pw));
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export function shuffle<T>(arr: T[], rand: ()=>number = Math.random): T[] {
  const a=[...arr]; for(let i=a.length-1;i>0;i--){const j=Math.floor(rand()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a;
}
// Seeded RNG so attempt order is reproducible per attempt
export function seededRand(seed: string): ()=>number {
  let h=2166136261; for(const c of seed){h^=c.charCodeAt(0); h=Math.imul(h,16777619);}
  return ()=>{h=Math.imul(h^h>>>15,2246822507); h=Math.imul(h^h>>>13,3266489909); h^=h>>>16; return (h>>>0)/4294967296;};
}
// Exam departments: stored as string[] ([] = all departments).
// Accepts legacy single-string form ('all' or 'CSE') from older seeds.
export function examDepartments(e: { department?: string[] | string }): string[] {
  const d = e.department;
  if (Array.isArray(d)) return d;
  if (!d || d === 'all') return [];
  return [d];
}
export const DEPT_OPTIONS = ['CSE','IT','ECE','EEE','MECH','CIVIL','CS-Cyber','AI&DS','AERO'];
export function fmtClock(ms: number): string {
  const s=Math.max(0,Math.floor(ms/1000)); const m=Math.floor(s/60); return `${String(m).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
}
// Display timestamps in Asia/Kolkata (stored times are UTC ms from Date.now()).
export function fmtDateTime(ms: number): string {
  return new Intl.DateTimeFormat('en-IN',{ timeZone:'Asia/Kolkata', day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true }).format(new Date(ms));
}
export function monitoringStatus(total: number, normalMax=2, attMax=5): 'NORMAL'|'ATTENTION'|'REVIEW' {
  if(total<=normalMax) return 'NORMAL'; if(total<=attMax) return 'ATTENTION'; return 'REVIEW';
}
