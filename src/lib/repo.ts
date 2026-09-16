// Async repository: Supabase when VITE_SUPABASE_URL/KEY are set,
// otherwise the localStorage adapter (same API, offline dev + tests).
// Collection names stay exactly as the app uses them today:
// users | students | exams | questionBank | questionBanks | attempts |
// events | auditLogs | questionImports | importQuestions
// NOTE: `users` (local SHA-login rows) is LOCAL-ONLY — remote auth lives in
// Supabase Auth + profiles, so there is deliberately no users MAP. Pages must
// guard users writes with `if (!isSupabaseConfigured)`.
import { db as local } from './store';
import { supabase, isSupabaseConfigured } from './supabase';

export const useRemote = () => isSupabaseConfigured;

// collection -> { table, toDb, fromDb }
type Map = { table: string; toDb: (o: any) => any; fromDb: (r: any) => any };
const rename = (pairs: Record<string, string>) => ({
  toDb: (o: any) => { const r: any = {}; for (const k of Object.keys(o)) r[pairs[k] ?? k] = o[k]; return r; },
  fromDb: (r: any) => { const o: any = {}; const rev = Object.fromEntries(Object.entries(pairs).map(([a, b]) => [b, a])); for (const k of Object.keys(r)) o[rev[k] ?? k] = r[k]; return o; },
});
const normDept = (d: any): string[] => (Array.isArray(d) ? d : d && d !== 'all' ? [d] : []);
const normYear = (y: any): number | null => (y === 'all' || y == null ? null : Number(y));

const Q = rename({ questionBankId: 'bank_id', correctAnswer: 'correct_answer', needsAnswer: 'needs_answer', sourceImportId: 'source_import_id', sourceOrder: 'source_order', createdBy: 'created_by', createdAt: 'created_at', updatedAt: 'updated_at' });
const E = rename({ durationMin: 'duration_min', startAt: 'start_at', endAt: 'end_at', passwordHash: 'password_hash', totalMarks: 'total_marks', randomizeQuestions: 'randomize_questions', randomizeOptions: 'randomize_options', oneAttemptOnly: 'one_attempt_only', negativeMarking: 'negative_marking', negativeMarks: 'negative_marks', resultsReleaseMode: 'results_release_mode', passPct: 'pass_pct', manualQids: 'manual_qids', questionBankId: 'bank_id', questionSnapshot: 'snapshot', createdBy: 'created_by', createdAt: 'created_at', updatedAt: 'updated_at' });
const A = rename({ studentId: 'student_id', examId: 'exam_id', startedAt: 'started_at', serverDeadline: 'server_deadline', submittedAt: 'submitted_at', questionOrder: 'question_order', optionOrder: 'option_order', currentIndex: 'current_index', totalMarks: 'total_marks', tabSwitchCount: 'tab_switch_count', fsExitCount: 'fs_exit_count', refreshCount: 'refresh_count', netDiscCount: 'net_disc_count', submissionType: 'submission_type', updatedAt: 'updated_at' });

