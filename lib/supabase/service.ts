/**
 * Server-only Supabase client using the service role key.
 *
 * Used SOLELY to bypass RLS for the small set of reads where the
 * cookie-scoped client cannot resolve the row (e.g. `organizations.settings`,
 * which is RLS-protected against direct user reads).
 *
 * NEVER import this from a client component, server action, or any module
 * reachable from the browser bundle. The service role key has no row-level
 * filtering — leaking it bypasses every tenant boundary in the database.
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';

let cached: ReturnType<typeof createClient<Database>> | null = null;

export function createServiceClient() {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is required for service-role client');
  }
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for service-role client');
  }

  cached = createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cached;
}
