import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

interface PausedItemsBannerProps {
  /** Which resource type to check: 'monitors' | 'schedules' | 'both' */
  type?: 'monitors' | 'schedules' | 'both';
}

/**
 * Shows a warning banner when monitors or schedules are paused
 * due to a disconnected Facebook profile.
 */
export function PausedItemsBanner({ type = 'both' }: PausedItemsBannerProps) {
  const { data: pausedData } = useQuery({
    queryKey: ['paused-items-check', type],
    queryFn: async () => {
      // Get disconnected profiles for this user
      const { data: disconnectedProfiles } = await supabase
        .from('facebook_profiles')
        .select('id, name')
        .eq('status', 'disconnected');

      if (!disconnectedProfiles || disconnectedProfiles.length === 0) {
        return { monitors: 0, schedules: 0, profileNames: [] };
      }

      const profileIds = disconnectedProfiles.map(p => p.id);
      const profileNames = disconnectedProfiles.map(p => p.name);

      let monitors = 0;
      let schedules = 0;

      if (type === 'monitors' || type === 'both') {
        const { count } = await supabase
          .from('catalog_media_monitors')
          .select('id', { count: 'exact', head: true })
          .in('profile_id', profileIds)
          .eq('is_active', false);
        monitors = count || 0;
      }

      if (type === 'schedules' || type === 'both') {
        const { count } = await supabase
          .from('catalog_schedules')
          .select('id', { count: 'exact', head: true })
          .in('profile_id', profileIds)
          .eq('status', 'paused');
        schedules = count || 0;
      }

      return { monitors, schedules, profileNames };
    },
    staleTime: 30_000,
  });

  if (!pausedData || (pausedData.monitors === 0 && pausedData.schedules === 0)) {
    return null;
  }

  const parts: string[] = [];
  if (pausedData.monitors > 0) {
    parts.push(`${pausedData.monitors} monitor${pausedData.monitors > 1 ? 'es' : ''}`);
  }
  if (pausedData.schedules > 0) {
    parts.push(`${pausedData.schedules} agendamento${pausedData.schedules > 1 ? 's' : ''}`);
  }

  return (
    <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Itens pausados</AlertTitle>
      <AlertDescription className="flex flex-col sm:flex-row sm:items-center gap-2">
        <span>
          {parts.join(' e ')} pausado{pausedData.monitors + pausedData.schedules > 1 ? 's' : ''} porque o perfil 
          {pausedData.profileNames.length > 0 && (
            <strong> {pausedData.profileNames.join(', ')}</strong>
          )} foi desconectado.
        </span>
        <Button variant="outline" size="sm" className="gap-1.5 shrink-0" asChild>
          <Link to="/perfis-facebook">
            <RefreshCw className="w-3.5 h-3.5" />
            Reconectar perfil
          </Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
