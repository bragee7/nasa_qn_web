// Import configuration: file-size limits (admin-configurable) + AI provider selection.
// Limits persist in localStorage so Super Admin can tune them in Settings.
// Provider is switchable without code changes: 'local' | 'gemini' | 'openai' | 'ollama'.
import type { FileKind } from './types';

const MB = 1024 * 1024;
export const DEFAULT_LIMITS_MB: Record<'pdf' | 'excel' | 'csv', number> = {
  pdf: 20,
  excel: 10,
  csv: 10,
};
const LIMITS_KEY = 'examora_importLimits';
const PROVIDER_KEY = 'examora_aiProvider';

export function limitGroupFor(kind: FileKind): 'pdf' | 'excel' | 'csv' {
  // Office documents (.docx spreadsheets .xlsx/.xls) share the 'excel' limit group.
  return kind === 'pdf' ? 'pdf' : kind === 'csv' ? 'csv' : 'excel';
}

export function getImportLimitsMB(): Record<'pdf' | 'excel' | 'csv', number> {
  try {
    const raw = localStorage.getItem(LIMITS_KEY);
    if (!raw) return { ...DEFAULT_LIMITS_MB };
    const p = JSON.parse(raw);
    return {
      pdf: Number(p.pdf) > 0 ? Number(p.pdf) : DEFAULT_LIMITS_MB.pdf,
      excel: Number(p.excel) > 0 ? Number(p.excel) : DEFAULT_LIMITS_MB.excel,
      csv: Number(p.csv) > 0 ? Number(p.csv) : DEFAULT_LIMITS_MB.csv,
    };
  } catch { return { ...DEFAULT_LIMITS_MB }; }
}

export function setImportLimitsMB(v: Record<'pdf' | 'excel' | 'csv', number>) {
  localStorage.setItem(LIMITS_KEY, JSON.stringify(v));
}

export function limitsToBytes() {
  const l = getImportLimitsMB();
  return { pdf: l.pdf * MB, excel: l.excel * MB, csv: l.csv * MB };
}

export type AIProviderId = 'local' | 'gemini' | 'openai' | 'ollama';

/** Resolution order: explicit app config -> saved choice -> env -> 'local'. */
export function getAIProvider(): AIProviderId {
  try {
    const saved = localStorage.getItem(PROVIDER_KEY);
    if (saved === 'gemini' || saved === 'openai' || saved === 'ollama' || saved === 'local') return saved;
  } catch { /* ignore */ }
  const env = (import.meta as any)?.env?.VITE_AI_PROVIDER;
  if (env === 'gemini' || env === 'openai' || env === 'ollama') return env;
  return 'local';
}

export function setAIProvider(p: AIProviderId) {
  localStorage.setItem(PROVIDER_KEY, p);
}
