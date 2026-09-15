// AI import pipeline tests (spec §45): parsers, answer detection (never-guess),
// duplicates, column mapping, bank conversion, validation.
import { describe, it, expect } from 'vitest';
import {
  parseAnswerValue, parseQuestionPaper, validateStaged,
} from './pdfParser';
import { normalizeQuestionText, similarity, findDuplicate } from './duplicates';
import { autoMapColumns, rowToStaged } from './excelMapper';
import { toBankCorrectAnswer } from './providers';
import { validateFile } from './validation';
import { chunkTextToPages } from './extractors';
import { limitGroupFor } from './config';

const OPTS = [
  { label: 'A', text: 'Paris' }, { label: 'B', text: 'London' },
  { label: 'C', text: 'Berlin' }, { label: 'D', text: 'Rome' },
];

describe('parseAnswerValue', () => {
  it('maps letter, number, and text answers', () => {
    expect(parseAnswerValue('B', OPTS).labels).toEqual(['B']);
    expect(parseAnswerValue('2', OPTS).labels).toEqual(['B']);
    expect(parseAnswerValue('berlin', OPTS).labels).toEqual(['C']);
    expect(parseAnswerValue('True', [{ label: 'A', text: 'True' }, { label: 'B', text: 'False' }]).labels).toEqual(['A']);
  });
  it('never guesses: unknown answer yields no labels', () => {
    expect(parseAnswerValue('Zebra', OPTS).labels).toEqual([]);
    expect(parseAnswerValue('', OPTS).labels).toEqual([]);
  });
});

describe('parseQuestionPaper', () => {
  const paper = [
    { pageNumber: 1, text: '1. Capital of France?\nA. Paris\nB. London\nC. Berlin\nD. Rome\nAnswer: A' },
    { pageNumber: 1, text: '2. The sky is green.\nA. True\nB. False\nAnswer: B' },
    { pageNumber: 2, text: '3. Which are vowels?\nA. A\nB. B\nC. E\nD. F\nAnswer: A, C' },
    { pageNumber: 2, text: '4. Explain photosynthesis in detail.' },
  ];
  const res = parseQuestionPaper(paper, { importId: 'imp1', fileName: 'q.pdf' });
  it('extracts questions with types and answers', () => {
    expect(res.questions.length).toBe(4);
    const [q1, q2, q3, q4] = res.questions;
    expect(q1.type).toBe('MCQ_SINGLE');
    expect(q1.correctLabels).toEqual(['A']);
    expect(q1.answerConfidence).toBe('HIGH');
    expect(q1.status).toBe('READY');
    expect(q2.type).toBe('TRUE_FALSE');
    expect(q2.correctLabels).toEqual(['B']);
    expect(q3.type).toBe('MCQ_MULTIPLE');
    expect(q3.correctLabels).toEqual(['A', 'C']);
  });
  it('marks missing answers NEEDS_REVIEW without guessing', () => {
    const q4 = res.questions[3];
    expect(q4.correctLabels).toEqual([]);
    expect(q4.status).toBe('NEEDS_REVIEW');
    expect(q4.answerConfidence).toBe('UNKNOWN');
  });
  it('applies a trailing answer-key section', () => {
    const r = parseQuestionPaper([
      { pageNumber: 1, text: '1. Capital of France?\nA. Paris\nB. London' },
      { pageNumber: 2, text: 'Answer Key\n1 - B' },
    ], { importId: 'imp2', fileName: 'k.pdf' });
    expect(r.answerKeyEntries).toBe(1);
    expect(r.questions[0].correctLabels).toEqual(['B']);
  });
});

describe('validateStaged', () => {
  it('flags short text, missing options, missing answers', () => {
    expect(validateStaged({ text: 'ab', type: 'MCQ_SINGLE', options: OPTS, correctLabels: ['A'], marks: 1 })).not.toEqual([]);
    expect(validateStaged({ text: 'A proper question text?', type: 'MCQ_SINGLE', options: [], correctLabels: [], marks: 1 }).length).toBeGreaterThan(0);
    expect(validateStaged({ text: 'A proper question text?', type: 'MCQ_SINGLE', options: OPTS, correctLabels: ['A'], marks: 1 })).toEqual([]);
  });
});

describe('duplicates', () => {
  it('normalizes punctuation/case', () => {
    expect(normalizeQuestionText('  What is DBMS?! ')).toBe('what is dbms');
  });
  it('finds exact and similar hits, ignores distant text', () => {
    const bank = [{ id: 'q1', text: 'What is a primary key in DBMS?' }];
    expect(findDuplicate('What is a primary key in DBMS?!', bank)?.similarity).toBe(100);
    expect(findDuplicate('Explain the process of photosynthesis in plants', bank)).toBeNull();
    expect(similarity('same same same', 'same same same')).toBe(100);
  });
});

