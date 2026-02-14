import { Bell, AlertTriangle, CheckCircle2, Info, Megaphone, CheckCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { differenceInDays, parseISO, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useState, useMemo, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';

interface SystemNotification {
  id: string;
  type: 'warning' | 'error' | 'info' | 'success';
  title?: string;
  message: string;
  action: string;
  href: string;
  createdAt?: Date;
  source: 'system';
}

interface AdminNotification {
  id: string;
  type: 'warning' | 'error' | 'info' | 'success' | 'urgent';
  title: string;
  message: string;
  createdAt: Date;
  source: 'admin';
  read: boolean;
}

type Notification = SystemNotification | AdminNotification;

export function NotificationPopover() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  // Fetch dismissed system notification keys from DB
  const { data: dismissedSystemIds = new Set<string>() } = useQuery({
    queryKey: ['dismissed-system-notifications', user?.id],
    queryFn: async () => {
      if (!user?.id) return new Set<string>();
      const { data } = await supabase
        .from('user_dismissed_notifications')
        .select('notification_key')
        .eq('user_id', user.id);
      return new Set(data?.map((r) => r.notification_key) || []);
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });

  // Fetch system notifications (tokens, jobs)
  const { data: systemNotifications = [] } = useQuery({
    queryKey: ['system-notifications'],
    queryFn: async () => {
      const alertsList: SystemNotification[] = [];

      // Check for expiring tokens
      const { data: profiles } = await supabase
        .from('facebook_profiles')
        .select('id, name, token_expires_at, status, updated_at')
        .order('token_expires_at', { ascending: true })
        .limit(10);

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
              source: 'system',
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
                source: 'system',
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
        .limit(3);

      if (failedJobs) {
        for (const job of failedJobs) {
          alertsList.push({
            id: `failed-${job.id}`,
            type: 'error',
            message: `Job "${job.name}" falhou`,
            action: 'Ver detalhes',
            href: '/fila-processamento',
            createdAt: new Date(job.updated_at),
            source: 'system',
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
        .limit(3);

      if (completedJobs && completedJobs.length > 0) {
        for (const job of completedJobs) {
          alertsList.push({
            id: `completed-${job.id}`,
            type: 'info',
            message: `Job "${job.name}" concluído`,
            action: 'Ver fila',
            href: '/fila-processamento',
            createdAt: job.completed_at ? new Date(job.completed_at) : new Date(),
            source: 'system',
          });
        }
      }

      // Check for recent catalog media alerts (video missing)
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      const { data: mediaAlerts } = await supabase
        .from('catalog_media_alerts')
        .select('id, retailer_id, product_name, product_set_name, catalog_name, status, created_at')
        .gte('created_at', threeDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(5);

      if (mediaAlerts) {
        for (const alert of mediaAlerts) {
          const isRepaired = alert.status === 'repaired';
          alertsList.push({
            id: `media-${alert.id}`,
            type: isRepaired ? 'success' : 'warning',
            message: isRepaired
              ? `Vídeo reparado: "${alert.product_name || alert.retailer_id}" (${alert.product_set_name})`
              : `Vídeo ausente: "${alert.product_name || alert.retailer_id}" (${alert.product_set_name})`,
            action: 'Ver monitor',
            href: '/monitor-catalogo',
            createdAt: new Date(alert.created_at),
            source: 'system',
          });
        }
      }

      return alertsList;
    },
    refetchInterval: 60000, // Refetch every 60 seconds
    staleTime: 30000,
  });

  // Fetch admin notifications
  const { data: adminNotifications = [] } = useQuery({
    queryKey: ['admin-broadcast-notifications', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const now = new Date().toISOString();

      // Get active notifications that haven't expired
      const { data: notifications, error } = await supabase
        .from('admin_notifications')
        .select('id, title, message, notification_type, sent_at, created_at')
        .not('sent_at', 'is', null)
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .order('sent_at', { ascending: false })
        .limit(10);

      if (error || !notifications) return [];

      // Get read status for current user
      const { data: reads } = await supabase
        .from('user_notification_reads')
        .select('notification_id')
        .eq('user_id', user.id);

      const readIds = new Set(reads?.map((r) => r.notification_id) || []);

      return notifications.map((n): AdminNotification => ({
        id: n.id,
        type: n.notification_type as AdminNotification['type'],
        title: n.title,
        message: n.message,
        createdAt: new Date(n.sent_at || n.created_at),
        source: 'admin',
        read: readIds.has(n.id),
      }));
    },
    refetchInterval: 60000,
    staleTime: 30000,
    enabled: !!user?.id,
  });

  // Mark notification as read
  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      if (!user?.id) return;
      
      const { error } = await supabase.from('user_notification_reads').upsert({
        user_id: user.id,
        notification_id: notificationId,
      }, { onConflict: 'user_id,notification_id' });

      if (error) console.error('Error marking notification as read:', error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-broadcast-notifications'] });
    },
  });

  // Mark all notifications as read
  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;

      // Mark admin notifications as read in DB
      const unreadAdmin = adminNotifications.filter((n) => !n.read);
      if (unreadAdmin.length > 0) {
        const rows = unreadAdmin.map((n) => ({
          user_id: user.id,
          notification_id: n.id,
        }));
        await supabase.from('user_notification_reads').upsert(rows, {
          onConflict: 'user_id,notification_id',
        });
      }

      // Dismiss system notifications via DB
      const undismissedSystem = systemNotifications.filter((n) => !dismissedSystemIds.has(n.id));
      if (undismissedSystem.length > 0) {
        const rows = undismissedSystem.map((n) => ({
          user_id: user.id,
          notification_key: n.id,
        }));
        await supabase.from('user_dismissed_notifications').upsert(rows, {
          onConflict: 'user_id,notification_key',
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-broadcast-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['dismissed-system-notifications'] });
    },
  });

  // Combine and sort all notifications
  const allNotifications = useMemo(() => {
    const combined: Notification[] = [...systemNotifications, ...adminNotifications];
    return combined
      .sort((a, b) => {
        if (!a.createdAt || !b.createdAt) return 0;
        return b.createdAt.getTime() - a.createdAt.getTime();
      })
      .slice(0, 15);
  }, [systemNotifications, adminNotifications]);

  const unreadCount = useMemo(() => {
    const unreadAdmin = adminNotifications.filter((n) => !n.read).length;
    const unreadSystem = systemNotifications.filter((n) => !dismissedSystemIds.has(n.id)).length;
    return unreadSystem + unreadAdmin;
  }, [systemNotifications, adminNotifications, dismissedSystemIds]);

  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'error':
        return <AlertTriangle className="w-4 h-4 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'urgent':
        return <Megaphone className="w-4 h-4 text-destructive" />;
      case 'info':
      default:
        return <Info className="w-4 h-4 text-sky-500" />;
    }
  };

  const getBgColor = (type: Notification['type'], read?: boolean) => {
    const opacity = read ? '5' : '10';
    switch (type) {
      case 'error':
      case 'urgent':
        return `bg-destructive/${opacity} border-destructive/20`;
      case 'warning':
        return `bg-amber-500/${opacity} border-amber-500/20`;
      case 'success':
        return `bg-emerald-500/${opacity} border-emerald-500/20`;
      case 'info':
      default:
        return `bg-sky-500/${opacity} border-sky-500/20`;
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (notification.source === 'admin' && !notification.read) {
      markAsReadMutation.mutate(notification.id);
    }
    setOpen(false);
  };

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
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <>
                <span className="text-xs text-muted-foreground">
                  {unreadCount} {unreadCount === 1 ? 'nova' : 'novas'}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={() => markAllAsReadMutation.mutate()}
                  disabled={markAllAsReadMutation.isPending}
                  title="Marcar todas como lidas"
                >
                  <CheckCheck className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>
        </div>
        <ScrollArea className="h-[320px]">
          {allNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Bell className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">Nenhuma notificação</p>
            </div>
          ) : (
            <div className="p-2 space-y-2">
              {allNotifications.map((notification) => {
                const isAdmin = notification.source === 'admin';
                const isRead = isAdmin ? notification.read : dismissedSystemIds.has(notification.id);

                if (isAdmin) {
                  return (
                    <div
                      key={notification.id}
                      onClick={() => handleNotificationClick(notification)}
                      className={`block p-3 rounded-lg border transition-colors cursor-pointer hover:bg-secondary/50 ${getBgColor(notification.type, isRead)} ${isRead ? 'opacity-60' : ''}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-0.5">
                          {getIcon(notification.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">
                            {notification.title}
                          </p>
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                            {notification.message}
                          </p>
                          <span className="text-xs text-muted-foreground mt-1 block">
                            {notification.createdAt &&
                              formatDistanceToNow(notification.createdAt, {
                                addSuffix: true,
                                locale: ptBR,
                              })}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <Link
                    key={notification.id}
                    to={notification.href}
                    onClick={() => handleNotificationClick(notification)}
                    className={`block p-3 rounded-lg border transition-colors hover:bg-secondary/50 ${getBgColor(notification.type, isRead)} ${isRead ? 'opacity-60' : ''}`}
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
                );
              })}
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