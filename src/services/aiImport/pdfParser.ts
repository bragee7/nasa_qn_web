// Rule-based question-paper parser (the default "local" extraction provider).
// Pure functions — fully unit-testable, no DOM, no network.
//
// SAFETY RULE (spec §7): answers are NEVER invented. If the source has no
// explicit answer, correctLabels stays empty with answerConfidence 'UNKNOWN'
// and the row is flagged NEEDS_REVIEW for staff.
import type {
  Confidence, ExtractedOption, ImportQuestionType, StagedQuestion,
} from './types';

export interface PdfPage { pageNumber: number; text: string; }

interface Line { page: number; text: string; }

const Q_START = /^\s*(?:Q(?:uestion)?\s*\.?\s*)?(\d{1,3})\s*[.)\-:]\s*(.*)$/;
const OPTION = /^\s*\(?([A-Ea-e])\s*[.)\-:)]\s+(.*)$/;
const ANSWER_LINE = /^\s*(answer|ans\.?|correct(?:\s+answer|\s+option)?|key|solution)\s*[:\-–]\s*(.+)$/i;
const KEY_HEADER = /^\s*(answer\s*key|answers?|key(\s*(to|for|of)\b.*)?|solutions?)\s*[:\-]?\s*$/i;
const KEY_ENTRY = /^\s*(\d{1,3})\s*[.)\-:]\s*(.+)$/;
const KEY_INLINE = /^\s*(\d{1,3})\s+([A-Ea-e](?:\s*[,;/]\s*[A-Ea-e])*)$/;
const KEY_NUM = /^\s*(\d{1,3})\s*$/;
const KEY_LETTERS = /^\s*([A-Ea-e](?:\s*[,;/]\s*[A-Ea-e])*|true|false)\s*$/i;
const EXPLAIN_LINE = /^\s*(logic|explanation|working|reason|note)\s*:/i;
const MARKS_INLINE = /[\[(]?\s*(\d+(?:\.\d+)?)\s*(?:marks?|m)\s*[\])]?/i;
const MARKS_LINE = /^\s*[\[(]?\s*(\d+(?:\.\d+)?)\s*(?:marks?|m)\s*[\])]?\s*$/i;
const CONTINUED = /^\s*(\(?continued\.?\)?|\.\.\.)\s*$/i;
const LETTERS_ONLY = /^[A-Ea-e](?:\s*[,;/\s]\s*[A-Ea-e])*$/;

export type AnswerMatchKind = 'labels' | 'text' | 'boolean' | 'index' | 'none';

export interface ParsedAnswer {
  labels: string[];
  kind: AnswerMatchKind;
  freeText: string | null;
}

/**
 * Split a single line holding MULTIPLE options, e.g. Word-flattened
 * `A) O(n)B) O(n log n)C) O(log n)D) O(n²)`. Returns null unless the line
 * starts with an option marker AND contains 2+ markers forming a consecutive
 * A→B→C… sequence with non-empty text each. The consecutiveness check keeps
 * single options whose text merely mentions another letter (e.g. option A
 * saying “use C) notation”) intact. Pure → unit-tested.
 */
export function splitInlineOptions(trimmedLine: string): { label: string; text: string }[] | null {
  const re = /\(?([A-Ea-e])\s*[.)\-:)]\s+/g;
  const marks: { label: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(trimmedLine)) !== null) {
    marks.push({ label: m[1].toUpperCase(), start: m.index, end: m.index + m[0].length });
  }
  if (marks.length < 2 || marks[0].start !== 0) return null;
  const base = marks[0].label.charCodeAt(0);
  for (let i = 0; i < marks.length; i++) {
    if (marks[i].label.charCodeAt(0) !== base + i) return null;
  }
  const out = marks.map((mk, i) => ({
    label: mk.label,
    text: trimmedLine.slice(mk.end, i + 1 < marks.length ? marks[i + 1].start : undefined).trim(),
  }));
  if (out.some(o => !o.text)) return null;
  return out;
}

