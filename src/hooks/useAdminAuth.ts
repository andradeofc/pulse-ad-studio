import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

interface AdminAuthState {
  isAdmin: boolean;
  isLoading: boolean;
  userId: string | null;
}

export function useAdminAuth(redirectOnFail = true): AdminAuthState {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function checkAdminRole() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          if (redirectOnFail) {
            navigate('/dashboard', { replace: true });
          }
          setIsLoading(false);
          return;
        }

        setUserId(user.id);

        // Check if user has admin role using the security definer function
        const { data, error } = await supabase.rpc('is_admin');
        
        if (error) {
          console.error('Error checking admin role:', error);
          if (redirectOnFail) {
            navigate('/dashboard', { replace: true });
          }
          setIsLoading(false);
          return;
        }

        if (data === true) {
          setIsAdmin(true);
        } else if (redirectOnFail) {
          // Silently redirect non-admins without revealing the route exists
          navigate('/dashboard', { replace: true });
        }
      } catch (err) {
        console.error('Admin auth error:', err);
        if (redirectOnFail) {
          navigate('/dashboard', { replace: true });
        }
      } finally {
        setIsLoading(false);
      }
    }

    checkAdminRole();
  }, [navigate, redirectOnFail]);

  return { isAdmin, isLoading, userId };
}

// Hook to check admin status without redirect (for sidebar button visibility)
export function useIsAdmin(): { isAdmin: boolean; isLoading: boolean } {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function checkAdmin() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          setIsLoading(false);
          return;
        }

        const { data } = await supabase.rpc('is_admin');
        setIsAdmin(data === true);
      } catch (err) {
        console.error('Admin check error:', err);
      } finally {
        setIsLoading(false);
      }
    }

    checkAdmin();
  }, []);

  return { isAdmin, isLoading };
}
