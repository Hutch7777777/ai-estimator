'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useUser } from './useUser';

interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  settings: Record<string, any>;
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
  switchOrganization: (orgId: string) => void;
  refreshOrganization: () => Promise<void>;
  isOwner: boolean;
  isAdmin: boolean;
  canEdit: boolean;
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

  const fetchOrganizations = async (userId: string): Promise<OrganizationMembership[]> => {
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
        console.error('Error fetching organizations:', error.message, error.details, error.hint, error.code);
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
      return [];
    }
  };

  const refreshOrganization = async () => {
    if (user) {
      const orgs = await fetchOrganizations(user.id);
      setOrganizations(orgs);
    }
  };

  useEffect(() => {
    const loadOrganizations = async () => {
      console.log('useOrganization: Starting loadOrganizations', { isUserLoading, hasUser: !!user });

      if (isUserLoading) {
        console.log('useOrganization: Waiting for user to load...');
        return;
      }

      if (!user) {
        console.log('useOrganization: No user, clearing orgs and setting isLoading false');
        setOrganizations([]);
        setCurrentOrgId(null);
        setIsLoading(false);
        return;
      }

      console.log('useOrganization: Fetching organizations for user', user.id);
      const orgs = await fetchOrganizations(user.id);
      console.log('useOrganization: Fetched orgs', { count: orgs.length });
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
      setIsLoading(false);
    };

    loadOrganizations();
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

  return (
    <OrganizationContext.Provider
      value={{
        organization,
        membership,
        organizations,
        isLoading,
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
