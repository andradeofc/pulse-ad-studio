import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import type { User as SupabaseUser } from '@supabase/supabase-js';

interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  plan: 'starter' | 'pro' | 'enterprise';
}

interface AuthState {
  user: User | null;
  supabaseUser: SupabaseUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
  initialize: () => Promise<void>;
}

const mapSupabaseUser = (supabaseUser: SupabaseUser): User => ({
  id: supabaseUser.id,
  name: supabaseUser.user_metadata?.name || supabaseUser.email?.split('@')[0] || 'User',
  email: supabaseUser.email || '',
  avatarUrl: supabaseUser.user_metadata?.avatar_url,
  plan: 'pro', // Default plan, can be fetched from profile later
});

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  supabaseUser: null,
  isAuthenticated: false,
  isLoading: true,

  initialize: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        set({
          supabaseUser: session.user,
          user: mapSupabaseUser(session.user),
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        set({ isLoading: false });
      }

      // Listen for auth changes
      supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          set({
            supabaseUser: session.user,
            user: mapSupabaseUser(session.user),
            isAuthenticated: true,
          });
        } else {
          set({
            supabaseUser: null,
            user: null,
            isAuthenticated: false,
          });
        }
      });
    } catch (error) {
      console.error('Error initializing auth:', error);
      set({ isLoading: false });
    }
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true });
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      set({ isLoading: false });
      throw error;
    }

    if (data.user) {
      set({
        supabaseUser: data.user,
        user: mapSupabaseUser(data.user),
        isAuthenticated: true,
        isLoading: false,
      });
    }
  },

  register: async (name: string, email: string, password: string) => {
    set({ isLoading: true });

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
        },
      },
    });

    if (error) {
      set({ isLoading: false });
      throw error;
    }

    // Note: User might need to confirm email before being fully authenticated
    if (data.user) {
      set({
        supabaseUser: data.user,
        user: mapSupabaseUser(data.user),
        isAuthenticated: !!data.session, // Only authenticated if session exists (email confirmed)
        isLoading: false,
      });
    } else {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    await supabase.auth.signOut();
    set({
      supabaseUser: null,
      user: null,
      isAuthenticated: false,
    });
  },

  setUser: (user) => {
    set({ user, isAuthenticated: !!user });
  },
}));
