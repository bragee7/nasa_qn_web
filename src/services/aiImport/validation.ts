// Step 2 of the pipeline: FILE VALIDATION (extension, MIME, size, empty).
// Integrity/corruption is checked later at parse time with friendly errors.
import { limitGroupFor, limitsToBytes, getImportLimitsMB } from './config';
import type { FileKind } from './types';

const EXT_TO_KIND: Record<string, FileKind> = {
  pdf: 'pdf', docx: 'docx', xlsx: 'xlsx', xls: 'xls', csv: 'csv',
};
// MIME sniffing is advisory: browsers/OSes often report '' or
// application/octet-stream for .xls/.csv/.docx, so we never reject on MIME alone.
const KIND_MIMES: Record<FileKind, string[]> = {
  pdf: ['application/pdf'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  xls: ['application/vnd.ms-excel'],
  csv: ['text/csv', 'application/csv', 'text/plain'],
};

export interface FileCheck {
  ok: boolean;
  errors: string[];
  warnings: string[];
  kind: FileKind | null;
}

export function validateFile(file: File): FileCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!file) return { ok: false, errors: ['No file selected.'], warnings, kind: null };

  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const kind = EXT_TO_KIND[ext] ?? null;
  if (!kind) {
    // Friendly nudge for the legacy binary Word format.
    if (ext === 'doc') {
      return {
        ok: false, warnings, kind,
        errors: ['Legacy “.doc” files are not supported. Please open the file in Word (or Docs/LibreOffice) and Save As “.docx”, then upload again.'],
      };
    }
    return {
      ok: false, warnings, kind,
      errors: [`Unsupported file format “.${ext || '?'}”. Please upload: PDF, Word (.docx), XLSX, XLS, or CSV.`],
    };
  }
  if (file.size === 0) errors.push('File is empty (0 bytes). Please choose a valid file.');
  const maxBytes = limitsToBytes()[limitGroupFor(kind)];
  const maxMB = getImportLimitsMB()[limitGroupFor(kind)];
  if (file.size > maxBytes) {
    errors.push(`File is ${(file.size / 1048576).toFixed(1)} MB — the ${kind.toUpperCase()} limit is ${maxMB} MB (change in Settings).`);
  }
  const mime = (file.type || '').toLowerCase();
  if (mime && mime !== 'application/octet-stream' && !KIND_MIMES[kind].includes(mime)) {
    warnings.push(`MIME type “${file.type}” does not match .${ext}; continuing based on file extension.`);
  }
  if (kind === 'docx') {
    warnings.push('Only the document text is read — pictures/scanned images inside a Word file are skipped. If questions are images, export the file as PDF instead (scanned PDFs get OCR).');
  }
  return { ok: errors.length === 0, errors, warnings, kind };
}
