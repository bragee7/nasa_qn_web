// Import persistence: `questionImports` records + `importQuestions` staged rows.
// Staged rows live OUTSIDE `questionBank` — nothing reaches production data
// without explicit staff approval (spec §41).
import { repo } from '../../lib/repo';
import { audit } from '../../lib/audit';
import type { ImportRecord, ImportStatus, StagedQuestion } from './types';

const IMPORTS = 'questionImports';
const STAGED = 'importQuestions';

export async function auditImport(action: string, adminId: string, adminEmail: string, importId: string, extra: Record<string, unknown> = {}) {
  void adminId; void adminEmail;
  await audit(action, importId, extra, 'question_import');
}

export async function createImport(rec: Omit<ImportRecord, 'createdAt' | 'updatedAt'>): Promise<ImportRecord> {
  const full: ImportRecord = { ...rec, createdAt: Date.now(), updatedAt: Date.now() };
  await repo.put(IMPORTS, full);
  return full;
}

export async function updateImport(id: string, patch: Partial<ImportRecord>): Promise<ImportRecord | undefined> {
  const cur = await repo.get<ImportRecord>(IMPORTS, id);
  if (!cur) return undefined;
  const next = { ...cur, ...patch, updatedAt: Date.now() };
  await repo.put(IMPORTS, next);
  return next;
}

export async function getImport(id: string): Promise<ImportRecord | undefined> {
  return repo.get<ImportRecord>(IMPORTS, id);
}

export async function listImports(): Promise<ImportRecord[]> {
  return (await repo.all<ImportRecord>(IMPORTS)).sort((a, b) => b.createdAt - a.createdAt);
}

/** Bulk insert of staged rows. */
export async function addStagedBulk(rows: StagedQuestion[]) {
  for (const r of rows) await repo.put(STAGED, r);
}

export async function stagedForImport(importId: string): Promise<StagedQuestion[]> {
  return repo.query<StagedQuestion>(STAGED, q => q.importId === importId);
}

export async function updateStaged(q: StagedQuestion) {
  await repo.put(STAGED, { ...q, updatedAt: Date.now() });
}

export async function removeStaged(id: string) {
  await repo.remove(STAGED, id);
}

/** Delete an import + its staged rows (secure deletion for failed/cancelled work). */
export async function deleteImport(id: string) {
  for (const q of await stagedForImport(id)) await repo.remove(STAGED, q.id);
  await repo.remove(IMPORTS, id);
}

export async function setImportStatus(id: string, status: ImportStatus, patch: Partial<ImportRecord> = {}) {
  await updateImport(id, { ...patch, status });
}

/** Recompute summary counters from staged rows. */
export async function refreshImportCounters(id: string): Promise<ImportRecord | undefined> {
  const rows = await stagedForImport(id);
  const count = (s: StagedQuestion['status']) => rows.filter(q => q.status === s).length;
  return updateImport(id, {
    totalQuestions: rows.length,
    readyQuestions: count('READY'),
    reviewQuestions: rows.filter(q => q.status === 'NEEDS_REVIEW').length,
    rejectedQuestions: count('REJECTED'),
    importedQuestions: count('IMPORTED'),
    duplicateQuestions: rows.filter(q => q.duplicate && !q.duplicateDecision).length,
  });
}

export { IMPORTS, STAGED };
export type { ImportStatus };

/**
 * Who may upload / review / approve question imports.
 * Today: Super Admin only. Future `question_manager` / staff role plugs in
 * here WITHOUT touching routes or pages (spec §40) — just extend this check.
 * Staff must NOT get student management, result export, or security settings.
 */
export function canManageQuestions(role?: string): boolean {
  return role === 'super_admin';
}
