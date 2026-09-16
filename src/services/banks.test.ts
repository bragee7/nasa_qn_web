import { describe, it, expect, beforeEach, vi } from 'vitest';

// Force Supabase off so repo.ts uses the localStorage fallback.
vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: false,
  supabase: () => null,
}));

// In-memory localStorage for the node test env (store.ts touches it lazily).
const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => { mem.set(k, String(v)); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => mem.clear(),
};
import { db } from '../lib/store';
import {
  allBanks, bankQuestions, recomputeCount, createBank, duplicateBank,
  archiveBank, deleteBank, deleteQuestions, ensureBankMigration, snapshotBank, getBank,
  ensureImportedBank, assignUnbankedToImported,
} from './banks';

function mkQ(id: string, bankId: string | undefined, order: number | undefined, text = 'q', active = true): any {
  return {
    id, text: `${text}-${id}`, type: 'MCQ_SINGLE', subject: 'DBMS', topic: 'T',
    difficulty: 'Medium', options: ['a', 'b', 'c', 'd'], correctAnswer: 0,
    marks: 2, status: active ? 'active' : 'archived',
    ...(bankId ? { questionBankId: bankId } : {}),
    ...(order !== undefined ? { sourceOrder: order } : {}),
    createdBy: 'u', createdAt: 1, updatedAt: 1,
  };
}

beforeEach(() => { mem.clear(); });

