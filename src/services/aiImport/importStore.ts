// Import persistence: `questionImports` records + `importQuestions` staged rows.
// Staged rows live OUTSIDE `questionBank` — nothing reaches production data
// without explicit staff approval (spec §41).
import { db } from '../../lib/store';
import type { ImportRecord, ImportStatus, StagedQuestion } from './types';

const IMPORTS = 'questionImports';
const STAGED = 'importQuestions';

function writeAudit(action: string, adminId: string, adminEmail: string, importId: string, extra: Record<string, unknown> = {}) {
  const l = db.all<any>('auditLogs');
  l.push({
    id: crypto.randomUUID(), adminId, adminEmail, action,
    targetType: 'question_import', targetId: importId, timestamp: Date.now(), metadata: extra,
  });
  localStorage.setItem('examora_auditLogs', JSON.stringify(l));
}

export const auditImport = writeAudit;

export function createImport(rec: Omit<ImportRecord, 'createdAt' | 'updatedAt'>): ImportRecord {
  const full: ImportRecord = { ...rec, createdAt: Date.now(), updatedAt: Date.now() };
  db.put(IMPORTS, full);
  return full;
}

export function updateImport(id: string, patch: Partial<ImportRecord>): ImportRecord | undefined {
  const cur = db.all<ImportRecord>(IMPORTS).find(r => r.id === id);
  if (!cur) return undefined;
  const next = { ...cur, ...patch, updatedAt: Date.now() };
  db.put(IMPORTS, next);
  return next;
}

export function getImport(id: string): ImportRecord | undefined {
  return db.all<ImportRecord>(IMPORTS).find(r => r.id === id);
}

export function listImports(): ImportRecord[] {
  return db.all<ImportRecord>(IMPORTS).sort((a, b) => b.createdAt - a.createdAt);
}

/** Bulk insert (single write — avoids O(n²) localStorage churn on big files). */
export function addStagedBulk(rows: StagedQuestion[]) {
  if (!rows.length) return;
  const all = db.all<StagedQuestion>(STAGED);
  all.push(...rows);
  localStorage.setItem('examora_' + STAGED, JSON.stringify(all));
}

export function stagedForImport(importId: string): StagedQuestion[] {
  return db.all<StagedQuestion>(STAGED).filter(q => q.importId === importId);
}

export function updateStaged(q: StagedQuestion) {
  db.put(STAGED, { ...q, updatedAt: Date.now() });
}

export function removeStaged(id: string) {
  db.remove(STAGED, id);
}

/** Delete an import + its staged rows (secure deletion for failed/cancelled work). */
export function deleteImport(id: string) {
  const keep = db.all<StagedQuestion>(STAGED).filter(q => q.importId !== id);
  localStorage.setItem('examora_' + STAGED, JSON.stringify(keep));
  db.remove(IMPORTS, id);
}

export function setImportStatus(id: string, status: ImportStatus, patch: Partial<ImportRecord> = {}) {
  updateImport(id, { ...patch, status });
}

/** Recompute summary counters from staged rows. */
export function refreshImportCounters(id: string): ImportRecord | undefined {
  const rows = stagedForImport(id);
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
