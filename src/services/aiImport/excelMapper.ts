// Excel/CSV → staged questions: header-alias auto-mapping + row conversion.
// Column variations (spec §4), e.g. 'Question Text'/'Question_Text' → text,
// 'Correct Answer'/'Ans'/'Key' → answer, are resolved through alias tables.
// When auto-mapping is uncertain the UI shows the mapping screen for staff.
import type { CanonicalField, ColumnMapping, StagedQuestion } from './types';
export type { CanonicalField, ColumnMapping };
import { parseAnswerValue, validateStaged, suggestSubjectTopic, suggestDifficulty, normalize } from './pdfParser';

export const FIELD_LABELS: Record<CanonicalField, string> = {
  text: 'Question', optionA: 'Option A', optionB: 'Option B', optionC: 'Option C',
  optionD: 'Option D', optionE: 'Option E', answer: 'Answer', marks: 'Marks',
  subject: 'Subject', topic: 'Topic', difficulty: 'Difficulty', type: 'Type',
};

const ALIASES: Record<CanonicalField, string[]> = {
  text: ['question', 'questiontext', 'question_text', 'questiondescription', 'questiontitle', 'q', 'qtext', 'problem', 'statement'],
  optionA: ['optiona', 'option_a', 'a', 'choicea', 'choice1', 'opta', 'opt1'],
  optionB: ['optionb', 'option_b', 'b', 'choiceb', 'choice2', 'optb', 'opt2'],
  optionC: ['optionc', 'option_c', 'c', 'choicec', 'choice3', 'optc', 'opt3'],
  optionD: ['optiond', 'option_d', 'd', 'choiced', 'choice4', 'optd', 'opt4'],
  optionE: ['optione', 'option_e', 'e', 'choicee', 'choice5', 'opte', 'opt5'],
  answer: ['answer', 'correctanswer', 'correct_answer', 'ans', 'key', 'answerkey', 'correct', 'correctoption', 'solution'],
  marks: ['marks', 'mark', 'score', 'points', 'weightage', 'maxmarks'],
  subject: ['subject', 'course', 'paper'],
  topic: ['topic', 'chapter', 'unit', 'module'],
  difficulty: ['difficulty', 'level', 'difficultylevel'],
  type: ['type', 'questiontype', 'qtype', 'format'],
};

