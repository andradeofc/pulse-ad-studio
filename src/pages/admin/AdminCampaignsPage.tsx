import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Megaphone,
  Search,
  Filter,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Eye,
  Pause,
  Play,
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
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { formatCurrency } from '@/lib/currencyUtils';

interface CampaignJob {
  id: string;
  name: string;
  hash: string;
  user_id: string;
  status: string;
  progress: number;
  total_campaigns: number;
  total_adsets: number;
  total_ads: number;
  accounts_count: number;
  config: any;
  created_at: string;
  completed_at: string | null;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  queued: { label: 'Na Fila', color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30' },
  processing: { label: 'Processando', color: 'bg-blue-500/10 text-blue-500 border-blue-500/30' },
  completed: { label: 'Concluído', color: 'bg-green-500/10 text-green-500 border-green-500/30' },
  failed: { label: 'Falhou', color: 'bg-red-500/10 text-red-500 border-red-500/30' },
  paused: { label: 'Pausado', color: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30' },
};

const ITEMS_PER_PAGE = 25;

export default function AdminCampaignsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch all users for the filter
  const { data: usersData } = useQuery({
    queryKey: ['admin-campaign-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('user_id, full_name')
        .order('full_name');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: campaignsData, isLoading } = useQuery({
    queryKey: ['admin-campaigns', searchQuery, statusFilter, typeFilter, userFilter, currentPage],
    queryFn: async () => {
      let query = supabase
        .from('campaign_jobs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (userFilter !== 'all') {
        query = query.eq('user_id', userFilter);
      }

      if (searchQuery) {
        query = query.or(`name.ilike.%${searchQuery}%,hash.ilike.%${searchQuery}%`);
      }

      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        campaigns: data as CampaignJob[],
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
            <Megaphone className="w-6 h-6" />
            Todas as Campanhas
          </h1>
          <p className="text-muted-foreground">
            {campaignsData?.total || 0} jobs de campanha registrados
          </p>
        </div>

        {/* Filters */}
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome ou hash..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="queued">Na Fila</SelectItem>
                  <SelectItem value="processing">Processando</SelectItem>
                  <SelectItem value="completed">Concluído</SelectItem>
                  <SelectItem value="failed">Falhou</SelectItem>
                  <SelectItem value="paused">Pausado</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="cbo">CBO</SelectItem>
                  <SelectItem value="abo">ABO</SelectItem>
                  <SelectItem value="catalog">Catálogo</SelectItem>
                </SelectContent>
              </Select>
              <Select value={userFilter} onValueChange={(v) => { setUserFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Usuário" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Usuários</SelectItem>
                  {usersData?.map((user) => (
                    <SelectItem key={user.user_id} value={user.user_id}>
                      {user.full_name || user.user_id.slice(0, 8) + '...'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Campaigns Table */}
        <Card className="glass-card">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Hash</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progresso</TableHead>
                  <TableHead className="text-center">Campanhas</TableHead>
                  <TableHead className="text-center">Conjuntos</TableHead>
                  <TableHead className="text-center">Anúncios</TableHead>
                  <TableHead>Contas</TableHead>
                  <TableHead>Criado em</TableHead>
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
                ) : campaignsData?.campaigns.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-32 text-center text-muted-foreground">
                      Nenhuma campanha encontrada
                    </TableCell>
                  </TableRow>
                ) : (
                  campaignsData?.campaigns.map((campaign) => (
                    <TableRow key={campaign.id} className="hover:bg-secondary/30">
                      <TableCell>
                        <div className="max-w-[200px]">
                          <p className="font-medium text-foreground truncate" title={campaign.name}>
                            {campaign.name}
                          </p>
                          <Link to={`/ops-center/usuarios/${campaign.user_id}`} className="text-xs text-primary hover:underline">
                            {usersData?.find(u => u.user_id === campaign.user_id)?.full_name || campaign.user_id.slice(0, 8) + '...'}
                          </Link>
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-secondary/50 px-2 py-1 rounded">
                          #{campaign.hash}
                        </code>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusConfig[campaign.status]?.color || ''}>
                          {statusConfig[campaign.status]?.label || campaign.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-secondary rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all"
                              style={{ width: `${campaign.progress}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">{campaign.progress}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">{campaign.total_campaigns}</TableCell>
                      <TableCell className="text-center">{campaign.total_adsets}</TableCell>
                      <TableCell className="text-center">{campaign.total_ads}</TableCell>
                      <TableCell>{campaign.accounts_count}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(campaign.created_at), 'dd/MM/yyyy HH:mm')}
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
                              <Link to={`/ops-center/campanhas/${campaign.id}`}>
                                <Eye className="w-4 h-4 mr-2" />
                                Ver Detalhes
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link to={`/ops-center/fila/${campaign.hash}`}>
                                <Eye className="w-4 h-4 mr-2" />
                                Ver na Fila
                              </Link>
                            </DropdownMenuItem>
                            {campaign.status === 'processing' && (
                              <DropdownMenuItem>
                                <Pause className="w-4 h-4 mr-2" />
                                Pausar
                              </DropdownMenuItem>
                            )}
                            {campaign.status === 'paused' && (
                              <DropdownMenuItem>
                                <Play className="w-4 h-4 mr-2" />
                                Retomar
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {/* Pagination */}
            {campaignsData && campaignsData.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  Página {currentPage} de {campaignsData.totalPages}
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
                    onClick={() => setCurrentPage(p => Math.min(campaignsData.totalPages, p + 1))}
                    disabled={currentPage === campaignsData.totalPages}
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
