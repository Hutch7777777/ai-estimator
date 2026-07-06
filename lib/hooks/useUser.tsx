'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useMemo, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { User } from '@supabase/supabase-js';

const USER_LOADING_TIMEOUT_MS = 5000; // 5 second timeout for user loading
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
  // IMPORTANT: Always start with consistent initial state for SSR hydration
  // Dev bypass is checked in useEffect after hydration to avoid mismatch
  const [isDevBypass, setIsDevBypass] = useState(false);

  // Always start with loading state for consistent SSR/client hydration
  const [user, setUserState] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  // Track if we've completed loading to prevent timeout from firing after success
  const hasCompletedRef = useRef(false);

  const supabase = useMemo(() => createClient(), []);

  // Keep a stable `user` object reference while the id is unchanged. Both
  // getUser() and the INITIAL_SESSION / TOKEN_REFRESHED auth events deliver
  // fresh User objects for the same account; without this, every event
  // changed the reference and restarted anything keyed on `user` (notably
  // the organization loader), which is what left the workspace spinner
  // stuck. This does not gate on isMounted — React ignores setState after
  // unmount and the stable-identity guarantee must hold on every call.
  const setUser = useCallback((next: User | null) => {
    setUserState((prev) => ((prev?.id ?? null) === (next?.id ?? null) ? prev : next));
  }, []);

  // Check for dev bypass after hydration (client-side only)
  useEffect(() => {
    if (isDevBypassEnabled()) {
      setIsDevBypass(true);
      setUser(DEV_MOCK_USER);
      setProfile(DEV_MOCK_PROFILE);
      setHasSession(true);
      setIsLoading(false);
      hasCompletedRef.current = true;
    }
  }, [setUser]); // Run once on mount

  const fetchProfile = useCallback(async (userId: string, retryCount = 0): Promise<UserProfile | null> => {
    try {
      const result = await withTimeout(
        supabase
          .from('user_profiles')
          .select('*')
          .eq('id', userId)
          .single(),
        'Profile fetch'
      );
      if (!result) return null;
      const { data, error } = result;

      if (error) {
        console.error('Profile fetch error:', error.message);
        // Retry once on failure
        if (retryCount < 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
          return fetchProfile(userId, retryCount + 1);
        }
        return null;
      }
      return data as UserProfile;
    } catch (err) {
      console.warn(
        'Profile fetch exception:',
        err instanceof Error ? err.message : String(err)
      );
      // Retry once on exception
      if (retryCount < 1) {
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
  }, [supabase, isDevBypass, setUser]);

  // Global timeout to prevent infinite loading
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (!hasCompletedRef.current) {
        console.warn('useUser: Loading timeout reached, forcing completion');

        // IMMEDIATELY mark as completed - no async before this!
        hasCompletedRef.current = true;
        setIsLoading(false);

        // Now try to get session in background (non-blocking)
        supabase.auth.getSession()
          .then(({ data: { session } }) => {
            if (session?.user) {
              setUser(session.user);
              setHasSession(true);
            } else {
              setHasSession(false);
            }
          })
          .catch((err) => {
            console.error('useUser: Error checking session after timeout', err);
          });
      }
    }, USER_LOADING_TIMEOUT_MS);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [supabase, setUser]);

  useEffect(() => {
    if (isDevBypassEnabled()) {
      return;
    }

    let isMounted = true;

    const loadProfile = (userId: string) => {
      void fetchProfile(userId).then((userProfile) => {
        if (isMounted) {
          setProfile(userProfile);
        }
      });
    };

    const initialize = async () => {

      try {
        const result = await withTimeout(
          supabase.auth.getUser(),
          'Auth user fetch'
        );
        if (!result) {
          const sessionResult = await withTimeout(
            supabase.auth.getSession(),
            'Auth session fallback'
          );
          const sessionUser = sessionResult?.data.session?.user ?? null;

          if (isMounted) {
            setUser(sessionUser);
            setHasSession(!!sessionUser);
            setProfile(null);
            if (sessionUser) {
              loadProfile(sessionUser.id);
            }
          }
          return;
        }
        const { data: { user: authUser }, error } = result;


        if (!isMounted || hasCompletedRef.current) return;

        if (authUser) {
          setUser(authUser);
          setHasSession(true);
          // Load the profile without blocking initialize() — a slow/hung
          // profile fetch must not keep isLoading true (July loading fix).
          setProfile(null);
          loadProfile(authUser.id);
        } else {
          setUser(null);
          setProfile(null);
          setHasSession(false);
        }
      } catch (err) {
        console.warn(
          'useUser: Initialize error',
          err instanceof Error ? err.message : String(err)
        );
        if (isMounted && !hasCompletedRef.current) {
          setUser(null);
          setProfile(null);
        }
      } finally {
        if (isMounted && !hasCompletedRef.current) {
          hasCompletedRef.current = true;
          setIsLoading(false);
        }
      }
    };

    initialize();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) return;

        const currentUser = session?.user ?? null;
        setUser(currentUser);
        setHasSession(!!currentUser);

        if (currentUser) {
          setProfile(null);
          window.setTimeout(() => loadProfile(currentUser.id), 0);
        } else {
          setProfile(null);
        }
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, fetchProfile, setUser]);

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
