import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';

export function useAuth() {
  const { initialize, ...rest } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  return rest;
}

export function useRequireAuth() {
  const { isAuthenticated, isLoading, user } = useAuthStore();
  
  return {
    isAuthenticated,
    isLoading,
    user,
    isReady: !isLoading,
  };
}