describe('excelMapper', () => {
  it('auto-maps aliased headers without uncertainty', () => {
    const r = autoMapColumns(['Question', 'Option A', 'Option B', 'Answer', 'Marks']);
    expect(r.uncertain).toBe(false);
    expect(r.unmappedRequired).toEqual([]);
  });
  it('flags uncertain when headers are unknown', () => {
    const r = autoMapColumns(['Foo', 'Bar', 'Baz']);
    expect(r.uncertain).toBe(true);
    expect(r.unmappedRequired).toContain('text');
  });
  it('converts rows and skips blanks', () => {
    const { mapping } = autoMapColumns(['Question', 'Option A', 'Option B', 'Answer']);
    const q = rowToStaged(
      { Question: '2+2?', 'Option A': '3', 'Option B': '4', Answer: 'B' },
      mapping, { importId: 'i', fileName: 'f.xlsx', sheet: 'S1', rowNumber: 2 });
    expect(q?.correctLabels).toEqual(['B']);
    expect(q?.sourceRow).toBe(2);
    expect(rowToStaged({ Question: '   ' }, mapping, { importId: 'i', fileName: 'f', sheet: null, rowNumber: 3 })).toBeNull();
  });
});

describe('toBankCorrectAnswer', () => {
  it('converts all four types to bank format', () => {
    expect(toBankCorrectAnswer('MCQ_SINGLE', OPTS, ['C'])).toBe(2);
    expect(toBankCorrectAnswer('MCQ_MULTIPLE', OPTS, ['A', 'C'])).toEqual([0, 2]);
    expect(toBankCorrectAnswer('TRUE_FALSE', [{ label: 'A', text: 'True' }, { label: 'B', text: 'False' }], ['A'])).toBe(true);
    expect(toBankCorrectAnswer('SHORT_ANSWER', [], [], '  acid ')).toBe('acid');
  });
});

describe('docx support', () => {
  const fake = (name: string, size: number, type = '') =>
    ({ name, size, type } as unknown as File);
  it('accepts .docx with the Word MIME type', () => {
    const v = validateFile(fake('paper.docx', 5000, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'));
    expect(v.ok).toBe(true);
    expect(v.kind).toBe('docx');
  });
  it('shares the 10 MB office-document limit group', () => {
    expect(limitGroupFor('docx')).toBe('excel');
    const v = validateFile(fake('big.docx', 11 * 1048576));
    expect(v.ok).toBe(false);
    expect(v.errors.join(' ')).toMatch(/10 MB/);
  });
  it('rejects legacy .doc with a Save-As-.docx nudge', () => {
    const v = validateFile(fake('old.doc', 5000, 'application/msword'));
    expect(v.ok).toBe(false);
    expect(v.errors.join(' ')).toMatch(/Save As “.docx”/);
  });
  it('warns that embedded images are skipped', () => {
    const v = validateFile(fake('paper.docx', 5000));
    expect(v.warnings.join(' ')).toMatch(/images/i);
  });
  it('chunks document text into page-like sections', () => {
    expect(chunkTextToPages('')).toEqual([]);
    const short = chunkTextToPages('1. What is 2+2?\nA. 3\nB. 4\nAnswer: B');
    expect(short.length).toBe(1);
    expect(short[0].pageNumber).toBe(1);
    const long = chunkTextToPages(Array.from({ length: 200 }, (_, i) => `Paragraph ${i} with filler words to add length.`).join('\n'), 500);
    expect(long.length).toBeGreaterThan(1);
    expect(long.map(p => p.pageNumber)).toEqual(long.map((_, i) => i + 1));
  });
  it('parses docx-extracted text end to end', () => {
    const pages = chunkTextToPages('Midterm Questions\n\n1. Capital of France?\nA. Paris\nB. London\nC. Berlin\nD. Rome\nAnswer: A\n\n2. The sky is green.\nA. True\nB. False\nAnswer: B');
    const res = parseQuestionPaper(pages, { importId: 'imp-docx', fileName: 'mid.docx' });
    expect(res.questions.length).toBe(2);
    expect(res.questions[0].type).toBe('MCQ_SINGLE');
    expect(res.questions[0].correctLabels).toEqual(['A']);
    expect(res.questions[1].type).toBe('TRUE_FALSE');
  });
});
