import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Infinity, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';

interface UserUsageData {
  userId: string;
  email: string;
  fullName: string;
  plan: string;
  adsUsed: number;
  adsLimit: number;
  percentUsed: number;
  isUnlimited: boolean;
  periodEnd: string;
}

const PLAN_LIMITS: Record<string, number> = {
  starter: 10000,
  pro: 25000,
  enterprise: 150000,
};

const PLAN_NAMES: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

export function UserAdUsageTable() {
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-user-ad-usage'],
    queryFn: async (): Promise<UserUsageData[]> => {
      // Get all users with their profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('user_profiles')
        .select('user_id, full_name, plan, subscription_starts_at, created_at');

      if (profilesError) throw profilesError;

      // Get admin users
      const { data: adminRoles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin');

      const adminUserIds = new Set(adminRoles?.map(r => r.user_id) || []);

      // Calculate usage for each user
      const usersWithUsage: UserUsageData[] = await Promise.all(
        (profiles || []).map(async (profile) => {
          const isAdmin = adminUserIds.has(profile.user_id);
          const plan = profile.plan || 'starter';
          const adsLimit = PLAN_LIMITS[plan] || 10000;

          // Calculate period
          const subscriptionStart = profile.subscription_starts_at || profile.created_at;
          const subDate = new Date(subscriptionStart);
          const now = new Date();
          const daysSinceStart = Math.floor((now.getTime() - subDate.getTime()) / (30 * 24 * 60 * 60 * 1000));
          const periodStart = new Date(subDate.getTime() + daysSinceStart * 30 * 24 * 60 * 60 * 1000);
          const periodEnd = new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000);

          // Get job IDs for this user
          const { data: userJobs } = await supabase
            .from('campaign_jobs')
            .select('id')
            .eq('user_id', profile.user_id);

          const jobIds = userJobs?.map(j => j.id) || [];

          // Count ads created in current period
          let adsUsed = 0;
          if (jobIds.length > 0) {
            const { count: adsCount } = await supabase
              .from('campaign_job_items')
              .select('*', { count: 'exact', head: true })
              .eq('item_type', 'ad')
              .eq('status', 'completed')
              .gte('created_at', periodStart.toISOString())
              .lt('created_at', periodEnd.toISOString())
              .in('job_id', jobIds);

            adsUsed = adsCount || 0;
          }

          return {
            userId: profile.user_id,
            email: '', // Will be filled if needed
            fullName: profile.full_name || 'Sem nome',
            plan: isAdmin ? 'admin' : plan,
            adsUsed,
            adsLimit,
            percentUsed: isAdmin ? 0 : Math.min(100, (adsUsed / adsLimit) * 100),
            isUnlimited: isAdmin,
            periodEnd: periodEnd.toISOString(),
          };
        })
      );

      // Sort by usage percentage (highest first), admins last
      return usersWithUsage.sort((a, b) => {
        if (a.isUnlimited && !b.isUnlimited) return 1;
        if (!a.isUnlimited && b.isUnlimited) return -1;
        return b.percentUsed - a.percentUsed;
      });
    },
    staleTime: 60000, // 1 minute
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  const formatNumber = (num: number) => {
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toLocaleString('pt-BR');
  };

  const getStatusBadge = (user: UserUsageData) => {
    if (user.isUnlimited) {
      return (
        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
          <Infinity className="w-3 h-3 mr-1" />
          Admin
        </Badge>
      );
    }
    if (user.percentUsed >= 90) {
      return (
        <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/30">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Crítico
        </Badge>
      );
    }
    if (user.percentUsed >= 75) {
      return (
        <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Atenção
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
        <CheckCircle className="w-3 h-3 mr-1" />
        OK
      </Badge>
    );
  };

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Usuário</TableHead>
            <TableHead>Plano</TableHead>
            <TableHead>Uso</TableHead>
            <TableHead>Progresso</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Renova em</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.userId}>
              <TableCell className="font-medium">{user.fullName}</TableCell>
              <TableCell>
                <Badge variant="secondary">
                  {user.isUnlimited ? 'Admin' : PLAN_NAMES[user.plan] || user.plan}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <TrendingUp className="w-4 h-4 text-muted-foreground" />
                  <span className="font-mono">
                    {formatNumber(user.adsUsed)}
                    {!user.isUnlimited && (
                      <span className="text-muted-foreground">
                        /{formatNumber(user.adsLimit)}
                      </span>
                    )}
                  </span>
                </div>
              </TableCell>
              <TableCell className="w-32">
                {!user.isUnlimited ? (
                  <div className="space-y-1">
                    <Progress value={user.percentUsed} className="h-2" />
                    <span className="text-xs text-muted-foreground">
                      {user.percentUsed.toFixed(1)}%
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">∞</span>
                )}
              </TableCell>
              <TableCell>{getStatusBadge(user)}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDistanceToNow(parseISO(user.periodEnd), { 
                  addSuffix: false, 
                  locale: ptBR 
                })}
              </TableCell>
            </TableRow>
          ))}
          {users.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                Nenhum usuário encontrado
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
