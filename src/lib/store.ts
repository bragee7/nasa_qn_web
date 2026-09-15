// Local-first data layer: uses localStorage as source of truth when Firebase is not configured.
// Identical collection layout to Firestore design (§46) so swapping to Firebase = change adapters only.
import type { Student, Exam, Question, Attempt, ExamEvent, AuditLog } from '../types/models';
const K = (c: string) => `examora_${c}`;
function read<T>(c: string, fallback: T): T {
  try { const raw = localStorage.getItem(K(c)); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}
function write(c: string, v: unknown) { localStorage.setItem(K(c), JSON.stringify(v)); }
export const db = {
  all<T>(c: string): T[] { return read<T[]>(c, []); },
  get<T extends {id:string}>(c: string, id: string): T | undefined { return read<T[]>(c, []).find(x=>x.id===id); },
  put<T>(c: string, v: T) { const a = read<any[]>(c, []); const key = (x:any)=>x.id ?? x.uid; const i = a.findIndex(x=>key(x)===key(v as any)); if(i>=0) a[i]=v; else a.push(v); write(c,a); },
  remove(c: string, id: string) { write(c, read<any[]>(c,[]).filter(x=>x.id!==id)); },
  query<T>(c: string, fn: (x:T)=>boolean): T[] { return read<T[]>(c,[]).filter(fn); },
};
// Users (auth): { uid, email, passHash, role, studentId? }
export interface LocalUser { uid: string; email: string; passHash: string; role: 'student'|'super_admin'; studentId?: string; name: string; }
export async function sha(s: string): Promise<string> {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('examora::'+s));
  return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export type { Student, Exam, Question, Attempt, ExamEvent, AuditLog };
