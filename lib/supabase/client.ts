/**
 * Supabase Browser Client (Singleton)
 *
 * This client is used in Client Components (components with 'use client' directive).
 * It uses the browser's native fetch and storage APIs.
 *
 * IMPORTANT: This is a singleton - the same instance is returned on every call.
 * This prevents race conditions when components include supabase in useEffect dependencies.
 *
 * @example
 * import { createClient } from '@/lib/supabase/client';
 *
 * export default function MyComponent() {
 *   const supabase = createClient();
 *   // Use supabase client...
 * }
 */

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/types/database';

// Singleton instance - created once, reused everywhere
let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createClient() {
  if (browserClient) {
    return browserClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  console.log('[createClient] Creating singleton with:', {
    url: url ? `${url.substring(0, 30)}...` : 'UNDEFINED',
    keyExists: !!key
  });

  if (!url || !key) {
    console.error('[createClient] Missing Supabase credentials!');
    throw new Error('Supabase configuration missing. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }

  browserClient = createBrowserClient<Database>(url, key);

  return browserClient;
}

// For rare cases where a fresh client is explicitly needed (e.g., testing)
export function createFreshClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Supabase configuration missing. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }

  return createBrowserClient<Database>(url, key);
}