describe('named question banks', () => {
  it('createBank registers an ACTIVE bank with count 0', async () => {
    const b = await createBank({ name: 'Physics Bank', subject: 'Physics' }, 'u_admin');
    expect(b.status).toBe('ACTIVE');
    expect(b.questionCount).toBe(0);
    expect((await allBanks(false)).map(x => x.id)).toContain(b.id);
  });

  it('bankQuestions returns file order (sourceOrder), actives only', async () => {
    const b = await createBank({ name: 'B' }, 'u');
    db.put('questionBank', mkQ('q3', b.id, 3));
    db.put('questionBank', mkQ('q1', b.id, 1));
    db.put('questionBank', mkQ('q2', b.id, 2));
    db.put('questionBank', mkQ('qx', b.id, 0, 'archived', false));
    expect((await bankQuestions(b.id)).map(q => q.id)).toEqual(['q1', 'q2', 'q3']);
  });

  it('recomputeCount counts active rows only', async () => {
    const b = await createBank({ name: 'B' }, 'u');
    db.put('questionBank', mkQ('q1', b.id, 1));
    db.put('questionBank', mkQ('qx', b.id, 2, 'archived', false));
    expect(await recomputeCount(b.id)).toBe(1);
  });

  it('snapshotBank freezes file-ordered SafeQuestions', async () => {
    const b = await createBank({ name: 'B' }, 'u');
    db.put('questionBank', mkQ('q2', b.id, 2));
    db.put('questionBank', mkQ('q1', b.id, 1));
    const snap = await snapshotBank(b.id);
    expect(snap.map(s => s.qid)).toEqual(['q1', 'q2']);
    expect(snap[0]).toMatchObject({ text: 'q-q1', options: ['a', 'b', 'c', 'd'], marks: 2 });
  });

  it('published snapshot is isolated from later bank edits', async () => {
    const b = await createBank({ name: 'B' }, 'u');
    db.put('questionBank', mkQ('q1', b.id, 1));
    const snap = await snapshotBank(b.id);
    db.put('questionBank', { ...mkQ('q1', b.id, 1), text: 'EDITED AFTER PUBLISH' });
    expect(snap[0].text).toBe('q-q1');
    expect((await snapshotBank(b.id))[0].text).toBe('EDITED AFTER PUBLISH');
  });

  it('duplicateBank makes an independent copy named Version 2', async () => {
    const b = await createBank({ name: 'Orig' }, 'u');
    db.put('questionBank', mkQ('q1', b.id, 1));
    await recomputeCount(b.id);
    const copy = await duplicateBank(b, 'u');
    expect(copy.name).toBe('Orig (Version 2)');
    expect(copy.id).not.toBe(b.id);
    // duplicateBank returns the pre-count object; the stored row carries the count
    expect((await getBank(copy.id))!.questionCount).toBe(1);
    const copyQs = await bankQuestions(copy.id, true);
    expect(copyQs).toHaveLength(1);
    expect(copyQs[0].id).not.toBe('q1');
    expect(copyQs[0].sourceOrder).toBe(1);
    // independence: editing the copy leaves the original intact
    db.put('questionBank', { ...copyQs[0], text: 'CHANGED' });
    expect((await bankQuestions(b.id, true))[0].text).toBe('q-q1');
  });

  it('archiveBank hides from default listing but keeps rows', async () => {
    const b = await createBank({ name: 'B' }, 'u');
    db.put('questionBank', mkQ('q1', b.id, 1));
    await archiveBank(b.id);
    expect((await allBanks(false)).map(x => x.id)).not.toContain(b.id);
    expect((await allBanks(true)).map(x => x.id)).toContain(b.id);
    expect(await bankQuestions(b.id)).toHaveLength(1); // questions kept, not deleted
  });

  it('ensureBankMigration groups seed + legacy rows and is idempotent', async () => {
    db.put('questionBank', mkQ('q1', undefined, undefined));
    db.put('questionBank', mkQ('q9', undefined, undefined));
    db.put('exams', { id: 'exam_dbms', title: 'E', manualQids: ['q1'] } as any);
    await ensureBankMigration();
    const banks = await allBanks(false);
    const dbms = banks.find(b => b.name === 'DBMS Question Bank');
    const legacy = banks.find(b => b.name === 'Legacy Question Bank');
    expect(dbms).toBeDefined();
    expect(legacy).toBeDefined();
    expect((await bankQuestions(dbms!.id)).map(q => q.id)).toEqual(['q1']);
    expect((await bankQuestions(legacy!.id)).map(q => q.id)).toEqual(['q9']);
    expect((db.get<any>('exams', 'exam_dbms') as any).questionBankId).toBe(dbms!.id);
    const n = (await allBanks(false)).length;
    await ensureBankMigration(); // second run: no duplicates
    expect((await allBanks(false))).toHaveLength(n);
  });

  it('deleteBank removes the bank but keeps its questions unassigned', async () => {
    const b = await createBank({ name: 'Doomed' }, 'u');
    db.put('questionBank', mkQ('q1', b.id, 1));
    db.put('questionBank', mkQ('q2', b.id, 2));
    const r = await deleteBank(b.id);
    expect(r.ok).toBe(true);
    expect(r.unassigned).toBe(2);
    expect(await getBank(b.id)).toBeUndefined();
    // questions kept, moved to No bank
    expect((db.get<any>('questionBank', 'q1') as any).questionBankId).toBeUndefined();
    expect((db.get<any>('questionBank', 'q2') as any).questionBankId).toBeUndefined();
  });

  it('deleteBank is blocked while an exam uses the bank', async () => {
    const b = await createBank({ name: 'InUse' }, 'u');
    db.put('questionBank', mkQ('q1', b.id, 1));
    db.put('exams', { id: 'e1', title: 'Midterm', questionBankId: b.id } as any);
    const r = await deleteBank(b.id);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/archive/i);
    expect(await getBank(b.id)).toBeDefined(); // bank kept
    expect(await bankQuestions(b.id)).toHaveLength(1); // questions untouched
  });

  it('deleteBank on an unknown id fails gracefully', async () => {
    expect((await deleteBank('nope')).ok).toBe(false);
  });

  it('deleteQuestions removes selected rows and recomputes counts', async () => {
    const b = await createBank({ name: 'B' }, 'u');
    db.put('questionBank', mkQ('q1', b.id, 1));
    db.put('questionBank', mkQ('q2', b.id, 2));
    db.put('questionBank', mkQ('q3', b.id, 3));
    await recomputeCount(b.id);
    const r = await deleteQuestions(['q1', 'q3']);
    expect(r.deleted).toBe(2);
    expect(db.get<any>('questionBank', 'q1')).toBeUndefined();
    expect((await bankQuestions(b.id, true)).map(q => q.id)).toEqual(['q2']);
    expect((await getBank(b.id))!.questionCount).toBe(1);
  });

  it('deleteQuestions ignores unknown ids and other-bank rows stay', async () => {
    const a = await createBank({ name: 'A' }, 'u');
    const b = await createBank({ name: 'B' }, 'u');
    db.put('questionBank', mkQ('qa', a.id, 1));
    db.put('questionBank', mkQ('qb', b.id, 1));
    const r = await deleteQuestions(['qa', 'ghost']);
    expect(r.deleted).toBe(1);
    expect((await bankQuestions(b.id, true)).map(q => q.id)).toEqual(['qb']);
  });

  it('ensureImportedBank reuses the existing ACTIVE Imported Questions bank', async () => {
    const first = await ensureImportedBank('u');
    const second = await ensureImportedBank('u');
    expect(first.id).toBe(second.id);
    expect((await allBanks(false)).filter(b => b.name === 'Imported Questions')).toHaveLength(1);
  });

  it('assignUnbankedToImported rescues bankless rows, preserves order, is idempotent', async () => {
    // an already-approved import with no target bank leaves bankless rows
    db.put('questionBank', mkQ('orph1', undefined, 2));
    db.put('questionBank', mkQ('orph2', undefined, undefined));
    const keep = await createBank({ name: 'Keep' }, 'u');
    db.put('questionBank', mkQ('mine', keep.id, 1));
    const r = await assignUnbankedToImported();
    expect(r.assigned).toBe(2);
    const rescued = await bankQuestions(r.bankId!);
    expect(rescued.map(q => q.id)).toEqual(['orph1', 'orph2']); // existing sourceOrder kept
    expect((await getBank(r.bankId!))!.questionCount).toBe(2);
    expect((await bankQuestions(keep.id)).map(q => q.id)).toEqual(['mine']); // untouched
    const again = await assignUnbankedToImported(); // flag set: no-op
    expect(again.assigned).toBe(0);
    expect((await allBanks(false)).filter(b => b.name === 'Imported Questions')).toHaveLength(1);
  });
});
