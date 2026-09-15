import { describe, it, expect } from 'vitest';
import {
  parseQuestionPaper, splitInlineOptions, validateStaged, applyAnswerDeferral,
} from './pdfParser';
import { docxHtmlToText } from './extractors';
import { toBankCorrectAnswer } from './providers';

const CTX = { importId: 'imp-test', fileName: 'cet.docx' };
const pages = (texts: string[]) => texts.map((text, i) => ({ pageNumber: i + 1, text }));

describe('CET order / alignment / deferred answers', () => {
  it('splits Word-joined inline options A)…B)…C)…D) into four options', () => {
    const got = splitInlineOptions('A) O(n)B) O(n log n)C) O(log n)D) O(n²)');
    expect(got?.map(o => o.label)).toEqual(['A', 'B', 'C', 'D']);
    expect(got?.[1].text).toBe('O(n log n)');
  });

  it('does not split a genuine single-option line', () => {
    expect(splitInlineOptions('A) Only one option here')).toBeNull();
  });

  it('reads a flattened answer-key table (tab cells) and keeps file order', () => {
    const { questions } = parseQuestionPaper(pages([
      '1. First question?\nA) opt oneB) opt twoC) opt threeD) opt four\n2. Second question?\nA) alphaB) betaC) gammaD) delta\nAnswer Key\n1\tB\n2\tC',
    ]), CTX);
    expect(questions.map(q => q.order)).toEqual([1, 2]);
    expect(questions.map(q => q.correctLabels)).toEqual([['B'], ['C']]);
    expect(questions.map(q => q.options.length)).toEqual([4, 4]);
    expect(questions.every(q => q.status === 'READY')).toBe(true);
  });

  it('pairs bare table numbers with bare letters across lines', () => {
    const { questions } = parseQuestionPaper(pages([
      '1. First question?\nA) aB) bC) cD) d\nAnswer Key\n1\nB',
    ]), CTX);
    expect(questions[0].correctLabels).toEqual(['B']);
  });

  it('preserves code indentation and line breaks in the stem', () => {
    const { questions } = parseQuestionPaper(pages([
      '1. DSA\nWhat does this print?\n    int lo = 0, hi = n - 1;\n    while (lo < hi) lo++;\nA) 0B) 1C) nD) n-1\nAnswer: C',
    ]), CTX);
    expect(questions[0].text).toContain('    int lo = 0, hi = n - 1;');
    expect(questions[0].text).toContain('\n');
    expect(questions[0].options[3].text).toBe('n-1');
  });

  it('keeps a trailing Logic:/Explanation: line in the stem, not the last option', () => {
    const { questions } = parseQuestionPaper(pages([
      '21. Puzzles\n1×2=2, 2×3=6, 3×4=12, 5×6=?\nA) 25B) 28C) 30D) 32\nAnswer: C\nLogic: multiply consecutive numbers',
    ]), CTX);
    expect(questions[0].options[3].text).toBe('32');
    expect(questions[0].text).toContain('Logic: multiply consecutive numbers');
    expect(questions[0].correctLabels).toEqual(['C']);
  });

  it('flags a missing MCQ answer without ever guessing', () => {
    const errs = validateStaged({
      text: 'No answer given?', type: 'MCQ_SINGLE',
      options: [{ label: 'A', text: 'a' }, { label: 'B', text: 'b' }],
      correctLabels: [], marks: 1,
    });
    expect(errs.length).toBeGreaterThan(0);
  });

  it('defers answers: READY without labels, null bank answer', () => {
    const { questions } = parseQuestionPaper(pages([
      '1. Answer comes later\nA) aB) bC) cD) d',
    ]), CTX);
    const q = applyAnswerDeferral(questions[0]);
    expect(q.answerDeferred).toBe(true);
    expect(q.correctLabels).toEqual([]);
    expect(validateStaged(q, null, true)).toEqual([]);
    expect(q.status).toBe('READY');
    expect(toBankCorrectAnswer(q.type, q.options, q.correctLabels, undefined)).toBeNull();
  });

  it('converts Word HTML <br/> options to lines and table cells to tabs', () => {
    const out = docxHtmlToText('<p>1. Q?<br/>A) x<br/>B) y</p><table><tr><td>1</td><td>B</td></tr></table>');
    expect(out).toContain('A) x\nB) y');
    expect(out).toContain('1\tB');
  });

  it('stamps document order 1..n across a multi-question paper', () => {
    const { questions } = parseQuestionPaper(pages([
      '1. One\nA) aB) b\n2. Two\nA) aB) b\n3. Three\nA) aB) b',
    ]), CTX);
    expect(questions.map(q => q.order)).toEqual([1, 2, 3]);
  });
});
