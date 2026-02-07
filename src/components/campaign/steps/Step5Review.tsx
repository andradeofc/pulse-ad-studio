import { motion } from 'framer-motion';
import { Check, Video, Image, ExternalLink, Facebook } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useCampaignStore } from '@/stores/campaignStore';

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

  const bidStrategyLabels: Record<string, string> = {
    LOWEST_COST_WITHOUT_CAP: 'Maior Volume',
    COST_CAP: 'Meta de Custo',
    LOWEST_COST_WITH_BID_CAP: 'Limite de Lance',
    LOWEST_COST_WITH_MIN_ROAS: 'Meta de ROAS',
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
                <Check className="w-5 h-5 text-primary" />
                Configuração da Campanha
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Nome</span>
                <span className="text-sm text-foreground font-mono">{config.campaignName}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Objetivo</span>
                <Badge variant="secondary">{objectiveLabels[config.objective]}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Tipo</span>
                <Badge className="bg-primary/20 text-primary border-primary/30">
                  {config.useCBO ? 'CBO (Orçamento de Campanha)' : 'ABO (Orçamento de Conjunto)'}
                </Badge>
              </div>
              {config.useCatalog && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Catálogo</span>
                  <Badge variant="secondary" className="bg-pink-500/20 text-pink-400 border-pink-500/30">
                    Dynamic Ads
                  </Badge>
                </div>
              )}
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
                <span className="text-sm text-muted-foreground">Orçamento por Campanha</span>
                <span className="text-sm text-foreground font-semibold">
                  {formatCurrency(config.budget)} / {config.budgetPeriod === 'daily' ? 'dia' : 'vitalício'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Estratégia de Lance</span>
                <span className="text-sm text-foreground">{bidStrategyLabels[config.bidStrategy]}</span>
              </div>
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
                <Check className="w-5 h-5 text-primary" />
                Público-Alvo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Localizações</span>
                <span className="text-sm text-foreground">{config.locations.join(', ')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Idade</span>
                <span className="text-sm text-foreground">
                  {config.ageMin} - {config.ageMax}+
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Gênero</span>
                <span className="text-sm text-foreground">
                  {config.gender === 'all' ? 'Todos' : config.gender === 'male' ? 'Masculino' : 'Feminino'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Idiomas</span>
                <span className="text-sm text-foreground">{config.languages.join(', ')}</span>
              </div>
              {config.advantagePlus && (
                <Badge className="badge-info w-fit">Advantage+ ativado</Badge>
              )}
            </CardContent>
          </Card>

          {/* Structure Summary */}
          <Card className="glass-card">
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Check className="w-5 h-5 text-primary" />
                Estrutura
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

                {/* Text */}
                <div className="px-3 pb-3">
                  <p className="text-sm">
                    {config.primaryText || 'Seu texto principal aparecerá aqui...'}
                  </p>
                </div>

                {/* Media */}
                <div className="aspect-video bg-gray-100 flex items-center justify-center relative">
                  {config.selectedCreatives.length > 0 ? (
                    config.selectedCreatives[0].type === 'video' ? (
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

                {/* Link Preview */}
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

                {/* CTA Button */}
                <div className="p-3 border-t border-gray-200">
                  <Button className="w-full bg-blue-500 hover:bg-blue-600 text-white rounded-md">
                    {config.ctaType === 'LEARN_MORE' && 'Saiba Mais'}
                    {config.ctaType === 'SHOP_NOW' && 'Comprar Agora'}
                    {config.ctaType === 'SIGN_UP' && 'Cadastre-se'}
                    {config.ctaType === 'DOWNLOAD' && 'Baixar'}
                    {config.ctaType === 'SUBSCRIBE' && 'Inscrever-se'}
                    {config.ctaType === 'WATCH_MORE' && 'Assistir Mais'}
                    {config.ctaType === 'CONTACT_US' && 'Fale Conosco'}
                    {config.ctaType === 'APPLY_NOW' && 'Solicitar Agora'}
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
                  <Badge className="badge-active">Anti-Spy Ativo</Badge>
                  <span className="text-sm text-muted-foreground">
                    Distribuição automática em múltiplas páginas
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
