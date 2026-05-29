import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Megaphone,
  Target,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Pause,
  Play,
  Loader2,
  MapPin,
  Globe,
  DollarSign,
  Users,
  Layers,
  Image,
  ExternalLink,
  Copy,
  ChevronRight,
  Monitor,
  Hash,
  Settings2,
  Zap,
  UserCircle,
  Shield,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import {
  formatCurrency,
  formatMultiCurrencyBudget,
  hasMultipleCurrencies,
  getPrimaryCurrency,
} from '@/lib/currencyUtils';


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
  user_id: string;
  admin_paused?: boolean;
  admin_pause_message?: string | null;
  admin_paused_at?: string | null;
}


interface CampaignJobItem {
  id: string;
  job_id: string;
  item_type: string;
  parent_id: string | null;
  name: string;
  status: string;
  facebook_id: string | null;
  error_message: string | null;
  config: any;
  created_at: string;
}

interface CampaignOwner {
  user_id: string;
  full_name: string | null;
  plan: string | null;
  status: string;
  email: string | null;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ComponentType<any>; bgColor: string }> = {
  queued: { label: 'Na Fila', color: 'text-ads-warning', icon: Clock, bgColor: 'bg-ads-warning/10' },
  processing: { label: 'Processando', color: 'text-ads-info', icon: Loader2, bgColor: 'bg-ads-info/10' },
  completed: { label: 'Concluído', color: 'text-ads-success', icon: CheckCircle2, bgColor: 'bg-ads-success/10' },
  failed: { label: 'Falhou', color: 'text-destructive', icon: AlertCircle, bgColor: 'bg-destructive/10' },
  paused: { label: 'Pausado', color: 'text-muted-foreground', icon: Pause, bgColor: 'bg-muted' },
  pending: { label: 'Pendente', color: 'text-muted-foreground', icon: Clock, bgColor: 'bg-muted' },
};

const objectiveLabels: Record<string, { label: string; description: string }> = {
  'OUTCOME_SALES': { label: 'Vendas', description: 'Conversões e vendas online' },
  'OUTCOME_LEADS': { label: 'Leads', description: 'Geração de cadastros' },
  'OUTCOME_TRAFFIC': { label: 'Tráfego', description: 'Visitas ao site' },
  'OUTCOME_AWARENESS': { label: 'Reconhecimento', description: 'Alcance e impressões' },
  'OUTCOME_ENGAGEMENT': { label: 'Engajamento', description: 'Interações e curtidas' },
  'OUTCOME_APP_PROMOTION': { label: 'App', description: 'Instalações de app' },
};

const optimizationGoalLabels: Record<string, string> = {
  'OFFSITE_CONVERSIONS': 'Conversões no Site',
  'VALUE': 'Valor de Conversão',
  'LINK_CLICKS': 'Cliques no Link',
  'LANDING_PAGE_VIEWS': 'Visualizações de Página',
  'IMPRESSIONS': 'Impressões',
  'REACH': 'Alcance',
  'LEAD_GENERATION': 'Geração de Leads',
  'QUALITY_LEAD': 'Leads Qualificados',
};

const billingEventLabels: Record<string, string> = {
  'IMPRESSIONS': 'CPM (Impressões)',
  'LINK_CLICKS': 'CPC (Cliques)',
  'APP_INSTALLS': 'CPI (Instalações)',
};

const planLabels: Record<string, { label: string; color: string }> = {
  starter: { label: 'Starter', color: 'bg-muted text-muted-foreground' },
  pro: { label: 'Pro', color: 'bg-ads-info/10 text-ads-info border-ads-info/30' },
  enterprise: { label: 'Enterprise', color: 'bg-ads-warning/10 text-ads-warning border-ads-warning/30' },
};

