'use client';

const COOKIE_CHUNKS_TO_CLEAR = 8;

function getSupabaseAuthStorageKey() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;

  try {
    const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
    return `sb-${projectRef}-auth-token`;
  } catch {
    return null;
  }
}

export function clearStaleSupabaseAuth() {
  if (typeof window === 'undefined') return;

  const storageKey = getSupabaseAuthStorageKey();
  if (!storageKey) return;

  const cookieNames = [
    storageKey,
    ...Array.from({ length: COOKIE_CHUNKS_TO_CLEAR }, (_, index) => `${storageKey}.${index}`),
  ];

  for (const name of cookieNames) {
    document.cookie = `${name}=; Max-Age=0; path=/`;
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }

  for (const key of Object.keys(window.localStorage)) {
    if (key.startsWith(storageKey)) {
      window.localStorage.removeItem(key);
    }
  }
}
