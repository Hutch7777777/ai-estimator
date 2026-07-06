'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useUser } from './useUser';

const LOADING_TIMEOUT_MS = 10000; // 10 second timeout to prevent infinite loading
const REQUEST_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: PromiseLike<T>, label: string): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      console.warn(`${label} timed out`);
      resolve(null);
    }, REQUEST_TIMEOUT_MS);

    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

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
}

interface OrganizationMembershipQueryRow {
  id: string;
  organization_id: string;
  role: OrganizationMembership['role'];
  joined_at: string;
  organization: Organization | Organization[] | null;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

const CURRENT_ORG_KEY = 'estimate_current_org';

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: isUserLoading } = useUser();
  const [organizations, setOrganizations] = useState<OrganizationMembership[]>([]);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Create client once with useMemo
  const supabase = useMemo(() => createClient(), []);

  const fetchOrganizations = useCallback(async function fetchOrganizations(
    userId: string,
    retryCount = 0
  ): Promise<OrganizationMembership[]> {
    try {
      const result = await withTimeout(
        supabase
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
          .order('joined_at', { ascending: true }),
        'Organization fetch'
      );
      if (!result) return [];
      const { data, error } = result;

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

      const rows = data as OrganizationMembershipQueryRow[];
      return rows.map((item) => ({
        id: item.id,
        organization_id: item.organization_id,
        role: item.role as 'owner' | 'admin' | 'estimator' | 'viewer',
        joined_at: item.joined_at,
        organization: Array.isArray(item.organization)
          ? item.organization[0]
          : item.organization,
      }));
    } catch (err) {
      console.warn(
        'Organization fetch exception:',
        err instanceof Error ? err.message : String(err)
      );
      // Retry once on exception
      if (retryCount < 1) {
        console.log('Retrying organization fetch after exception...');
        await new Promise(resolve => setTimeout(resolve, 500));
        return fetchOrganizations(userId, retryCount + 1);
      }
      return [];
    }
  }, [supabase]);

  const refreshOrganization = async () => {
    if (user) {
      const orgs = await fetchOrganizations(user.id);
      setOrganizations(orgs);
    }
  };

  // Depend on the user id (a stable string), not the user object. Auth
  // events deliver fresh User objects for the same account; keying the
  // loader on the object identity restarted this effect on every event and
  // cleared the safety timeout each time, so the spinner could hang forever.
  const userId = user?.id ?? null;

  useEffect(() => {
    let isMounted = true;
    const loadingStartTime = Date.now();

    // Timeout safeguard to prevent infinite loading
    const timeoutId = setTimeout(() => {
      if (isMounted) {
        console.warn('useOrganization: Loading timeout reached, forcing completion');
        setIsLoading(false);
      }
    }, LOADING_TIMEOUT_MS);

    const loadOrganizations = async () => {
      console.log('useOrganization: Starting loadOrganizations', { isUserLoading, hasUser: !!userId });

      if (isUserLoading) {
        console.log('useOrganization: Waiting for user to load...');
        return;
      }

      if (!userId) {
        console.log('useOrganization: No user, clearing orgs and setting isLoading false');
        if (isMounted) {
          setOrganizations([]);
          setCurrentOrgId(null);
          setIsLoading(false);
        }
        return;
      }

      try {
        console.log('useOrganization: Fetching organizations for user', userId);
        const orgs = await fetchOrganizations(userId);

        if (!isMounted) return;

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
        } else {
          setCurrentOrgId(null);
        }
      } finally {
        if (isMounted) {
          console.log('useOrganization: Finished, setting isLoading false');
          setIsLoading(false);
        }
      }
    };

    loadOrganizations();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [userId, isUserLoading, fetchOrganizations]);

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