export default function AdminCampaignDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pauseDialogOpen, setPauseDialogOpen] = useState(false);
  const [pauseMessage, setPauseMessage] = useState('Pausado Manualmente');
  const [pauseLoading, setPauseLoading] = useState(false);
  const [resumeLoading, setResumeLoading] = useState(false);

  const handleAdminPause = async () => {
    setPauseLoading(true);
    try {
      const { error } = await supabase.rpc('admin_pause_job' as any, {
        p_job_id: id!,
        p_message: pauseMessage.trim() || 'Pausado Manualmente',
      });
      if (error) throw error;
      toast({ title: 'Campanha pausada', description: 'O job será pausado após o batch atual.' });
      setPauseDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['admin-campaign-details', id] });
    } catch (e: any) {
      toast({ title: 'Erro ao pausar', description: e.message, variant: 'destructive' });
    } finally {
      setPauseLoading(false);
    }
  };

  const handleAdminResume = async () => {
    setResumeLoading(true);
    try {
      const { error } = await supabase.rpc('admin_resume_job' as any, { p_job_id: id! });
      if (error) throw error;
      toast({ title: 'Campanha retomada', description: 'O job voltou para a fila.' });
      queryClient.invalidateQueries({ queryKey: ['admin-campaign-details', id] });
    } catch (e: any) {
      toast({ title: 'Erro ao retomar', description: e.message, variant: 'destructive' });
    } finally {
      setResumeLoading(false);
    }
  };


  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-campaign-details', id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_admin_campaign_details', {
        p_job_id: id!,
      });
      if (error) throw error;
      return data as unknown as { job: CampaignJob; items: CampaignJobItem[] | null; user: CampaignOwner | null };
    },
    enabled: !!id,
  });

  const campaign = data?.job;
  const items = data?.items || [];
  const owner = data?.user;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copiado!',
      description: `${label} copiado para a área de transferência.`,
    });
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  if (!campaign) {
    return (
      <AdminLayout>
        <div className="flex flex-col items-center justify-center h-96">
          <AlertCircle className="w-16 h-16 text-muted-foreground/30 mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">Campanha não encontrada</h2>
          <p className="text-muted-foreground mb-6">A campanha que você está procurando não existe ou foi removida.</p>
          <Button asChild>
            <Link to="/ops-center/campanhas">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar para Campanhas
            </Link>
          </Button>
        </div>
      </AdminLayout>
    );
  }

  const config = campaign.config || {};
  const StatusIcon = statusConfig[campaign.status]?.icon || Clock;
  const objective = objectiveLabels[config.objective] || { label: config.objective, description: '' };

  const campaigns = items.filter(i => i.item_type === 'campaign');
  const adsets = items.filter(i => i.item_type === 'adset');
  const ads = items.filter(i => i.item_type === 'ad');

  const itemStats = {
    completed: items.filter(i => i.status === 'completed').length,
    failed: items.filter(i => i.status === 'failed').length,
    pending: items.filter(i => i.status === 'pending').length,
    processing: items.filter(i => i.status === 'processing').length,
  };

  const ownerPlan = planLabels[owner?.plan || 'starter'] || planLabels.starter;

  return (
    <AdminLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col gap-4">
          <Button variant="ghost" size="sm" className="w-fit -ml-2" asChild>
            <Link to="/ops-center/campanhas">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar para Campanhas
            </Link>
          </Button>

          {/* Owner Banner */}
          {owner && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <UserCircle className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-foreground">{owner.full_name || 'Sem nome'}</h3>
                        <Badge variant="outline" className={`text-xs ${ownerPlan.color}`}>
                          {ownerPlan.label}
                        </Badge>
                        <Badge variant="outline" className={`text-xs ${owner.status === 'active' ? 'border-ads-success/30 text-ads-success' : 'border-destructive/30 text-destructive'}`}>
                          {owner.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{owner.email || 'Email não disponível'}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/ops-center/usuarios/${owner.user_id}`}>
                      <UserCircle className="w-4 h-4 mr-2" />
                      Ver Perfil
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className={`w-14 h-14 rounded-xl ${statusConfig[campaign.status]?.bgColor} flex items-center justify-center flex-shrink-0`}>
                <StatusIcon className={`w-7 h-7 ${statusConfig[campaign.status]?.color} ${campaign.status === 'processing' ? 'animate-spin' : ''}`} />
              </div>
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl font-bold text-foreground">{campaign.name}</h1>
                  <Badge className={`${campaign.status === 'completed' ? 'badge-active' : campaign.status === 'failed' ? 'badge-danger' : campaign.status === 'processing' ? 'badge-info' : 'badge-warning'}`}>
                    {statusConfig[campaign.status]?.label}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5" />
                    {campaign.hash}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    {format(new Date(campaign.created_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
                  </span>
                  {campaign.completed_at && (
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-ads-success" />
                      Concluído {formatDistanceToNow(new Date(campaign.completed_at), { addSuffix: true, locale: ptBR })}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => copyToClipboard(campaign.id, 'ID')}>
                <Copy className="w-4 h-4 mr-2" />
                Copiar ID
              </Button>

              {/* Admin manual pause / resume */}
              {campaign.admin_paused ? (
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleAdminResume}
                  disabled={resumeLoading}
                  className="bg-ads-success hover:bg-ads-success/90"
                >
                  {resumeLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                  Retomar
                </Button>
              ) : (
                campaign.status !== 'completed' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setPauseMessage('Pausado Manualmente'); setPauseDialogOpen(true); }}
                    className="border-amber-500/40 text-amber-600 hover:bg-amber-500/10"
                  >
                    <Pause className="w-4 h-4 mr-2" />
                    Pausar manualmente
                  </Button>
                )
              )}
            </div>
          </div>
        </div>

        {/* Admin paused banner */}
        {campaign.admin_paused && (
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Pause className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-medium text-amber-600">Pausado pelo admin</h4>
                  <p className="text-sm text-foreground/80 mt-1">
                    {campaign.admin_pause_message || 'Pausado Manualmente'}
                  </p>
                  {campaign.admin_paused_at && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(campaign.admin_paused_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pause dialog */}
        <Dialog open={pauseDialogOpen} onOpenChange={setPauseDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Pausar campanha manualmente</DialogTitle>
              <DialogDescription>
                O processamento será pausado após o batch atual terminar. O usuário verá a mensagem abaixo na fila.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor="pause-message">Mensagem para o usuário</Label>
              <Textarea
                id="pause-message"
                value={pauseMessage}
                onChange={(e) => setPauseMessage(e.target.value)}
                rows={3}
                placeholder="Pausado Manualmente"
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setPauseDialogOpen(false)} disabled={pauseLoading}>
                Cancelar
              </Button>
              <Button onClick={handleAdminPause} disabled={pauseLoading} className="bg-amber-500 hover:bg-amber-600">
                {pauseLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Pause className="w-4 h-4 mr-2" />}
                Pausar campanha
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>


        {/* Error Message */}
        {campaign.error_message && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium text-destructive">Erro no Processamento</h4>
                  <p className="text-sm text-destructive/80 mt-1">{campaign.error_message}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Progress Section */}
        <Card className="glass-card overflow-hidden">
          <div
            className={`h-1.5 ${campaign.status === 'completed' ? 'bg-gradient-to-r from-ads-success via-ads-success to-ads-success/50' : campaign.status === 'failed' ? 'bg-gradient-to-r from-destructive to-destructive/50' : 'bg-gradient-to-r from-primary via-primary to-primary/50'}`}
            style={{ width: `${campaign.progress}%`, transition: 'width 0.5s ease' }}
          />
          <CardContent className="p-6">
            <div className="flex flex-col lg:flex-row lg:items-center gap-6">
              <div className="flex-1 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-foreground">Progresso do Processamento</span>
                    {campaign.status === 'processing' && (
                      <span className="flex items-center gap-1.5 text-xs text-ads-info">
                        <span className="w-1.5 h-1.5 rounded-full bg-ads-info animate-pulse" />
                        Em andamento
                      </span>
                    )}
                  </div>
                  <span className="text-3xl font-bold text-foreground">{campaign.progress}<span className="text-lg text-muted-foreground">%</span></span>
                </div>
                <Progress
                  value={campaign.progress}
                  className="h-2.5"
                  indicatorClassName={campaign.status === 'failed' ? 'bg-destructive' : campaign.status === 'completed' ? 'bg-ads-success' : undefined}
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{itemStats.completed} de {items.length} itens processados</span>
                  <div className="flex items-center gap-3">
                    {itemStats.completed > 0 && <span className="text-ads-success">{itemStats.completed} ✓</span>}
                    {itemStats.failed > 0 && <span className="text-destructive">{itemStats.failed} erros</span>}
                  </div>
                </div>
              </div>

              <Separator orientation="vertical" className="hidden lg:block h-20" />

              <div className="grid grid-cols-4 gap-4 lg:gap-6">
                <div className="text-center p-3 rounded-lg bg-primary/5 border border-primary/10">
                  <p className="text-xl font-bold text-primary">{campaign.total_campaigns}</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Campanhas</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-ads-info/5 border border-ads-info/10">
                  <p className="text-xl font-bold text-ads-info">{campaign.total_adsets}</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Conjuntos</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-ads-warning/5 border border-ads-warning/10">
                  <p className="text-xl font-bold text-ads-warning">{campaign.total_ads}</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Anúncios</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-ads-success/5 border border-ads-success/10">
                  <p className="text-xl font-bold text-ads-success">{campaign.accounts_count}</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Contas</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Content Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="structure">Estrutura</TabsTrigger>
            <TabsTrigger value="config">Configuração</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Campaign Settings */}
              <Card className="glass-card">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Target className="w-5 h-5 text-primary" />
                    Objetivo da Campanha
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4 p-4 rounded-lg bg-primary/5 border border-primary/10">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Zap className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground">{objective.label}</h4>
                      <p className="text-sm text-muted-foreground">{objective.description}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg bg-secondary/50">
                      <p className="text-xs text-muted-foreground mb-1">Tipo</p>
                      <p className="font-medium text-foreground">{config.useCatalog ? 'Catálogo' : 'Padrão'}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-secondary/50">
                      <p className="text-xs text-muted-foreground mb-1">Orçamento</p>
                      <p className="font-medium text-foreground">{config.useCBO ? 'CBO' : 'ABO'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Budget & Bidding */}
              <Card className="glass-card">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-primary" />
                    Orçamento e Lance
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-lg bg-ads-success/5 border border-ads-success/10">
                      <p className="text-xs text-muted-foreground mb-1">Orçamento Diário</p>
                      <p className="text-2xl font-bold text-ads-success">
                        {(() => {
                          const budgetByCurrency = config.budgetByCurrency || config.adsetBudgetByCurrency;
                          if (budgetByCurrency && hasMultipleCurrencies(budgetByCurrency)) {
                            return formatMultiCurrencyBudget(budgetByCurrency);
                          }
                          const currency = getPrimaryCurrency(budgetByCurrency || {}, 'BRL');
                          return formatCurrency(config.budget || config.adsetBudget || 0, currency);
                        })()}
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-secondary/50">
                      <p className="text-xs text-muted-foreground mb-1">Otimização</p>
                      <p className="font-medium text-foreground text-sm">
                        {optimizationGoalLabels[config.optimizationGoal] || config.optimizationGoal || 'Não definido'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg bg-secondary/50">
                      <p className="text-xs text-muted-foreground mb-1">Cobrança</p>
                      <p className="font-medium text-foreground text-sm">
                        {billingEventLabels[config.billingEvent] || config.billingEvent || 'Impressões'}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-secondary/50">
                      <p className="text-xs text-muted-foreground mb-1">Estratégia</p>
                      <p className="font-medium text-foreground text-sm">
                        {config.bidStrategy === 'LOWEST_COST_WITHOUT_CAP' ? 'Menor Custo' :
                         config.bidStrategy === 'COST_CAP' ? 'Custo Alvo' :
                         config.bidStrategy || 'Automático'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Targeting */}
              <Card className="glass-card">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" />
                    Segmentação
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      Localizações
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {config.geoLocations?.length > 0 ? (
                        config.geoLocations.slice(0, 5).map((loc: any, idx: number) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            {loc.name || loc.key}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground">Não especificado</span>
                      )}
                      {config.geoLocations?.length > 5 && (
                        <Badge variant="outline" className="text-xs">
                          +{config.geoLocations.length - 5} mais
                        </Badge>
                      )}
                    </div>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Idade</p>
                      <p className="font-medium text-foreground">
                        {config.advantagePlus && config.ageRangeSuggestion
                          ? `${config.ageRangeSuggestion[0]} - ${config.ageRangeSuggestion[1]}+ (sugestão)`
                          : `${config.ageMin || 18} - ${config.ageMax || 65}+ anos`}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Gênero</p>
                      <p className="font-medium text-foreground">
                        {config.genders?.length === 2 || !config.genders?.length ? 'Todos' :
                         config.genders?.[0] === 1 ? 'Masculino' : 'Feminino'}
                      </p>
                    </div>
                  </div>

                  <Separator />
                  <div>
                    <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                      <Monitor className="w-3 h-3" />
                      Posicionamentos
                    </p>
                    <p className="font-medium text-foreground text-sm">
                      {config.automaticPlacements ? 'Automático (Advantage+)' : 'Manual'}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Destination & Creative */}
              <Card className="glass-card">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Globe className="w-5 h-5 text-primary" />
                    Destino e Criativo
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {config.destinationUrl && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">URL de Destino</p>
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/50">
                        <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm text-foreground truncate flex-1">{config.destinationUrl}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => window.open(config.destinationUrl, '_blank')}>
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {config.useCatalog && (
                    <>
                      <Separator />
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground mb-2">Catálogo</p>
                          <p className="font-medium text-foreground text-sm truncate">{config.catalogName || 'Selecionado'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-2">Product Set</p>
                          <p className="font-medium text-foreground text-sm truncate">{config.productSetName || 'Selecionado'}</p>
                        </div>
                      </div>
                    </>
                  )}

                  {config.selectedCreatives?.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                          <Image className="w-3 h-3" />
                          Criativos ({config.selectedCreatives.length})
                        </p>
                        <div className="flex gap-2 overflow-x-auto pb-2">
                          {config.selectedCreatives.slice(0, 4).map((creative: any, idx: number) => (
                            <div key={idx} className="w-16 h-16 rounded-lg bg-secondary flex-shrink-0 overflow-hidden">
                              {creative.thumbnail_url || creative.url ? (
                                <img src={creative.thumbnail_url || creative.url} alt={creative.name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Image className="w-6 h-6 text-muted-foreground" />
                                </div>
                              )}
                            </div>
                          ))}
                          {config.selectedCreatives.length > 4 && (
                            <div className="w-16 h-16 rounded-lg bg-secondary flex-shrink-0 flex items-center justify-center">
                              <span className="text-sm font-medium text-muted-foreground">+{config.selectedCreatives.length - 4}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  {/* UTM Parameters */}
                  {config.urlParams && (
                    <>
                      <Separator />
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">Parâmetros UTM</p>
                        <div className="p-3 rounded-lg bg-secondary/50 font-mono text-xs text-foreground break-all">
                          {config.urlParams}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Ad texts */}
                  {(config.primaryText || config.headline || config.description) && (
                    <>
                      <Separator />
                      <div className="space-y-3">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Textos do Anúncio</p>
                        {config.primaryText && (
                          <div className="p-3 rounded-lg bg-secondary/50">
                            <p className="text-xs text-muted-foreground mb-1">Texto Principal</p>
                            <p className="text-sm text-foreground whitespace-pre-wrap">{config.primaryText}</p>
                          </div>
                        )}
                        {config.headline && (
                          <div className="p-3 rounded-lg bg-secondary/50">
                            <p className="text-xs text-muted-foreground mb-1">Título</p>
                            <p className="text-sm font-medium text-foreground">{config.headline}</p>
                          </div>
                        )}
                        {config.description && (
                          <div className="p-3 rounded-lg bg-secondary/50">
                            <p className="text-xs text-muted-foreground mb-1">Descrição</p>
                            <p className="text-sm text-foreground">{config.description}</p>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* CTA */}
                  {(config.ctaType || config.callToAction) && (
                    <div className="p-3 rounded-lg bg-secondary/50">
                      <p className="text-xs text-muted-foreground mb-1">Call to Action</p>
                      <p className="font-medium text-foreground text-sm">{config.ctaType || config.callToAction}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Structure Tab */}
          <TabsContent value="structure" className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="glass-card overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-primary to-primary/50" />
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Megaphone className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">{campaign.total_campaigns}</p>
                      <p className="text-xs text-muted-foreground">Campanhas</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="glass-card overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-ads-info to-ads-info/50" />
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-ads-info/10 flex items-center justify-center">
                      <Layers className="w-5 h-5 text-ads-info" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">{campaign.total_adsets}</p>
                      <p className="text-xs text-muted-foreground">Conjuntos</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="glass-card overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-ads-warning to-ads-warning/50" />
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-ads-warning/10 flex items-center justify-center">
                      <Image className="w-5 h-5 text-ads-warning" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">{campaign.total_ads}</p>
                      <p className="text-xs text-muted-foreground">Anúncios</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="glass-card overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-ads-success to-ads-success/50" />
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-ads-success/10 flex items-center justify-center">
                      <Users className="w-5 h-5 text-ads-success" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">{campaign.accounts_count}</p>
                      <p className="text-xs text-muted-foreground">Contas</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Distribution Model */}
            <Card className="glass-card">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Modelo de Distribuição:</span>
                      <Badge variant="outline" className="text-lg font-mono font-bold px-3 py-1 border-primary/30 bg-primary/5">
                        {campaign.total_campaigns}-{campaign.total_adsets}-{campaign.total_ads}
                      </Badge>
                    </div>
                    <Separator orientation="vertical" className="h-6 hidden sm:block" />
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Tipo:</span>
                      <Badge variant="secondary">
                        {config.useCBO ? 'CBO' : 'ABO'} • {config.useCatalog ? 'Catálogo' : 'Padrão'}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="px-2 py-1 rounded bg-ads-success/10 text-ads-success font-medium">{itemStats.completed} ok</span>
                    {itemStats.failed > 0 && <span className="px-2 py-1 rounded bg-destructive/10 text-destructive font-medium">{itemStats.failed} erro</span>}
                    {itemStats.pending > 0 && <span className="px-2 py-1 rounded bg-muted text-muted-foreground font-medium">{itemStats.pending} pendente</span>}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Structure Tree */}
            <Card className="glass-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Layers className="w-5 h-5 text-primary" />
                  Árvore de Itens
                </CardTitle>
                <CardDescription>Hierarquia completa: Campanha → Conjuntos → Anúncios</CardDescription>
              </CardHeader>
              <CardContent>
                {items.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">Nenhum item encontrado</div>
                ) : (
                  <div className="space-y-4">
                    {campaigns.map((campaignItem) => {
                      const campaignAdsets = adsets.filter(a => a.parent_id === campaignItem.id);
                      const ItemStatusIcon = statusConfig[campaignItem.status]?.icon || Clock;

                      return (
                        <div key={campaignItem.id} className="border border-border rounded-lg overflow-hidden">
                          <div className="p-4 bg-primary/5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                <Megaphone className="w-4 h-4 text-primary" />
                              </div>
                              <div>
                                <h4 className="font-medium text-foreground">{campaignItem.name}</h4>
                                <p className="text-xs text-muted-foreground">Campanha</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {campaignItem.facebook_id && (
                                <Badge variant="outline" className="text-xs font-mono">{campaignItem.facebook_id}</Badge>
                              )}
                              <Badge className={campaignItem.status === 'completed' ? 'badge-active' : campaignItem.status === 'failed' ? 'badge-danger' : 'bg-muted text-muted-foreground'}>
                                <ItemStatusIcon className={`w-3 h-3 mr-1 ${campaignItem.status === 'processing' ? 'animate-spin' : ''}`} />
                                {statusConfig[campaignItem.status]?.label}
                              </Badge>
                            </div>
                          </div>

                          {campaignAdsets.map((adset) => {
                            const adsetAds = ads.filter(a => a.parent_id === adset.id);
                            const AdsetStatusIcon = statusConfig[adset.status]?.icon || Clock;

                            return (
                              <div key={adset.id}>
                                <div className="p-4 pl-12 border-t border-border/50 bg-secondary/30 flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                    <div className="w-7 h-7 rounded-lg bg-ads-info/10 flex items-center justify-center">
                                      <Layers className="w-3.5 h-3.5 text-ads-info" />
                                    </div>
                                    <div>
                                      <h5 className="font-medium text-foreground text-sm">{adset.name}</h5>
                                      <p className="text-xs text-muted-foreground">Conjunto de Anúncios</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {adset.facebook_id && <Badge variant="outline" className="text-xs font-mono">{adset.facebook_id}</Badge>}
                                    <Badge variant="secondary" className={`text-xs ${statusConfig[adset.status]?.color}`}>
                                      <AdsetStatusIcon className={`w-2.5 h-2.5 mr-1 ${adset.status === 'processing' ? 'animate-spin' : ''}`} />
                                      {statusConfig[adset.status]?.label}
                                    </Badge>
                                  </div>
                                </div>

                                {adsetAds.map((ad) => {
                                  const AdStatusIcon = statusConfig[ad.status]?.icon || Clock;
                                  return (
                                    <div key={ad.id} className="p-4 pl-20 border-t border-border/30 flex items-center justify-between">
                                      <div className="flex items-center gap-3">
                                        <ChevronRight className="w-3 h-3 text-muted-foreground/50" />
                                        <div className="w-6 h-6 rounded bg-ads-warning/10 flex items-center justify-center">
                                          <Image className="w-3 h-3 text-ads-warning" />
                                        </div>
                                        <div>
                                          <h6 className="font-medium text-foreground text-sm">{ad.name}</h6>
                                          <p className="text-xs text-muted-foreground">Anúncio</p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        {ad.facebook_id && <Badge variant="outline" className="text-xs font-mono">{ad.facebook_id}</Badge>}
                                        <Badge variant="secondary" className={`text-xs ${statusConfig[ad.status]?.color}`}>
                                          <AdStatusIcon className={`w-2.5 h-2.5 mr-1 ${ad.status === 'processing' ? 'animate-spin' : ''}`} />
                                          {statusConfig[ad.status]?.label}
                                        </Badge>
                                      </div>
                                    </div>
                                  );
                                })}

                                {adset.error_message && (
                                  <div className="px-4 pb-3 pl-20">
                                    <p className="text-xs text-destructive bg-destructive/10 p-2 rounded">{adset.error_message}</p>
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {campaignItem.error_message && (
                            <div className="px-4 pb-3">
                              <p className="text-sm text-destructive bg-destructive/10 p-2 rounded">{campaignItem.error_message}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Config Tab */}
          <TabsContent value="config" className="space-y-6">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Settings2 className="w-5 h-5 text-primary" />
                  Configuração Completa
                </CardTitle>
                <CardDescription>Dados técnicos e payload da campanha</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px] w-full rounded-lg border border-border">
                  <pre className="p-4 text-xs text-foreground font-mono whitespace-pre-wrap">
                    {JSON.stringify(config, null, 2)}
                  </pre>
                </ScrollArea>
                <div className="mt-4 flex justify-end">
                  <Button variant="outline" size="sm" onClick={() => copyToClipboard(JSON.stringify(config, null, 2), 'Configuração')}>
                    <Copy className="w-4 h-4 mr-2" />
                    Copiar JSON
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
