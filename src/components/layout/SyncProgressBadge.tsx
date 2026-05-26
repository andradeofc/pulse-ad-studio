import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, CheckCircle, AlertCircle, X, Database, FileText, Target } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';

type SyncStage = 'idle' | 'syncing_accounts' | 'syncing_pages' | 'syncing_pixels' | 'completed' | 'error';

interface SyncingProfile {
  id: string;
  name: string;
  sync_status: SyncStage;
}

interface SyncProgressBadgeProps {
  isCollapsed?: boolean;
}

const stageConfig: Record<SyncStage, { label: string; icon: typeof Database; progress: number }> = {
  idle: { label: '', icon: Database, progress: 0 },
  syncing_accounts: { label: 'Sincronizando contas...', icon: Database, progress: 33 },
  syncing_pages: { label: 'Sincronizando páginas...', icon: FileText, progress: 66 },
  syncing_pixels: { label: 'Sincronizando pixels...', icon: Target, progress: 90 },
  completed: { label: 'Sincronização concluída!', icon: CheckCircle, progress: 100 },
  error: { label: 'Erro na sincronização', icon: AlertCircle, progress: 0 },
};

export function SyncProgressBadge({ isCollapsed = false }: SyncProgressBadgeProps) {
  const { isAuthenticated } = useAuthStore();
  const [syncingProfiles, setSyncingProfiles] = useState<SyncingProfile[]>([]);
  const [recentlyCompleted, setRecentlyCompleted] = useState<SyncingProfile[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [currentStage, setCurrentStage] = useState<SyncStage>('idle');

  const fetchSyncStatus = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      const { data, error } = await supabase
        .from('facebook_profiles')
        .select('id, name, sync_status')
        .neq('sync_status', 'idle');

      if (error) {
        console.error('Error checking sync status:', error);
        return;
      }

      const syncing = (data || []).filter(p =>
        p.sync_status === 'syncing_accounts' ||
        p.sync_status === 'syncing_pages' ||
        p.sync_status === 'syncing_pixels'
      ) as SyncingProfile[];

      const completed = (data || []).filter(p =>
        p.sync_status === 'completed' ||
        p.sync_status === 'error'
      ) as SyncingProfile[];

      setSyncingProfiles(syncing);

      if (syncing.length > 0) {
        setCurrentStage(syncing[0].sync_status as SyncStage);
      }

      if (completed.length > 0 && recentlyCompleted.length === 0) {
        setRecentlyCompleted(completed);
        setCurrentStage(completed[0].sync_status as SyncStage);
        setDismissed(false);

        setTimeout(async () => {
          for (const profile of completed) {
            await supabase
              .from('facebook_profiles')
              .update({ sync_status: 'idle' })
              .eq('id', profile.id);
          }
          setRecentlyCompleted([]);
          setCurrentStage('idle');
        }, 5000);
      }
    } catch (error) {
      console.error('Error in sync status check:', error);
    }
  }, [isAuthenticated, recentlyCompleted.length]);

  useEffect(() => {
    if (!isAuthenticated) return;

    // Initial fetch on mount
    fetchSyncStatus();

    // Subscribe to realtime changes (RLS-scoped to the current user's profiles)
    const channel = supabase
      .channel('sync-progress-badge')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'facebook_profiles',
        },
        () => {
          fetchSyncStatus();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated, fetchSyncStatus]);

  const handleDismiss = () => {
    setDismissed(true);
    setRecentlyCompleted([]);
  };

  // Computed values
  const isSyncing = syncingProfiles.length > 0;
  const hasErrors = recentlyCompleted.some(p => p.sync_status === 'error');
  const allCompleted = !isSyncing && recentlyCompleted.length > 0;
  const shouldShow = syncingProfiles.length > 0 || (recentlyCompleted.length > 0 && !dismissed);

  // Nothing to show
  if (!shouldShow) {
    return null;
  }

  const config = stageConfig[currentStage] || stageConfig.idle;
  const StageIcon = isSyncing ? Loader2 : config.icon;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className={cn(
          "mx-3 mb-4",
          isCollapsed && "mx-2"
        )}
      >
        <div
          className={cn(
            "relative rounded-lg border p-3 transition-all",
            isSyncing && "bg-primary/10 border-primary/30",
            allCompleted && !hasErrors && "bg-accent border-accent",
            allCompleted && hasErrors && "bg-destructive/10 border-destructive/30"
          )}
        >
          {/* Dismiss button for completed state */}
          {allCompleted && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-1 right-1 h-5 w-5"
              onClick={handleDismiss}
            >
              <X className="h-3 w-3" />
            </Button>
          )}

          <div className="flex items-center gap-2">
            <StageIcon 
              className={cn(
                "h-4 w-4 flex-shrink-0",
                isSyncing && "animate-spin text-primary",
                allCompleted && !hasErrors && "text-primary",
                hasErrors && "text-destructive"
              )} 
            />

            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">
                  {isSyncing ? config.label : allCompleted && !hasErrors ? 'Sincronização concluída!' : 'Erro na sincronização'}
                </p>
                
                {isSyncing && (
                  <div className="mt-2">
                    <Progress value={config.progress} className="h-1" />
                    <div className="flex justify-between mt-1">
                      <p className="text-[10px] text-muted-foreground">
                        {syncingProfiles.length} perfil(s)
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {config.progress}%
                      </p>
                    </div>
                  </div>
                )}

                {allCompleted && !hasErrors && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Todos os dados foram sincronizados
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Collapsed state - just show icon with badge */}
          {isCollapsed && isSyncing && (
            <Badge 
              variant="default" 
              className="absolute -top-2 -right-2 h-4 w-4 p-0 flex items-center justify-center text-[10px]"
            >
              {syncingProfiles.length}
            </Badge>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
