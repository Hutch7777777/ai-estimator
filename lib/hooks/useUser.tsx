'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { User } from '@supabase/supabase-js';

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
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Create client once with useMemo
  const supabase = useMemo(() => createClient(), []);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching profile:', error.message, error.details, error.hint);
        return null;
      }

      return data as UserProfile;
    } catch (err) {
      console.error('Profile fetch exception:', err);
      return null;
    }
  };

  const refreshProfile = async () => {
    if (user) {
      const newProfile = await fetchProfile(user.id);
      setProfile(newProfile);
    }
  };

  useEffect(() => {
    const getInitialSession = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();

        // "Auth session missing!" is expected when not logged in - don't log it as error
        if (error && error.message !== 'Auth session missing!') {
          console.error('Auth error:', error.message);
        }

        setUser(user);

        if (user) {
          const profile = await fetchProfile(user.id);
          setProfile(profile);
        }
      } catch (err) {
        console.error('Session check exception:', err);
      } finally {
        setIsLoading(false);
      }
    };

    getInitialSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event);
        const currentUser = session?.user ?? null;
        setUser(currentUser);

        if (currentUser) {
          const profile = await fetchProfile(currentUser.id);
          setProfile(profile);
        } else {
          setProfile(null);
        }

        setIsLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Sign out error:', error.message);
      }
      setUser(null);
      setProfile(null);
      // Force redirect to login
      window.location.href = '/login';
    } catch (err) {
      console.error('Sign out exception:', err);
      // Force redirect anyway
      window.location.href = '/login';
    }
  };

  return (
    <UserContext.Provider value={{ user, profile, isLoading, signOut, refreshProfile }}>
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
