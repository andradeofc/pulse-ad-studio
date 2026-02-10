import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { differenceInDays, parseISO } from 'date-fns';

export interface DashboardMetrics {
  activeAccounts: number;
  totalCampaigns: number;
  processingQueue: number;
  completedToday: number;
}

export interface RecentCampaign {
  id: string;
  name: string;
  accountName: string;
  status: string;
  totalAds: number;
  progress: number;
  createdAt: string;
}

export interface DashboardAlert {
  id: string;
  type: 'warning' | 'error' | 'info';
  message: string;
  action: string;
  href: string;
}

export function useDashboardData() {
  // Fetch active ad accounts count
  const { data: accountsCount = 0, isLoading: loadingAccounts } = useQuery({
    queryKey: ['dashboard-accounts-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('facebook_ad_accounts')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');
      
      if (error) throw error;
      return count || 0;
    },
  });

  // Fetch campaign jobs metrics
  const { data: campaignMetrics, isLoading: loadingCampaigns } = useQuery({
    queryKey: ['dashboard-campaign-metrics'],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Total campaigns count
      const { count: totalCampaignsCount, error: campError } = await supabase
        .from('campaign_jobs')
        .select('*', { count: 'exact', head: true });

      if (campError) throw campError;

      // Processing queue count
      const { count: processingCount, error: procError } = await supabase
        .from('campaign_jobs')
        .select('*', { count: 'exact', head: true })
        .in('status', ['queued', 'processing']);

      if (procError) throw procError;

      // Completed today - use UTC start of day to match DB timestamps
      const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
      const { count: completedTodayCount, error: compError } = await supabase
        .from('campaign_jobs')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed')
        .gte('completed_at', todayUTC.toISOString());

      if (compError) throw compError;

      return {
        totalCampaigns: totalCampaignsCount || 0,
        processingQueue: processingCount || 0,
        completedToday: completedTodayCount || 0,
      };
    },
  });

  // Fetch recent campaign jobs
  const { data: recentCampaigns = [], isLoading: loadingRecent } = useQuery({
    queryKey: ['dashboard-recent-campaigns'],
    queryFn: async () => {
      const { data: jobs, error } = await supabase
        .from('campaign_jobs')
        .select('id, name, status, total_ads, progress, created_at, accounts_count')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;

      return (jobs || []).map(job => ({
        id: job.id,
        name: job.name,
        accountName: `${job.accounts_count} conta${job.accounts_count > 1 ? 's' : ''}`,
        status: job.status,
        totalAds: job.total_ads,
        progress: job.progress,
        createdAt: job.created_at,
      }));
    },
  });

  // Fetch alerts based on real conditions
  const { data: alerts = [], isLoading: loadingAlerts } = useQuery({
    queryKey: ['dashboard-alerts'],
    queryFn: async () => {
      const alertsList: DashboardAlert[] = [];

      // Check for expiring tokens
      const { data: profiles } = await supabase
        .from('facebook_profiles')
        .select('id, name, token_expires_at, status')
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
              });
            }
          }
        }
      }

      // Check for failed jobs
      const { data: failedJobs } = await supabase
        .from('campaign_jobs')
        .select('id, name')
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
          });
        }
      }

      // Check for completed jobs today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { count: completedCount } = await supabase
        .from('campaign_jobs')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed')
        .gte('completed_at', today.toISOString());

      if (completedCount && completedCount > 0) {
        alertsList.push({
          id: 'completed-today',
          type: 'info',
          message: `${completedCount} job${completedCount > 1 ? 's' : ''} concluído${completedCount > 1 ? 's' : ''} hoje`,
          action: 'Ver fila',
          href: '/fila-processamento',
        });
      }

      return alertsList.slice(0, 5); // Limit to 5 alerts
    },
  });

  const metrics: DashboardMetrics = {
    activeAccounts: accountsCount,
    totalCampaigns: campaignMetrics?.totalCampaigns || 0,
    processingQueue: campaignMetrics?.processingQueue || 0,
    completedToday: campaignMetrics?.completedToday || 0,
  };

  return {
    metrics,
    recentCampaigns,
    alerts,
    isLoading: loadingAccounts || loadingCampaigns || loadingRecent || loadingAlerts,
  };
}