/** Map a raw answer string onto option labels. Never throws. */
export function parseAnswerValue(raw: string, options: ExtractedOption[]): ParsedAnswer {
  const v = (raw || '').trim().replace(/\.$/, '');
  if (!v) return { labels: [], kind: 'none', freeText: null };
  const upper = v.toUpperCase();

  // 1) Letter list: "B", "A, C", "A/C", "AC"
  const squished = upper.replace(/[\s,;/|]+/g, '');
  if (/^[A-E]+$/.test(squished) && squished.length <= options.length && squished.length >= 1) {
    const labels = [...new Set(squished.split(''))];
    if (options.length === 0) return { labels, kind: 'labels', freeText: null };
    if (labels.every(l => options.some(o => o.label === l))) {
      return { labels, kind: 'labels', freeText: null };
    }
  }
  if (LETTERS_ONLY.test(v) && options.length > 0) {
    const labels = [...new Set(v.toUpperCase().split(/[\s,;/]+/).filter(Boolean))];
    if (labels.every(l => options.some(o => o.label === l))) {
      return { labels, kind: 'labels', freeText: null };
    }
  }
  // 2) True / False
  if (/^(true|false)$/i.test(v)) {
    const hit = options.find(o => o.text.trim().toLowerCase() === v.toLowerCase());
    if (hit) return { labels: [hit.label], kind: 'boolean', freeText: v };
    return { labels: [], kind: 'boolean', freeText: v };
  }
  // 3) Full option-text match ("Correct: Stack")
  const norm = normalize(v);
  const textHit = options.find(o => normalize(o.text) === norm);
  if (textHit) return { labels: [textHit.label], kind: 'text', freeText: v };
  // 4) 1-based option index ("Answer Key: 2")
  if (/^\d{1,2}$/.test(v)) {
    const n = Number(v);
    if (options.length > 0 && n >= 1 && n <= options.length) {
      return { labels: [options[n - 1].label], kind: 'index', freeText: v };
    }
  }
  // 5) Unrecognized — keep raw text for SHORT_ANSWER style answers.
  return { labels: [], kind: 'none', freeText: v };
}

