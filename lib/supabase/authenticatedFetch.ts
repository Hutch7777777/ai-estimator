import { createClient } from '@/lib/supabase/client';

/**
 * Call Supabase REST/Storage with the signed-in user's access token.
 *
 * Several legacy call sites used the public anon key as the Bearer token,
 * which made them depend on permissive RLS policies. Keeping this small
 * wrapper lets those call sites retain raw REST semantics while enforcing the
 * same user identity as the browser Supabase client.
 */
export async function authenticatedSupabaseFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error('Supabase configuration is missing');
  }

  const supabase = createClient();
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.access_token) {
    throw new Error('Authentication required');
  }

  const headers = new Headers(init.headers);
  headers.set('apikey', anonKey);
  headers.set('Authorization', `Bearer ${session.access_token}`);

  return fetch(`${supabaseUrl}${path.startsWith('/') ? path : `/${path}`}`, {
    ...init,
    headers,
  });
}
