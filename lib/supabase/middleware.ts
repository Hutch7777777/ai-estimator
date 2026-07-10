import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Validate the token with Supabase Auth. Server-side authorization must not
  // trust the unverified session payload stored in cookies.
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error && error.name !== 'AuthSessionMissingError') {
    console.error('Middleware auth error:', error.message);
  }

  const pathname = request.nextUrl.pathname;
  const publicRoutes = new Set(['/', '/login', '/signup', '/terms', '/privacy']);
  const isPublicRoute =
    publicRoutes.has(pathname) ||
    pathname.startsWith('/auth/callback') ||
    pathname.startsWith('/auth/confirm');

  if (!user && pathname.startsWith('/api/')) {
    return NextResponse.json(
      { success: false, error: 'Authentication required' },
      {
        status: 401,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirectTo', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  if (user && (pathname === '/login' || pathname === '/signup')) {
    const url = request.nextUrl.clone();
    url.pathname = '/project';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
