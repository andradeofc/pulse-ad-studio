import { Bell, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { differenceInDays, parseISO, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useState } from 'react';

interface Notification {
  id: string;
  type: 'warning' | 'error' | 'info';
  message: string;
  action: string;
  href: string;
  createdAt?: Date;
}

export function NotificationPopover() {
  const [open, setOpen] = useState(false);

  const { data: notifications = [] } = useQuery({
    queryKey: ['header-notifications'],
    queryFn: async () => {
      const alertsList: Notification[] = [];

      // Check for expiring tokens
      const { data: profiles } = await supabase
        .from('facebook_profiles')
        .select('id, name, token_expires_at, status, updated_at')
        .order('token_expires_at', { ascending: true });

      if (profiles) {
        for (const profile of profiles) {
          if (profile.status === 'expired') {
            alertsList.push({
              id: `expired-${profile.id}`,
              type: 'error',
              message: `Token do perfil "${profile.name}" expirou`,
              action: 'Renovar',
              href: '/perfis-facebook',
              createdAt: new Date(profile.updated_at),
            });
          } else if (profile.token_expires_at) {
            const daysUntilExpiry = differenceInDays(parseISO(profile.token_expires_at), new Date());
            if (daysUntilExpiry <= 7 && daysUntilExpiry > 0) {
              alertsList.push({
                id: `expiring-${profile.id}`,
                type: 'warning',
                message: `Token do perfil "${profile.name}" expira em ${daysUntilExpiry} dias`,
                action: 'Renovar',
                href: '/perfis-facebook',
                createdAt: new Date(profile.updated_at),
              });
            }
          }
        }
      }

      // Check for failed jobs
      const { data: failedJobs } = await supabase
        .from('campaign_jobs')
        .select('id, name, updated_at')
        .eq('status', 'failed')
        .order('created_at', { ascending: false })
        .limit(5);

      if (failedJobs) {
        for (const job of failedJobs) {
          alertsList.push({
            id: `failed-${job.id}`,
            type: 'error',
            message: `Job "${job.name}" falhou`,
            action: 'Ver detalhes',
            href: '/fila-processamento',
            createdAt: new Date(job.updated_at),
          });
        }
      }

      // Check for completed jobs today
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: completedJobs } = await supabase
        .from('campaign_jobs')
        .select('id, name, completed_at')
        .eq('status', 'completed')
        .gte('completed_at', today.toISOString())
        .order('completed_at', { ascending: false })
        .limit(5);

      if (completedJobs && completedJobs.length > 0) {
        for (const job of completedJobs) {
          alertsList.push({
            id: `completed-${job.id}`,
            type: 'info',
            message: `Job "${job.name}" concluído`,
            action: 'Ver fila',
            href: '/fila-processamento',
            createdAt: job.completed_at ? new Date(job.completed_at) : new Date(),
          });
        }
      }

      // Check for processing jobs
      const { data: processingJobs } = await supabase
        .from('campaign_jobs')
        .select('id, name, updated_at')
        .eq('status', 'processing')
        .order('updated_at', { ascending: false })
        .limit(3);

      if (processingJobs) {
        for (const job of processingJobs) {
          alertsList.push({
            id: `processing-${job.id}`,
            type: 'info',
            message: `Job "${job.name}" em processamento`,
            action: 'Acompanhar',
            href: '/fila-processamento',
            createdAt: new Date(job.updated_at),
          });
        }
      }

      // Sort by date (most recent first)
      return alertsList.sort((a, b) => {
        if (!a.createdAt || !b.createdAt) return 0;
        return b.createdAt.getTime() - a.createdAt.getTime();
      }).slice(0, 10);
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'error':
        return <AlertTriangle className="w-4 h-4 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-ads-warning" />;
      case 'info':
        return <Info className="w-4 h-4 text-ads-info" />;
      default:
        return <CheckCircle2 className="w-4 h-4 text-ads-success" />;
    }
  };

  const getBgColor = (type: Notification['type']) => {
    switch (type) {
      case 'error':
        return 'bg-destructive/10 border-destructive/20';
      case 'warning':
        return 'bg-ads-warning/10 border-ads-warning/20';
      case 'info':
        return 'bg-ads-info/10 border-ads-info/20';
      default:
        return 'bg-ads-success/10 border-ads-success/20';
    }
  };

  const unreadCount = notifications.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-muted-foreground hover:text-foreground"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-destructive rounded-full flex items-center justify-center">
              <span className="text-[10px] font-bold text-destructive-foreground">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h4 className="font-semibold text-foreground">Notificações</h4>
          {unreadCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {unreadCount} {unreadCount === 1 ? 'nova' : 'novas'}
            </span>
          )}
        </div>
        <ScrollArea className="h-[300px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Bell className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">Nenhuma notificação</p>
            </div>
          ) : (
            <div className="p-2 space-y-2">
              {notifications.map((notification) => (
                <Link
                  key={notification.id}
                  to={notification.href}
                  onClick={() => setOpen(false)}
                  className={`block p-3 rounded-lg border transition-colors hover:bg-secondary/50 ${getBgColor(notification.type)}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {getIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground line-clamp-2">
                        {notification.message}
                      </p>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-primary font-medium">
                          {notification.action}
                        </span>
                        {notification.createdAt && (
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(notification.createdAt, {
                              addSuffix: true,
                              locale: ptBR,
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </ScrollArea>
        <div className="p-2 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground hover:text-foreground"
            asChild
            onClick={() => setOpen(false)}
          >
            <Link to="/fila-processamento">Ver fila de processamento</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
