import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Megaphone,
  Search,
  Filter,
  Plus,
  Eye,
  MoreHorizontal,
  Calendar,
  Layers,
  Target,
  CheckCircle2,
  Clock,
  AlertCircle,
  Pause,
  Loader2,
  ChevronDown,
  ExternalLink,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface CampaignJob {
  id: string;
  name: string;
  hash: string;
  status: string;
  progress: number;
  total_campaigns: number;
  total_adsets: number;
  total_ads: number;
  accounts_count: number;
  config: any;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ComponentType<any> }> = {
  queued: { label: 'Na Fila', color: 'badge-warning', icon: Clock },
  processing: { label: 'Processando', color: 'badge-info', icon: Loader2 },
  completed: { label: 'Concluído', color: 'badge-active', icon: CheckCircle2 },
  failed: { label: 'Falhou', color: 'badge-danger', icon: AlertCircle },
  paused: { label: 'Pausado', color: 'bg-muted text-muted-foreground', icon: Pause },
};

export default function CampaignsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ['campaigns-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_jobs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as CampaignJob[];
    },
  });

  // Filter campaigns
  const filteredCampaigns = campaigns.filter((campaign) => {
    const matchesSearch = campaign.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || campaign.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Stats
  const stats = {
    total: campaigns.length,
    completed: campaigns.filter(c => c.status === 'completed').length,
    processing: campaigns.filter(c => c.status === 'processing' || c.status === 'queued').length,
    failed: campaigns.filter(c => c.status === 'failed').length,
  };

  const getObjectiveLabel = (objective: string) => {
    const objectives: Record<string, string> = {
      'OUTCOME_SALES': 'Vendas',
      'OUTCOME_LEADS': 'Leads',
      'OUTCOME_TRAFFIC': 'Tráfego',
      'OUTCOME_AWARENESS': 'Reconhecimento',
      'OUTCOME_ENGAGEMENT': 'Engajamento',
      'OUTCOME_APP_PROMOTION': 'App',
    };
    return objectives[objective] || objective;
  };

  const getCampaignTypeLabel = (config: any) => {
    const parts = [];
    if (config?.useCatalog) parts.push('Catálogo');
    if (config?.useCBO) parts.push('CBO');
    else parts.push('ABO');
    return parts.join(' | ');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Campanhas</h1>
          <p className="text-muted-foreground">Gerencie suas campanhas criadas</p>
        </div>
        <Button asChild className="glow-primary">
          <Link to="/campanhas/criar">
            <Plus className="w-4 h-4 mr-2" />
            Nova Campanha
          </Link>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-2xl font-bold text-foreground">{stats.total}</p>
              </div>
              <Megaphone className="w-8 h-8 text-muted-foreground/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Concluídas</p>
                <p className="text-2xl font-bold text-ads-success">{stats.completed}</p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-ads-success/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Processando</p>
                <p className="text-2xl font-bold text-ads-info">{stats.processing}</p>
              </div>
              <Clock className="w-8 h-8 text-ads-info/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Falhas</p>
                <p className="text-2xl font-bold text-ads-danger">{stats.failed}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-ads-danger/30" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar campanhas..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-48">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="completed">Concluídos</SelectItem>
                <SelectItem value="processing">Processando</SelectItem>
                <SelectItem value="queued">Na Fila</SelectItem>
                <SelectItem value="failed">Falhou</SelectItem>
                <SelectItem value="paused">Pausado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Campaigns List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filteredCampaigns.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Megaphone className="w-16 h-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              {searchQuery || statusFilter !== 'all' 
                ? 'Nenhuma campanha encontrada' 
                : 'Nenhuma campanha criada ainda'}
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              {searchQuery || statusFilter !== 'all'
                ? 'Tente ajustar os filtros de busca'
                : 'Comece criando sua primeira campanha'}
            </p>
            {!searchQuery && statusFilter === 'all' && (
              <Button asChild>
                <Link to="/campanhas/criar">
                  <Plus className="w-4 h-4 mr-2" />
                  Criar Campanha
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredCampaigns.map((campaign, index) => {
            const StatusIcon = statusConfig[campaign.status]?.icon || Clock;
            const config = campaign.config || {};
            
            return (
              <motion.div
                key={campaign.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="glass-card hover:border-primary/30 transition-all">
                  <CardContent className="p-6">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                      {/* Main Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Megaphone className="w-5 h-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-medium text-foreground truncate max-w-md">
                                {campaign.name}
                              </h3>
                              <Badge className={statusConfig[campaign.status]?.color}>
                                <StatusIcon className={`w-3 h-3 mr-1 ${campaign.status === 'processing' ? 'animate-spin' : ''}`} />
                                {statusConfig[campaign.status]?.label}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {formatDistanceToNow(new Date(campaign.created_at), { 
                                  addSuffix: true, 
                                  locale: ptBR 
                                })}
                              </span>
                              <span className="flex items-center gap-1">
                                <Target className="w-3 h-3" />
                                {getObjectiveLabel(config.objective)}
                              </span>
                              <span className="text-xs px-2 py-0.5 bg-secondary rounded">
                                {getCampaignTypeLabel(config)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-6 text-sm">
                        <div className="text-center">
                          <p className="text-lg font-bold text-foreground">{campaign.total_campaigns}</p>
                          <p className="text-xs text-muted-foreground">Campanhas</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold text-foreground">{campaign.total_adsets}</p>
                          <p className="text-xs text-muted-foreground">Conjuntos</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold text-foreground">{campaign.total_ads}</p>
                          <p className="text-xs text-muted-foreground">Anúncios</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold text-foreground">{campaign.accounts_count}</p>
                          <p className="text-xs text-muted-foreground">Contas</p>
                        </div>
                      </div>

                      {/* Progress */}
                      <div className="w-32">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-muted-foreground">Progresso</span>
                          <span className="text-xs font-medium text-foreground">{campaign.progress}%</span>
                        </div>
                        <Progress value={campaign.progress} className="h-2" />
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <Link to="/fila-processamento">
                            <Eye className="w-4 h-4 mr-1" />
                            Detalhes
                          </Link>
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link to="/fila-processamento">
                                <Eye className="w-4 h-4 mr-2" />
                                Ver na Fila
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Layers className="w-4 h-4 mr-2" />
                              Duplicar
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <ExternalLink className="w-4 h-4 mr-2" />
                              Abrir no Facebook
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {/* Error Message */}
                    {campaign.error_message && (
                      <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                        <p className="text-sm text-destructive">{campaign.error_message}</p>
                      </div>
                    )}

                    {/* Extra Info Row */}
                    <div className="mt-4 pt-4 border-t border-border flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                      <span>
                        <strong>Orçamento:</strong> R$ {config.budget || 0}/dia
                      </span>
                      {config.destinationUrl && (
                        <span className="truncate max-w-xs">
                          <strong>URL:</strong> {config.destinationUrl}
                        </span>
                      )}
                      {campaign.completed_at && (
                        <span>
                          <strong>Concluído:</strong> {format(new Date(campaign.completed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </span>
                      )}
                      <span className="ml-auto text-xs opacity-50">
                        #{campaign.hash}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
