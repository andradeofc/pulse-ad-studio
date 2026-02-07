import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, CheckCircle, AlertCircle, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';

interface SyncingProfile {
  id: string;
  name: string;
  sync_status: string;
}

interface SyncProgressBadgeProps {
  isCollapsed?: boolean;
}

export function SyncProgressBadge({ isCollapsed = false }: SyncProgressBadgeProps) {
  const { isAuthenticated } = useAuthStore();
  const [syncingProfiles, setSyncingProfiles] = useState<SyncingProfile[]>([]);
  const [recentlyCompleted, setRecentlyCompleted] = useState<SyncingProfile[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [progress, setProgress] = useState(10);

  const checkSyncStatus = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      const { data, error } = await supabase
        .from('facebook_profiles')
        .select('id, name, sync_status')
        .in('sync_status', ['syncing', 'completed', 'error']);

      if (error) {
        console.error('Error checking sync status:', error);
        return;
      }

      const syncing = (data || []).filter(p => p.sync_status === 'syncing');
      const completed = (data || []).filter(p => p.sync_status === 'completed' || p.sync_status === 'error');

      setSyncingProfiles(syncing);
      
      // Track recently completed for showing success message briefly
      if (completed.length > 0) {
        setRecentlyCompleted(completed);
        setDismissed(false);
        
        // Reset status after 5 seconds
        setTimeout(async () => {
          for (const profile of completed) {
            await supabase
              .from('facebook_profiles')
              .update({ sync_status: 'idle' })
              .eq('id', profile.id);
          }
          setRecentlyCompleted([]);
        }, 5000);
      }
    } catch (error) {
      console.error('Error in sync status check:', error);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;

    // Initial check
    checkSyncStatus();

    // Poll every 2 seconds
    const interval = setInterval(checkSyncStatus, 2000);

    return () => clearInterval(interval);
  }, [isAuthenticated, checkSyncStatus]);

  // Progress simulation effect
  useEffect(() => {
    const isSyncing = syncingProfiles.length > 0;
    
    if (isSyncing) {
      const interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) return prev;
          return prev + Math.random() * 10;
        });
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setProgress(100);
    }
  }, [syncingProfiles.length]);

  // Reset progress when new sync starts
  useEffect(() => {
    if (syncingProfiles.length > 0) {
      setProgress(10);
    }
  }, [syncingProfiles.length]);

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
            {isSyncing ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
            ) : allCompleted && !hasErrors ? (
              <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
            )}

            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">
                  {isSyncing 
                    ? `Sincronizando ${syncingProfiles.length} perfil(s)...`
                    : allCompleted && !hasErrors
                    ? 'Sincronização concluída!'
                    : 'Erro na sincronização'
                  }
                </p>
                
                {isSyncing && (
                  <div className="mt-2">
                    <Progress value={progress} className="h-1" />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Contas, pixels e páginas...
                    </p>
                  </div>
                )}

                {allCompleted && !hasErrors && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Dados atualizados com sucesso
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
