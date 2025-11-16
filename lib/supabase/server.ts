/**
 * Supabase Server Client
 *
 * This client is used in Server Components, Server Actions, and Route Handlers.
 * It properly handles cookie-based authentication for SSR.
 *
 * @example Server Component
 * import { createClient } from '@/lib/supabase/server';
 *
 * export default async function MyServerComponent() {
 *   const supabase = await createClient();
 *   const { data } = await supabase.from('projects').select('*');
 *   return <div>{JSON.stringify(data)}</div>;
 * }
 *
 * @example Server Action
 * 'use server'
 * import { createClient } from '@/lib/supabase/server';
 *
 * export async function getProjects() {
 *   const supabase = await createClient();
 *   return await supabase.from('projects').select('*');
 * }
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/types/database';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch (error) {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
}
