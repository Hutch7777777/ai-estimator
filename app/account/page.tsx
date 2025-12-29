'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, User, Building2, Users, HelpCircle, CreditCard, Save, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useUser } from '@/lib/hooks/useUser';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

function AccountSettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'profile';

  const { user, profile, refreshProfile, isLoading: isUserLoading } = useUser();
  const { organization, membership, organizations, isOwner, isAdmin, refreshOrganization, isLoading: isOrgLoading } = useOrganization();

  const [activeTab, setActiveTab] = useState(initialTab);
  const [isSaving, setIsSaving] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);

  // Profile form state
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Company form state
  const [companyName, setCompanyName] = useState('');
  const [defaultMarkup, setDefaultMarkup] = useState('');
  const [timezone, setTimezone] = useState('');

  // Support form state
  const [supportSubject, setSupportSubject] = useState('');
  const [supportMessage, setSupportMessage] = useState('');

  // Team state
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [isLoadingTeam, setIsLoadingTeam] = useState(false);

  // Loading timeout state
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);

  const supabase = createClient();

  // Debug loading states and add timeout
  useEffect(() => {
    console.log('Account page - isUserLoading:', isUserLoading, 'isOrgLoading:', isOrgLoading);

    // Set a timeout to catch infinite loading
    const timeout = setTimeout(() => {
      if (isUserLoading || isOrgLoading) {
        console.error('Loading timed out! isUserLoading:', isUserLoading, 'isOrgLoading:', isOrgLoading);
        setLoadingTimedOut(true);
      }
    }, 5000);

    return () => clearTimeout(timeout);
  }, [isUserLoading, isOrgLoading]);

  // Initialize form values when data loads
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setPhone(profile.phone || '');
    } else if (user?.user_metadata?.full_name) {
      setFullName(user.user_metadata.full_name);
    }
  }, [profile, user]);

  useEffect(() => {
    if (organization) {
      setCompanyName(organization.name || '');
      setDefaultMarkup(organization.settings?.default_markup_percent?.toString() || '');
      setTimezone(organization.settings?.timezone || 'America/Los_Angeles');
    }
  }, [organization]);

  // Load team members
  useEffect(() => {
    const loadTeamMembers = async () => {
      if (!organization || !isAdmin) return;

      setIsLoadingTeam(true);
      try {
        // First get memberships
        const { data: memberships, error: memberError } = await supabase
          .from('organization_memberships')
          .select('id, user_id, role, joined_at')
          .eq('organization_id', organization.id)
          .order('joined_at', { ascending: true }) as { data: { id: string; user_id: string; role: string; joined_at: string }[] | null; error: any };

        if (memberError) throw memberError;

        // Then get user profiles for those members
        const userIds = (memberships || []).map(m => m.user_id);

        let profiles: { id: string; email: string; full_name: string | null }[] = [];
        if (userIds.length > 0) {
          const { data: profileData, error: profileError } = await supabase
            .from('user_profiles')
            .select('id, email, full_name')
            .in('id', userIds) as { data: { id: string; email: string; full_name: string | null }[] | null; error: any };

          if (!profileError && profileData) {
            profiles = profileData;
          }
        }

        // Combine the data
        const combined = (memberships || []).map(member => ({
          ...member,
          user: profiles.find(p => p.id === member.user_id) || {
            email: 'Unknown',
            full_name: null
          }
        }));

        setTeamMembers(combined);
      } catch (err) {
        console.error('Error loading team:', err);
        setTeamMembers([]);
      } finally {
        setIsLoadingTeam(false);
      }
    };

    if (activeTab === 'team') {
      loadTeamMembers();
    }
  }, [activeTab, organization, isAdmin]);

  const handleSaveProfile = async () => {
    if (!user) return;
    setIsSaving(true);

    try {
      // Update user metadata
      const { error: metaError } = await supabase.auth.updateUser({
        data: { full_name: fullName }
      });

      if (metaError) throw metaError;

      // Update user_profiles table if it exists
      const { error: profileError } = await supabase
        .from('user_profiles')
        .upsert({
          id: user.id,
          email: user.email,
          full_name: fullName,
          phone: phone || null,
        });

      if (profileError && profileError.code !== '42P01') {
        console.error('Profile update error:', profileError);
      }

      await refreshProfile();
      toast.success('Profile updated successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      toast.success('Password updated successfully');
      setShowPasswordChange(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update password');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveCompany = async () => {
    if (!organization) return;
    setIsSaving(true);

    try {
      const { error } = await supabase
        .from('organizations')
        .update({
          name: companyName,
          settings: {
            ...organization.settings,
            default_markup_percent: defaultMarkup ? parseFloat(defaultMarkup) : null,
            timezone: timezone,
          }
        })
        .eq('id', organization.id);

      if (error) throw error;

      await refreshOrganization();
      toast.success('Company settings updated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update company settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmitSupport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supportSubject.trim() || !supportMessage.trim()) {
      toast.error('Please fill in all fields');
      return;
    }

    setIsSaving(true);
    try {
      // For now, just show success - in production, this would send an email or create a ticket
      toast.success('Support request submitted. We\'ll get back to you soon!');
      setSupportSubject('');
      setSupportMessage('');
    } catch (err: any) {
      toast.error('Failed to submit support request');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangeMemberRole = async (memberId: string, newRole: string) => {
    try {
      const { error } = await supabase
        .from('organization_memberships')
        .update({ role: newRole })
        .eq('id', memberId);

      if (error) throw error;

      setTeamMembers(members =>
        members.map(m => m.id === memberId ? { ...m, role: newRole } : m)
      );
      toast.success('Member role updated');
    } catch (err: any) {
      toast.error('Failed to update role');
    }
  };

  const handleRemoveMember = async (memberId: string, memberEmail: string) => {
    if (!confirm(`Remove ${memberEmail} from the team?`)) return;

    try {
      const { error } = await supabase
        .from('organization_memberships')
        .delete()
        .eq('id', memberId);

      if (error) throw error;

      setTeamMembers(members => members.filter(m => m.id !== memberId));
      toast.success('Member removed');
    } catch (err: any) {
      toast.error('Failed to remove member');
    }
  };

  if (isUserLoading || isOrgLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8fafc]">
        <div className="text-center space-y-4">
          {loadingTimedOut ? (
            <>
              <div className="text-red-500 font-medium">Loading timed out</div>
              <div className="text-sm text-gray-600">
                <div>User loading: {isUserLoading ? 'stuck' : 'done'}</div>
                <div>Org loading: {isOrgLoading ? 'stuck' : 'done'}</div>
              </div>
              <Button onClick={() => window.location.reload()}>
                Refresh Page
              </Button>
            </>
          ) : (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-[#00cc6a] mx-auto" />
              <div className="text-sm text-gray-500">
                {isUserLoading && <div>Loading user...</div>}
                {isOrgLoading && <div>Loading organization...</div>}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  const timezones = [
    { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
    { value: 'America/Denver', label: 'Mountain Time (MT)' },
    { value: 'America/Chicago', label: 'Central Time (CT)' },
    { value: 'America/New_York', label: 'Eastern Time (ET)' },
    { value: 'America/Phoenix', label: 'Arizona (MST)' },
    { value: 'Pacific/Honolulu', label: 'Hawaii (HST)' },
  ];

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="mx-auto max-w-4xl px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/project"
            className="inline-flex items-center text-sm text-[#64748b] hover:text-[#0f172a] transition-colors"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Link>
          <h1 className="mt-4 text-3xl font-bold text-[#0f172a]">Account Settings</h1>
          <p className="mt-2 text-[#64748b]">Manage your account, company, and team settings</p>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-white border border-[#e2e8f0] p-1 h-auto flex-wrap">
            <TabsTrigger value="profile" className="data-[state=active]:bg-[#f1f5f9]">
              <User className="mr-2 h-4 w-4" />
              Profile
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="company" className="data-[state=active]:bg-[#f1f5f9]">
                <Building2 className="mr-2 h-4 w-4" />
                Company
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="team" className="data-[state=active]:bg-[#f1f5f9]">
                <Users className="mr-2 h-4 w-4" />
                Team
              </TabsTrigger>
            )}
            <TabsTrigger value="support" className="data-[state=active]:bg-[#f1f5f9]">
              <HelpCircle className="mr-2 h-4 w-4" />
              Support
            </TabsTrigger>
            <TabsTrigger value="billing" className="data-[state=active]:bg-[#f1f5f9]">
              <CreditCard className="mr-2 h-4 w-4" />
              Billing
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile">
            <div className="bg-white border border-[#e2e8f0] rounded-lg p-6 shadow-sm space-y-6">
              <h2 className="text-lg font-semibold text-[#0f172a]">Profile Information</h2>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="John Smith"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    value={user?.email || ''}
                    disabled
                    className="bg-[#f8fafc]"
                  />
                  <p className="text-xs text-[#94a3b8]">Email cannot be changed</p>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSaveProfile} disabled={isSaving}>
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Save Changes
                </Button>
              </div>

              {/* Password Section */}
              <div className="border-t border-[#e2e8f0] pt-6">
                <button
                  onClick={() => setShowPasswordChange(!showPasswordChange)}
                  className="flex items-center gap-2 text-[#0f172a] font-medium hover:text-[#00cc6a] transition-colors"
                >
                  {showPasswordChange ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  Change Password
                </button>

                {showPasswordChange && (
                  <div className="mt-4 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="newPassword">New Password</Label>
                      <Input
                        id="newPassword"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Min. 8 characters"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirm New Password</Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm your new password"
                      />
                    </div>
                    <Button onClick={handleChangePassword} disabled={isSaving}>
                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Update Password
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Company Tab */}
          <TabsContent value="company">
            <div className="bg-white border border-[#e2e8f0] rounded-lg p-6 shadow-sm space-y-6">
              <h2 className="text-lg font-semibold text-[#0f172a]">Company Settings</h2>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="companyName">Company Name</Label>
                  <Input
                    id="companyName"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Acme Exteriors LLC"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="defaultMarkup">Default Markup (%)</Label>
                  <Input
                    id="defaultMarkup"
                    type="number"
                    value={defaultMarkup}
                    onChange={(e) => setDefaultMarkup(e.target.value)}
                    placeholder="25"
                  />
                  <p className="text-xs text-[#94a3b8]">Applied to estimates by default</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <select
                    id="timezone"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {timezones.map(tz => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSaveCompany} disabled={isSaving}>
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Save Changes
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Team Tab */}
          <TabsContent value="team">
            <div className="bg-white border border-[#e2e8f0] rounded-lg p-6 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[#0f172a]">Team Members</h2>
                <Button variant="outline" disabled>
                  <Users className="h-4 w-4 mr-2" />
                  Invite Member
                </Button>
              </div>

              {isLoadingTeam ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-[#00cc6a]" />
                </div>
              ) : teamMembers.length === 0 ? (
                <p className="text-center text-[#64748b] py-8">No team members found</p>
              ) : (
                <div className="divide-y divide-[#e2e8f0]">
                  {teamMembers.map((member) => {
                    const memberEmail = member.user?.email || 'Unknown';
                    const memberName = member.user?.full_name || memberEmail.split('@')[0];
                    const isCurrentUser = member.user_id === user?.id;

                    return (
                      <div key={member.id} className="py-4 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-10 w-10 rounded-full bg-[#dcfce7] flex items-center justify-center text-sm font-medium text-[#00cc6a] flex-shrink-0">
                            {memberName.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-[#0f172a] truncate">{memberName}</p>
                            <p className="text-sm text-[#64748b] truncate">{memberEmail}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isOwner && !isCurrentUser ? (
                            <>
                              <select
                                value={member.role}
                                onChange={(e) => handleChangeMemberRole(member.id, e.target.value)}
                                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                              >
                                <option value="admin">Admin</option>
                                <option value="estimator">Estimator</option>
                                <option value="viewer">Viewer</option>
                              </select>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => handleRemoveMember(member.id, memberEmail)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <span className="px-3 py-1 text-sm rounded-full bg-[#f1f5f9] text-[#64748b] capitalize">
                              {member.role}
                              {isCurrentUser && ' (You)'}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Support Tab */}
          <TabsContent value="support">
            <div className="space-y-6">
              <div className="bg-white border border-[#e2e8f0] rounded-lg p-6 shadow-sm space-y-6">
                <h2 className="text-lg font-semibold text-[#0f172a]">Contact Support</h2>
                <form onSubmit={handleSubmitSupport} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="supportSubject">Subject</Label>
                    <Input
                      id="supportSubject"
                      value={supportSubject}
                      onChange={(e) => setSupportSubject(e.target.value)}
                      placeholder="How can we help?"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="supportMessage">Message</Label>
                    <Textarea
                      id="supportMessage"
                      value={supportMessage}
                      onChange={(e) => setSupportMessage(e.target.value)}
                      placeholder="Describe your issue or question..."
                      rows={5}
                      required
                    />
                  </div>
                  <Button type="submit" disabled={isSaving}>
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Submit Request
                  </Button>
                </form>
              </div>

              <div className="bg-white border border-[#e2e8f0] rounded-lg p-6 shadow-sm space-y-4">
                <h2 className="text-lg font-semibold text-[#0f172a]">Resources</h2>
                <div className="space-y-3">
                  <a
                    href="#"
                    className="block p-3 rounded-lg border border-[#e2e8f0] hover:border-[#00cc6a] hover:bg-[#f8fafc] transition-colors"
                  >
                    <p className="font-medium text-[#0f172a]">Documentation</p>
                    <p className="text-sm text-[#64748b]">Learn how to use Estimate.ai</p>
                  </a>
                  <a
                    href="#"
                    className="block p-3 rounded-lg border border-[#e2e8f0] hover:border-[#00cc6a] hover:bg-[#f8fafc] transition-colors"
                  >
                    <p className="font-medium text-[#0f172a]">Request a Feature</p>
                    <p className="text-sm text-[#64748b]">Tell us what you'd like to see</p>
                  </a>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Billing Tab */}
          <TabsContent value="billing">
            <div className="bg-white border border-[#e2e8f0] rounded-lg p-6 shadow-sm space-y-6">
              <h2 className="text-lg font-semibold text-[#0f172a]">Subscription & Billing</h2>

              <div className="p-4 rounded-lg bg-[#f8fafc] border border-[#e2e8f0]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-[#0f172a]">Free Plan</p>
                    <p className="text-sm text-[#64748b]">Basic features for getting started</p>
                  </div>
                  <Button variant="outline" disabled>
                    Upgrade
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-medium text-[#0f172a]">Usage This Month</h3>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="p-4 rounded-lg bg-[#f8fafc] border border-[#e2e8f0]">
                    <p className="text-2xl font-bold text-[#0f172a]">0</p>
                    <p className="text-sm text-[#64748b]">Projects Created</p>
                  </div>
                  <div className="p-4 rounded-lg bg-[#f8fafc] border border-[#e2e8f0]">
                    <p className="text-2xl font-bold text-[#0f172a]">0</p>
                    <p className="text-sm text-[#64748b]">PDFs Processed</p>
                  </div>
                  <div className="p-4 rounded-lg bg-[#f8fafc] border border-[#e2e8f0]">
                    <p className="text-2xl font-bold text-[#0f172a]">0</p>
                    <p className="text-sm text-[#64748b]">Exports Generated</p>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default function AccountSettingsPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[#f8fafc]">
        <Loader2 className="h-8 w-8 animate-spin text-[#00cc6a]" />
      </div>
    }>
      <AccountSettingsContent />
    </Suspense>
  );
}
