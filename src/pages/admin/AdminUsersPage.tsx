import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Users,
  Search,
  Download,
  Plus,
  MoreHorizontal,
  Edit,
  Key,
  RefreshCw,
  Pause,
  Ban,
  Trash2,
  LogIn,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  TrendingUp,
  AlertTriangle,
  Calendar,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/currencyUtils';
import { useImpersonationStore } from '@/stores/impersonationStore';
import { useAuthStore } from '@/stores/authStore';

interface UserProfile {
  id: string;
  user_id: string;
  full_name: string | null;
  phone: string | null;
  status: string;
  plan: string;
  admin_notes: string | null;
  custom_limits: Record<string, any>;
  last_login_at: string | null;
  last_login_ip: string | null;
  created_at: string;
  updated_at: string;
  email?: string;
  fb_accounts_count?: number;
  ad_accounts_count?: number;
  campaigns_count?: number;
  total_spend?: number;
}

interface UserStats {
  user_id: string;
  fb_accounts_count: number;
  ad_accounts_count: number;
  campaigns_count: number;
  total_spend: number;
}

interface SummaryMetrics {
  total_users: number;
  active_users: number;
  suspended_users: number;
  new_this_month: number;
  starter_count: number;
  pro_count: number;
  enterprise_count: number;
}

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

const ITEMS_PER_PAGE = 25;

function getInitials(name: string | null): string {
  if (!name) return '?';
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
}

