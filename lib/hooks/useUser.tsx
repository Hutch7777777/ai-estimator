'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { User } from '@supabase/supabase-js';

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
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
          console.log('Retrying profile fetch...');
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
    try {
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
    } catch (err) {
      console.error('Sign out error:', err);
    }
    window.location.href = '/login';
  }, [supabase, setUser]);

  useEffect(() => {
    let isMounted = true;

    const loadProfile = (userId: string) => {
      void fetchProfile(userId).then((userProfile) => {
        if (isMounted) {
          setProfile(userProfile);
        }
      });
    };

    const initialize = async () => {
      console.log('useUser: Initializing...');

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
            setProfile(null);
            if (sessionUser) {
              loadProfile(sessionUser.id);
            }
          }
          return;
        }
        const { data: { user: authUser }, error } = result;

        console.log('useUser: getUser result', {
          userId: authUser?.id,
          error: error?.message
        });

        if (!isMounted) return;

        if (authUser) {
          setUser(authUser);
          setProfile(null);
          loadProfile(authUser.id);
        } else {
          setUser(null);
          setProfile(null);
        }
      } catch (err) {
        console.warn(
          'useUser: Initialize error',
          err instanceof Error ? err.message : String(err)
        );
        if (isMounted) {
          setUser(null);
          setProfile(null);
        }
      } finally {
        console.log('useUser: Setting isLoading to false');
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    initialize();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('useUser: Auth state changed:', event);

        if (!isMounted) return;

        const currentUser = session?.user ?? null;
        setUser(currentUser);

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
    signOut,
    refreshProfile,
  }), [user, profile, isLoading, signOut, refreshProfile]);

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
