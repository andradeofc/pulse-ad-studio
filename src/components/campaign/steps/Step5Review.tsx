import { Check, Video, Image, ExternalLink, Facebook, Shield, Users, Globe, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useCampaignStore } from '@/stores/campaignStore';
import { getCountryByCode } from '../GeoLocationSelector';
import { getLocaleById } from '../LocaleSelector';

// CTA labels map - synced with Step4Ads
const ctaLabels: Record<string, string> = {
  LEARN_MORE: 'Saiba Mais',
  SHOP_NOW: 'Comprar Agora',
  SIGN_UP: 'Cadastre-se',
  DOWNLOAD: 'Baixar',
  SUBSCRIBE: 'Inscrever-se',
  WATCH_MORE: 'Assistir Mais',
  CONTACT_US: 'Fale Conosco',
  APPLY_NOW: 'Solicitar Agora',
  GET_OFFER: 'Obter Oferta',
  GET_QUOTE: 'Solicitar Orçamento',
  BUY_NOW: 'Comprar',
  ORDER_NOW: 'Pedir Agora',
  BOOK_TRAVEL: 'Reservar',
  SEE_MORE: 'Ver Mais',
  SEND_MESSAGE: 'Enviar Mensagem',
  WHATSAPP_MESSAGE: 'WhatsApp',
  CALL_NOW: 'Ligar Agora',
  GET_DIRECTIONS: 'Como Chegar',
};

