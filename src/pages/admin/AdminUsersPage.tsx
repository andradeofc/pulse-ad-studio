import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Users,
  Search,
  Download,
  Plus,
  MoreHorizontal,
  Eye,
  Edit,
  Key,
  RefreshCw,
  Pause,
  Ban,
  Trash2,
  LogIn,
  ChevronLeft,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/currencyUtils';

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

const statusConfig = {
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

export default function AdminUsersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState('newest');
  const [currentPage, setCurrentPage] = useState(1);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // Fetch users with stats
  const { data: usersData, isLoading } = useQuery({
    queryKey: ['admin-users', searchQuery, planFilter, statusFilter, sortBy, currentPage],
    queryFn: async () => {
      let query = supabase
        .from('user_profiles')
        .select('*', { count: 'exact' });

      // Apply filters
      if (planFilter !== 'all') {
        query = query.eq('plan', planFilter);
      }
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter as any);
      }
      if (searchQuery) {
        query = query.or(`full_name.ilike.%${searchQuery}%,user_id.eq.${searchQuery}`);
      }

      // Sorting
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

      // Pagination
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      // Enrich with additional stats
      const enrichedUsers = await Promise.all(
        (data || []).map(async (user) => {
          const [fbAccounts, adAccounts, campaigns, spendData] = await Promise.all([
            supabase.from('facebook_profiles').select('*', { count: 'exact', head: true }).eq('user_id', user.user_id),
            supabase.from('facebook_ad_accounts').select('*', { count: 'exact', head: true }),
            supabase.from('campaign_jobs').select('*', { count: 'exact', head: true }).eq('user_id', user.user_id),
            supabase.from('facebook_ad_accounts').select('amount_spent'),
          ]);

          return {
            ...user,
            fb_accounts_count: fbAccounts.count || 0,
            ad_accounts_count: adAccounts.count || 0,
            campaigns_count: campaigns.count || 0,
            total_spend: spendData.data?.reduce((sum, acc) => sum + (acc.amount_spent || 0), 0) || 0,
          };
        })
      );

      return {
        users: enrichedUsers as UserProfile[],
        total: count || 0,
        totalPages: Math.ceil((count || 0) / ITEMS_PER_PAGE),
      };
    },
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

      // Log admin action
      await supabase.from('admin_audit_logs').insert({
        admin_user_id: (await supabase.auth.getUser()).data.user?.id,
        action: 'update_user',
        target_type: 'user',
        target_id: id,
        details: { updates: data },
        ip_address: 'unknown', // Would need to get from server
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({ title: 'Usuário atualizado com sucesso' });
      setShowEditModal(false);
      setEditingUser(null);
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar usuário', description: String(error), variant: 'destructive' });
    },
  });

  const handleStatusChange = async (userId: string, newStatus: string) => {
    await updateUserMutation.mutateAsync({ id: userId, status: newStatus as any });
  };

  const handleEdit = (user: UserProfile) => {
    setEditingUser(user);
    setShowEditModal(true);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Users className="w-6 h-6" />
              Usuários
            </h1>
            <p className="text-muted-foreground">
              {usersData?.total || 0} usuários registrados
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Exportar CSV
            </Button>
            <Button size="sm" className="bg-red-600 hover:bg-red-700">
              <Plus className="w-4 h-4 mr-2" />
              Criar Usuário
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome, email ou ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={planFilter} onValueChange={setPlanFilter}>
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
              <Select value={statusFilter} onValueChange={setStatusFilter}>
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
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-32 text-center text-muted-foreground">
                      Carregando...
                    </TableCell>
                  </TableRow>
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
                        <div>
                          <p className="font-medium text-foreground">
                            {user.full_name || 'Sem nome'}
                          </p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {user.user_id.slice(0, 8)}...
                          </p>
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
                      <TableCell className="text-center">{user.fb_accounts_count}</TableCell>
                      <TableCell className="text-center">{user.ad_accounts_count}</TableCell>
                      <TableCell className="text-center">{user.campaigns_count}</TableCell>
                      <TableCell className="text-right font-medium">
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
                            <DropdownMenuItem asChild>
                              <Link to={`/ops-center/usuarios/${user.id}`}>
                                <Eye className="w-4 h-4 mr-2" />
                                Ver Detalhes
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleEdit(user)}>
                              <Edit className="w-4 h-4 mr-2" />
                              Editar Dados
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Key className="w-4 h-4 mr-2" />
                              Alterar Senha
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <RefreshCw className="w-4 h-4 mr-2" />
                              Resetar Senha
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
                            <DropdownMenuItem>
                              <LogIn className="w-4 h-4 mr-2" />
                              Login como Usuário
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-red-500">
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
                  Página {currentPage} de {usersData.totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(usersData.totalPages, p + 1))}
                    disabled={currentPage === usersData.totalPages}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

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
      </div>
    </AdminLayout>
  );
}
