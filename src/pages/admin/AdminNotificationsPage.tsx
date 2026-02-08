import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Bell,
  Plus,
  Send,
  Users,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Info,
  Megaphone,
  Trash2,
  Eye,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useToast } from '@/hooks/use-toast';

interface AdminNotification {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  target_audience: string;
  target_plans: string[] | null;
  target_user_ids: string[] | null;
  delivery_method: string;
  scheduled_at: string | null;
  sent_at: string | null;
  expires_at: string | null;
  created_at: string;
  admin_user_id: string;
}

const notificationTypeConfig = {
  info: { label: 'Informação', icon: Info, color: 'bg-blue-500/10 text-blue-500 border-blue-500/30' },
  warning: { label: 'Aviso', icon: AlertTriangle, color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30' },
  success: { label: 'Sucesso', icon: CheckCircle2, color: 'bg-green-500/10 text-green-500 border-green-500/30' },
  urgent: { label: 'Urgente', icon: Megaphone, color: 'bg-red-500/10 text-red-500 border-red-500/30' },
};

const audienceConfig = {
  all: { label: 'Todos os Usuários', icon: Users },
  by_plan: { label: 'Por Plano', icon: Users },
  specific_users: { label: 'Usuários Específicos', icon: Users },
};

export default function AdminNotificationsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newNotification, setNewNotification] = useState({
    title: '',
    message: '',
    notification_type: 'info',
    target_audience: 'all',
    target_plans: [] as string[],
    delivery_method: 'banner',
    expires_in_days: 7,
  });

  // Fetch notifications
  const { data: notifications, isLoading } = useQuery({
    queryKey: ['admin-notifications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as AdminNotification[];
    },
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['admin-notifications-stats'],
    queryFn: async () => {
      const [totalResult, activeResult, usersResult] = await Promise.all([
        supabase.from('admin_notifications').select('id', { count: 'exact', head: true }),
        supabase
          .from('admin_notifications')
          .select('id', { count: 'exact', head: true })
          .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
        supabase.from('user_profiles').select('id', { count: 'exact', head: true }),
      ]);

      return {
        total: totalResult.count || 0,
        active: activeResult.count || 0,
        users: usersResult.count || 0,
      };
    },
  });

  // Create notification mutation
  const createNotificationMutation = useMutation({
    mutationFn: async (notification: typeof newNotification) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + notification.expires_in_days);

      const { error } = await supabase.from('admin_notifications').insert({
        admin_user_id: user.id,
        title: notification.title,
        message: notification.message,
        notification_type: notification.notification_type,
        target_audience: notification.target_audience,
        target_plans: notification.target_audience === 'by_plan' ? notification.target_plans : null,
        delivery_method: notification.delivery_method,
        sent_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
      });

      if (error) throw error;

      // Log admin action
      await supabase.from('admin_audit_logs').insert({
        admin_user_id: user.id,
        action: 'create_notification',
        target_type: 'notification',
        details: { title: notification.title, target: notification.target_audience },
        ip_address: 'unknown',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['admin-notifications-stats'] });
      toast({ title: 'Notificação criada', description: 'A notificação foi enviada com sucesso.' });
      setShowCreateModal(false);
      setNewNotification({
        title: '',
        message: '',
        notification_type: 'info',
        target_audience: 'all',
        target_plans: [],
        delivery_method: 'banner',
        expires_in_days: 7,
      });
    },
    onError: (error) => {
      toast({ title: 'Erro ao criar notificação', description: String(error), variant: 'destructive' });
    },
  });

  // Delete notification mutation
  const deleteNotificationMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('admin_notifications').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['admin-notifications-stats'] });
      toast({ title: 'Notificação removida' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao remover', description: String(error), variant: 'destructive' });
    },
  });

  const handleCreate = () => {
    if (!newNotification.title.trim() || !newNotification.message.trim()) {
      toast({ title: 'Preencha todos os campos', variant: 'destructive' });
      return;
    }
    createNotificationMutation.mutate(newNotification);
  };

  const getTypeConfig = (type: string) => {
    return notificationTypeConfig[type as keyof typeof notificationTypeConfig] || notificationTypeConfig.info;
  };

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Bell className="w-6 h-6" />
              Notificações
            </h1>
            <p className="text-muted-foreground">
              Envie avisos e comunicados para os usuários
            </p>
          </div>
          <Button
            className="bg-red-600 hover:bg-red-700"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            Nova Notificação
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="glass-card">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <Send className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats?.total || 0}</p>
                <p className="text-sm text-muted-foreground">Total Enviadas</p>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats?.active || 0}</p>
                <p className="text-sm text-muted-foreground">Ativas</p>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
                <Users className="w-6 h-6 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats?.users || 0}</p>
                <p className="text-sm text-muted-foreground">Usuários Alcançáveis</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Notifications Table */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Histórico de Notificações</CardTitle>
            <CardDescription>Todas as notificações enviadas</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Audiência</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Enviada em</TableHead>
                  <TableHead>Expira em</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : notifications?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                      Nenhuma notificação enviada
                    </TableCell>
                  </TableRow>
                ) : (
                  notifications?.map((notification) => {
                    const typeConfig = getTypeConfig(notification.notification_type);
                    const TypeIcon = typeConfig.icon;
                    const expired = isExpired(notification.expires_at);

                    return (
                      <TableRow key={notification.id} className="hover:bg-secondary/30">
                        <TableCell>
                          <Badge variant="outline" className={typeConfig.color}>
                            <TypeIcon className="w-3 h-3 mr-1" />
                            {typeConfig.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-foreground">{notification.title}</p>
                            <p className="text-xs text-muted-foreground line-clamp-1">
                              {notification.message}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {audienceConfig[notification.target_audience as keyof typeof audienceConfig]?.label || notification.target_audience}
                          </span>
                        </TableCell>
                        <TableCell>
                          {expired ? (
                            <Badge variant="outline" className="bg-zinc-500/10 text-zinc-400 border-zinc-500/30">
                              Expirada
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
                              Ativa
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {notification.sent_at
                            ? format(new Date(notification.sent_at), 'dd/MM/yyyy HH:mm')
                            : '-'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {notification.expires_at
                            ? format(new Date(notification.expires_at), 'dd/MM/yyyy')
                            : 'Nunca'}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteNotificationMutation.mutate(notification.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Create Modal */}
        <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Nova Notificação</DialogTitle>
              <DialogDescription>
                Envie uma notificação para os usuários da plataforma
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Título</Label>
                <Input
                  id="title"
                  placeholder="Ex: Manutenção programada"
                  value={newNotification.title}
                  onChange={(e) => setNewNotification({ ...newNotification, title: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">Mensagem</Label>
                <Textarea
                  id="message"
                  placeholder="Escreva a mensagem da notificação..."
                  rows={3}
                  value={newNotification.message}
                  onChange={(e) => setNewNotification({ ...newNotification, message: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select
                    value={newNotification.notification_type}
                    onValueChange={(v) => setNewNotification({ ...newNotification, notification_type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="info">Informação</SelectItem>
                      <SelectItem value="warning">Aviso</SelectItem>
                      <SelectItem value="success">Sucesso</SelectItem>
                      <SelectItem value="urgent">Urgente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Audiência</Label>
                  <Select
                    value={newNotification.target_audience}
                    onValueChange={(v) => setNewNotification({ ...newNotification, target_audience: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os Usuários</SelectItem>
                      <SelectItem value="by_plan">Por Plano</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {newNotification.target_audience === 'by_plan' && (
                <div className="space-y-2">
                  <Label>Planos</Label>
                  <div className="flex gap-2">
                    {['starter', 'pro', 'enterprise'].map((plan) => (
                      <Button
                        key={plan}
                        type="button"
                        size="sm"
                        variant={newNotification.target_plans.includes(plan) ? 'default' : 'outline'}
                        onClick={() => {
                          const plans = newNotification.target_plans.includes(plan)
                            ? newNotification.target_plans.filter((p) => p !== plan)
                            : [...newNotification.target_plans, plan];
                          setNewNotification({ ...newNotification, target_plans: plans });
                        }}
                      >
                        {plan.charAt(0).toUpperCase() + plan.slice(1)}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Expira em (dias)</Label>
                <Select
                  value={String(newNotification.expires_in_days)}
                  onValueChange={(v) => setNewNotification({ ...newNotification, expires_in_days: Number(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 dia</SelectItem>
                    <SelectItem value="3">3 dias</SelectItem>
                    <SelectItem value="7">7 dias</SelectItem>
                    <SelectItem value="14">14 dias</SelectItem>
                    <SelectItem value="30">30 dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                Cancelar
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-700"
                onClick={handleCreate}
                disabled={createNotificationMutation.isPending}
              >
                <Send className="w-4 h-4 mr-2" />
                {createNotificationMutation.isPending ? 'Enviando...' : 'Enviar Notificação'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
