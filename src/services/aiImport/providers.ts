// Step 4: AI ANALYSIS LAYER — provider abstraction (spec §35/§36).
//
//   QuestionExtractionService
//     ├── LocalHeuristicProvider ('local', default — offline, deterministic,
//     │                           rule-based parsing; never hallucinates)
//     └── CloudProvider ('gemini' | 'openai' | 'ollama' — calls the secure
//                        backend; the browser NEVER holds provider API keys)
//
// Switch providers via Settings or VITE_AI_PROVIDER. Cost control (spec §37):
// spreadsheets are parsed locally first and only ambiguous rows would be sent
// to a cloud model; PDFs are text-extracted (OCR only when needed) and chunked.
import type { BankQuestion, ColumnMapping, ImportQuestionType, StagedQuestion } from './types';
import type { PdfPage } from './pdfParser';
import { applyAnswerDeferral, parseQuestionPaper } from './pdfParser';
import { rowToStaged } from './excelMapper';
import { getAIProvider, type AIProviderId } from './config';

export interface PdfExtractionInput {
  kind: 'pdf-text';
  pages: PdfPage[];
  importId: string;
  fileName: string;
  /** Admin will assign answers later in the bank — import without answers. */
  skipAnswers?: boolean;
}
export interface RowsExtractionInput {
  kind: 'rows';
  rows: { rowNumber: number; values: Record<string, string> }[];
  mapping: ColumnMapping[];
  sheet: string | null;
  importId: string;
  fileName: string;
  /** Admin will assign answers later in the bank — import without answers. */
  skipAnswers?: boolean;
}
export type ExtractionInput = PdfExtractionInput | RowsExtractionInput;

export interface ExtractionResult {
  staged: StagedQuestion[];
  skippedRows: number;
  answerKeyEntries: number;
  warnings: string[];
}

export interface AnswerSuggestion {
  labels: string[];
  rationale: string;
}

export interface QuestionExtractionService {
  readonly id: string;
  readonly label: string;
  extract(input: ExtractionInput): Promise<ExtractionResult>;
  /** Suggest an answer ONLY when asked; local provider declines (never guesses). */
  suggestAnswer(questionText: string, options: { label: string; text: string }[]): Promise<AnswerSuggestion | null>;
}

/** Default offline provider: deterministic rules, zero cost, zero hallucination. */
export class LocalHeuristicProvider implements QuestionExtractionService {
  readonly id = 'local';
  readonly label = 'Local heuristic extraction (offline)';

  async extract(input: ExtractionInput): Promise<ExtractionResult> {
    if (input.kind === 'pdf-text') {
      const parsed = parseQuestionPaper(input.pages, { importId: input.importId, fileName: input.fileName });
      const staged = finalizeOrder(parsed.questions, input.skipAnswers === true);
      return { staged, skippedRows: 0, answerKeyEntries: parsed.answerKeyEntries, warnings: parsed.warnings };
    }
    const staged: StagedQuestion[] = [];
    let skippedRows = 0;
    for (const r of input.rows) {
      const q = rowToStaged(r.values, input.mapping, {
        importId: input.importId, fileName: input.fileName, sheet: input.sheet, rowNumber: r.rowNumber,
      });
      if (q) staged.push(q);
      else skippedRows++;
    }
    return { staged: finalizeOrder(staged, input.skipAnswers === true), skippedRows, answerKeyEntries: 0, warnings: [] };
  }

  async suggestAnswer(): Promise<AnswerSuggestion | null> {
    // The local provider has no language model — it must NOT guess.
    // Staff enter the answer manually, or configure a cloud provider.
    return null;
  }
}

/**
 * Secure-backend provider (spec §24). In production this calls the
 * `analyzeImport` Cloud Function, which holds the vendor API key server-side
 * and enforces the strict-JSON extraction prompt + Zod validation.
 * Until a backend/provider is configured it fails closed with guidance.
 */
export class CloudProvider implements QuestionExtractionService {
  readonly id: AIProviderId;
  readonly label: string;
  constructor(id: AIProviderId) {
    this.id = id;
    this.label = `Cloud extraction via secure backend (${id})`;
  }
  async extract(): Promise<ExtractionResult> {
    throw new Error(
      `Cloud AI provider “${this.id}” is not configured. Set it up in the Cloud Function analyzeImport ` +
      `(see functions/src/imports.ts), or switch back to the local provider in Settings. No data was sent anywhere.`,
    );
  }
  async suggestAnswer(): Promise<AnswerSuggestion | null> {
    throw new Error(`Cloud AI provider “${this.id}” is not configured. Enter the answer manually or configure the provider.`);
  }
}

export function getExtractionService(): QuestionExtractionService {
  const p = getAIProvider();
  if (p === 'local') return new LocalHeuristicProvider();
  return new CloudProvider(p);
}

/** Stamp file-sequence order (1-based, extraction order = file order) and,
 *  when skipAnswers is set, defer missing answers for later bank assignment. */
function finalizeOrder(staged: StagedQuestion[], skipAnswers: boolean): StagedQuestion[] {
  staged.forEach((q, i) => {
    q.order = i + 1;
    if (skipAnswers && q.correctLabels.length === 0 && q.type !== 'SHORT_ANSWER') {
      applyAnswerDeferral(q);
    }
  });
  return staged;
}

/** Map staged labels → production bank correctAnswer format.
 *  Empty labels (deferred answers) → null; bank shows “missing answer”. */
export function toBankCorrectAnswer(
  type: ImportQuestionType,
  options: { label: string; text: string }[],
  labels: string[],
  expectedText?: string,
): number | number[] | boolean | string | null {
  if (labels.length === 0 && type !== 'SHORT_ANSWER') return null;
  if (type === 'TRUE_FALSE') {
    const opt = options.find(o => o.label === labels[0]);
    return /^true$/i.test((opt?.text || '').trim());
  }
  if (type === 'MCQ_MULTIPLE') {
    return labels
      .map(l => options.findIndex(o => o.label === l))
      .filter(i => i >= 0);
  }
  if (type === 'SHORT_ANSWER') return (expectedText || '').trim();
  return options.findIndex(o => o.label === labels[0]);
}
