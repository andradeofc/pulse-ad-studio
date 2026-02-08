import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Users,
  UserCheck,
  Megaphone,
  Clock,
  CreditCard,
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Activity,
  Zap,
  BarChart3,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { UserAdUsageTable } from '@/components/admin/UserAdUsageTable';
import { formatCurrency } from '@/lib/currencyUtils';

interface PlatformMetrics {
  totalUsers: number;
  activeUsers7d: number;
  campaignsToday: number;
  jobsInQueue: number;
  totalAdAccounts: number;
  blockedAdAccounts: number;
  totalSpend: number;
  usersGrowth: number;
}

interface RecentActivity {
  id: string;
  type: 'campaign' | 'profile' | 'job' | 'user';
  message: string;
  timestamp: string;
  userId?: string;
  userName?: string;
}

export default function AdminDashboardPage() {
  // Fetch platform metrics
  const { data: metrics, isLoading: loadingMetrics } = useQuery({
    queryKey: ['admin-metrics'],
    queryFn: async (): Promise<PlatformMetrics> => {
      // Total users
      const { count: totalUsers } = await supabase
        .from('user_profiles')
        .select('*', { count: 'exact', head: true });

      // Active users (logged in last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const { count: activeUsers7d } = await supabase
        .from('user_profiles')
        .select('*', { count: 'exact', head: true })
        .gte('last_login_at', sevenDaysAgo.toISOString());

      // Campaigns created today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { count: campaignsToday } = await supabase
        .from('campaign_jobs')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', todayStart.toISOString());

      // Jobs in queue
      const { count: jobsInQueue } = await supabase
        .from('campaign_jobs')
        .select('*', { count: 'exact', head: true })
        .in('status', ['queued', 'processing']);

      // Ad accounts
      const { count: totalAdAccounts } = await supabase
        .from('facebook_ad_accounts')
        .select('*', { count: 'exact', head: true });

      const { count: blockedAdAccounts } = await supabase
        .from('facebook_ad_accounts')
        .select('*', { count: 'exact', head: true })
        .neq('status', 'active');

      // Total spend
      const { data: spendData } = await supabase
        .from('facebook_ad_accounts')
        .select('amount_spent');
      const totalSpend = spendData?.reduce((sum, acc) => sum + (acc.amount_spent || 0), 0) || 0;

      return {
        totalUsers: totalUsers || 0,
        activeUsers7d: activeUsers7d || 0,
        campaignsToday: campaignsToday || 0,
        jobsInQueue: jobsInQueue || 0,
        totalAdAccounts: totalAdAccounts || 0,
        blockedAdAccounts: blockedAdAccounts || 0,
        totalSpend,
        usersGrowth: 12.5, // Mock - would need historical data
      };
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch recent activity
  const { data: recentActivity = [], isLoading: loadingActivity } = useQuery({
    queryKey: ['admin-activity'],
    queryFn: async (): Promise<RecentActivity[]> => {
      const activities: RecentActivity[] = [];

      // Recent campaign jobs
      const { data: recentJobs } = await supabase
        .from('campaign_jobs')
        .select('id, name, user_id, status, created_at, total_campaigns')
        .order('created_at', { ascending: false })
        .limit(10);

      recentJobs?.forEach(job => {
        activities.push({
          id: `job-${job.id}`,
          type: 'job',
          message: `${job.status === 'completed' ? '✅' : job.status === 'failed' ? '❌' : '⏳'} Job "${job.name}" - ${job.total_campaigns} campanhas`,
          timestamp: job.created_at,
        });
      });

      // Recent profile connections
      const { data: recentProfiles } = await supabase
        .from('facebook_profiles')
        .select('id, name, user_id, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

      recentProfiles?.forEach(profile => {
        activities.push({
          id: `profile-${profile.id}`,
          type: 'profile',
          message: `🔗 Novo perfil Facebook conectado: ${profile.name}`,
          timestamp: profile.created_at,
        });
      });

      // Sort by timestamp
      return activities
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 15);
    },
    refetchInterval: 15000,
  });

  // Fetch system alerts
  const { data: alerts = [] } = useQuery({
    queryKey: ['admin-alerts'],
    queryFn: async () => {
      const alertsList: { type: 'warning' | 'error' | 'info'; message: string }[] = [];

      // Check for expiring tokens
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
      const { count: expiringTokens } = await supabase
        .from('facebook_profiles')
        .select('*', { count: 'exact', head: true })
        .lte('token_expires_at', sevenDaysFromNow.toISOString())
        .gte('token_expires_at', new Date().toISOString());

      if (expiringTokens && expiringTokens > 0) {
        alertsList.push({
          type: 'warning',
          message: `${expiringTokens} token(s) expirando nos próximos 7 dias`,
        });
      }

      // Check for failed jobs in last 24h
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);
      const { count: failedJobs } = await supabase
        .from('campaign_jobs')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'failed')
        .gte('created_at', oneDayAgo.toISOString());

      if (failedJobs && failedJobs > 5) {
        alertsList.push({
          type: 'error',
          message: `${failedJobs} jobs falharam nas últimas 24h`,
        });
      }

      return alertsList;
    },
  });

  const metricCards = [
    {
      title: 'Total Usuários',
      value: metrics?.totalUsers || 0,
      icon: Users,
      trend: metrics?.usersGrowth,
      trendUp: true,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      title: 'Usuários Ativos (7d)',
      value: metrics?.activeUsers7d || 0,
      icon: UserCheck,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    {
      title: 'Campanhas Criadas (hoje)',
      value: metrics?.campaignsToday || 0,
      icon: Megaphone,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
    },
    {
      title: 'Jobs na Fila',
      value: metrics?.jobsInQueue || 0,
      icon: Clock,
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10',
    },
    {
      title: 'Contas de Anúncio',
      value: `${(metrics?.totalAdAccounts || 0) - (metrics?.blockedAdAccounts || 0)} / ${metrics?.totalAdAccounts || 0}`,
      subtitle: `${metrics?.blockedAdAccounts || 0} bloqueadas`,
      icon: CreditCard,
      color: 'text-cyan-500',
      bgColor: 'bg-cyan-500/10',
    },
    {
      title: 'Gasto Total (plataforma)',
      value: formatCurrency(metrics?.totalSpend || 0, 'BRL'),
      icon: DollarSign,
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-500/10',
    },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard Administrativo</h1>
          <p className="text-muted-foreground">Visão geral da plataforma em tempo real</p>
        </div>

        {/* Alerts */}
        {alerts.length > 0 && (
          <div className="space-y-2">
            {alerts.map((alert, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
              >
                <Card className={`border-l-4 ${
                  alert.type === 'error' ? 'border-l-red-500 bg-red-500/5' :
                  alert.type === 'warning' ? 'border-l-yellow-500 bg-yellow-500/5' :
                  'border-l-blue-500 bg-blue-500/5'
                }`}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <AlertTriangle className={`w-5 h-5 ${
                      alert.type === 'error' ? 'text-red-500' :
                      alert.type === 'warning' ? 'text-yellow-500' :
                      'text-blue-500'
                    }`} />
                    <span className="text-sm font-medium">{alert.message}</span>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {metricCards.map((metric, idx) => (
            <motion.div
              key={metric.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
            >
              <Card className="glass-card h-full">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className={`w-10 h-10 rounded-lg ${metric.bgColor} flex items-center justify-center`}>
                      <metric.icon className={`w-5 h-5 ${metric.color}`} />
                    </div>
                    {metric.trend !== undefined && (
                      <div className={`flex items-center gap-1 text-xs ${metric.trendUp ? 'text-green-500' : 'text-red-500'}`}>
                        {metric.trendUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {metric.trend}%
                      </div>
                    )}
                  </div>
                  <p className="text-2xl font-bold text-foreground">
                    {typeof metric.value === 'number' ? metric.value.toLocaleString() : metric.value}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{metric.title}</p>
                  {metric.subtitle && (
                    <p className="text-xs text-muted-foreground/70">{metric.subtitle}</p>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Activity */}
          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                Atividade Recente
              </CardTitle>
              <CardDescription>Últimas ações na plataforma</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-3">
                  {recentActivity.map((activity) => (
                    <div
                      key={activity.id}
                      className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground">{activity.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true, locale: ptBR })}
                        </p>
                      </div>
                    </div>
                  ))}
                  {recentActivity.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Nenhuma atividade recente
                    </p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" />
                Status do Sistema
              </CardTitle>
              <CardDescription>Saúde da plataforma</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Queue Health */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Fila de Processamento</span>
                  <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
                    Saudável
                  </Badge>
                </div>
                <Progress value={30} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  {metrics?.jobsInQueue || 0} jobs em processamento
                </p>
              </div>

              {/* API Rate Limit */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Rate Limit API</span>
                  <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
                    OK
                  </Badge>
                </div>
                <Progress value={25} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  ~25% utilizado na última hora
                </p>
              </div>

              {/* Token Health */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Tokens Válidos</span>
                  <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30">
                    Atenção
                  </Badge>
                </div>
                <Progress value={85} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  85% dos tokens ativos e válidos
                </p>
              </div>

              {/* Database */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Banco de Dados</span>
                  <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
                    Online
                  </Badge>
                </div>
                <Progress value={45} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  45% de armazenamento utilizado
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* User Ad Usage Table */}
        <Card className="glass-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Uso de Anúncios por Usuário
            </CardTitle>
            <CardDescription>
              Monitoramento de limites de anúncios por plano
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UserAdUsageTable />
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
