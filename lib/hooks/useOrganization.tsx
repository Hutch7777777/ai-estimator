'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useUser } from './useUser';

const LOADING_TIMEOUT_MS = 8000; // 8 second timeout to prevent infinite loading

// =============================================================================
// DEV AUTH BYPASS - For local development only
// =============================================================================
const isDevBypassEnabled = () => {
  if (typeof window === 'undefined') return false;
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const bypassEnabled = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true';
  return isLocalhost && bypassEnabled;
};

interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  settings: Record<string, unknown>;
  subscription_tier: 'free' | 'pro' | 'enterprise';
  created_at: string;
}

interface OrganizationMembership {
  id: string;
  organization_id: string;
  role: 'owner' | 'admin' | 'estimator' | 'viewer';
  joined_at: string;
  organization: Organization;
}

// Mock organization for dev bypass
const DEV_MOCK_ORGANIZATION: Organization = {
  id: 'dev-org-00000000-0000-0000-0000-000000000000',
  name: 'Development Organization',
  slug: 'dev-org',
  logo_url: null,
  settings: {},
  subscription_tier: 'enterprise',
  created_at: new Date().toISOString(),
};

const DEV_MOCK_MEMBERSHIP: OrganizationMembership = {
  id: 'dev-membership-00000000-0000-0000-0000-000000000000',
  organization_id: 'dev-org-00000000-0000-0000-0000-000000000000',
  role: 'owner',
  joined_at: new Date().toISOString(),
  organization: DEV_MOCK_ORGANIZATION,
};

