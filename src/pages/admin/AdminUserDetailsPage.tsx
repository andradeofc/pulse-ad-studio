import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  User,
  Calendar,
  Globe,
  CreditCard,
  Megaphone,
  BarChart3,
  Clock,
  Facebook,
  Monitor,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { formatCurrency } from '@/lib/currencyUtils';

const statusConfig: Record<string, { label: string; color: string }> = {
  active: { label: 'Ativo', color: 'bg-green-500/10 text-green-500 border-green-500/30' },
  inactive: { label: 'Inativo', color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30' },
  suspended: { label: 'Suspenso', color: 'bg-orange-500/10 text-orange-500 border-orange-500/30' },
  banned: { label: 'Banido', color: 'bg-red-500/10 text-red-500 border-red-500/30' },
};

const planConfig: Record<string, { label: string; color: string }> = {
  starter: { label: 'Starter', color: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30' },
  pro: { label: 'Pro', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  enterprise: { label: 'Enterprise', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
};

function getInitials(name: string | null): string {
  if (!name) return '?';
  return name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase();
}

export default function AdminUserDetailsPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();

  // User profile
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['admin-user-detail', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  // User email from edge function
  const { data: emailData } = useQuery({
    queryKey: ['admin-user-email', userId],
    queryFn: async () => {
      const res = await supabase.functions.invoke('admin-manage-user', {
        body: { action: 'get_user_email', target_user_id: userId },
      });
      if (res.error) throw res.error;
      return res.data as { email: string };
    },
    enabled: !!userId,
  });

  // User stats via RPC
  const { data: stats } = useQuery({
    queryKey: ['admin-user-stats', userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_admin_user_stats', {
        target_user_id: userId!,
      });
      if (error) throw error;
      return data as any;
    },
    enabled: !!userId,
  });

  // Campaign jobs
  const { data: campaigns } = useQuery({
    queryKey: ['admin-user-campaigns', userId],
    queryFn: async () => {
      // Use the RPC to bypass RLS — but campaign_jobs has user-only RLS
      // We'll use a workaround: get from admin-manage-user or just show stats
      // Actually, admin can't query other users' campaign_jobs due to RLS
      // So we show stats from the RPC instead
      return null;
    },
    enabled: false, // Disabled - RLS prevents this
  });

  // Ad usage
  const { data: adUsage } = useQuery({
    queryKey: ['admin-user-ad-usage', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_ad_usage')
        .select('*')
        .eq('user_id', userId!)
        .order('period_start', { ascending: false })
        .limit(6);
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  // Audit logs for this user
  const { data: auditLogs } = useQuery({
    queryKey: ['admin-user-audit', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_audit_logs')
        .select('*')
        .eq('target_id', userId!)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  if (profileLoading) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </AdminLayout>
    );
  }

  if (!profile) {
    return (
      <AdminLayout>
        <div className="text-center py-20">
          <p className="text-muted-foreground">Usuário não encontrado</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/ops-center/usuarios')}>
            Voltar
          </Button>
        </div>
      </AdminLayout>
    );
  }

  const statCards = [
    { label: 'Contas Facebook', value: stats?.fb_accounts_count ?? 0, icon: Facebook },
    { label: 'Contas de Anúncio', value: stats?.ad_accounts_count ?? 0, icon: Monitor },
    { label: 'Campanhas', value: stats?.campaigns_count ?? 0, icon: Megaphone },
    { label: 'Gasto Total', value: formatCurrency(stats?.total_spend ?? 0, 'BRL'), icon: CreditCard },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/ops-center/usuarios')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-4 flex-1">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="text-lg bg-secondary text-foreground">
                {getInitials(profile.full_name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {profile.full_name || 'Sem nome'}
              </h1>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                {emailData?.email && <span>{emailData.email}</span>}
                <span className="font-mono text-xs">{profile.user_id}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={planConfig[profile.plan || 'starter']?.color}>
              {planConfig[profile.plan || 'starter']?.label}
            </Badge>
            <Badge variant="outline" className={statusConfig[profile.status]?.color}>
              {statusConfig[profile.status]?.label}
            </Badge>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4">
          {statCards.map((card) => (
            <Card key={card.label} className="glass-card">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-secondary">
                  <card.icon className="w-5 h-5 text-foreground" />
                </div>
                <div>
                  <p className="text-xl font-bold text-foreground">{card.value}</p>
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* User Info */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <User className="w-4 h-4" />
                Informações do Usuário
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <InfoRow label="Nome" value={profile.full_name || '—'} />
              <InfoRow label="Email" value={emailData?.email || '—'} />
              <InfoRow label="Telefone" value={profile.phone || '—'} />
              <InfoRow label="Plano" value={planConfig[profile.plan || 'starter']?.label || profile.plan || '—'} />
              <InfoRow label="Status" value={statusConfig[profile.status]?.label || profile.status} />
              <Separator />
              <InfoRow
                label="Cadastro"
                value={format(new Date(profile.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              />
              <InfoRow
                label="Último Login"
                value={
                  profile.last_login_at
                    ? formatDistanceToNow(new Date(profile.last_login_at), { addSuffix: true, locale: ptBR })
                    : 'Nunca'
                }
              />
              <InfoRow label="IP Último Login" value={profile.last_login_ip || '—'} />
              {profile.admin_notes && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Notas do Admin</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{profile.admin_notes}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Ad Usage History */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Uso de Anúncios (Últimos Períodos)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {adUsage && adUsage.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Período</TableHead>
                      <TableHead className="text-right">Anúncios Criados</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {adUsage.map((usage) => (
                      <TableRow key={usage.id}>
                        <TableCell className="text-sm">
                          {format(new Date(usage.period_start), 'dd/MM/yyyy')} —{' '}
                          {format(new Date(usage.period_end), 'dd/MM/yyyy')}
                        </TableCell>
                        <TableCell className="text-right font-medium">{usage.ads_created}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhum registro de uso encontrado
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Audit Logs */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Atividade Recente (Ações Admin)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {auditLogs && auditLogs.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ação</TableHead>
                    <TableHead>Detalhes</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">
                        {log.details ? JSON.stringify(log.details) : '—'}
                      </TableCell>
                      <TableCell className="text-sm font-mono">{log.ip_address}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: ptBR })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhuma atividade registrada para este usuário
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground font-medium">{value}</span>
    </div>
  );
}
