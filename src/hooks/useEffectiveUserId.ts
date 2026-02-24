import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';

interface EffectiveUserInfo {
  effectiveUserId: string;
  isCollaborator: boolean;
  ownerName: string | null;
}

export function useEffectiveUserId() {
  const { supabaseUser } = useAuthStore();

  return useQuery({
    queryKey: ['effective-user-id', supabaseUser?.id],
    queryFn: async (): Promise<EffectiveUserInfo> => {
      if (!supabaseUser) {
        return { effectiveUserId: '', isCollaborator: false, ownerName: null };
      }

      // Check if current user is a collaborator
      const { data: teamMember, error } = await supabase
        .from('team_members' as any)
        .select('owner_id')
        .eq('member_id', supabaseUser.id)
        .eq('status', 'active')
        .maybeSingle();

      if (error || !teamMember) {
        return { effectiveUserId: supabaseUser.id, isCollaborator: false, ownerName: null };
      }

      // Get owner name
      const ownerId = (teamMember as any).owner_id;
      const { data: ownerProfile } = await supabase
        .from('user_profiles')
        .select('full_name')
        .eq('user_id', ownerId)
        .maybeSingle();

      return {
        effectiveUserId: ownerId,
        isCollaborator: true,
        ownerName: ownerProfile?.full_name || 'Usuário',
      };
    },
    enabled: !!supabaseUser,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}
