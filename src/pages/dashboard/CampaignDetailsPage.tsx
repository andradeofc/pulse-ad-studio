import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
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
  Loader2,
  MapPin,
  Globe,
  DollarSign,
  Users,
  Layers,
  Image,
  ExternalLink,
  Copy,
  RefreshCw,
  ChevronRight,
  Smartphone,
  Monitor,
  Hash,
  Settings2,
  Zap,
  TrendingUp,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';

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

export default function CampaignDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: campaign, isLoading: loadingCampaign } = useQuery({
    queryKey: ['campaign-details', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_jobs')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as CampaignJob;
    },
    enabled: !!id,
  });

  const { data: items = [], isLoading: loadingItems } = useQuery({
    queryKey: ['campaign-items', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_job_items')
        .select('*')
        .eq('job_id', id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as CampaignJobItem[];
    },
    enabled: !!id,
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copiado!',
      description: `${label} copiado para a área de transferência.`,
    });
  };

  if (loadingCampaign) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <AlertCircle className="w-16 h-16 text-muted-foreground/30 mb-4" />
        <h2 className="text-xl font-semibold text-foreground mb-2">Campanha não encontrada</h2>
        <p className="text-muted-foreground mb-6">A campanha que você está procurando não existe ou foi removida.</p>
        <Button asChild>
          <Link to="/campanhas">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar para Campanhas
          </Link>
        </Button>
      </div>
    );
  }

  const config = campaign.config || {};
  const StatusIcon = statusConfig[campaign.status]?.icon || Clock;
  const objective = objectiveLabels[config.objective] || { label: config.objective, description: '' };

  // Group items by type
  const campaigns = items.filter(i => i.item_type === 'campaign');
  const adsets = items.filter(i => i.item_type === 'adset');
  const ads = items.filter(i => i.item_type === 'ad');

  // Calculate item stats
  const itemStats = {
    completed: items.filter(i => i.status === 'completed').length,
    failed: items.filter(i => i.status === 'failed').length,
    pending: items.filter(i => i.status === 'pending').length,
    processing: items.filter(i => i.status === 'processing').length,
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <Button variant="ghost" size="sm" className="w-fit -ml-2" asChild>
          <Link to="/campanhas">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar para Campanhas
          </Link>
        </Button>

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

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => copyToClipboard(campaign.id, 'ID')}>
              <Copy className="w-4 h-4 mr-2" />
              Copiar ID
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/fila-processamento">
                <RefreshCw className="w-4 h-4 mr-2" />
                Ver na Fila
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {campaign.error_message && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
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
        </motion.div>
      )}

      {/* Progress Section */}
      <Card className="glass-card">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">Progresso Geral</span>
                <span className="text-2xl font-bold text-primary">{campaign.progress}%</span>
              </div>
              <Progress 
                value={campaign.progress} 
                className="h-3" 
                indicatorClassName={campaign.status === 'failed' ? 'bg-destructive' : undefined}
              />
              <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                <span>{itemStats.completed} de {items.length} itens processados</span>
                {itemStats.failed > 0 && (
                  <span className="text-destructive">{itemStats.failed} com erro</span>
                )}
              </div>
            </div>

            <Separator orientation="vertical" className="hidden md:block h-16" />

            <div className="grid grid-cols-4 gap-6 text-center">
              <div>
                <p className="text-2xl font-bold text-foreground">{campaign.total_campaigns}</p>
                <p className="text-xs text-muted-foreground">Campanhas</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{campaign.total_adsets}</p>
                <p className="text-xs text-muted-foreground">Conjuntos</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{campaign.total_ads}</p>
                <p className="text-xs text-muted-foreground">Anúncios</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{campaign.accounts_count}</p>
                <p className="text-xs text-muted-foreground">Contas</p>
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
                    <p className="font-medium text-foreground">
                      {config.useCatalog ? 'Catálogo' : 'Padrão'}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/50">
                    <p className="text-xs text-muted-foreground mb-1">Orçamento</p>
                    <p className="font-medium text-foreground">
                      {config.useCBO ? 'CBO' : 'ABO'}
                    </p>
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
                      R$ {config.budget || 0}
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
                {/* Locations */}
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

                {/* Age & Gender */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Idade</p>
                    <p className="font-medium text-foreground">
                      {config.ageMin || 18} - {config.ageMax || 65}+ anos
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

                {/* Placements */}
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
                      <span className="text-sm text-foreground truncate flex-1">
                        {config.destinationUrl}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => window.open(config.destinationUrl, '_blank')}
                      >
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
                        <p className="font-medium text-foreground text-sm truncate">
                          {config.catalogName || 'Selecionado'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">Product Set</p>
                        <p className="font-medium text-foreground text-sm truncate">
                          {config.productSetName || 'Selecionado'}
                        </p>
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
                          <div
                            key={idx}
                            className="w-16 h-16 rounded-lg bg-secondary flex-shrink-0 overflow-hidden"
                          >
                            {creative.thumbnail_url || creative.url ? (
                              <img
                                src={creative.thumbnail_url || creative.url}
                                alt={creative.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Image className="w-6 h-6 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                        ))}
                        {config.selectedCreatives.length > 4 && (
                          <div className="w-16 h-16 rounded-lg bg-secondary flex-shrink-0 flex items-center justify-center">
                            <span className="text-sm font-medium text-muted-foreground">
                              +{config.selectedCreatives.length - 4}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Structure Tab */}
        <TabsContent value="structure" className="space-y-6">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Layers className="w-5 h-5 text-primary" />
                Estrutura da Campanha
              </CardTitle>
              <CardDescription>
                Visualize todos os itens criados nesta campanha
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingItems ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : items.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum item encontrado
                </div>
              ) : (
                <div className="space-y-4">
                  {campaigns.map((campaignItem) => {
                    const campaignAdsets = adsets.filter(a => a.parent_id === campaignItem.id);
                    const ItemStatusIcon = statusConfig[campaignItem.status]?.icon || Clock;

                    return (
                      <div key={campaignItem.id} className="border border-border rounded-lg overflow-hidden">
                        {/* Campaign Header */}
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
                              <Badge variant="outline" className="text-xs font-mono">
                                {campaignItem.facebook_id}
                              </Badge>
                            )}
                            <Badge className={campaignItem.status === 'completed' ? 'badge-active' : campaignItem.status === 'failed' ? 'badge-danger' : 'bg-muted text-muted-foreground'}>
                              <ItemStatusIcon className={`w-3 h-3 mr-1 ${campaignItem.status === 'processing' ? 'animate-spin' : ''}`} />
                              {statusConfig[campaignItem.status]?.label}
                            </Badge>
                          </div>
                        </div>

                        {/* Adsets */}
                        {campaignAdsets.map((adset) => {
                          const adsetAds = ads.filter(a => a.parent_id === adset.id);
                          const AdsetStatusIcon = statusConfig[adset.status]?.icon || Clock;

                          return (
                            <div key={adset.id}>
                              {/* Adset Row */}
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
                                  {adset.facebook_id && (
                                    <Badge variant="outline" className="text-xs font-mono">
                                      {adset.facebook_id}
                                    </Badge>
                                  )}
                                  <Badge variant="secondary" className={`text-xs ${statusConfig[adset.status]?.color}`}>
                                    <AdsetStatusIcon className={`w-2.5 h-2.5 mr-1 ${adset.status === 'processing' ? 'animate-spin' : ''}`} />
                                    {statusConfig[adset.status]?.label}
                                  </Badge>
                                </div>
                              </div>

                              {/* Ads */}
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
                                      {ad.facebook_id && (
                                        <Badge variant="outline" className="text-xs font-mono">
                                          {ad.facebook_id}
                                        </Badge>
                                      )}
                                      <Badge variant="secondary" className={`text-xs ${statusConfig[ad.status]?.color}`}>
                                        <AdStatusIcon className={`w-2.5 h-2.5 mr-1 ${ad.status === 'processing' ? 'animate-spin' : ''}`} />
                                        {statusConfig[ad.status]?.label}
                                      </Badge>
                                    </div>
                                  </div>
                                );
                              })}

                              {/* Error for adset */}
                              {adset.error_message && (
                                <div className="px-4 pb-3 pl-20">
                                  <p className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                                    {adset.error_message}
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {/* Error for campaign */}
                        {campaignItem.error_message && (
                          <div className="px-4 pb-3">
                            <p className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                              {campaignItem.error_message}
                            </p>
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
              <CardDescription>
                Dados técnicos e payload da campanha
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px] w-full rounded-lg border border-border">
                <pre className="p-4 text-xs text-foreground font-mono whitespace-pre-wrap">
                  {JSON.stringify(config, null, 2)}
                </pre>
              </ScrollArea>
              <div className="mt-4 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(JSON.stringify(config, null, 2), 'Configuração')}
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copiar JSON
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