interface OrganizationContextType {
  organization: Organization | null;
  membership: OrganizationMembership | null;
  organizations: OrganizationMembership[];
  isLoading: boolean;
  hasNoOrganizations: boolean;
  switchOrganization: (orgId: string) => void;
  refreshOrganization: () => Promise<void>;
  isOwner: boolean;
  isAdmin: boolean;
  canEdit: boolean;
  timedOut: boolean;
  isDevBypass: boolean;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

const CURRENT_ORG_KEY = 'estimate_current_org';

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: isUserLoading } = useUser();

  // Check for dev bypass mode on mount
  const [isDevBypass] = useState(() => isDevBypassEnabled());

  // If dev bypass, start with mock data immediately
  const [organizations, setOrganizations] = useState<OrganizationMembership[]>(
    () => isDevBypassEnabled() ? [DEV_MOCK_MEMBERSHIP] : []
  );
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(
    () => isDevBypassEnabled() ? DEV_MOCK_ORGANIZATION.id : null
  );
  const [isLoading, setIsLoading] = useState(() => !isDevBypassEnabled()); // No loading if dev bypass
  const [timedOut, setTimedOut] = useState(false);

  // Track if we've already completed loading (via timeout or success)
  const hasCompletedRef = useRef(isDevBypassEnabled()); // Already completed if dev bypass
  const mountTimeRef = useRef(Date.now());

  // Create client once with useMemo
  const supabase = useMemo(() => createClient(), []);

  // Log dev bypass status on mount
  useEffect(() => {
    if (isDevBypass) {
      console.log('🔓 DEV AUTH BYPASS ENABLED - Using mock organization:', DEV_MOCK_ORGANIZATION.name);
    }
  }, [isDevBypass]);

  const fetchOrganizations = async (userId: string, retryCount = 0): Promise<OrganizationMembership[]> => {
    try {
      const { data, error } = await supabase
        .from('organization_memberships')
        .select(`
          id,
          organization_id,
          role,
          joined_at,
          organization:organizations(
            id,
            name,
            slug,
            logo_url,
            settings,
            subscription_tier,
            created_at
          )
        `)
        .eq('user_id', userId)
        .order('joined_at', { ascending: true });

      if (error) {
        console.error('Error fetching organizations:', error.message);
        // Retry once on failure
        if (retryCount < 1) {
          console.log('Retrying organization fetch...');
          await new Promise(resolve => setTimeout(resolve, 500));
          return fetchOrganizations(userId, retryCount + 1);
        }
        return [];
      }

      if (!data || data.length === 0) {
        console.log('No organizations found for user:', userId);
        return [];
      }

      return data.map((item: any) => ({
        id: item.id,
        organization_id: item.organization_id,
        role: item.role as 'owner' | 'admin' | 'estimator' | 'viewer',
        joined_at: item.joined_at,
        organization: Array.isArray(item.organization)
          ? item.organization[0]
          : item.organization,
      }));
    } catch (err) {
      console.error('Organization fetch exception:', err);
      // Retry once on exception
      if (retryCount < 1) {
        console.log('Retrying organization fetch after exception...');
        await new Promise(resolve => setTimeout(resolve, 500));
        return fetchOrganizations(userId, retryCount + 1);
      }
      return [];
    }
  };

  const refreshOrganization = async () => {
    if (user) {
      const orgs = await fetchOrganizations(user.id);
      setOrganizations(orgs);
    }
  };

  // Global timeout that runs once on mount - ensures loading always resolves
  useEffect(() => {
    const globalTimeoutId = setTimeout(() => {
      if (!hasCompletedRef.current) {
        console.warn('useOrganization: Global timeout reached, forcing completion');
        hasCompletedRef.current = true;
        setTimedOut(true);
        setIsLoading(false);
      }
    }, LOADING_TIMEOUT_MS);

    return () => {
      clearTimeout(globalTimeoutId);
    };
  }, []); // Only run once on mount

  useEffect(() => {
    let isMounted = true;
    const loadingStartTime = Date.now();

    const loadOrganizations = async () => {
      // If we've already completed (via timeout), don't restart loading
      if (hasCompletedRef.current) {
        console.log('useOrganization: Already completed, skipping reload');
        return;
      }

      console.log('useOrganization: Starting loadOrganizations', {
        isUserLoading,
        hasUser: !!user,
        elapsed: Date.now() - mountTimeRef.current
      });

      // If user is still loading but we're approaching timeout, proceed anyway
      const elapsedSinceMount = Date.now() - mountTimeRef.current;
      if (isUserLoading && elapsedSinceMount < LOADING_TIMEOUT_MS - 1000) {
        console.log('useOrganization: Waiting for user to load...');
        return;
      }

      if (isUserLoading) {
        console.log('useOrganization: User loading timeout, proceeding without user');
      }

      if (!user) {
        console.log('useOrganization: No user, clearing orgs and setting isLoading false');
        if (isMounted && !hasCompletedRef.current) {
          setOrganizations([]);
          setCurrentOrgId(null);
          hasCompletedRef.current = true;
          setIsLoading(false);
        }
        return;
      }

      console.log('useOrganization: Fetching organizations for user', user.id);
      const orgs = await fetchOrganizations(user.id);

      if (!isMounted || hasCompletedRef.current) return;

      console.log('useOrganization: Fetched orgs', { count: orgs.length, elapsed: Date.now() - loadingStartTime });
      setOrganizations(orgs);

      // Try to restore saved org, or use first one
      const savedOrgId = typeof window !== 'undefined' ? localStorage.getItem(CURRENT_ORG_KEY) : null;
      const validSavedOrg = orgs.find(o => o.organization_id === savedOrgId);

      if (validSavedOrg) {
        setCurrentOrgId(validSavedOrg.organization_id);
      } else if (orgs.length > 0) {
        setCurrentOrgId(orgs[0].organization_id);
        if (typeof window !== 'undefined') {
          localStorage.setItem(CURRENT_ORG_KEY, orgs[0].organization_id);
        }
      }

      console.log('useOrganization: Finished, setting isLoading false');
      hasCompletedRef.current = true;
      setIsLoading(false);
    };

    loadOrganizations();

    return () => {
      isMounted = false;
    };
  }, [user, isUserLoading, supabase]);

  const switchOrganization = (orgId: string) => {
    const org = organizations.find(o => o.organization_id === orgId);
    if (org) {
      setCurrentOrgId(orgId);
      if (typeof window !== 'undefined') {
        localStorage.setItem(CURRENT_ORG_KEY, orgId);
      }
    }
  };

  const membership = organizations.find(o => o.organization_id === currentOrgId) || null;
  const organization = membership?.organization || null;
  const isOwner = membership?.role === 'owner';
  const isAdmin = membership?.role === 'owner' || membership?.role === 'admin';
  const canEdit = ['owner', 'admin', 'estimator'].includes(membership?.role || '');

  // True when loading is complete and user has no organizations
  const hasNoOrganizations = !isLoading && organizations.length === 0;

  return (
    <OrganizationContext.Provider
      value={{
        organization,
        membership,
        organizations,
        isLoading,
        hasNoOrganizations,
        switchOrganization,
        refreshOrganization,
        isOwner,
        isAdmin,
        canEdit,
        timedOut,
        isDevBypass,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (context === undefined) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
}
