// Named question banks: reusable question sets; exams select ONE bank.
// Legacy flat questions (no questionBankId) are migrated into a default bank once.
// Async: reads/writes go through repo (Supabase when configured, localStorage fallback).
import { repo } from '../lib/repo';
import { uid, now } from '../lib/utils';
import type { Exam, Question, QuestionBank, SafeQuestion } from '../types/models';

export async function allBanks(includeArchived = true): Promise<QuestionBank[]> {
  const all = (await repo.all<QuestionBank>('questionBanks')).sort((a, b) => b.updatedAt - a.updatedAt);
  return includeArchived ? all : all.filter(b => b.status === 'ACTIVE');
}
export function getBank(id: string): Promise<QuestionBank | undefined> {
  return repo.get<QuestionBank>('questionBanks', id);
}
// Active questions of a bank, in file order (sourceOrder) then creation order.
export async function bankQuestions(bankId: string, includeArchivedQ = false): Promise<Question[]> {
  return (await repo.query<Question>('questionBank', q => q.questionBankId === bankId && (includeArchivedQ || q.status === 'active')))
    .sort((a, b) => (a.sourceOrder ?? Number.MAX_SAFE_INTEGER) - (b.sourceOrder ?? Number.MAX_SAFE_INTEGER) || (a.createdAt - b.createdAt));
}
export async function recomputeCount(bankId: string): Promise<number> {
  const n = (await repo.query<Question>('questionBank', q => q.questionBankId === bankId && q.status === 'active')).length;
  const b = await getBank(bankId);
  if (b) await repo.put('questionBanks', { ...b, questionCount: n, updatedAt: now() });
  return n;
}
// Frozen copy of a bank's active questions (file order) stamped onto an exam at publish/save.
// Later bank edits never affect published exams (historical integrity).
export async function snapshotBank(bankId: string): Promise<SafeQuestion[]> {
  return (await bankQuestions(bankId)).map(q => ({ qid: q.id, text: q.text, type: q.type, options: [...q.options], marks: q.marks }));
}
export interface BankInput { name: string; description?: string; subject?: string; year?: number|'all'; department?: string[]; section?: string; }
export async function createBank(input: BankInput, createdBy: string): Promise<QuestionBank> {
  const t = now();
  const b: QuestionBank = { id: uid('bank'), name: input.name.trim(), description: input.description?.trim() ?? '', subject: input.subject?.trim() ?? 'General', year: input.year ?? 'all', department: input.department ?? [], section: input.section ?? 'all', questionCount: 0, status: 'ACTIVE', createdBy, createdAt: t, updatedAt: t };
  await repo.put('questionBanks', b);
  return b;
}
// Independent copy: new bank + new question rows (sourceOrder preserved).
export async function duplicateBank(src: QuestionBank, createdBy: string): Promise<QuestionBank> {
  const t = now();
  const copy: QuestionBank = { ...src, id: uid('bank'), name: `${src.name} (Version 2)`, questionCount: 0, status: 'ACTIVE', createdBy, createdAt: t, updatedAt: t };
  await repo.put('questionBanks', copy);
  for (const q of await bankQuestions(src.id, true)) {
    await repo.put('questionBank', { ...q, id: uid('q'), questionBankId: copy.id, createdBy, createdAt: t, updatedAt: t });
  }
  await recomputeCount(copy.id);
  return copy;
}
export async function archiveBank(id: string): Promise<void> {
  const b = await getBank(id);
  if (b) await repo.put('questionBanks', { ...b, status: 'ARCHIVED', updatedAt: now() });
}
// Hard delete: blocked while any exam references the bank (archive instead).
// The bank row is removed; its questions are KEPT but unassigned (No bank).
export async function deleteBank(id: string): Promise<{ ok: boolean; reason?: string; unassigned?: number }> {
  const b = await getBank(id);
  if (!b) return { ok: false, reason: 'Bank not found.' };
  const usedBy = await repo.query<Exam>('exams', e => e.questionBankId === id);
  if (usedBy.length) return { ok: false, reason: `Used by ${usedBy.length} exam(s) (${usedBy.slice(0, 3).map(e => e.title).join(', ')}${usedBy.length > 3 ? '…' : ''}) — archive this bank instead of deleting it.` };
  let n = 0;
  for (const q of await bankQuestions(id, true)) {
    await repo.put('questionBank', { ...q, questionBankId: undefined, updatedAt: now() });
    n++;
  }
  await repo.remove('questionBanks', id);
  return { ok: true, unassigned: n };
}
// Hard delete questions by id (bulk). Rows are removed permanently;
// affected bank counts are recomputed. Published exams are safe (frozen snapshots).
export async function deleteQuestions(ids: string[]): Promise<{ deleted: number }> {
  const touched = new Set<string>();
  let n = 0;
  for (const id of ids) {
    const q = await repo.get<Question>('questionBank', id);
    if (!q) continue;
    if (q.questionBankId) touched.add(q.questionBankId);
    await repo.remove('questionBank', id);
    n++;
  }
  for (const b of touched) await recomputeCount(b);
  return { deleted: n };
}
// One-time migration: seed DBMS questions -> 'DBMS Question Bank' (linked from
// exam_dbms), any other legacy questions -> 'Legacy Question Bank'.
export async function ensureBankMigration(): Promise<void> {
  if (localStorage.getItem('examora_banks_v1')) return;
  const unassigned = () => repo.query<Question>('questionBank', q => !q.questionBankId);
  let rest = await unassigned();
  if (rest.length) {
    const seedIds = new Set(['q1', 'q2', 'q3', 'q4', 'q5']);
    const seedQs = rest.filter(q => seedIds.has(q.id));
    if (seedQs.length) {
      const dbms = await createBank({ name: 'DBMS Question Bank', description: 'Seeded DBMS mid-term questions', subject: 'DBMS', department: ['CSE'] }, 'u_admin');
      for (const [i, q] of seedQs.entries()) await repo.put('questionBank', { ...q, questionBankId: dbms.id, sourceOrder: q.sourceOrder ?? i + 1 });
      await recomputeCount(dbms.id);
      const ex = await repo.get<Exam>('exams', 'exam_dbms');
      if (ex && !ex.questionBankId) await repo.put('exams', { ...ex, questionBankId: dbms.id, updatedAt: now() });
    }
    rest = await unassigned();
    if (rest.length) {
      const legacy = await createBank({ name: 'Legacy Question Bank', description: 'Questions created before named banks' }, 'system');
      for (const [i, q] of rest.entries()) await repo.put('questionBank', { ...q, questionBankId: legacy.id, sourceOrder: q.sourceOrder ?? i + 1 });
      await recomputeCount(legacy.id);
    }
  }
  localStorage.setItem('examora_banks_v1', '1');
}
// Catch-all bank for imports that were not started from inside a bank
// (imp.bankId empty). Reused by finalImport so approved rows NEVER land bankless.
export async function ensureImportedBank(createdBy = 'system'): Promise<QuestionBank> {
  const found = (await repo.query<QuestionBank>('questionBanks', b => b.name === 'Imported Questions' && b.status === 'ACTIVE'))[0];
  if (found) return found;
  return createBank({ name: 'Imported Questions', description: 'Approved rows from file imports without a target bank', subject: 'General' }, createdBy);
}
// One-time rescue (flag examora_banks_v2): any question row with no
// questionBankId (e.g. approved imports from before target-bank defaulting)
// moves into 'Imported Questions', preserving existing sourceOrder.
// Runs on every app boot until the flag is set, so existing browsers heal.
export async function assignUnbankedToImported(): Promise<{ bankId: string | null; assigned: number }> {
  if (localStorage.getItem('examora_banks_v2')) return { bankId: null, assigned: 0 };
  const orphans = await repo.query<Question>('questionBank', q => !q.questionBankId);
  if (!orphans.length) { localStorage.setItem('examora_banks_v2', '1'); return { bankId: null, assigned: 0 }; }
  const bank = await ensureImportedBank('system');
  for (const [i, q] of orphans.entries()) await repo.put('questionBank', { ...q, questionBankId: bank.id, sourceOrder: q.sourceOrder ?? i + 1, updatedAt: now() });
  await recomputeCount(bank.id);
  localStorage.setItem('examora_banks_v2', '1');
  return { bankId: bank.id, assigned: orphans.length };
}
