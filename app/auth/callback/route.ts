import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  // OAuth callback parameters
  const code = searchParams.get('code');

  // Email confirmation parameters
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type');

  // Common parameters
  const redirectTo = searchParams.get('redirectTo') || '/project';
  const newUser = searchParams.get('newUser') === 'true';
  const next = searchParams.get('next') || redirectTo;

  const supabase = await createClient();

  // Handle email confirmation (signup, recovery, invite, etc.)
  if (token_hash && type) {
    const { data, error } = await supabase.auth.verifyOtp({
      type: type as any,
      token_hash,
    });

    if (error) {
      console.error('Email verification error:', error);
      return NextResponse.redirect(`${origin}/login?error=verification_failed`);
    }

    // For new signups, check if they need to create an organization
    if (type === 'signup' && data.user) {
      const { data: memberships } = await supabase
        .from('organization_memberships')
        .select('organization_id')
        .eq('user_id', data.user.id)
        .limit(1);

      if (!memberships || memberships.length === 0) {
        return NextResponse.redirect(`${origin}/onboarding`);
      }
    }

    return NextResponse.redirect(`${origin}${next}`);
  }

  // Handle OAuth callback
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('OAuth callback error:', error);
      return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
    }

    // For new OAuth users, check if they need to create an organization
    if (newUser && data.user) {
      const { data: memberships } = await supabase
        .from('organization_memberships')
        .select('organization_id')
        .eq('user_id', data.user.id)
        .limit(1);

      if (!memberships || memberships.length === 0) {
        return NextResponse.redirect(`${origin}/onboarding`);
      }
    }

    return NextResponse.redirect(`${origin}${redirectTo}`);
  }

  // No valid parameters
  return NextResponse.redirect(`${origin}/login?error=missing_params`);
}