export function normalize(t: string): string {
  return (t || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// ---- subject / topic / difficulty heuristics (suggestions only) ----
interface Hint { subject: string; topic: string; keywords: string[]; }
const HINTS: Hint[] = [
  { subject: 'DBMS', topic: 'SQL', keywords: ['sql', 'query', 'join', 'select', 'primary key'] },
  { subject: 'DBMS', topic: 'Normalization', keywords: ['normalization', 'normal form', '1nf', '2nf', '3nf', 'bcnf', 'functional dependency'] },
  { subject: 'DBMS', topic: 'Transactions', keywords: ['acid', 'transaction', 'atomicity', 'isolation', 'serializable'] },
  { subject: 'DBMS', topic: 'Indexing', keywords: ['index', 'b-tree', 'btree', 'hash index'] },
  { subject: 'Data Structures', topic: 'Stack', keywords: ['stack', 'lifo'] },
  { subject: 'Data Structures', topic: 'Queue', keywords: ['queue', 'fifo'] },
  { subject: 'Data Structures', topic: 'Linked List', keywords: ['linked list', 'node', 'pointer'] },
  { subject: 'Data Structures', topic: 'Trees', keywords: ['tree', 'binary search', 'bst', 'traversal', 'heap'] },
  { subject: 'Data Structures', topic: 'Graphs', keywords: ['graph', 'bfs', 'dfs', 'dijkstra'] },
  { subject: 'Data Structures', topic: 'Sorting', keywords: ['sort', 'quicksort', 'mergesort', 'complexity'] },
  { subject: 'Operating Systems', topic: 'Processes', keywords: ['process', 'thread', 'scheduling', 'context switch'] },
  { subject: 'Operating Systems', topic: 'Synchronization', keywords: ['deadlock', 'semaphore', 'mutex', 'critical section'] },
  { subject: 'Operating Systems', topic: 'Memory', keywords: ['paging', 'segmentation', 'virtual memory', 'page fault'] },
  { subject: 'Computer Networks', topic: 'General', keywords: ['tcp', 'udp', 'osi', 'routing', 'dns', 'subnet', 'protocol', 'ip address'] },
  { subject: 'Java', topic: 'General', keywords: ['java', 'jvm', 'inheritance', 'polymorphism', 'exception handling'] },
  { subject: 'Python', topic: 'General', keywords: ['python', 'tuple', 'dictionary', 'lambda', 'list comprehension', 'pip'] },
];

export function suggestSubjectTopic(text: string): { subject: string; topic: string; confidence: number } {
  const hay = normalize(` ${text} `);
  let best: Hint | null = null;
  let bestHits = 0;
  for (const h of HINTS) {
    const hits = h.keywords.filter(k => hay.includes(k)).length;
    if (hits > bestHits) { bestHits = hits; best = h; }
  }
  if (!best || bestHits === 0) return { subject: 'General', topic: 'General', confidence: 30 };
  return { subject: best.subject, topic: best.topic, confidence: Math.min(90, 55 + bestHits * 15) };
}

export function suggestDifficulty(text: string, type: ImportQuestionType): { difficulty: 'Easy' | 'Medium' | 'Hard'; confidence: number } {
  const hay = normalize(text);
  if (/\b(define|what is|stands for|which of the following|full form)\b/.test(hay) || text.length < 80) {
    return { difficulty: 'Easy', confidence: 60 };
  }
  if (/\b(analyze|derive|prove|design|compare and contrast|explain in detail|complexity|optimize)\b/.test(hay) || text.length > 300) {
    return { difficulty: 'Hard', confidence: 55 };
  }
  return { difficulty: 'Medium', confidence: 50 };
}

// ---- main entry ----
export interface ParsedPaper {
  questions: StagedQuestion[];
  answerKeyEntries: number;
  warnings: string[];
}

let stagedSeq = 0;

export function parseQuestionPaper(
  pages: PdfPage[],
  ctx: { importId: string; fileName: string },
): ParsedPaper {
  const warnings: string[] = [];
  const lines: Line[] = [];
  for (const p of pages) {
    for (const raw of p.text.split(/\r?\n/)) {
      // preserve LEADING indentation (code alignment); drop trailing space only
      const kept = raw.replace(/[ \t]+$/, '');
      if (!kept.trim() || CONTINUED.test(kept.trim())) continue;
      lines.push({ page: p.pageNumber, text: kept });
    }
  }

  interface Block { qnum: number; page: number; lines: string[]; }
  const blocks: Block[] = [];
  const keyEntries: { qnum: number; raw: string; page: number }[] = [];
  let keyMode = false;
  let pendingKey: number | null = null; // bare table number awaiting its letter(s)
  let current: Block | null = null;

  const flush = () => { if (current) { blocks.push(current); current = null; } };
  const recordKey = (qnum: number, raw: string, page: number) => {
    keyEntries.push({ qnum, raw, page });
  };

  for (const ln of lines) {
    if (KEY_HEADER.test(ln.text)) { flush(); keyMode = true; pendingKey = null; continue; }
    const inlineKey = !keyMode && KEY_INLINE.test(ln.text);
    const mQ = ln.text.match(Q_START);
    if (keyMode) {
      // Word answer-key TABLES flatten to tab-separated (or bare-line) cells:
      // walk each cell pairing a bare number with the letter(s) that follow it.
      const cells = ln.text.split('\t').map(c => c.trim()).filter(Boolean);
      if (cells.length > 1) {
        for (const c of cells) {
          if (KEY_NUM.test(c)) pendingKey = Number(c.match(KEY_NUM)![1]);
          else if (pendingKey != null && KEY_LETTERS.test(c)) {
            recordKey(pendingKey, c.match(KEY_LETTERS)![1], ln.page);
            pendingKey = null;
          }
        }
        continue;
      }
      const mNum = ln.text.match(KEY_NUM);
      if (mNum) { pendingKey = Number(mNum[1]); continue; }
      const mLet = ln.text.match(KEY_LETTERS);
      if (mLet && pendingKey != null) {
        recordKey(pendingKey, mLet[1], ln.page);
        pendingKey = null;
        continue;
      }
      const mK = ln.text.match(KEY_ENTRY);
      if (mK && mK[2].trim().length <= 60) {
        recordKey(Number(mK[1]), mK[2].trim(), ln.page);
        pendingKey = null;
        continue;
      }
      // A long numbered line is a question, not a key entry.
      if (mQ && (mQ[2] || '').trim().length > 40) { keyMode = false; pendingKey = null; }
      else if (mQ && (mQ[2] || '').trim().length === 0) continue;
      else if (!mQ) continue;
      else { keyMode = false; pendingKey = null; }
    } else if (inlineKey) {
      const mK = ln.text.match(KEY_INLINE)!;
      keyEntries.push({ qnum: Number(mK[1]), raw: mK[2].trim(), page: ln.page });
      continue;
    }
    if (mQ) {
      flush();
      current = { qnum: Number(mQ[1]), page: ln.page, lines: [] };
      const rest = (mQ[2] || '').trim();
      if (rest) current.lines.push(rest);
    } else if (current) {
      current.lines.push(ln.text);
    }
    // preamble before the first question is ignored
  }
  flush();

  const questions = blocks.map(b => blockToStaged(b, keyEntries, ctx));
  questions.forEach((q, i) => { q.order = i + 1; }); // document sequence = file order
  // attach key answers where the block itself had none
  for (const q of questions) {
    if (q.correctLabels.length === 0 && q.sourceQuestionNumber != null) {
      const hit = keyEntries.find(k => k.qnum === q.sourceQuestionNumber);
      if (hit) {
        const pa = parseAnswerValue(hit.raw, q.options);
        if (pa.labels.length > 0) {
          q.correctLabels = pa.labels;
          q.answerConfidence = 'MEDIUM';
          q.answerSource = `Answer key “${hit.raw}” (page ${hit.page})`;
          q.reviewNotes.push('Answer taken from the answer-key section — please verify.');
          // the key arrived AFTER block validation: clear the stale missing-answer error
          q.validationErrors = validateStaged(q, q.expectedText ?? null);
        }
      }
    }
    finalizeStatus(q);
  }
  return { questions, answerKeyEntries: keyEntries.length, warnings };
}

function blockToStaged(
  b: { qnum: number; page: number; lines: string[] },
  _key: unknown,
  ctx: { importId: string; fileName: string },
): StagedQuestion {
  const textParts: string[] = [];
  const options: ExtractedOption[] = [];
  let answerRaw: string | null = null;
  let answerPageNote = `page ${b.page}`;
  let marks: number | null = null;
  let marksExplicit = false;

  const pushLine = (rawLn: string) => {
    const t = rawLn.trim();
    if (options.length > 0) options[options.length - 1].text += ' ' + t;
    else textParts.push(rawLn); // raw: keeps code indentation + line breaks
  };

  for (const ln of b.lines) {
    const t = ln.trim();
    const mA = t.match(ANSWER_LINE);
    if (mA) { answerRaw = mA[2].trim(); continue; }
    if (MARKS_LINE.test(t)) {
      const m = t.match(/(\d+(?:\.\d+)?)/)!;
      marks = Number(m[1]); marksExplicit = true; continue;
    }
    // trailing working/explanation lines belong to the stem, never to an option
    if (EXPLAIN_LINE.test(t)) { textParts.push(ln); continue; }
    // one line holding several options (Word-flattened) → split, preserving order
    const inline = splitInlineOptions(t);
    if (inline) {
      for (const o of inline) options.push({ label: o.label, text: o.text });
      continue;
    }
    const mO = t.match(OPTION);
    if (mO && mO[2].trim().length > 0) {
      options.push({ label: mO[1].toUpperCase(), text: mO[2].trim() });
      continue;
    }
    // inline marks, e.g. "…protocol? (2 marks)" or trailing "[2M]"
    const mM = t.match(/[\[(]\s*(\d+(?:\.\d+)?)\s*(?:marks?|m)\s*[\])]\s*$/i);
    let rest = ln;
    if (mM) { marks = Number(mM[1]); marksExplicit = true; rest = t.slice(0, mM.index).trim(); }
    if (rest.trim()) pushLine(rest);
  }

  // True/False normalization: keep explicit True/False options, else infer from text
  // NOTE: text keeps newlines (alignment); \s matches them so detection still works.
  let text = textParts.join('\n').trim();
  const tfMention = /\btrue\s*\/\s*false\b|\bfalse\s*\/\s*true\b/i.test(text);
  if (tfMention && options.length === 0) {
    options.push({ label: 'A', text: 'True' }, { label: 'B', text: 'False' });
    text = text.replace(/\btrue\s*\/\s*false\b|\bfalse\s*\/\s*true\b/i, '').replace(/\n{3,}/g, '\n\n').trim();
  }

  let type: ImportQuestionType = 'MCQ_SINGLE';
  if (options.length === 0) type = 'SHORT_ANSWER';
  else if (options.length === 2 && options.every(o => /^(true|false)$/i.test(o.text.trim()))) type = 'TRUE_FALSE';

  let correctLabels: string[] = [];
  let answerConfidence: Confidence = 'UNKNOWN';
  let answerSource = 'Missing — staff must enter or approve an AI suggestion';
  let freeText: string | null = null;
  const notes: string[] = [];
  if (answerRaw != null) {
    const pa = parseAnswerValue(answerRaw, options);
    freeText = pa.freeText;
    if (pa.labels.length > 0) {
      correctLabels = pa.labels;
      answerConfidence = 'HIGH';
      answerSource = `Explicit “${answerRaw}” (${answerPageNote})`;
      if (pa.kind === 'index') notes.push('Answer given as an option number — mapped to that option; please verify.');
    } else if (type === 'SHORT_ANSWER' && freeText) {
      correctLabels = [];
      answerConfidence = 'MEDIUM';
      answerSource = `Expected answer text “${freeText}” (${answerPageNote})`;
    } else {
      answerConfidence = 'LOW';
      answerSource = `Unrecognized answer “${answerRaw}” (${answerPageNote})`;
      notes.push(`Could not map answer “${answerRaw}” to an option — staff must fix.`);
    }
  } else {
    notes.push('Answer not found in source — NOT guessed. Staff must enter it or approve an AI suggestion.');
  }
  if (type !== 'SHORT_ANSWER' && correctLabels.length > 1) type = 'MCQ_MULTIPLE';

  if (marks == null) { marks = 1; notes.push('Marks not found — defaulted to 1. Adjust if needed.'); }

  const st = suggestSubjectTopic(`${text} ${options.map(o => o.text).join(' ')}`);
  const df = suggestDifficulty(text, type);

  const q: StagedQuestion = {
    id: `staged_${Date.now().toString(36)}_${stagedSeq++}`,
    importId: ctx.importId,
    order: 0, // assigned by parseQuestionPaper (document sequence)
    sourceQuestionNumber: b.qnum,
    sourcePage: b.page,
    sourceRow: null,
    sourceSheet: null,
    text,
    type,
    options,
    correctLabels,
    aiSuggested: false,
    marks,
    subject: st.subject === 'General' ? '' : st.subject,
    topic: st.topic === 'General' ? '' : st.topic,
    difficulty: df.difficulty,
    difficultyConfidence: df.confidence,
    extractionConfidence: text.length >= 10 ? 'HIGH' : 'MEDIUM',
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
  if (type === 'SHORT_ANSWER' && freeText && correctLabels.length === 0) {
    // keep expected answer text alongside (stored for exact-match grading)
    q.reviewNotes.push(`Expected answer: “${freeText}”. It will be stored for exact-match grading.`);
    q.expectedText = freeText;
  }
  q.validationErrors = validateStaged(q, freeText);
  return q;
}

/** Spec §20 validation. Returns error list (empty = valid).
 * deferAnswer=true: the admin will assign answers later in the bank, so a
 * missing MCQ/True-False answer is NOT an error. */
export function validateStaged(q: Pick<StagedQuestion, 'text' | 'type' | 'options' | 'correctLabels' | 'marks'>, freeText?: string | null, deferAnswer = false): string[] {
  const errs: string[] = [];
  if (!q.text || q.text.trim().length < 5) errs.push('Question text is missing or too short.');
  if (!(q.marks > 0)) errs.push('Marks must be greater than 0.');
  if (q.type === 'MCQ_SINGLE' || q.type === 'MCQ_MULTIPLE') {
    const validOpts = q.options.filter(o => o.text.trim());
    if (validOpts.length < 2) errs.push('MCQ needs at least 2 options.');
    if (q.correctLabels.length === 0) {
      if (!deferAnswer) errs.push('Correct answer is missing.');
    } else {
      if (q.type === 'MCQ_SINGLE' && q.correctLabels.length > 1) errs.push('Single-choice question has multiple answers.');
      for (const l of q.correctLabels) {
        if (!q.options.some(o => o.label === l)) errs.push(`Answer “${l}” does not match any option.`);
      }
    }
  } else if (q.type === 'TRUE_FALSE') {
    if (q.correctLabels.length === 0) {
      if (!deferAnswer) errs.push('Correct answer (True/False) is missing.');
    } else {
      const opt = q.options.find(o => o.label === q.correctLabels[0]);
      if (!opt || !/^(true|false)$/i.test(opt.text.trim())) errs.push('True/False answer must be True or False.');
    }
  } else {
    if (!freeText || !freeText.trim()) errs.push('Short-answer question has no expected answer.');
  }
  return errs;
}

/**
 * Apply the “I'll assign answers myself later” choice: clear any labels,
 * mark deferred, and leave the row READY so it can be imported without an
 * answer. Staff set A/B/C/D afterwards in the question bank.
 */
export function applyAnswerDeferral(q: StagedQuestion): StagedQuestion {
  q.correctLabels = [];
  q.answerDeferred = true;
  q.answerConfidence = 'UNKNOWN';
  q.answerSource = 'Deferred — admin will assign the answer (A/B/C/D) in the question bank';
  q.reviewNotes.push('Answer assignment deferred to the question bank — NOT guessed.');
  q.validationErrors = validateStaged(q, q.expectedText ?? null, true);
  finalizeStatus(q);
  return q;
}

function finalizeStatus(q: StagedQuestion) {
  const deferred = q.answerDeferred === true;
  if (q.validationErrors.length > 0 || (q.answerConfidence === 'UNKNOWN' && !deferred)) q.status = 'NEEDS_REVIEW';
  else q.status = 'READY';
}
