/**
 * Supabase Browser Client
 *
 * This client is used in Client Components (components with 'use client' directive).
 * It uses the browser's native fetch and storage APIs.
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
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';

/**
 * SINGLETON browser client.
 *
 * `createBrowserClient` builds a GoTrueClient with its own auth state,
 * token-refresh timer, and navigator LockManager lock over the shared
 * `sb-<ref>-auth-token` cookie. Creating one PER call (this file previously
 * returned a fresh client every time, and ~50 call sites plus the User and
 * Organization providers each call it) produces "Multiple GoTrueClient
 * instances detected in the same browser context" — documented undefined
 * behavior that fires repeated auth-state-change events. That churn changed
 * the `user` object reference in a loop, which restarted the organization
 * loader and cleared its safety timeout on every restart, so the workspace
 * spinner never resolved. One shared instance eliminates the churn.
 */
let browserClient: SupabaseClient<Database> | undefined;

export function createClient(): SupabaseClient<Database> {
  if (!browserClient) {
    browserClient = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return browserClient;
}
