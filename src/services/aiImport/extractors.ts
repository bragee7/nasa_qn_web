// Step 3 of the pipeline: TEXT / TABLE EXTRACTION.
// - Excel/CSV/XLS via SheetJS (already a project dependency).
// - PDF text via pdf.js (lazy-loaded so the main bundle stays small).
// - Word (.docx) text via mammoth (lazy-loaded); tables are flattened to text.
// Integrity failures (corrupt/unreadable files) throw friendly Errors here.
import * as XLSX from 'xlsx';

export interface SheetRow { rowNumber: number; values: Record<string, string>; }
export interface SheetData { name: string; headers: string[]; rows: SheetRow[]; }

function sheetToData(name: string, ws: XLSX.WorkSheet): SheetData {
  const grid: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
  let headerIdx = grid.findIndex(r => Array.isArray(r) && r.some(c => String(c ?? '').trim() !== ''));
  if (headerIdx === -1) return { name, headers: [], rows: [] };
  const rawHeaders = (grid[headerIdx] as unknown[]).map(h => String(h ?? '').trim());
  // de-duplicate blank/duplicate headers so every column is addressable
  const seen = new Map<string, number>();
  const headers = rawHeaders.map((h, i) => {
    const base = h || `Column ${i + 1}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base} (${n + 1})`;
  });
  const rows: SheetRow[] = [];
  for (let r = headerIdx + 1; r < grid.length; r++) {
    const line = grid[r] as unknown[];
    if (!Array.isArray(line) || line.every(c => String(c ?? '').trim() === '')) continue;
    const values: Record<string, string> = {};
    headers.forEach((h, c) => { values[h] = String(line[c] ?? '').trim(); });
    rows.push({ rowNumber: r + 1, values }); // 1-based incl. header row
  }
  return { name, headers, rows };
}

export async function extractWorkbook(file: File): Promise<{ sheets: SheetData[] }> {
  let wb: XLSX.WorkBook;
  try {
    if (/\.csv$/i.test(file.name)) {
      const text = await file.text();
      if (!text.trim()) throw new Error('empty');
      wb = XLSX.read(text, { type: 'string' });
    } else {
      const buf = await file.arrayBuffer();
      if (buf.byteLength === 0) throw new Error('empty');
      wb = XLSX.read(buf, { type: 'array' });
    }
  } catch {
    throw new Error('This file appears to be corrupted or is not a valid spreadsheet. Please check the file and try again.');
  }
  if (!wb.SheetNames.length) throw new Error('No worksheets found in this file.');
  return { sheets: wb.SheetNames.map(n => sheetToData(n, wb.Sheets[n])) };
}

// ---- PDF text extraction (pdf.js, lazy) ----
export interface PdfPageText { pageNumber: number; text: string; }

async function loadPdfJs() {
  const pdfjs: any = await import('pdfjs-dist');
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const worker: any = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  }
  return pdfjs;
}

/** Extract selectable text per page. Throws a friendly Error on corrupt files. */
export async function extractPdfPages(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<{ pages: PdfPageText[]; pageCount: number; pdf: any }> {
  const pdfjs = await loadPdfJs();
  let doc: any;
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    doc = await pdfjs.getDocument({ data }).promise;
  } catch {
    throw new Error('This PDF appears to be corrupted or password-protected. Please check the file and try again.');
  }
  const pages: PdfPageText[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    let text = '';
    for (const it of tc.items as any[]) {
      text += it.str ?? '';
      if (it.hasEOL) text += '\n';
    }
    pages.push({ pageNumber: i, text });
    onProgress?.(i, doc.numPages);
  }
  return { pages, pageCount: doc.numPages, pdf: doc };
}

/** A page with almost no selectable text is probably a scan → needs OCR. */
export function pageNeedsOcr(text: string): boolean {
  return normalize_ws(text).length < 50;
}

// ---- Word (.docx) text extraction (mammoth, lazy) ----

