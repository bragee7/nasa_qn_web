// Duplicate detection: exact match, normalized match, and token-level similarity.
// NEVER deletes or merges automatically — hits are flagged for staff decision.
export interface DuplicateResult {
  existingId: string;
  existingText: string;
  similarity: number; // 0-100
}

export function normalizeQuestionText(t: string): string {
  return (t || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(t: string): Set<string> {
  return new Set(normalizeQuestionText(t).split(' ').filter(w => w.length > 1));
}

/** Jaccard similarity over significant tokens, 0-100. */
export function similarity(a: string, b: string): number {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  const union = A.size + B.size - inter;
  return Math.round((inter / union) * 100);
}

export interface BankRow { id: string; text: string; }

/** Returns the best hit at or above threshold (default 80%), else null. */
export function findDuplicate(
  text: string,
  bank: BankRow[],
  threshold = 80,
): DuplicateResult | null {
  const norm = normalizeQuestionText(text);
  if (!norm) return null;
  let best: DuplicateResult | null = null;
  for (const row of bank) {
    if (!row.text) continue;
    if (normalizeQuestionText(row.text) === norm) {
      return { existingId: row.id, existingText: row.text, similarity: 100 };
    }
    const s = similarity(text, row.text);
    if (s >= threshold && (!best || s > best.similarity)) {
      best = { existingId: row.id, existingText: row.text, similarity: s };
    }
  }
  return best;
}
