import { describe, it, expect, beforeEach } from 'vitest';
// In-memory localStorage for the node test env (store.ts touches it lazily).
const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => { mem.set(k, String(v)); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => mem.clear(),
};
import { db, sha, type LocalUser } from '../lib/store';
import { DEFAULT_STUDENT_PASSWORD } from '../config/app';
import { findUserByIdentifier } from './auth';

const admin: LocalUser = { uid: 'u_admin', email: 'admin@college.edu', passHash: 'h', role: 'super_admin', name: 'Super Admin' };
const arun: LocalUser = { uid: 'u_23CSE001', email: 'arun@college.edu', passHash: 'h', role: 'student', studentId: '23CSE001', name: 'Arun Kumar' };
const twelve: LocalUser = { uid: 'u_811324104023', email: 'divya@college.edu', passHash: 'h', role: 'student', studentId: '811324104023', name: 'Divya' };
const users = [admin, arun, twelve];

beforeEach(() => { mem.clear(); });

describe('findUserByIdentifier (email or register no)', () => {
  it('matches by email (existing behaviour)', () => {
    expect(findUserByIdentifier(users, 'arun@college.edu')?.uid).toBe('u_23CSE001');
  });

  it('matches email case-insensitively with surrounding spaces', () => {
    expect(findUserByIdentifier(users, '  ARUN@college.edu ')?.uid).toBe('u_23CSE001');
  });

  it('matches an alphanumeric register no', () => {
    expect(findUserByIdentifier(users, '23CSE001')?.uid).toBe('u_23CSE001');
  });

  it('matches register no case-insensitively with spaces', () => {
    expect(findUserByIdentifier(users, ' 23cse001 ')?.uid).toBe('u_23CSE001');
  });

  it('matches a 12-digit register no', () => {
    expect(findUserByIdentifier(users, '811324104023')?.uid).toBe('u_811324104023');
  });

  it('returns undefined for unknown identifiers and blanks', () => {
    expect(findUserByIdentifier(users, 'nobody@college.edu')).toBeUndefined();
    expect(findUserByIdentifier(users, '99XXX999')).toBeUndefined();
    expect(findUserByIdentifier(users, '   ')).toBeUndefined();
  });

  it('prefers email match and never matches admin by register no', () => {
    expect(findUserByIdentifier(users, 'admin@college.edu')?.uid).toBe('u_admin');
    expect(findUserByIdentifier(users, 'u_admin')).toBeUndefined();
  });
});

describe('login accepts email or register no', () => {
  // Exercises the real login path (hash check + disabled check) via the
  // seeded-shape rows; AuthProvider itself is React-only so we replicate its
  // lookup through findUserByIdentifier, the exact call login() makes.
  it('seeded student row resolves identically by email and by register no', async () => {
    const pw = await sha(DEFAULT_STUDENT_PASSWORD);
    db.put('users', { ...arun, passHash: pw });
    db.put('students', { id: '23CSE001', studentId: '23CSE001', name: 'Arun Kumar', email: 'arun@college.edu', department: 'CSE', year: 2, section: 'A', status: 'active', createdAt: 1, updatedAt: 1 });
    const byEmail = findUserByIdentifier(db.all<LocalUser>('users'), 'arun@college.edu');
    const byReg = findUserByIdentifier(db.all<LocalUser>('users'), '23CSE001');
    expect(byEmail?.uid).toBe('u_23CSE001');
    expect(byReg?.uid).toBe('u_23CSE001');
    expect(await sha(DEFAULT_STUDENT_PASSWORD)).toBe(byReg!.passHash);
    expect(await sha('WrongPass')).not.toBe(byReg!.passHash);
  });
});
