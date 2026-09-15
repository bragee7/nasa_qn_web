export type Role = 'student' | 'super_admin';
export type ExamStatus = 'DRAFT'|'SCHEDULED'|'ACTIVE'|'COMPLETED'|'ARCHIVED';
export type AttemptStatus = 'IN_PROGRESS'|'SUBMITTED'|'AUTO_SUBMITTED';
export type QType = 'MCQ_SINGLE'|'MCQ_MULTIPLE'|'TRUE_FALSE'|'SHORT_ANSWER';
export type Difficulty = 'Easy'|'Medium'|'Hard';
export interface Student { id: string; studentId: string; name: string; email: string; uid?: string; department: string; year: number; section: string; status: 'active'|'disabled'; createdAt: number; updatedAt: number; }
export interface Exam { id: string; title: string; description: string; subject: string; department: string[] | string; year: number|'all'; section: string; durationMin: number; startAt: number; endAt: number; passwordHash: string; status: ExamStatus; totalMarks: number; randomizeQuestions: boolean; randomizeOptions: boolean; oneAttemptOnly: boolean; negativeMarking: boolean; negativeMarks: number; resultsReleaseMode: 'IMMEDIATE'|'MANUAL_RELEASE'|'SCHEDULED_RELEASE'; passPct: number; pool?: { easy: number; medium: number; hard: number }; manualQids?: string[]; questionBankId?: string; questionSnapshot?: SafeQuestion[]; createdBy: string; createdAt: number; updatedAt: number; }
export interface Question { id: string; text: string; type: QType; subject: string; topic: string; difficulty: Difficulty; options: string[]; correctAnswer: number | number[] | boolean | string | null; needsAnswer?: boolean; sourceImportId?: string; sourceOrder?: number; questionBankId?: string; marks: number; explanation?: string; status: 'active'|'archived'; createdBy: string; createdAt: number; updatedAt: number; }
export type BankStatus = 'ACTIVE'|'ARCHIVED';
export interface QuestionBank { id: string; name: string; description: string; subject: string; year: number|'all'; department: string[]; section: string; questionCount: number; status: BankStatus; createdBy: string; createdAt: number; updatedAt: number; }
// Safe snapshot sent to students (NO correctAnswer/explanation)
export interface SafeQuestion { qid: string; text: string; type: QType; options: string[]; marks: number; }
export interface Attempt { id: string; studentId: string; uid: string; examId: string; status: AttemptStatus; startedAt: number; serverDeadline: number; submittedAt?: number; questionOrder: string[]; optionOrder: Record<string, number[]>; currentIndex: number; answers: Record<string, any>; score?: number; totalMarks?: number; pct?: number; tabSwitchCount: number; fsExitCount: number; refreshCount: number; netDiscCount: number; submissionType?: 'MANUAL'|'AUTO'; updatedAt: number; }
export interface ExamEvent { id: string; attemptId: string; studentId: string; examId: string; eventType: string; timestamp: number; metadata?: Record<string, any>; }
export interface AuditLog { id: string; adminId: string; adminEmail: string; action: string; targetType: string; targetId: string; timestamp: number; metadata?: Record<string, any>; }
