'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Building2, ArrowRight, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [companyName, setCompanyName] = useState('');
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data: memberships } = await (supabase as any)
        .from('organization_memberships')
        .select('organization_id')
        .eq('user_id', user.id)
        .limit(1);

      if (memberships && memberships.length > 0) { router.push('/project'); return; }
      setUser(user);
      setIsCheckingAuth(false);
    };
    checkAuth();
  }, [router, supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { toast.error('Not authenticated'); return; }
    setIsLoading(true);

    try {
      const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const { data: orgData, error: orgError } = await (supabase as any)
        .from('organizations')
        .insert({ name: companyName, slug: slug + '-' + Date.now().toString(36) })
        .select()
        .single();

      if (orgError) { toast.error('Failed to create organization'); setIsLoading(false); return; }

      const { error: membershipError } = await (supabase as any)
        .from('organization_memberships')
        .insert({ user_id: user.id, organization_id: orgData.id, role: 'owner' });

      if (membershipError) { toast.error('Failed to set up membership'); setIsLoading(false); return; }

      toast.success('Organization created!');
      router.push('/project');
      router.refresh();
    } catch (error) {
      toast.error('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8fafc]">
        <Loader2 className="h-8 w-8 animate-spin text-[#00cc6a]" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-white via-white to-[#f1f5f9]/20 px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 rounded-lg bg-[#dcfce7] flex items-center justify-center mb-6">
            <Sparkles className="h-8 w-8 text-[#00cc6a]" />
          </div>
          <h1 className="text-2xl font-bold text-[#0f172a] font-heading">
            Welcome, {user?.user_metadata?.full_name || user?.email?.split('@')[0]}!
          </h1>
          <p className="mt-2 text-[#475569]">Let's set up your company to get started</p>
        </div>

        <div className="bg-white border border-[#e2e8f0] rounded-lg p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name</Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[#94a3b8]" />
                <Input id="companyName" placeholder="Acme Exteriors LLC" value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="pl-10 h-12" required autoFocus />
              </div>
              <p className="text-xs text-[#94a3b8]">This is your organization name. You can invite team members later.</p>
            </div>
            <Button type="submit" disabled={isLoading || !companyName.trim()} className="w-full h-12">
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Get Started <ArrowRight className="ml-2 h-4 w-4" /></>}
            </Button>
          </form>
        </div>

        <div className="bg-white border border-[#e2e8f0] rounded-lg p-6 shadow-sm">
          <h3 className="font-medium text-[#0f172a] mb-3">What's next?</h3>
          <ul className="space-y-3 text-sm text-[#475569]">
            <li className="flex items-center gap-3"><span className="h-2 w-2 rounded-full bg-[#00cc6a]" />Upload your first HOVER PDF</li>
            <li className="flex items-center gap-3"><span className="h-2 w-2 rounded-full bg-[#00cc6a]" />AI extracts all measurements</li>
            <li className="flex items-center gap-3"><span className="h-2 w-2 rounded-full bg-[#00cc6a]" />Download professional Excel takeoff</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
