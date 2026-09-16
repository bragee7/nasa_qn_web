// Supabase client (new EXAMORA backend). Reads VITE_SUPABASE_URL /
// VITE_SUPABASE_ANON_KEY; when either is missing the app runs on the
// local-storage fallback (see repo.ts) so dev/tests work with no backend.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anon);

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!client) {
    if (!isSupabaseConfigured) throw new Error('Supabase is not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
    client = createClient(url!, anon!);
  }
  return client;
}