const MAPS: Record<string, Map> = {
  students: {
    table: 'students',
    toDb: (o: any) => ({ id: o.id, student_id: o.studentId, name: o.name, email: o.email, department: o.department ?? '', year: o.year ?? 2, section: o.section ?? 'A', status: o.status ?? 'active', created_at: o.createdAt, updated_at: o.updatedAt }),
    fromDb: (r: any) => ({ id: r.id, studentId: r.student_id, name: r.name, email: r.email, department: r.department, year: r.year, section: r.section, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at }),
  },
  questionBank: {
    table: 'questions',
    toDb: (o: any) => ({ ...Q.toDb(o), options: o.options ?? [], correct_answer: o.correctAnswer ?? null }),
    fromDb: (r: any) => ({ ...Q.fromDb(r), options: r.options ?? [] }),
  },
  questionBankPublic: {
    table: 'questions_public',
    toDb: (o: any) => ({ ...Q.toDb(o), options: o.options ?? [] }),
    fromDb: (r: any) => ({ ...Q.fromDb(r), options: r.options ?? [], correctAnswer: r.correct_answer ?? null }),
  },
  questionBanks: {
    table: 'question_banks',
    toDb: (o: any) => ({ id: o.id, name: o.name, description: o.description ?? '', subject: o.subject ?? 'General', year: normYear(o.year), department: normDept(o.department), section: o.section ?? 'all', question_count: o.questionCount ?? 0, status: o.status ?? 'ACTIVE', created_by: o.createdBy ?? '', created_at: o.createdAt, updated_at: o.updatedAt }),
    fromDb: (r: any) => ({ id: r.id, name: r.name, description: r.description, subject: r.subject, year: r.year ?? 'all', department: r.department ?? [], section: r.section, questionCount: r.question_count, status: r.status, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at }),
  },
  exams: {
    table: 'exams',
    toDb: (o: any) => ({ ...E.toDb(o), year: normYear(o.year), department: normDept(o.department), pool: o.pool ?? null, manual_qids: o.manualQids ?? null, bank_id: o.questionBankId ?? null, snapshot: o.questionSnapshot ?? null }),
    fromDb: (r: any) => { const o = E.fromDb(r) as any; return { ...o, year: r.year ?? 'all', department: r.department ?? [], manualQids: r.manual_qids ?? undefined, questionBankId: r.bank_id ?? undefined, questionSnapshot: r.snapshot ?? undefined }; },
  },
  attempts: {
    table: 'attempts',
    toDb: (o: any) => ({ ...A.toDb(o), submitted_at: o.submittedAt ?? null, score: o.score ?? null, total_marks: o.totalMarks ?? null, pct: o.pct ?? null, submission_type: o.submissionType ?? null }),
    fromDb: (r: any) => { const o = A.fromDb(r) as any; return { ...o, submittedAt: r.submitted_at ?? undefined, score: r.score ?? undefined, totalMarks: r.total_marks ?? undefined, pct: r.pct ?? undefined, submissionType: r.submission_type ?? undefined }; },
  },
  events: {
    table: 'events',
    toDb: (o: any) => ({ id: o.id, attempt_id: o.attemptId, student_id: o.studentId ?? '', exam_id: o.examId ?? '', event_type: o.eventType, timestamp: o.timestamp, metadata: o.metadata ?? {} }),
    fromDb: (r: any) => ({ id: r.id, attemptId: r.attempt_id, studentId: r.student_id, examId: r.exam_id, eventType: r.event_type, timestamp: r.timestamp, metadata: r.metadata ?? {} }),
  },
  auditLogs: {
    table: 'audit_logs',
    toDb: (o: any) => ({ id: o.id, admin_id: o.adminId ?? '', admin_email: o.adminEmail ?? '', action: o.action, target_type: o.targetType ?? '', target_id: o.targetId ?? '', timestamp: o.timestamp, metadata: o.metadata ?? {} }),
    fromDb: (r: any) => ({ id: r.id, adminId: r.admin_id, adminEmail: r.admin_email, action: r.action, targetType: r.target_type, targetId: r.target_id, timestamp: r.timestamp, metadata: r.metadata ?? {} }),
  },
  questionImports: {
    table: 'imports',
    toDb: (o: any) => ({ id: o.id, file_name: o.fileName ?? '', file_type: o.fileType ?? '', status: o.status, bank_id: o.bankId ?? null, counts: { total: o.totalQuestions ?? 0, ready: o.readyQuestions ?? 0, review: o.reviewQuestions ?? 0, rejected: o.rejectedQuestions ?? 0, imported: o.importedQuestions ?? 0, dup: o.duplicateQuestions ?? 0 }, created_by: o.uploadedBy ?? '', created_at: o.createdAt, updated_at: o.updatedAt, data: o }),
    fromDb: (r: any) => ({ ...(r.data ?? {}), id: r.id, status: r.status, bankId: r.bank_id ?? r.data?.bankId }),
  },
  importQuestions: {
    table: 'import_questions',
    toDb: (o: any) => ({ id: o.id, import_id: o.importId, data: o }),
    fromDb: (r: any) => ({ ...(r.data ?? {}), id: r.id, importId: r.import_id }),
  },
};

export const repo = {
  async all<T>(c: string): Promise<T[]> {
    if (!isSupabaseConfigured) return local.all<T>(c);
    const m = MAPS[c]; if (!m) throw new Error(`repo: unknown collection ${c}`);
    const { data, error } = await supabase().from(m.table).select('*');
    if (error) throw error;
    return (data ?? []).map(m.fromDb) as T[];
  },
  async get<T extends { id: string }>(c: string, idv: string): Promise<T | undefined> {
    if (!isSupabaseConfigured) return local.get<T>(c, idv);
    const m = MAPS[c]; if (!m) throw new Error(`repo: unknown collection ${c}`);
    const { data, error } = await supabase().from(m.table).select('*').eq('id', idv).maybeSingle();
    if (error) throw error;
    return data ? (m.fromDb(data) as T) : undefined;
  },
  async put<T>(c: string, v: T): Promise<void> {
    if (!isSupabaseConfigured) { local.put(c, v); return; }
    const m = MAPS[c]; if (!m) throw new Error(`repo: unknown collection ${c}`);
    const { error } = await supabase().from(m.table).upsert(m.toDb(v as any), { onConflict: 'id' });
    if (error) throw error;
  },
  async remove(c: string, idv: string): Promise<void> {
    if (!isSupabaseConfigured) { local.remove(c, idv); return; }
    const m = MAPS[c]; if (!m) throw new Error(`repo: unknown collection ${c}`);
    const { error } = await supabase().from(m.table).delete().eq('id', idv);
    if (error) throw error;
  },
  async query<T>(c: string, fn: (x: T) => boolean): Promise<T[]> {
    return (await this.all<T>(c)).filter(fn);
  },
};
