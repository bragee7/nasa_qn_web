// Shared async audit helper. Writes through repo (Supabase when configured,
// otherwise localStorage). Reads the current session from localStorage.
import { repo } from './repo';

export async function audit(action: string, targetId: string, metadata: Record<string, any> = {}, targetType = 'system'): Promise<void> {
  let adminId = 'system', adminEmail = 'system';
  try {
    const s = JSON.parse(localStorage.getItem('examora_session') ?? 'null');
    if (s) { adminId = s.uid ?? 'system'; adminEmail = s.email ?? 'system'; }
  } catch { /* keep system */ }
  await repo.put('auditLogs', {
    id: crypto.randomUUID(), adminId, adminEmail, action,
    targetType, targetId, timestamp: Date.now(), metadata,
  });
}
