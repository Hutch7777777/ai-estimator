'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Mail, Lock, User, ArrowRight, Check } from 'lucide-react';
import { toast } from 'sonner';

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();

  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  const handleGoogleSignup = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback?newUser=true` },
      });
      if (error) {
        toast.error(error.message);
        setIsLoading(false);
      }
    } catch (error) {
      toast.error('Failed to connect with Google');
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setIsLoading(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/auth/callback?newUser=true`,
        },
      });

      if (authError) {
        toast.error(authError.message);
        setIsLoading(false);
        return;
      }

      if (!authData.user) {
        toast.error('Failed to create account');
        setIsLoading(false);
        return;
      }

      // Don't create organization here - user will do that on /onboarding after confirming email
      setShowSuccess(true);
    } catch (error) {
      console.error('Signup error:', error);
      toast.error('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  if (showSuccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8fafc] px-4">
        <div className="w-full max-w-md space-y-8 text-center">
          <div className="mx-auto h-16 w-16 rounded-lg bg-[#dcfce7] flex items-center justify-center">
            <Check className="h-8 w-8 text-[#00cc6a]" />
          </div>
          <h1 className="text-2xl font-bold text-[#0f172a] font-heading">Check your email</h1>
          <p className="text-[#475569]">
            We sent a confirmation link to <span className="font-medium text-[#0f172a]">{email}</span>
          </p>
          <p className="text-sm text-[#94a3b8]">Click the link to activate your account and set up your company.</p>
          <Button onClick={() => router.push('/login')} variant="outline" className="mt-4">
            Back to login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-white via-white to-[#f1f5f9]/20 px-4 py-8">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <Link href="/" className="inline-flex items-center">
            <span className="font-mono text-2xl font-bold text-[#0f172a]">ESTIMATE</span>
            <span className="font-mono text-2xl font-bold text-[#00cc6a]">.ai</span>
          </Link>
          <h2 className="mt-6 text-xl font-semibold text-[#0f172a] font-heading">Create your account</h2>
          <p className="mt-2 text-sm text-[#475569]">Start estimating in minutes, not hours</p>
        </div>

        <div className="bg-white border border-[#e2e8f0] rounded-lg p-8 shadow-sm">
          <Button type="button" variant="outline" onClick={handleGoogleSignup} disabled={isLoading} className="w-full h-12">
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
              <>
                <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continue with Google
              </>
            )}
          </Button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-[#e2e8f0]" /></div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-[#94a3b8]">Or continue with email</span>
            </div>
          </div>

          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[#94a3b8]" />
                <Input id="fullName" placeholder="John Smith" value={fullName} onChange={(e) => setFullName(e.target.value)} className="pl-10 h-12" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[#94a3b8]" />
                <Input id="email" type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10 h-12" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[#94a3b8]" />
                <Input id="password" type="password" placeholder="Min. 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10 h-12" minLength={8} required />
              </div>
            </div>
            <Button type="submit" disabled={isLoading} className="w-full h-12">
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Create Account <ArrowRight className="ml-2 h-4 w-4" /></>}
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-[#475569]">
          Already have an account?{' '}
          <Link href="/login" className="text-[#00cc6a] hover:text-[#00b35e] font-medium">Sign in</Link>
        </p>
        <p className="text-center text-xs text-[#94a3b8]">
          By signing up, you agree to our <Link href="/terms" className="hover:text-[#0f172a]">Terms</Link> and <Link href="/privacy" className="hover:text-[#0f172a]">Privacy Policy</Link>
        </p>
      </div>
    </div>
  );
}