export function Step5Review() {
  const { config, getTotalCampaigns, getTotalAdsets, getTotalAds, getTotalBudget } = useCampaignStore();
  
  const totalCampaigns = getTotalCampaigns();
  const totalAdsets = getTotalAdsets();
  const totalAds = getTotalAds();
  const totalBudget = getTotalBudget();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const objectiveLabels: Record<string, string> = {
    OUTCOME_SALES: 'Vendas',
    OUTCOME_LEADS: 'Leads',
    OUTCOME_TRAFFIC: 'Tráfego',
    OUTCOME_ENGAGEMENT: 'Engajamento',
    OUTCOME_AWARENESS: 'Reconhecimento',
    OUTCOME_APP_PROMOTION: 'Downloads de App',
  };

  const specialAdCategoryLabels: Record<string, string> = {
    NONE: 'Nenhuma',
    HOUSING: 'Habitação',
    EMPLOYMENT: 'Emprego',
    FINANCIAL_PRODUCTS_SERVICES: 'Serviços Financeiros',
    ISSUES_ELECTIONS_POLITICS: 'Política',
  };

  const bidStrategyLabels: Record<string, string> = {
    LOWEST_COST_WITHOUT_CAP: 'Maior Volume',
    COST_CAP: 'Meta de Custo',
    LOWEST_COST_WITH_BID_CAP: 'Limite de Lance',
    LOWEST_COST_WITH_MIN_ROAS: 'Meta de ROAS',
  };

  const distributionLabels: Record<string, string> = {
    campaign: 'Por Campanha',
    adset: 'Por Conjunto',
    ad: 'Por Anúncio',
  };

  // Helper to get gender display
  const getGenderDisplay = () => {
    if (config.genders.length === 0) return 'Todos';
    if (config.genders.includes(1) && config.genders.includes(2)) return 'Todos';
    if (config.genders.includes(1)) return 'Masculino';
    if (config.genders.includes(2)) return 'Feminino';
    return 'Todos';
  };

  // Get country names from codes
  const getCountryNames = () => {
    return config.geoLocations.countries
      .map(code => getCountryByCode(code)?.name || code)
      .join(', ');
  };

  // Get locale names from IDs
  const getLocaleNames = () => {
    return config.locales
      .map(id => getLocaleById(id)?.name || `ID: ${id}`)
      .join(', ');
  };

  // Build API-compatible ad creative object for preview
  const buildAdCreativePreview = () => {
    const creative: any = {
      object_story_spec: {
        page_id: config.selectedPages[0] || '<PAGE_ID>',
        link_data: {
          message: config.primaryText || undefined,
          name: config.headline || undefined,
          description: config.description || undefined,
          link: config.destinationUrl || '<URL>',
          call_to_action: {
            type: config.ctaType,
            value: {
              link: config.destinationUrl || '<URL>',
            },
          },
        },
      },
      url_tags: config.urlParams || undefined,
      contextual_multi_ads: {
        enroll_status: config.multiAdvertiser ? 'OPT_IN' : 'OPT_OUT',
      },
    };

    return creative;
  };

  // Build API-compatible promoted object for campaign/adset
  const buildPromotedObject = () => {
    const promotedObject: any = {};

    if (config.useCatalog && config.catalogId) {
      promotedObject.product_catalog_id = config.catalogId;
    }

    if (config.useCatalog && config.productSetId) {
      promotedObject.product_set_id = config.productSetId;
    }

    if (config.pixelId) {
      promotedObject.pixel_id = config.pixelId;
    }

    return Object.keys(promotedObject).length > 0 ? promotedObject : undefined;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-2">Confirme e Publique</h2>
        <p className="text-muted-foreground">
          Revise todas as configurações antes de criar suas campanhas
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Configuration */}
        <div className="space-y-6">
          {/* Campaign Config */}
          <Card className="glass-card">
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="w-5 h-5 text-primary" />
                Configuração da Campanha
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Nome</span>
                <span className="text-sm text-foreground font-mono text-right max-w-[200px] truncate" title={config.campaignName}>
                  {config.campaignName}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Objetivo</span>
                <Badge variant="secondary">{objectiveLabels[config.objective]}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Categoria Especial</span>
                <Badge variant="outline" className={config.specialAdCategory !== 'NONE' ? 'border-ads-warning text-ads-warning' : ''}>
                  {specialAdCategoryLabels[config.specialAdCategory]}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Tipo de Orçamento</span>
                <Badge className="bg-primary/20 text-primary border-primary/30">
                  {config.useCBO ? 'CBO' : 'ABO'}
                </Badge>
              </div>
              {config.useCatalog && (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Catálogo</span>
                    <Badge variant="secondary" className="bg-pink-500/20 text-pink-400 border-pink-500/30">
                      Dynamic Ads
                    </Badge>
                  </div>
                  {config.catalogId && (
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Catalog ID</span>
                      <span className="text-xs text-foreground font-mono">{config.catalogId}</span>
                    </div>
                  )}
                </>
              )}
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Contas Selecionadas</span>
                <Badge variant="outline">{config.selectedAccounts.length || 0}</Badge>
              </div>
              {config.isPaused && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Status Inicial</span>
                  <Badge variant="outline" className="text-ads-warning border-ads-warning">
                    Pausada
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Ad Set Config */}
          <Card className="glass-card">
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Configuração do Conjunto
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Nome</span>
                <span className="text-sm text-foreground font-mono text-right max-w-[200px] truncate" title={config.adsetName}>
                  {config.adsetName}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Distribuição</span>
                <Badge variant="outline">{distributionLabels[config.distribution]}</Badge>
              </div>

              {config.pixelId ? (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Pixel</span>
                  <span className="text-sm text-foreground font-mono">{config.pixelId}</span>
                </div>
              ) : config.objective === 'OUTCOME_SALES' ? (
                <div className="flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
                  <span className="text-sm font-medium text-destructive">Pixel obrigatório</span>
                  <span className="text-xs text-muted-foreground">Volte ao Step 3 e selecione um Pixel</span>
                </div>
              ) : null}

              {config.advantagePlus && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Advantage+</span>
                  <Badge className="bg-ads-info/20 text-ads-info border-ads-info/30">Ativado</Badge>
                </div>
              )}
              {config.useCatalog && config.productSetId && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Product Set</span>
                  <span className="text-xs text-foreground font-mono">{config.productSetId}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Budget and Bid */}
          <Card className="glass-card border-primary/30">
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Check className="w-5 h-5 text-primary" />
                Orçamento e Lance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">
                  Orçamento por {config.useCBO ? 'Campanha' : 'Conjunto'}
                </span>
                <span className="text-sm text-foreground font-semibold">
                  {formatCurrency(config.useCBO ? config.budget : config.adsetBudget)} / {config.budgetPeriod === 'daily' ? 'dia' : 'vitalício'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Estratégia de Lance</span>
                <span className="text-sm text-foreground">{bidStrategyLabels[config.bidStrategy]}</span>
              </div>
              {config.bidStrategy === 'COST_CAP' && config.costCap && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Custo Máximo</span>
                  <span className="text-sm text-foreground">{formatCurrency(config.costCap)}</span>
                </div>
              )}
              {config.bidStrategy === 'LOWEST_COST_WITH_BID_CAP' && config.bidCap && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Lance Máximo</span>
                  <span className="text-sm text-foreground">{formatCurrency(config.bidCap)}</span>
                </div>
              )}
              {config.bidStrategy === 'LOWEST_COST_WITH_MIN_ROAS' && config.roasGoal && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Meta de ROAS</span>
                  <span className="text-sm text-foreground">{config.roasGoal}x</span>
                </div>
              )}
              <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-destructive">
                    Total ({totalCampaigns} campanhas)
                  </span>
                  <span className="text-lg font-bold text-destructive">
                    {formatCurrency(totalBudget)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Audience */}
          <Card className="glass-card">
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="w-5 h-5 text-primary" />
                Público-Alvo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Localizações</span>
                <span className="text-sm text-foreground">{getCountryNames()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Idade</span>
                <span className="text-sm text-foreground">
                  {config.ageMin} - {config.ageMax}+
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Gênero</span>
                <span className="text-sm text-foreground">{getGenderDisplay()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Idiomas</span>
                <span className="text-sm text-foreground">{getLocaleNames()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Posicionamento</span>
                <Badge variant="outline">
                  {config.autoPlacement ? 'Automático' : 'Manual'}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Structure Summary */}
          <Card className="glass-card">
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Check className="w-5 h-5 text-primary" />
                Estrutura Final
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-4 bg-secondary/50 rounded-lg">
                  <p className="text-2xl font-bold text-foreground">{totalCampaigns}</p>
                  <p className="text-xs text-muted-foreground">Campanhas</p>
                </div>
                <div className="p-4 bg-secondary/50 rounded-lg">
                  <p className="text-2xl font-bold text-foreground">{totalAdsets}</p>
                  <p className="text-xs text-muted-foreground">Conjuntos</p>
                </div>
                <div className="p-4 bg-ads-success/10 rounded-lg border border-ads-success/20">
                  <p className="text-2xl font-bold text-ads-success">{totalAds}</p>
                  <p className="text-xs text-muted-foreground">Anúncios</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Ad Preview */}
        <div className="space-y-6">
          {/* Ad Config Summary */}
          <Card className="glass-card">
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Check className="w-5 h-5 text-primary" />
                Configuração do Anúncio
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Nome</span>
                <span className="text-sm text-foreground font-mono text-right max-w-[200px] truncate" title={config.adName}>
                  {config.adName}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Multi-Advertiser</span>
                <Badge 
                  variant="outline" 
                  className={`font-mono ${config.multiAdvertiser ? 'bg-ads-success/20 text-ads-success border-ads-success/30' : 'bg-destructive/20 text-destructive border-destructive/30'}`}
                >
                  {config.multiAdvertiser ? 'OPT_IN' : 'OPT_OUT'}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">CTA</span>
                <Badge variant="outline">{ctaLabels[config.ctaType] || config.ctaType}</Badge>
              </div>
              {config.destinationUrl && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">URL</span>
                  <a 
                    href={config.destinationUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline flex items-center gap-1 max-w-[180px] truncate"
                  >
                    {new URL(config.destinationUrl).hostname}
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  </a>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Páginas</span>
                <Badge variant="outline">{config.selectedPages.length || 0}</Badge>
              </div>
              {config.urlParams && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">URL Tags</span>
                  <span className="text-xs text-muted-foreground font-mono text-right max-w-[180px] truncate" title={config.urlParams}>
                    {config.urlParams.substring(0, 30)}...
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Facebook Ad Preview */}
          <Card className="glass-card">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Preview do Anúncio</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Facebook Ad Mockup */}
              <div className="bg-white rounded-lg overflow-hidden text-gray-900">
                {/* Header */}
                <div className="p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                    <Facebook className="w-5 h-5 text-gray-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">Nome da Página</p>
                    <p className="text-xs text-gray-500">Patrocinado · 🌐</p>
                  </div>
                </div>

                {/* Text - API: message */}
                <div className="px-3 pb-3">
                  <p className="text-sm">
                    {config.primaryText || 'Seu texto principal aparecerá aqui...'}
                  </p>
                </div>

                {/* Media */}
                <div className="aspect-video bg-gray-100 flex items-center justify-center relative">
                  {config.selectedCreatives.length > 0 ? (
                    config.selectedCreatives[0].thumbnailUrl ? (
                      <img 
                        src={config.selectedCreatives[0].thumbnailUrl} 
                        alt={config.selectedCreatives[0].name}
                        className="w-full h-full object-cover"
                      />
                    ) : config.selectedCreatives[0].type === 'video' ? (
                      <Video className="w-12 h-12 text-gray-400" />
                    ) : (
                      <Image className="w-12 h-12 text-gray-400" />
                    )
                  ) : (
                    <p className="text-gray-400 text-sm">Mídia do anúncio</p>
                  )}
                  
                  {config.selectedCreatives.length > 1 && (
                    <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                      1/{config.selectedCreatives.length}
                    </div>
                  )}
                </div>

                {/* Link Preview - API: name, description */}
                <div className="p-3 bg-gray-100 border-t border-gray-200">
                  <p className="text-xs text-gray-500 uppercase mb-1">
                    {config.destinationUrl ? new URL(config.destinationUrl).hostname : 'seusite.com'}
                  </p>
                  <p className="text-sm font-semibold text-gray-900 line-clamp-1">
                    {config.headline || 'Seu título aparecerá aqui'}
                  </p>
                  <p className="text-xs text-gray-500 line-clamp-1">
                    {config.description || 'Sua descrição aparecerá aqui'}
                  </p>
                </div>

                {/* CTA Button - API: call_to_action.type */}
                <div className="p-3 border-t border-gray-200">
                  <Button className="w-full bg-blue-500 hover:bg-blue-600 text-white rounded-md">
                    {ctaLabels[config.ctaType] || 'Saiba Mais'}
                  </Button>
                </div>
              </div>

              {/* Selected Creatives */}
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-sm font-medium text-foreground mb-3">
                  Criativos ({config.selectedCreatives.length})
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {config.selectedCreatives.slice(0, 4).map((creative) => (
                    <div
                      key={creative.id}
                      className="aspect-square rounded-lg bg-muted flex items-center justify-center overflow-hidden"
                    >
                      {creative.thumbnailUrl ? (
                        <img
                          src={creative.thumbnailUrl}
                          alt={creative.name}
                          className="w-full h-full object-cover"
                        />
                      ) : creative.type === 'video' ? (
                        <Video className="w-6 h-6 text-muted-foreground/50" />
                      ) : (
                        <Image className="w-6 h-6 text-muted-foreground/50" />
                      )}
                    </div>
                  ))}
                  {config.selectedCreatives.length > 4 && (
                    <div className="aspect-square rounded-lg bg-muted flex items-center justify-center">
                      <span className="text-sm text-muted-foreground">
                        +{config.selectedCreatives.length - 4}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Anti-Spy Status */}
          {config.antiSpyEnabled && (
            <Card className="glass-card border-primary/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-primary" />
                  <Badge className="bg-primary/20 text-primary border-primary/30">Anti-Spy Ativo</Badge>
                  <span className="text-sm text-muted-foreground">
                    {config.selectedPages.length} páginas selecionadas
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* API Ad Creative Preview */}
          <Card className="glass-card">
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Check className="w-5 h-5 text-primary" />
                Ad Creative Spec (API)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap bg-secondary/50 p-3 rounded-lg max-h-[300px] overflow-y-auto">
{JSON.stringify(buildAdCreativePreview(), null, 2)}
              </pre>
            </CardContent>
          </Card>

          {/* Promoted Object Preview - for Dynamic Ads */}
          {config.useCatalog && (
            <Card className="glass-card border-pink-500/30">
              <CardHeader className="pb-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <Check className="w-5 h-5 text-pink-400" />
                  Promoted Object (API)
                  <Badge variant="secondary" className="text-xs bg-pink-500/20 text-pink-400 border-pink-500/30">
                    DPA
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap bg-secondary/50 p-3 rounded-lg">
{JSON.stringify(buildPromotedObject(), null, 2)}
                </pre>
                <p className="text-xs text-muted-foreground mt-2">
                  Usado no <code className="px-1 py-0.5 bg-secondary rounded">campaign.promoted_object</code> e <code className="px-1 py-0.5 bg-secondary rounded">adset.promoted_object</code>
                </p>
              </CardContent>
            </Card>
          )}

          {/* API Targeting Preview */}
          <Card className="glass-card">
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Check className="w-5 h-5 text-primary" />
                Targeting Spec (API)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap bg-secondary/50 p-3 rounded-lg">
{JSON.stringify({
  geo_locations: config.geoLocations,
  age_min: config.ageMin,
  age_max: config.advantagePlus ? undefined : config.ageMax,
  genders: config.genders.length > 0 ? config.genders : undefined,
  locales: config.locales.length > 0 ? config.locales : undefined,
  targeting_optimization: config.advantagePlus ? 'expansion_all' : undefined,
  publisher_platforms: config.autoPlacement ? undefined : config.publisherPlatforms,
}, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
