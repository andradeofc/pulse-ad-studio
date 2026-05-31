import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, RefreshCw, ArrowRightLeft, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface PausedItemsBannerProps {
  /** Which resource type to check: 'monitors' | 'schedules' | 'both' */
  type?: 'monitors' | 'schedules' | 'both';
}

/**
 * Shows a warning banner when monitors or schedules are paused
 * due to a disconnected Facebook profile. Also offers a way to
 * migrate them to another active profile.
 */
export function PausedItemsBanner({ type = 'both' }: PausedItemsBannerProps) {
  const qc = useQueryClient();
  const [migrateOpen, setMigrateOpen] = useState(false);
  const [targetProfileId, setTargetProfileId] = useState<string>('');

  const { data: pausedData } = useQuery({
    queryKey: ['paused-items-check', type],
    queryFn: async () => {
      const { data: disconnectedProfiles } = await supabase
        .from('facebook_profiles')
        .select('id, name')
        .eq('status', 'disconnected');

      if (!disconnectedProfiles || disconnectedProfiles.length === 0) {
        return { monitors: 0, schedules: 0, affectedProfiles: [] as { id: string; name: string; monitors: number }[] };
      }

      const profileIds = disconnectedProfiles.map((p) => p.id);

      let monitors = 0;
      let schedules = 0;
      const affectedProfiles: { id: string; name: string; monitors: number }[] = [];

      if (type === 'monitors' || type === 'both') {
        for (const p of disconnectedProfiles) {
          const { count } = await supabase
            .from('catalog_media_monitors')
            .select('id', { count: 'exact', head: true })
            .eq('profile_id', p.id)
            .eq('is_active', false);
          if (count && count > 0) {
            affectedProfiles.push({ id: p.id, name: p.name, monitors: count });
            monitors += count;
          }
        }
      }

      if (type === 'schedules' || type === 'both') {
        const { count } = await supabase
          .from('catalog_schedules')
          .select('id', { count: 'exact', head: true })
          .in('profile_id', profileIds)
          .eq('status', 'paused');
        schedules = count || 0;
      }

      return { monitors, schedules, affectedProfiles };
    },
    staleTime: 30_000,
  });

  // Active profiles available as migration target
  const { data: activeProfiles } = useQuery({
    queryKey: ['active-profiles-for-migration'],
    enabled: migrateOpen,
    queryFn: async () => {
      const { data } = await supabase
        .from('facebook_profiles')
        .select('id, name')
        .eq('status', 'active')
        .order('name');
      return data || [];
    },
  });

  const migrateMutation = useMutation({
    mutationFn: async (newProfileId: string) => {
      const sources = pausedData?.affectedProfiles ?? [];
      if (sources.length === 0) return { migrated: 0 };
      let total = 0;
      for (const src of sources) {
        const { error } = await supabase.rpc('migrate_catalog_monitors_to_profile', {
          p_old_profile_id: src.id,
          p_new_profile_id: newProfileId,
        });
        if (error) throw error;
        total += src.monitors;
      }
      return { migrated: total };
    },
    onSuccess: ({ migrated }) => {
      toast.success(`${migrated} monitor(es) migrado(s) e reativado(s)`);
      setMigrateOpen(false);
      setTargetProfileId('');
      qc.invalidateQueries({ queryKey: ['paused-items-check'] });
      qc.invalidateQueries({ queryKey: ['catalog-monitors'] });
    },
    onError: (e: any) => {
      toast.error(e?.message || 'Falha ao migrar monitores');
    },
  });

  const profileNames = useMemo(
    () => (pausedData?.affectedProfiles ?? []).map((p) => p.name),
    [pausedData]
  );

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

  const canMigrate = pausedData.monitors > 0 && pausedData.affectedProfiles.length > 0;

  return (
    <>
      <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Itens pausados</AlertTitle>
        <AlertDescription className="flex flex-col sm:flex-row sm:items-center gap-2">
          <span>
            {parts.join(' e ')} pausado{pausedData.monitors + pausedData.schedules > 1 ? 's' : ''} porque o perfil
            {profileNames.length > 0 && <strong> {profileNames.join(', ')}</strong>} foi desconectado.
          </span>
          <div className="flex flex-wrap gap-2 shrink-0">
            {canMigrate && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setMigrateOpen(true)}
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                Migrar para outro perfil
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <Link to="/perfis-facebook">
                <RefreshCw className="w-3.5 h-3.5" />
                Reconectar perfil
              </Link>
            </Button>
          </div>
        </AlertDescription>
      </Alert>

      <Dialog open={migrateOpen} onOpenChange={setMigrateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Migrar monitores para outro perfil</DialogTitle>
            <DialogDescription>
              Os monitores pausados serão reatribuídos ao perfil escolhido e reativados automaticamente.
              Os catálogos e conjuntos de produtos serão vinculados ao novo perfil sem perder histórico.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="text-sm text-muted-foreground">
              <strong className="text-foreground">{pausedData.monitors}</strong> monitor(es) de{' '}
              <strong className="text-foreground">{pausedData.affectedProfiles.length}</strong> perfil(is)
              desconectado(s) serão migrados.
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="target-profile">Perfil de destino</Label>
              <Select value={targetProfileId} onValueChange={setTargetProfileId}>
                <SelectTrigger id="target-profile">
                  <SelectValue placeholder="Selecione um perfil ativo" />
                </SelectTrigger>
                <SelectContent>
                  {(activeProfiles ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                  {activeProfiles && activeProfiles.length === 0 && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      Nenhum perfil ativo disponível
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMigrateOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!targetProfileId || migrateMutation.isPending}
              onClick={() => targetProfileId && migrateMutation.mutate(targetProfileId)}
            >
              {migrateMutation.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Migrar e reativar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