export default function AdminUsersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const startImpersonation = useImpersonationStore((s) => s.startImpersonation);
  const initialize = useAuthStore((s) => s.initialize);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState('newest');
  const [currentPage, setCurrentPage] = useState(1);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [targetUser, setTargetUser] = useState<UserProfile | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', plan: 'starter' });

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Summary metrics
  const { data: summary } = useQuery({
    queryKey: ['admin-users-summary'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_admin_users_summary');
      if (error) throw error;
      return data as unknown as SummaryMetrics;
    },
  });

  // Bulk stats
  const { data: allStats } = useQuery({
    queryKey: ['admin-users-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_admin_all_user_stats');
      if (error) throw error;
      return (data as unknown as UserStats[]) || [];
    },
  });

  const statsMap = useMemo(() => {
    const map = new Map<string, UserStats>();
    allStats?.forEach((s) => map.set(s.user_id, s));
    return map;
  }, [allStats]);

  // Fetch users
  const { data: usersData, isLoading } = useQuery({
    queryKey: ['admin-users', debouncedSearch, planFilter, statusFilter, sortBy, currentPage],
    queryFn: async () => {
      let query = supabase.from('user_profiles').select('*', { count: 'exact' });

      if (planFilter !== 'all') query = query.eq('plan', planFilter);
      if (statusFilter !== 'all') query = query.eq('status', statusFilter as any);
      if (debouncedSearch) {
        // Search by name or user_id prefix
        const isUuid = /^[0-9a-f-]{4,}$/i.test(debouncedSearch);
        if (isUuid) {
          query = query.or(`user_id.eq.${debouncedSearch},full_name.ilike.%${debouncedSearch}%`);
        } else {
          query = query.ilike('full_name', `%${debouncedSearch}%`);
        }
      }

      switch (sortBy) {
        case 'newest':
          query = query.order('created_at', { ascending: false });
          break;
        case 'oldest':
          query = query.order('created_at', { ascending: true });
          break;
        case 'last_login':
          query = query.order('last_login_at', { ascending: false, nullsFirst: false });
          break;
      }

      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      query = query.range(from, from + ITEMS_PER_PAGE - 1);

      const { data, error, count } = await query;
      if (error) throw error;

      const enrichedUsers = (data || []).map((user) => {
        const stats = statsMap.get(user.user_id);
        return {
          ...user,
          fb_accounts_count: stats?.fb_accounts_count || 0,
          ad_accounts_count: stats?.ad_accounts_count || 0,
          campaigns_count: stats?.campaigns_count || 0,
          total_spend: stats?.total_spend || 0,
        };
      });

      return {
        users: enrichedUsers as UserProfile[],
        total: count || 0,
        totalPages: Math.ceil((count || 0) / ITEMS_PER_PAGE),
      };
    },
    enabled: !!allStats,
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: async (updates: Partial<UserProfile> & { id: string }) => {
      const { id, fb_accounts_count, ad_accounts_count, campaigns_count, total_spend, email, ...data } = updates;
      const { error } = await supabase
        .from('user_profiles')
        .update(data as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-users-summary'] });
      toast({ title: 'Usuário atualizado com sucesso' });
      setShowEditModal(false);
      setEditingUser(null);
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar', description: String(error), variant: 'destructive' });
    },
  });

  // Create user via edge function
  const createUserMutation = useMutation({
    mutationFn: async (userData: { name: string; email: string; password: string; plan: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('admin-create-user', {
        body: userData,
      });
      if (res.error) throw new Error(res.error.message || 'Failed to create user');
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-users-summary'] });
      queryClient.invalidateQueries({ queryKey: ['admin-users-stats'] });
      toast({ title: 'Usuário criado com sucesso' });
      setShowCreateModal(false);
      setNewUser({ name: '', email: '', password: '', plan: 'starter' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao criar usuário', description: String(error), variant: 'destructive' });
    },
  });

  // Reset password via edge function
  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      const res = await supabase.functions.invoke('admin-manage-user', {
        body: { action: 'reset_password', target_user_id: userId, new_password: password },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: () => {
      toast({ title: 'Senha alterada com sucesso' });
      setShowResetPasswordModal(false);
      setNewPassword('');
      setTargetUser(null);
    },
    onError: (error) => {
      toast({ title: 'Erro ao alterar senha', description: String(error), variant: 'destructive' });
    },
  });

  // Delete user via edge function
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await supabase.functions.invoke('admin-manage-user', {
        body: { action: 'delete_user', target_user_id: userId },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-users-summary'] });
      queryClient.invalidateQueries({ queryKey: ['admin-users-stats'] });
      toast({ title: 'Usuário deletado com sucesso' });
      setShowDeleteDialog(false);
      setTargetUser(null);
    },
    onError: (error) => {
      toast({ title: 'Erro ao deletar', description: String(error), variant: 'destructive' });
    },
  });

  const handleStatusChange = (userId: string, newStatus: string) => {
    updateUserMutation.mutate({ id: userId, status: newStatus as any });
  };

  // Impersonate user
  const impersonateMutation = useMutation({
    mutationFn: async (user: UserProfile) => {
      // Save current admin session
      const { data: { session: adminSession } } = await supabase.auth.getSession();
      if (!adminSession) throw new Error('No admin session');

      // Call edge function to get impersonation token
      const res = await supabase.functions.invoke('admin-impersonate', {
        body: { target_user_id: user.user_id },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);

      const { token_hash, target_user } = res.data;

      // Store admin tokens before switching
      startImpersonation(
        target_user,
        adminSession.access_token,
        adminSession.refresh_token
      );

      // Exchange token for session
      const { error: otpError } = await supabase.auth.verifyOtp({
        token_hash,
        type: 'magiclink',
      });
      if (otpError) throw otpError;

      // Re-initialize auth store with new session
      await initialize();

      return target_user;
    },
    onSuccess: (targetUser) => {
      toast({ title: `Logado como ${targetUser.name}`, description: 'Você está no modo de impersonação. A sessão expira em 30 minutos.' });
      navigate('/dashboard', { replace: true });
    },
    onError: (error) => {
      toast({ title: 'Erro ao impersonar', description: String(error), variant: 'destructive' });
    },
  });

  const handleExportCSV = useCallback(() => {
    if (!usersData?.users.length) return;
    const headers = ['Nome', 'User ID', 'Plano', 'Status', 'FB Accounts', 'Ad Accounts', 'Campanhas', 'Gasto Total', 'Último Login', 'Cadastro'];
    const rows = usersData.users.map((u) => [
      u.full_name || 'Sem nome',
      u.user_id,
      u.plan,
      u.status,
      u.fb_accounts_count || 0,
      u.ad_accounts_count || 0,
      u.campaigns_count || 0,
      u.total_spend || 0,
      u.last_login_at ? format(new Date(u.last_login_at), 'dd/MM/yyyy HH:mm') : 'Nunca',
      format(new Date(u.created_at), 'dd/MM/yyyy'),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.map((v) => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `usuarios_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'CSV exportado com sucesso' });
  }, [usersData, toast]);

  const summaryCards = [
    { label: 'Total de Usuários', value: summary?.total_users ?? '—', icon: Users, color: 'text-foreground' },
    { label: 'Ativos', value: summary?.active_users ?? '—', icon: TrendingUp, color: 'text-green-500' },
    { label: 'Suspensos / Banidos', value: summary?.suspended_users ?? '—', icon: AlertTriangle, color: 'text-orange-500' },
    { label: 'Novos este Mês', value: summary?.new_this_month ?? '—', icon: Calendar, color: 'text-blue-500' },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Users className="w-6 h-6" />
              Gestão de Usuários
            </h1>
            <p className="text-muted-foreground text-sm">
              Gerencie contas, planos e permissões
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!usersData?.users.length}>
              <Download className="w-4 h-4 mr-2" />
              Exportar CSV
            </Button>
            <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={() => setShowCreateModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Criar Usuário
            </Button>
          </div>
        </div>

        {/* Metrics Cards */}
        <div className="grid grid-cols-4 gap-4">
          {summaryCards.map((card) => (
            <Card key={card.label} className="glass-card">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-secondary ${card.color}`}>
                  <card.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">
                    {summary ? card.value : <Skeleton className="h-7 w-10 inline-block" />}
                  </p>
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome ou ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={planFilter} onValueChange={(v) => { setPlanFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Plano" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                  <SelectItem value="suspended">Suspenso</SelectItem>
                  <SelectItem value="banned">Banido</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Ordenar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Mais recente</SelectItem>
                  <SelectItem value="oldest">Mais antigo</SelectItem>
                  <SelectItem value="last_login">Último login</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Users Table */}
        <Card className="glass-card">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">FB</TableHead>
                  <TableHead className="text-center">Ads</TableHead>
                  <TableHead className="text-center">Campanhas</TableHead>
                  <TableHead className="text-right">Gasto Total</TableHead>
                  <TableHead>Último Login</TableHead>
                  <TableHead>Cadastro</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading || !allStats ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-8 w-8 rounded-full" />
                          <div className="space-y-1.5">
                            <Skeleton className="h-4 w-28" />
                            <Skeleton className="h-3 w-16" />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-14" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-6 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-6 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-6 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-6" /></TableCell>
                    </TableRow>
                  ))
                ) : usersData?.users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-32 text-center text-muted-foreground">
                      Nenhum usuário encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  usersData?.users.map((user) => (
                    <TableRow key={user.id} className="hover:bg-secondary/30">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs bg-secondary text-foreground">
                              {getInitials(user.full_name)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-foreground text-sm">
                              {user.full_name || 'Sem nome'}
                            </p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {user.user_id.slice(0, 8)}...
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={planConfig[user.plan]?.color || ''}>
                          {planConfig[user.plan]?.label || user.plan}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusConfig[user.status]?.color || ''}>
                          {statusConfig[user.status]?.label || user.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-sm">{user.fb_accounts_count}</TableCell>
                      <TableCell className="text-center text-sm">{user.ad_accounts_count}</TableCell>
                      <TableCell className="text-center text-sm">{user.campaigns_count}</TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        {formatCurrency(user.total_spend || 0, 'BRL')}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {user.last_login_at
                          ? formatDistanceToNow(new Date(user.last_login_at), { addSuffix: true, locale: ptBR })
                          : 'Nunca'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(user.created_at), 'dd/MM/yyyy')}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setEditingUser(user); setShowEditModal(true); }}>
                              <Edit className="w-4 h-4 mr-2" />
                              Editar Dados
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setTargetUser(user); setNewPassword(''); setShowResetPasswordModal(true); }}>
                              <Key className="w-4 h-4 mr-2" />
                              Alterar Senha
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {user.status !== 'suspended' && (
                              <DropdownMenuItem
                                onClick={() => handleStatusChange(user.id, 'suspended')}
                                className="text-orange-500"
                              >
                                <Pause className="w-4 h-4 mr-2" />
                                Suspender Conta
                              </DropdownMenuItem>
                            )}
                            {user.status !== 'banned' && (
                              <DropdownMenuItem
                                onClick={() => handleStatusChange(user.id, 'banned')}
                                className="text-red-500"
                              >
                                <Ban className="w-4 h-4 mr-2" />
                                Banir Conta
                              </DropdownMenuItem>
                            )}
                            {(user.status === 'suspended' || user.status === 'banned') && (
                              <DropdownMenuItem
                                onClick={() => handleStatusChange(user.id, 'active')}
                                className="text-green-500"
                              >
                                <RefreshCw className="w-4 h-4 mr-2" />
                                Reativar Conta
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => impersonateMutation.mutate(user)}
                              disabled={impersonateMutation.isPending}
                            >
                              <LogIn className="w-4 h-4 mr-2" />
                              Login como Usuário
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => { setTargetUser(user); setShowDeleteDialog(true); }}
                              className="text-red-500"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Deletar Conta
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {/* Pagination */}
            {usersData && usersData.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  Página {currentPage} de {usersData.totalPages} · {usersData.total} usuários
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(usersData.totalPages, p + 1))}
                    disabled={currentPage === usersData.totalPages}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create User Modal */}
        <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Criar Novo Usuário</DialogTitle>
              <DialogDescription>O usuário será criado com email já confirmado.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nome Completo</Label>
                <Input
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  placeholder="João Silva"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  placeholder="email@exemplo.com"
                />
              </div>
              <div>
                <Label>Senha</Label>
                <Input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
              <div>
                <Label>Plano</Label>
                <Select value={newUser.plan} onValueChange={(v) => setNewUser({ ...newUser, plan: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => createUserMutation.mutate(newUser)}
                disabled={createUserMutation.isPending || !newUser.email || !newUser.password || newUser.password.length < 6}
                className="bg-red-600 hover:bg-red-700"
              >
                {createUserMutation.isPending ? 'Criando...' : 'Criar Usuário'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit User Modal */}
        <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Editar Usuário</DialogTitle>
              <DialogDescription>
                Alterar dados de {editingUser?.full_name || 'usuário'}
              </DialogDescription>
            </DialogHeader>
            {editingUser && (
              <div className="space-y-4">
                <div>
                  <Label>Nome Completo</Label>
                  <Input
                    value={editingUser.full_name || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, full_name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input
                    value={editingUser.phone || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, phone: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Plano</Label>
                    <Select
                      value={editingUser.plan}
                      onValueChange={(v) => setEditingUser({ ...editingUser, plan: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="starter">Starter</SelectItem>
                        <SelectItem value="pro">Pro</SelectItem>
                        <SelectItem value="enterprise">Enterprise</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Status</Label>
                    <Select
                      value={editingUser.status}
                      onValueChange={(v) => setEditingUser({ ...editingUser, status: v as any })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Ativo</SelectItem>
                        <SelectItem value="inactive">Inativo</SelectItem>
                        <SelectItem value="suspended">Suspenso</SelectItem>
                        <SelectItem value="banned">Banido</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Notas Internas (Admin)</Label>
                  <Textarea
                    value={editingUser.admin_notes || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, admin_notes: e.target.value })}
                    placeholder="Observações sobre este usuário..."
                    rows={3}
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditModal(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => editingUser && updateUserMutation.mutate(editingUser)}
                disabled={updateUserMutation.isPending}
                className="bg-red-600 hover:bg-red-700"
              >
                Salvar Alterações
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reset Password Modal */}
        <Dialog open={showResetPasswordModal} onOpenChange={setShowResetPasswordModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Alterar Senha</DialogTitle>
              <DialogDescription>
                Definir nova senha para {targetUser?.full_name || 'usuário'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nova Senha</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowResetPasswordModal(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => targetUser && resetPasswordMutation.mutate({ userId: targetUser.user_id, password: newPassword })}
                disabled={resetPasswordMutation.isPending || newPassword.length < 6}
                className="bg-red-600 hover:bg-red-700"
              >
                {resetPasswordMutation.isPending ? 'Salvando...' : 'Alterar Senha'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete User Dialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Deletar conta permanentemente?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação é irreversível. Todos os dados de{' '}
                <strong>{targetUser?.full_name || 'este usuário'}</strong> serão removidos permanentemente,
                incluindo perfis do Facebook, campanhas e criativos.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => targetUser && deleteUserMutation.mutate(targetUser.user_id)}
                className="bg-red-600 hover:bg-red-700"
                disabled={deleteUserMutation.isPending}
              >
                {deleteUserMutation.isPending ? 'Deletando...' : 'Sim, Deletar'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminLayout>
  );
}
