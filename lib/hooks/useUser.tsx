'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useMemo, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { User } from '@supabase/supabase-js';

const USER_LOADING_TIMEOUT_MS = 5000; // 5 second timeout for user loading

// =============================================================================
// DEV AUTH BYPASS - For local development only
// =============================================================================
const isDevBypassEnabled = () => {
  if (typeof window === 'undefined') return false;
  // Only allow bypass on localhost
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const bypassEnabled = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true';
  return isLocalhost && bypassEnabled;
};

// Mock user for dev bypass - mimics Supabase User structure
const DEV_MOCK_USER: User = {
  id: 'dev-user-00000000-0000-0000-0000-000000000000',
  email: 'dev@localhost',
  app_metadata: {},
  user_metadata: { full_name: 'Dev User' },
  aud: 'authenticated',
  created_at: new Date().toISOString(),
} as User;

const DEV_MOCK_PROFILE: UserProfile = {
  id: 'dev-user-00000000-0000-0000-0000-000000000000',
  email: 'dev@localhost',
  full_name: 'Dev User',
  avatar_url: null,
  phone: null,
};

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
}

interface UserContextType {
  user: User | null;
  profile: UserProfile | null;
  isLoading: boolean;
  hasSession: boolean; // True if there's an active session (even if user object isn't fully loaded)
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  isDevBypass: boolean; // True if using dev bypass mode
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  // Check for dev bypass mode on mount
  const [isDevBypass] = useState(() => isDevBypassEnabled());

  // If dev bypass is enabled, start with mock user immediately (no loading)
  const [user, setUser] = useState<User | null>(() => isDevBypassEnabled() ? DEV_MOCK_USER : null);
  const [profile, setProfile] = useState<UserProfile | null>(() => isDevBypassEnabled() ? DEV_MOCK_PROFILE : null);
  const [isLoading, setIsLoading] = useState(() => !isDevBypassEnabled()); // No loading if dev bypass
  const [hasSession, setHasSession] = useState(() => isDevBypassEnabled()); // Has session if dev bypass

  // Track if we've completed loading to prevent timeout from firing after success
  const hasCompletedRef = useRef(isDevBypassEnabled()); // Already completed if dev bypass

  const supabase = useMemo(() => createClient(), []);

  // Log dev bypass status on mount
  useEffect(() => {
    if (isDevBypass) {
      console.log('🔓 DEV AUTH BYPASS ENABLED - Using mock user:', DEV_MOCK_USER.email);
    }
  }, [isDevBypass]);

  const fetchProfile = useCallback(async (userId: string, retryCount = 0): Promise<UserProfile | null> => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Profile fetch error:', error.message);
        // Retry once on failure
        if (retryCount < 1) {
          console.log('Retrying profile fetch...');
          await new Promise(resolve => setTimeout(resolve, 500));
          return fetchProfile(userId, retryCount + 1);
        }
        return null;
      }
      return data as UserProfile;
    } catch (err) {
      console.error('Profile fetch exception:', err);
      // Retry once on exception
      if (retryCount < 1) {
        console.log('Retrying profile fetch after exception...');
        await new Promise(resolve => setTimeout(resolve, 500));
        return fetchProfile(userId, retryCount + 1);
      }
      return null;
    }
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    if (user) {
      const newProfile = await fetchProfile(user.id);
      setProfile(newProfile);
    }
  }, [user, fetchProfile]);

  const signOut = useCallback(async () => {
    // In dev bypass mode, just redirect to login (no actual signout needed)
    if (isDevBypass) {
      console.log('🔓 DEV BYPASS: Simulating sign out');
      window.location.href = '/login';
      return;
    }
    try {
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
    } catch (err) {
      console.error('Sign out error:', err);
    }
    window.location.href = '/login';
  }, [supabase, isDevBypass]);

  // Global timeout to prevent infinite loading
  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      if (!hasCompletedRef.current) {
        console.warn('useUser: Loading timeout reached, checking session...');

        // Try to get session quickly (faster than getUser)
        try {
          const { data: { session } } = await supabase.auth.getSession();

          if (session?.user) {
            console.log('useUser: Found valid session on timeout, using session user');
            setUser(session.user);
            setHasSession(true);
          } else {
            console.log('useUser: No session found on timeout');
            setHasSession(false);
          }
        } catch (err) {
          console.error('useUser: Error checking session on timeout', err);
        }

        hasCompletedRef.current = true;
        setIsLoading(false);
      }
    }, USER_LOADING_TIMEOUT_MS);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [supabase]);

  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      console.log('useUser: Initializing...');

      try {
        const { data: { user: authUser }, error } = await supabase.auth.getUser();

        console.log('useUser: getUser result', {
          userId: authUser?.id,
          error: error?.message
        });

        if (!isMounted || hasCompletedRef.current) return;

        if (authUser) {
          setUser(authUser);
          setHasSession(true);
          const userProfile = await fetchProfile(authUser.id);
          if (isMounted && !hasCompletedRef.current) {
            setProfile(userProfile);
          }
        } else {
          setUser(null);
          setProfile(null);
          setHasSession(false);
        }
      } catch (err) {
        console.error('useUser: Initialize error', err);
        if (isMounted && !hasCompletedRef.current) {
          setUser(null);
          setProfile(null);
        }
      } finally {
        console.log('useUser: Setting isLoading to false');
        if (isMounted && !hasCompletedRef.current) {
          hasCompletedRef.current = true;
          setIsLoading(false);
        }
      }
    };

    initialize();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('useUser: Auth state changed:', event);

        if (!isMounted) return;

        const currentUser = session?.user ?? null;
        setUser(currentUser);

        if (currentUser) {
          const userProfile = await fetchProfile(currentUser.id);
          if (isMounted) {
            setProfile(userProfile);
          }
        } else {
          setProfile(null);
        }
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, fetchProfile]);

  const value = useMemo(() => ({
    user,
    profile,
    isLoading,
    hasSession,
    signOut,
    refreshProfile,
    isDevBypass,
  }), [user, profile, isLoading, hasSession, signOut, refreshProfile, isDevBypass]);

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
