const DEFAULT_REDIRECT = '/project';

/**
 * Accept only same-site paths for post-authentication redirects.
 * This prevents an attacker from turning the login page into an open redirect.
 */
export function sanitizeRedirectPath(
  value: string | null | undefined,
  fallback = DEFAULT_REDIRECT
): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return fallback;
  }

  if (value.includes('\\') || /[\u0000-\u001f\u007f]/.test(value)) {
    return fallback;
  }

  try {
    const url = new URL(value, 'https://estimate.local');
    if (url.origin !== 'https://estimate.local') return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
