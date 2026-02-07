import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  plan: 'starter' | 'pro' | 'enterprise';
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      
      login: async (email: string, _password: string) => {
        set({ isLoading: true });
        // Simulated login - replace with actual API call
        await new Promise(resolve => setTimeout(resolve, 1000));
        const mockUser: User = {
          id: '1',
          name: email.split('@')[0],
          email,
          plan: 'pro',
        };
        set({ user: mockUser, isAuthenticated: true, isLoading: false });
      },
      
      register: async (name: string, email: string, _password: string) => {
        set({ isLoading: true });
        await new Promise(resolve => setTimeout(resolve, 1000));
        const mockUser: User = {
          id: '1',
          name,
          email,
          plan: 'starter',
        };
        set({ user: mockUser, isAuthenticated: true, isLoading: false });
      },
      
      logout: () => {
        set({ user: null, isAuthenticated: false });
      },
      
      setUser: (user) => {
        set({ user, isAuthenticated: !!user });
      },
    }),
    {
      name: 'adspulse-auth',
    }
  )
);
