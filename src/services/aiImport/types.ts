// AI-assisted question import: shared types.
// Core rule: AI extraction NEVER publishes directly — staged rows enter the
// production questionBank only after explicit staff approval in the review UI.
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
export type ImportStatus =
  | 'UPLOADED' | 'PROCESSING' | 'REVIEW' | 'APPROVED'
  | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type StagedStatus = 'READY' | 'NEEDS_REVIEW' | 'APPROVED' | 'REJECTED' | 'IMPORTED';
export type ImportQuestionType = 'MCQ_SINGLE' | 'MCQ_MULTIPLE' | 'TRUE_FALSE' | 'SHORT_ANSWER';
export type FileKind = 'pdf' | 'docx' | 'xlsx' | 'xls' | 'csv';

export interface ExtractedOption { label: string; text: string; }

export interface DuplicateHit {
  existingId: string;
  existingText: string;
  similarity: number; // 0-100
}

export interface StagedQuestion {
  id: string;
  importId: string;
  /** 1-based position in the source file — the review UI sorts by this so the
   *  file's question order is preserved end-to-end. */
  order: number;
  /** True when the admin chose “I'll assign answers myself later”: missing
   *  answers are deferred, not errors, until staff set them in the bank. */
  answerDeferred?: boolean;
  sourceQuestionNumber: number | null;
  sourcePage: number | null;   // PDF page (1-based)
  sourceRow: number | null;    // Excel/CSV row (1-based incl. header)
  sourceSheet: string | null;  // Excel sheet name
  text: string;
  type: ImportQuestionType;
  options: ExtractedOption[];
  /** Labels exactly as found in the source, e.g. ['B']. Empty = not found (NEVER guessed). */
  correctLabels: string[];
  /** Expected answer text for SHORT_ANSWER (exact-match grading). */
  expectedText?: string | null;
  /** True when the current correctLabels came from an AI suggestion approved by staff. */
  aiSuggested: boolean;
  marks: number;
  subject: string;
  topic: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  difficultyConfidence: number; // 0-100, suggestion only
  extractionConfidence: Confidence;
  answerConfidence: Confidence;
  /** Human-readable provenance, e.g. 'Explicit "Answer: B" (page 2)'. */
  answerSource: string;
  status: StagedStatus;
  reviewNotes: string[];
  duplicate: DuplicateHit | null;
  duplicateDecision: 'KEEP_BOTH' | 'SKIP' | null;
  validationErrors: string[];
  editedBy?: string;
  approvedBy?: string;
  approvedAt?: number;
  importedQuestionId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ImportRecord {
  id: string;
  fileName: string;
  fileType: FileKind;
  fileSize: number;
  uploadedBy: string;
  uploadedByEmail: string;
  uploadedAt: number;
  provider: string; // extraction provider id, e.g. 'local'
  pageCount?: number;
  sheetName?: string;
  totalQuestions: number;
  readyQuestions: number;
  reviewQuestions: number;
  rejectedQuestions: number;
  importedQuestions: number;
  duplicateQuestions: number;
  status: ImportStatus;
  errorReport: string[];
  /** Target named bank when launched via “Import Into Bank” (?bank=). Final import tags rows with this bank. */
  bankId?: string;
  createdAt: number;
  updatedAt: number;
}

export type CanonicalField =
  | 'text' | 'optionA' | 'optionB' | 'optionC' | 'optionD' | 'optionE'
  | 'answer' | 'marks' | 'subject' | 'topic' | 'difficulty' | 'type';

export interface ColumnMapping { field: CanonicalField; header: string | null; auto: boolean; }

/** Final bank-ready shape (mirrors questionBank documents). */
export interface BankQuestion {
  id: string;
  text: string;
  type: ImportQuestionType;
  subject: string;
  topic: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  options: string[];
  /** Null = answer not yet assigned by staff (bank shows “missing answer”). */
  correctAnswer: number | number[] | boolean | string | null;
  /** True while correctAnswer is null and staff must still assign A/B/C/D. */
  needsAnswer?: boolean;
  /** Named bank this row was imported into (threaded from ?bank=). */
  questionBankId?: string;
  /** File-order position carried over from the staged row. */
  sourceOrder?: number;
  marks: number;
  status: 'active';
  sourceImportId: string;
  sourceFileName: string;
  sourcePage: number | null;
  sourceRow: number | null;
  sourceSheet: string | null;
  sourceQuestionNumber: number | null;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}
