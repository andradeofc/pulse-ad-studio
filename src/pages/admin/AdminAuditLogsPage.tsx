import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ScrollText,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  User,
  Settings,
  Trash2,
  Edit,
  LogIn,
  Eye,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AdminLayout } from '@/components/admin/AdminLayout';

interface AuditLog {
  id: string;
  admin_user_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, any>;
  ip_address: string;
  user_agent: string | null;
  created_at: string;
}

const actionConfig: Record<string, { label: string; icon: typeof User; color: string }> = {
  login_admin: { label: 'Login Admin', icon: LogIn, color: 'text-blue-500' },
  view_user: { label: 'Visualizou Usuário', icon: Eye, color: 'text-cyan-500' },
  update_user: { label: 'Editou Usuário', icon: Edit, color: 'text-yellow-500' },
  delete_user: { label: 'Deletou Usuário', icon: Trash2, color: 'text-red-500' },
  update_settings: { label: 'Alterou Config', icon: Settings, color: 'text-purple-500' },
  impersonate_user: { label: 'Impersonou Usuário', icon: User, color: 'text-orange-500' },
};

const ITEMS_PER_PAGE = 50;

export default function AdminAuditLogsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);

  const { data: logsData, isLoading } = useQuery({
    queryKey: ['admin-audit-logs', searchQuery, actionFilter, currentPage],
    queryFn: async () => {
      let query = supabase
        .from('admin_audit_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (actionFilter !== 'all') {
        query = query.eq('action', actionFilter);
      }

      if (searchQuery) {
        query = query.or(`action.ilike.%${searchQuery}%,target_id.ilike.%${searchQuery}%`);
      }

      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        logs: data as AuditLog[],
        total: count || 0,
        totalPages: Math.ceil((count || 0) / ITEMS_PER_PAGE),
      };
    },
  });

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ScrollText className="w-6 h-6" />
            Logs de Auditoria
          </h1>
          <p className="text-muted-foreground">
            Registro imutável de todas as ações administrativas
          </p>
        </div>

        {/* Warning */}
        <Card className="border-l-4 border-l-yellow-500 bg-yellow-500/5">
          <CardContent className="p-4">
            <p className="text-sm text-yellow-500">
              ⚠️ Logs de auditoria são imutáveis e não podem ser deletados.
            </p>
          </CardContent>
        </Card>

        {/* Filters */}
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por ação ou alvo..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Tipo de Ação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="login_admin">Login Admin</SelectItem>
                  <SelectItem value="view_user">Visualizar Usuário</SelectItem>
                  <SelectItem value="update_user">Editar Usuário</SelectItem>
                  <SelectItem value="delete_user">Deletar Usuário</SelectItem>
                  <SelectItem value="update_settings">Alterar Config</SelectItem>
                  <SelectItem value="impersonate_user">Impersonar</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Logs Table */}
        <Card className="glass-card">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Alvo</TableHead>
                  <TableHead>Detalhes</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : logsData?.logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      Nenhum log encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  logsData?.logs.map((log) => {
                    const config = actionConfig[log.action] || {
                      label: log.action,
                      icon: Settings,
                      color: 'text-muted-foreground',
                    };
                    const Icon = config.icon;

                    return (
                      <TableRow key={log.id} className="hover:bg-secondary/30">
                        <TableCell className="text-sm">
                          {format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          <code className="text-xs bg-secondary/50 px-2 py-1 rounded">
                            {log.admin_user_id.slice(0, 8)}...
                          </code>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Icon className={`w-4 h-4 ${config.color}`} />
                            <span className="text-sm">{config.label}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {log.target_type && log.target_id ? (
                            <Badge variant="outline" className="font-mono text-xs">
                              {log.target_type}:{log.target_id.slice(0, 8)}...
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground max-w-[200px] truncate block">
                            {JSON.stringify(log.details).slice(0, 50)}...
                          </span>
                        </TableCell>
                        <TableCell>
                          <code className="text-xs text-muted-foreground">{log.ip_address}</code>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>

            {/* Pagination */}
            {logsData && logsData.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  Página {currentPage} de {logsData.totalPages} ({logsData.total} registros)
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
                    onClick={() => setCurrentPage(p => Math.min(logsData.totalPages, p + 1))}
                    disabled={currentPage === logsData.totalPages}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