/** Extract raw text from a .docx file. Throws a friendly Error on corrupt files. */
export async function extractDocxText(file: File): Promise<{ text: string; messages: string[] }> {
  let mammoth: any;
  try {
    mammoth = await import('mammoth');
  } catch {
    throw new Error('The Word reader could not be loaded. Check your connection and try again.');
  }
  try {
    const buf = await file.arrayBuffer();
    if (buf.byteLength === 0) throw new Error('empty');
    const mod = mammoth.default ?? mammoth;
    // convertToHtml (not extractRawText): <br/> line breaks and table cell
    // boundaries survive conversion, so options stay one-per-line and answer
    // keys in Word tables stay parseable. Mammoth emits no positional CSS —
    // plain text order = document order, so file order is preserved.
    // NOTE: mammoth ships two option flavours — the node build reads
    // {buffer} only, the browser build reads {arrayBuffer} only, and the
    // bundler may resolve either one. Try both so .docx works everywhere.
    let out: any = null;
    let lastErr: any = null;
    for (const opts of [{ buffer: new Uint8Array(buf) }, { arrayBuffer: buf }]) {
      try { out = await mod.convertToHtml(opts); break; }
      catch (e) { lastErr = e; }
    }
    if (!out) throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
    // mammoth reports conversion caveats (unsupported runs etc.) — surfaced, not fatal.
    const messages: string[] = Array.isArray(out?.messages)
      ? out.messages.map((m: any) => String(m?.message ?? m ?? '')).filter(Boolean).slice(0, 5)
      : [];
    return { text: docxHtmlToText(String(out?.value ?? '')), messages };
  } catch (e: any) {
    if (e?.message === 'empty') throw new Error('This file appears to be empty.');
    throw new Error('This Word file appears to be corrupted or is not a valid .docx document. If it is a legacy “.doc” file, Save As “.docx” and try again.');
  }
}

/**
 * Convert mammoth HTML to plain text preserving DOCUMENT ORDER and
 * ALIGNMENT-critical structure: <br/> → newline, block closes → newline,
 * table cells → tab-separated, leading indentation kept. Pure → unit-tested.
 * Inline tags (bold/italic/code/run styling) are dropped without separators.
 */
export function docxHtmlToText(html: string): string {
  let s = String(html || '');
  // boundaries first (before tag stripping)
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|h[1-6]|li|tr|ul|ol)>/gi, '\n');
  s = s.replace(/<\/(td|th)>/gi, '\t');
  s = s.replace(/<[^>]*>/g, '');
  // entities (order matters: &amp; last)
  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&');
  // collapse blank runs but KEEP leading indentation of each line
  const lines = s.split('\n').map(l => l.replace(/[ \t]+$/g, ''));
  const out: string[] = [];
  let blanks = 0;
  for (const l of lines) {
    if (!l.trim()) { blanks++; if (blanks <= 1 && out.length) out.push(''); continue; }
    blanks = 0;
    out.push(l);
  }
  return out.join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
}

/**
 * Split long document text into page-like chunks (paragraph-boundary, ~4000
 * chars) so downstream question parsing keeps stable source refs (“page” N
 * of the Word document) and the UI can show progress. Leading indentation is
 * preserved (alignment); only trailing whitespace is trimmed. Pure → unit-tested.
 */
export function chunkTextToPages(text: string, maxChars = 4000): { pageNumber: number; text: string }[] {
  const paras = String(text || '')
    .split(/\n+/)
    .map(p => p.replace(/[ \t]+$/g, ''))
    .filter(p => p.trim() !== '');
  const pages: { pageNumber: number; text: string }[] = [];
  let cur = '';
  for (const p of paras) {
    if (cur && (cur + '\n' + p).length > maxChars) {
      pages.push({ pageNumber: pages.length + 1, text: cur });
      cur = p;
    } else {
      cur = cur ? cur + '\n' + p : p;
    }
  }
  if (cur.trim()) pages.push({ pageNumber: pages.length + 1, text: cur });
  return pages;
}

function normalize_ws(t: string): string {
  return (t || '').replace(/\s+/g, ' ').trim();
}
