'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, User, Building2, Users, HelpCircle, CreditCard, Save, ChevronDown, ChevronUp, Trash2, Package, Calculator, Briefcase, Info } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useUser } from '@/lib/hooks/useUser';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { NoOrganization } from '@/components/no-organization';
import { resolveSettings } from '@/lib/types/organization';
import { ProductSelector } from '@/components/settings/ProductSelector';

function AccountSettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'profile';

  const { user, profile, refreshProfile, isLoading: isUserLoading } = useUser();
  const { organization, isOwner, isAdmin, refreshOrganization, isLoading: isOrgLoading, hasNoOrganizations } = useOrganization();

  const [activeTab, setActiveTab] = useState(initialTab);
  const [isSaving, setIsSaving] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);

  // Profile form state
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Company form state - General
  const [companyName, setCompanyName] = useState('');
  const [defaultMarkup, setDefaultMarkup] = useState('');
  const [timezone, setTimezone] = useState('');

  // Company form state - Labor Rates
  const [liInsuranceRate, setLiInsuranceRate] = useState('12.65');
  const [unemploymentRate, setUnemploymentRate] = useState('6.60');
  const [wasteFactorPercent, setWasteFactorPercent] = useState('12');
  const [overheadMultiplier, setOverheadMultiplier] = useState('1.0');
  const [baseLaborRateHourly, setBaseLaborRateHourly] = useState('');
  const [defaultCrewSize, setDefaultCrewSize] = useState('');

  // Company form state - Business Info
  const [licenseNumber, setLicenseNumber] = useState('');
  const [insurancePolicyNumber, setInsurancePolicyNumber] = useState('');
  const [insuranceExpiration, setInsuranceExpiration] = useState('');
  const [defaultPaymentTerms, setDefaultPaymentTerms] = useState('');
  const [defaultWarrantyPeriod, setDefaultWarrantyPeriod] = useState('');
  const [companyTagline, setCompanyTagline] = useState('');
  const [estimateContactPhone, setEstimateContactPhone] = useState('');
  const [estimateContactEmail, setEstimateContactEmail] = useState('');

  // Material Defaults
  const [defaultTrimSku, setDefaultTrimSku] = useState<string | null>(null);
  const [defaultWrbSku, setDefaultWrbSku] = useState<string | null>(null);
  const [defaultFlashingSku, setDefaultFlashingSku] = useState<string | null>(null);
  const [defaultCaulkSku, setDefaultCaulkSku] = useState<string | null>(null);
  const [defaultFastenerSku, setDefaultFastenerSku] = useState<string | null>(null);
  const [defaultSidingSku, setDefaultSidingSku] = useState<string | null>(null);
  const [defaultSoffitSku, setDefaultSoffitSku] = useState<string | null>(null);
  const [defaultCornerSku, setDefaultCornerSku] = useState<string | null>(null);

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
      // Resolve settings with defaults
      const settings = resolveSettings(organization.settings);

      // General settings
      setCompanyName(organization.name || '');
      setDefaultMarkup(settings.default_markup_percent?.toString() || '35');
      setTimezone(settings.timezone || 'America/Los_Angeles');

      // Labor rates
      setLiInsuranceRate(settings.labor_rates?.li_insurance_rate_percent?.toString() || '12.65');
      setUnemploymentRate(settings.labor_rates?.unemployment_rate_percent?.toString() || '6.60');
      setWasteFactorPercent(settings.labor_rates?.default_waste_factor_percent?.toString() || '12');
      setOverheadMultiplier(settings.labor_rates?.overhead_multiplier?.toString() || '1.0');
      setBaseLaborRateHourly(settings.labor_rates?.base_labor_rate_hourly?.toString() || '');
      setDefaultCrewSize(settings.labor_rates?.default_crew_size?.toString() || '');

      // Business info
      setLicenseNumber(settings.business_info?.license_number || '');
      setInsurancePolicyNumber(settings.business_info?.insurance_policy_number || '');
      setInsuranceExpiration(settings.business_info?.insurance_expiration || '');
      setDefaultPaymentTerms(settings.business_info?.default_payment_terms || '');
      setDefaultWarrantyPeriod(settings.business_info?.default_warranty_period || '');
      setCompanyTagline(settings.business_info?.company_tagline || '');
      setEstimateContactPhone(settings.business_info?.estimate_contact_phone || '');
      setEstimateContactEmail(settings.business_info?.estimate_contact_email || '');

      // Material defaults
      setDefaultTrimSku(settings.material_defaults?.default_trim_sku || null);
      setDefaultWrbSku(settings.material_defaults?.default_wrb_sku || null);
      setDefaultFlashingSku(settings.material_defaults?.default_flashing_sku || null);
      setDefaultCaulkSku(settings.material_defaults?.default_caulk_sku || null);
      setDefaultFastenerSku(settings.material_defaults?.default_fastener_sku || null);
      setDefaultSidingSku(settings.material_defaults?.default_siding_sku || null);
      setDefaultSoffitSku(settings.material_defaults?.default_soffit_sku || null);
      setDefaultCornerSku(settings.material_defaults?.default_corner_sku || null);
    }
  }, [organization]);

  // Calculate total burden rate for display
  const totalBurdenRate = (parseFloat(liInsuranceRate) || 0) + (parseFloat(unemploymentRate) || 0);

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
            default_markup_percent: defaultMarkup ? parseFloat(defaultMarkup) : 35,
            timezone: timezone,
            labor_rates: {
              li_insurance_rate_percent: parseFloat(liInsuranceRate) || 12.65,
              unemployment_rate_percent: parseFloat(unemploymentRate) || 6.60,
              default_waste_factor_percent: parseFloat(wasteFactorPercent) || 12,
              overhead_multiplier: parseFloat(overheadMultiplier) || 1.0,
              base_labor_rate_hourly: baseLaborRateHourly ? parseFloat(baseLaborRateHourly) : null,
              default_crew_size: defaultCrewSize ? parseInt(defaultCrewSize, 10) : null,
            },
            business_info: {
              license_number: licenseNumber || null,
              insurance_policy_number: insurancePolicyNumber || null,
              insurance_expiration: insuranceExpiration || null,
              default_payment_terms: defaultPaymentTerms || null,
              default_warranty_period: defaultWarrantyPeriod || null,
              company_tagline: companyTagline || null,
              estimate_contact_phone: estimateContactPhone || null,
              estimate_contact_email: estimateContactEmail || null,
            },
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

  const handleSaveMaterials = async () => {
    if (!organization) return;
    setIsSaving(true);

    try {
      const { error } = await supabase
        .from('organizations')
        .update({
          settings: {
            ...organization.settings,
            material_defaults: {
              default_trim_sku: defaultTrimSku,
              default_wrb_sku: defaultWrbSku,
              default_flashing_sku: defaultFlashingSku,
              default_caulk_sku: defaultCaulkSku,
              default_fastener_sku: defaultFastenerSku,
              default_siding_sku: defaultSidingSku,
              default_soffit_sku: defaultSoffitSku,
              default_corner_sku: defaultCornerSku,
            },
          }
        })
        .eq('id', organization.id);

      if (error) throw error;

      await refreshOrganization();
      toast.success('Default materials updated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update default materials');
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

  // Show no organization state
  if (hasNoOrganizations) {
    return (
      <div className="min-h-screen bg-[#f8fafc]">
        <div className="mx-auto max-w-4xl px-4 py-8">
          <div className="mb-8">
            <Link
              href="/project"
              className="inline-flex items-center text-sm text-[#64748b] hover:text-[#0f172a] transition-colors"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Link>
            <h1 className="mt-4 text-3xl font-bold text-[#0f172a]">Account Settings</h1>
          </div>
          <NoOrganization />
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
              <TabsTrigger value="materials" className="data-[state=active]:bg-[#f1f5f9]">
                <Package className="mr-2 h-4 w-4" />
                Materials
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
            <div className="space-y-6">
              {/* General Settings Section */}
              <div className="bg-white border border-[#e2e8f0] rounded-lg p-6 shadow-sm space-y-6">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-blue-100">
                    <Building2 className="h-5 w-5 text-blue-600" />
                  </div>
                  <h2 className="text-lg font-semibold text-[#0f172a]">General Settings</h2>
                </div>

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
              </div>

              {/* Pricing & Labor Rates Section */}
              <div className="bg-white border border-[#e2e8f0] rounded-lg p-6 shadow-sm space-y-6">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-green-100">
                    <Calculator className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-[#0f172a]">Pricing & Labor Rates</h2>
                    <p className="text-sm text-[#64748b]">Configure markup and labor burden rates for estimates</p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="defaultMarkup">Default Markup (%)</Label>
                    <div className="relative">
                      <Input
                        id="defaultMarkup"
                        type="number"
                        step="0.1"
                        value={defaultMarkup}
                        onChange={(e) => setDefaultMarkup(e.target.value)}
                        placeholder="35"
                        className="pr-8"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8]">%</span>
                    </div>
                    <p className="text-xs text-[#94a3b8]">Applied to all estimates</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="liInsuranceRate">L&I Insurance Rate (%)</Label>
                    <div className="relative">
                      <Input
                        id="liInsuranceRate"
                        type="number"
                        step="0.01"
                        value={liInsuranceRate}
                        onChange={(e) => setLiInsuranceRate(e.target.value)}
                        placeholder="12.65"
                        className="pr-8"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8]">%</span>
                    </div>
                    <p className="text-xs text-[#94a3b8]">Washington State L&I</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unemploymentRate">Unemployment Rate (%)</Label>
                    <div className="relative">
                      <Input
                        id="unemploymentRate"
                        type="number"
                        step="0.01"
                        value={unemploymentRate}
                        onChange={(e) => setUnemploymentRate(e.target.value)}
                        placeholder="6.60"
                        className="pr-8"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8]">%</span>
                    </div>
                    <p className="text-xs text-[#94a3b8]">State unemployment tax</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wasteFactorPercent">Default Waste Factor (%)</Label>
                    <div className="relative">
                      <Input
                        id="wasteFactorPercent"
                        type="number"
                        step="1"
                        value={wasteFactorPercent}
                        onChange={(e) => setWasteFactorPercent(e.target.value)}
                        placeholder="12"
                        className="pr-8"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8]">%</span>
                    </div>
                    <p className="text-xs text-[#94a3b8]">Added to material quantities</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="overheadMultiplier">Overhead Multiplier</Label>
                    <Input
                      id="overheadMultiplier"
                      type="number"
                      step="0.1"
                      value={overheadMultiplier}
                      onChange={(e) => setOverheadMultiplier(e.target.value)}
                      placeholder="1.0"
                    />
                    <p className="text-xs text-[#94a3b8]">1.0 = no additional overhead</p>
                  </div>
                </div>

                {/* Labor Burden Summary */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Info className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-blue-900">Total Labor Burden Rate</p>
                      <p className="text-sm text-blue-700 mt-1">
                        L&I ({liInsuranceRate || '0'}%) + Unemployment ({unemploymentRate || '0'}%) = <span className="font-bold">{totalBurdenRate.toFixed(2)}%</span>
                      </p>
                      <p className="text-xs text-blue-600 mt-1">
                        This rate is applied to base labor costs in all estimates.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Optional Advanced Settings */}
                <div className="border-t border-[#e2e8f0] pt-4">
                  <p className="text-sm font-medium text-[#64748b] mb-3">Advanced Settings (Optional)</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="baseLaborRateHourly">Base Labor Rate ($/hr)</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]">$</span>
                        <Input
                          id="baseLaborRateHourly"
                          type="number"
                          step="0.01"
                          value={baseLaborRateHourly}
                          onChange={(e) => setBaseLaborRateHourly(e.target.value)}
                          placeholder="45.00"
                          className="pl-7"
                        />
                      </div>
                      <p className="text-xs text-[#94a3b8]">Hourly rate for labor calculations</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="defaultCrewSize">Default Crew Size</Label>
                      <Input
                        id="defaultCrewSize"
                        type="number"
                        step="1"
                        min="1"
                        value={defaultCrewSize}
                        onChange={(e) => setDefaultCrewSize(e.target.value)}
                        placeholder="3"
                      />
                      <p className="text-xs text-[#94a3b8]">Number of workers per crew</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Business Information Section */}
              <div className="bg-white border border-[#e2e8f0] rounded-lg p-6 shadow-sm space-y-6">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-purple-100">
                    <Briefcase className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-[#0f172a]">Business Information</h2>
                    <p className="text-sm text-[#64748b]">This information appears on proposals and contracts</p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="licenseNumber">License Number</Label>
                    <Input
                      id="licenseNumber"
                      value={licenseNumber}
                      onChange={(e) => setLicenseNumber(e.target.value)}
                      placeholder="EXTERFLLC123AB"
                    />
                    <p className="text-xs text-[#94a3b8]">Contractor license #</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="insurancePolicyNumber">Insurance Policy Number</Label>
                    <Input
                      id="insurancePolicyNumber"
                      value={insurancePolicyNumber}
                      onChange={(e) => setInsurancePolicyNumber(e.target.value)}
                      placeholder="POL-12345678"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="insuranceExpiration">Insurance Expiration</Label>
                    <Input
                      id="insuranceExpiration"
                      type="date"
                      value={insuranceExpiration}
                      onChange={(e) => setInsuranceExpiration(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="defaultPaymentTerms">Default Payment Terms</Label>
                    <Input
                      id="defaultPaymentTerms"
                      value={defaultPaymentTerms}
                      onChange={(e) => setDefaultPaymentTerms(e.target.value)}
                      placeholder="50% deposit, 50% upon completion"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="defaultWarrantyPeriod">Default Warranty Period</Label>
                    <Input
                      id="defaultWarrantyPeriod"
                      value={defaultWarrantyPeriod}
                      onChange={(e) => setDefaultWarrantyPeriod(e.target.value)}
                      placeholder="2 years labor, 30 years material warranty"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="companyTagline">Company Tagline</Label>
                    <Input
                      id="companyTagline"
                      value={companyTagline}
                      onChange={(e) => setCompanyTagline(e.target.value)}
                      placeholder="Quality Exteriors, Built to Last"
                    />
                    <p className="text-xs text-[#94a3b8]">Appears in proposal headers</p>
                  </div>
                </div>

                <div className="border-t border-[#e2e8f0] pt-4">
                  <p className="text-sm font-medium text-[#64748b] mb-3">Estimate Contact Information</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="estimateContactPhone">Contact Phone</Label>
                      <Input
                        id="estimateContactPhone"
                        type="tel"
                        value={estimateContactPhone}
                        onChange={(e) => setEstimateContactPhone(e.target.value)}
                        placeholder="(555) 123-4567"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="estimateContactEmail">Contact Email</Label>
                      <Input
                        id="estimateContactEmail"
                        type="email"
                        value={estimateContactEmail}
                        onChange={(e) => setEstimateContactEmail(e.target.value)}
                        placeholder="estimates@exteriorfinishes.com"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <div className="flex justify-end">
                <Button onClick={handleSaveCompany} disabled={isSaving} size="lg">
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Save All Company Settings
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Materials Tab */}
          <TabsContent value="materials">
            <div className="space-y-6">
              <div className="bg-white border border-[#e2e8f0] rounded-lg p-6 shadow-sm space-y-6">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-orange-100">
                    <Package className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-[#0f172a]">Default Materials</h2>
                    <p className="text-sm text-[#64748b]">
                      Set default products for when no specific material is assigned to a detection.
                      These are used as fallbacks in auto-scope calculations.
                    </p>
                  </div>
                </div>

                {/* Primary Siding Products */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-[#0f172a] border-b border-[#e2e8f0] pb-2">
                    Primary Siding
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ProductSelector
                      label="Default Siding"
                      category={['lap_siding', 'panel']}
                      value={defaultSidingSku}
                      onChange={setDefaultSidingSku}
                      placeholder="Select default siding product..."
                      helpText="Used for main siding areas"
                    />
                    <ProductSelector
                      label="Default Soffit"
                      category="soffit"
                      value={defaultSoffitSku}
                      onChange={setDefaultSoffitSku}
                      placeholder="Select default soffit product..."
                      helpText="Used for soffit areas"
                    />
                  </div>
                </div>

                {/* Trim & Corners */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-[#0f172a] border-b border-[#e2e8f0] pb-2">
                    Trim & Corners
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ProductSelector
                      label="Default Trim"
                      category="trim"
                      value={defaultTrimSku}
                      onChange={setDefaultTrimSku}
                      placeholder="Select default trim product..."
                      helpText="Used for window/door trim"
                    />
                    <ProductSelector
                      label="Default Corner"
                      category={['corner', 'corners']}
                      value={defaultCornerSku}
                      onChange={setDefaultCornerSku}
                      placeholder="Select default corner product..."
                      helpText="Used for outside/inside corners"
                    />
                  </div>
                </div>

                {/* Weatherproofing */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-[#0f172a] border-b border-[#e2e8f0] pb-2">
                    Weatherproofing
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ProductSelector
                      label="Default WRB / Housewrap"
                      category={['wrb', 'water_barrier', 'housewrap']}
                      value={defaultWrbSku}
                      onChange={setDefaultWrbSku}
                      placeholder="Select default WRB product..."
                      helpText="Weather-resistant barrier"
                    />
                    <ProductSelector
                      label="Default Flashing"
                      category="flashing"
                      value={defaultFlashingSku}
                      onChange={setDefaultFlashingSku}
                      placeholder="Select default flashing product..."
                      helpText="Z-flashing, drip edge, etc."
                    />
                  </div>
                </div>

                {/* Accessories */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-[#0f172a] border-b border-[#e2e8f0] pb-2">
                    Accessories
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ProductSelector
                      label="Default Caulk / Sealant"
                      category={['sealants', 'caulk']}
                      value={defaultCaulkSku}
                      onChange={setDefaultCaulkSku}
                      placeholder="Select default caulk product..."
                      helpText="Sealants and caulk"
                    />
                    <ProductSelector
                      label="Default Fasteners"
                      category="fasteners"
                      value={defaultFastenerSku}
                      onChange={setDefaultFastenerSku}
                      placeholder="Select default fastener product..."
                      helpText="Nails, screws, etc."
                    />
                  </div>
                </div>

                {/* Info Box */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Info className="h-5 w-5 text-amber-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-amber-900">How Default Materials Work</p>
                      <p className="text-sm text-amber-700 mt-1">
                        When generating a takeoff, if a detection doesn&apos;t have a specific material assigned,
                        the system will use these default products from your pricing catalog.
                        This ensures all line items have pricing even without manual assignment.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <div className="flex justify-end">
                <Button onClick={handleSaveMaterials} disabled={isSaving} size="lg">
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Save Default Materials
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
