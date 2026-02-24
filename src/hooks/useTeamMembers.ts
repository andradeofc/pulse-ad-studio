import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface TeamMember {
  id: string;
  owner_id: string;
  member_id: string;
  email: string;
  full_name: string;
  status: string;
  invited_at: string;
  created_at: string;
}

export function useTeamMembers() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const membersQuery = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('manage-team-members', {
        body: { action: 'list' },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      return (data?.members || []) as TeamMember[];
    },
  });

  const inviteMember = useMutation({
    mutationFn: async (email: string) => {
      const { data, error } = await supabase.functions.invoke('manage-team-members', {
        body: { action: 'invite', email },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      toast({ title: 'Colaborador adicionado!', description: 'O colaborador pode fazer login com a senha padrão.' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    },
  });

  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { data, error } = await supabase.functions.invoke('manage-team-members', {
        body: { action: 'remove', member_id: memberId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      toast({ title: 'Colaborador removido', description: 'O acesso foi revogado.' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    },
  });

  return {
    members: membersQuery.data || [],
    isLoading: membersQuery.isLoading,
    error: membersQuery.error,
    inviteMember,
    removeMember,
    activeCount: (membersQuery.data || []).filter(m => m.status === 'active').length,
  };
}
