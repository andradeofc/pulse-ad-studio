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
  blockedReason: string | null;
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

// Helper function to check user status in user_profiles
const checkUserStatus = async (userId: string): Promise<{ 
  allowed: boolean; 
  status?: string; 
  message?: string 
}> => {
  try {
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('status')
      .eq('user_id', userId)
      .maybeSingle();

    // If no profile exists yet (new user) or error, allow access
    if (error || !profile) {
      return { allowed: true };
    }

    if (profile.status === 'suspended') {
      return { 
        allowed: false, 
        status: 'suspended',
        message: 'Sua conta está suspensa temporariamente. Entre em contato com o suporte para mais informações.'
      };
    }

    if (profile.status === 'banned') {
      return { 
        allowed: false, 
        status: 'banned',
        message: 'Sua conta foi banida permanentemente devido a violações dos termos de uso.'
      };
    }

    // Status is 'active' or 'inactive' - allow access
    return { allowed: true };
  } catch (error) {
    // On error, allow access to not block legitimate users
    console.error('Error checking user status:', error);
    return { allowed: true };
  }
};

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  supabaseUser: null,
  isAuthenticated: false,
  isLoading: true,
  blockedReason: null,

  initialize: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        // Check user status before allowing access
        const statusCheck = await checkUserStatus(session.user.id);
        
        if (!statusCheck.allowed) {
          // User is suspended or banned - sign them out silently
          await supabase.auth.signOut();
          set({
            supabaseUser: null,
            user: null,
            isAuthenticated: false,
            isLoading: false,
            blockedReason: statusCheck.message || null,
          });
          return;
        }

        set({
          supabaseUser: session.user,
          user: mapSupabaseUser(session.user),
          isAuthenticated: true,
          isLoading: false,
          blockedReason: null,
        });
      } else {
        set({ isLoading: false });
      }

      // Listen for auth changes
      supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          // Defer status check to avoid Supabase client deadlock
          setTimeout(async () => {
            const statusCheck = await checkUserStatus(session.user.id);
            
            if (!statusCheck.allowed) {
              await supabase.auth.signOut();
              set({
                supabaseUser: null,
                user: null,
                isAuthenticated: false,
                blockedReason: statusCheck.message || null,
              });
              return;
            }

            set({
              supabaseUser: session.user,
              user: mapSupabaseUser(session.user),
              isAuthenticated: true,
              blockedReason: null,
            });
          }, 0);
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
    set({ isLoading: true, blockedReason: null });
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      set({ isLoading: false });
      throw error;
    }

    if (data.user) {
      // Check user status after successful authentication
      const statusCheck = await checkUserStatus(data.user.id);
      
      if (!statusCheck.allowed) {
        // Sign out the user immediately
        await supabase.auth.signOut();
        set({ 
          isLoading: false,
          blockedReason: statusCheck.message || null,
        });
        throw new Error(statusCheck.message || 'Acesso negado');
      }

      set({
        supabaseUser: data.user,
        user: mapSupabaseUser(data.user),
        isAuthenticated: true,
        isLoading: false,
        blockedReason: null,
      });
    }
  },

  register: async (name: string, email: string, password: string) => {
    set({ isLoading: true, blockedReason: null });

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
      blockedReason: null,
    });
  },

  setUser: (user) => {
    set({ user, isAuthenticated: !!user });
  },
}));