const normHeader = (h: string) => (h || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export const REQUIRED_FIELDS: CanonicalField[] = ['text'];

/** Auto-map headers → canonical fields. `uncertain` when a required field is unmapped. */
export function autoMapColumns(headers: string[]): { mapping: ColumnMapping[]; uncertain: boolean; unmappedRequired: CanonicalField[] } {
  const used = new Set<string>();
  const fields: CanonicalField[] = ['text', 'optionA', 'optionB', 'optionC', 'optionD', 'optionE', 'answer', 'marks', 'subject', 'topic', 'difficulty', 'type'];
  const mapping: ColumnMapping[] = fields.map(field => {
    const aliases = ALIASES[field];
    let header: string | null = null;
    for (const h of headers) {
      if (used.has(h)) continue;
      if (aliases.includes(normHeader(h))) { header = h; used.add(h); break; }
    }
    return { field, header, auto: header != null };
  });
  const unmappedRequired = REQUIRED_FIELDS.filter(f => !mapping.find(m => m.field === f)?.header);
  return { mapping, uncertain: unmappedRequired.length > 0, unmappedRequired };
}

let stagedSeq = 100000;

export function rowToStaged(
  values: Record<string, string>,
  mapping: ColumnMapping[],
  ctx: { importId: string; fileName: string; sheet: string | null; rowNumber: number },
): StagedQuestion | null {
  const get = (f: CanonicalField): string => {
    const m = mapping.find(x => x.field === f);
    if (!m?.header) return '';
    return (values[m.header] ?? '').toString().trim();
  };
  const text = get('text');
  if (!text) return null; // skip blank rows silently

  const optTexts = [get('optionA'), get('optionB'), get('optionC'), get('optionD'), get('optionE')];
  const labels = ['A', 'B', 'C', 'D', 'E'];
  const options = optTexts
    .map((t, i) => ({ label: labels[i], text: t }))
    .filter(o => o.text !== '');

  let type = (get('type') || '').toUpperCase().replace(/[\s-]+/g, '_');
  const typeMap: Record<string, StagedQuestion['type']> = {
    MCQ_SINGLE: 'MCQ_SINGLE', MCQ: 'MCQ_SINGLE', SINGLE: 'MCQ_SINGLE',
    MCQ_MULTIPLE: 'MCQ_MULTIPLE', MULTIPLE: 'MCQ_MULTIPLE', MULTI: 'MCQ_MULTIPLE', MSQ: 'MCQ_MULTIPLE',
    TRUE_FALSE: 'TRUE_FALSE', TRUEFALSE: 'TRUE_FALSE', TF: 'TRUE_FALSE', BOOLEAN: 'TRUE_FALSE',
    SHORT_ANSWER: 'SHORT_ANSWER', SHORT: 'SHORT_ANSWER', DESCRIPTIVE: 'SHORT_ANSWER', TEXT: 'SHORT_ANSWER', FILL: 'SHORT_ANSWER',
  };
  let qtype: StagedQuestion['type'] = typeMap[type] ?? (
    options.length === 0 ? 'SHORT_ANSWER'
    : options.length === 2 && options.every(o => /^(true|false)$/i.test(o.text)) ? 'TRUE_FALSE'
    : 'MCQ_SINGLE'
  );

  const answerRaw = get('answer');
  const pa = parseAnswerValue(answerRaw, options);
  const notes: string[] = [];
  let correctLabels = pa.labels;
  let answerConfidence: StagedQuestion['answerConfidence'] = 'UNKNOWN';
  let answerSource = 'Missing — staff must enter or approve an AI suggestion';
  let expectedText: string | null = null;
  if (answerRaw) {
    if (pa.labels.length > 0) {
      answerConfidence = 'HIGH';
      answerSource = `Explicit “${answerRaw}” (row ${ctx.rowNumber})`;
      if (pa.kind === 'index') notes.push('Answer given as an option number — mapped to that option; please verify.');
    } else if (qtype === 'SHORT_ANSWER' && pa.freeText) {
      answerConfidence = 'MEDIUM';
      answerSource = `Expected answer text “${pa.freeText}” (row ${ctx.rowNumber})`;
      expectedText = pa.freeText;
    } else {
      answerConfidence = 'LOW';
      answerSource = `Unrecognized answer “${answerRaw}” (row ${ctx.rowNumber})`;
      notes.push(`Could not map answer “${answerRaw}” to an option — staff must fix.`);
    }
  } else {
    notes.push('Answer not found in source — NOT guessed. Staff must enter it or approve an AI suggestion.');
  }
  if (qtype !== 'SHORT_ANSWER' && correctLabels.length > 1) qtype = 'MCQ_MULTIPLE';

  let marks = Number(get('marks'));
  if (!(marks > 0)) { marks = 1; notes.push('Marks not found — defaulted to 1. Adjust if needed.'); }

  const colSubject = get('subject');
  const colTopic = get('topic');
  const st = suggestSubjectTopic(`${text} ${options.map(o => o.text).join(' ')}`);
  const colDiff = get('difficulty').toLowerCase();
  const difficulty = colDiff.startsWith('e') ? 'Easy' : colDiff.startsWith('h') ? 'Hard' : colDiff.startsWith('m') ? 'Medium' : suggestDifficulty(text, qtype).difficulty;

  const q: StagedQuestion = {
    id: `staged_${Date.now().toString(36)}_${stagedSeq++}`,
    importId: ctx.importId,
    order: 0, // assigned by the provider (file sequence)
    sourceQuestionNumber: null,
    sourcePage: null,
    sourceRow: ctx.rowNumber,
    sourceSheet: ctx.sheet,
    text,
    type: qtype,
    options,
    correctLabels,
    aiSuggested: false,
    marks,
    subject: colSubject || (st.subject === 'General' ? '' : st.subject),
    topic: colTopic || (st.topic === 'General' ? '' : st.topic),
    difficulty: difficulty as StagedQuestion['difficulty'],
    difficultyConfidence: colSubject || /^[ehm]/i.test(get('difficulty')) ? 95 : 50,
    extractionConfidence: 'HIGH',
    answerConfidence,
    answerSource,
    status: 'READY',
    reviewNotes: notes,
    duplicate: null,
    duplicateDecision: null,
    validationErrors: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  if (qtype === 'SHORT_ANSWER' && expectedText) {
    q.reviewNotes.push(`Expected answer: “${expectedText}”. It will be stored for exact-match grading.`);
    q.expectedText = expectedText;
  }
  q.validationErrors = validateStaged(q, expectedText);
  if (q.validationErrors.length > 0 || q.answerConfidence === 'UNKNOWN') q.status = 'NEEDS_REVIEW';
  void normalize;
  return q;
}
