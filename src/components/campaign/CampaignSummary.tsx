import { motion } from 'framer-motion';
import { Image, Video, Edit2, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useCampaignStore, Creative } from '@/stores/campaignStore';
import { cn } from '@/lib/utils';
import { RateLimitIndicator } from './RateLimitIndicator';
import { estimateRateLimitUsage } from '@/lib/rateLimitCalculator';
import { useMemo } from 'react';
import { 
  formatCurrency as formatCurrencyUtil, 
  formatMultiCurrencyBudget,
  hasMultipleCurrencies,
  getPrimaryCurrency 
} from '@/lib/currencyUtils';

export function CampaignSummary() {
  const { config, getTotalCampaigns, getTotalAdsets, getTotalAds, getTotalBudget } = useCampaignStore();
  
  const totalCampaigns = getTotalCampaigns();
  const totalAdsets = getTotalAdsets();
  const totalAds = getTotalAds();
  const totalBudget = getTotalBudget();

  // Calculate rate limit estimate
  const rateLimitEstimate = useMemo(() => {
    const accountsCount = config.selectedAccounts.length || 1;
    return estimateRateLimitUsage(
      totalCampaigns,
      config.adsetsPerCampaign,
      config.adsPerAdset,
      config.useCatalog,
      0, // Current usage (we don't know until we call the API)
      accountsCount
    );
  }, [totalCampaigns, config.adsetsPerCampaign, config.adsPerAdset, config.useCatalog, config.selectedAccounts.length]);

  const distributionLabel = {
    campaign: 'Por Campanha',
    adset: 'Por Conjunto',
    ad: 'Por Anúncio',
  };

  // Determine the currency to use for formatting
  const budgetConfig = config.useCBO ? config.budgetByCurrency : config.adsetBudgetByCurrency;
  const isMultiCurrency = hasMultipleCurrencies(budgetConfig);
  const primaryCurrency = getPrimaryCurrency(budgetConfig, 'BRL');

  const formatCurrency = (value: number) => {
    return formatCurrencyUtil(value, primaryCurrency);
  };
  
  // Format budget showing all currencies if multi-currency
  const formatBudgetDisplay = () => {
    if (isMultiCurrency) {
      return formatMultiCurrencyBudget(budgetConfig);
    }
    const budgetValue = config.useCBO ? config.budget : config.adsetBudget;
    return formatCurrencyUtil(budgetValue, primaryCurrency);
  };

  return (
    <Card className="glass-card sticky top-6">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg text-foreground">Resumo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Creatives Count */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Criativos</span>
          <Badge variant="secondary">{config.selectedCreatives.length}</Badge>
        </div>

        {/* Distribution */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Distribuição</span>
          <span className="text-sm font-medium text-foreground">
            {distributionLabel[config.distribution]}
          </span>
        </div>

        {/* Campaigns per Creative */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Campanhas/Criativo</span>
          <span className="text-sm font-medium text-foreground">
            {config.campaignsPerCreative}
          </span>
        </div>

        {/* Total Campaigns */}
        <div className="flex items-center justify-between p-3 bg-ads-info/10 rounded-lg border border-ads-info/20">
          <span className="text-sm font-medium text-ads-info">Total Campanhas</span>
          <span className="text-lg font-bold text-ads-info">{totalCampaigns}</span>
        </div>

        {/* Adsets per Campaign */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Conjuntos (cada campanha)</span>
          <span className="text-sm font-medium text-foreground">
            {config.adsetsPerCampaign}
          </span>
        </div>

        {/* Ads per Adset */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Anúncios/Conjunto</span>
          <span className="text-sm font-medium text-foreground">
            {config.adsPerAdset}
          </span>
        </div>

        {/* Ads per Campaign */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Anúncios (por campanha)</span>
          <span className="text-sm font-medium text-foreground">
            {config.adsetsPerCampaign * config.adsPerAdset}
          </span>
        </div>

        {/* Total Ads */}
        <div className="flex items-center justify-between p-3 bg-ads-success/10 rounded-lg border border-ads-success/20">
          <span className="text-sm font-medium text-ads-success">Total Global</span>
          <span className="text-lg font-bold text-ads-success">{totalAds} anúncios</span>
        </div>

        {/* Budget per Campaign */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Orçamento ({config.useCBO ? 'por campanha' : 'por conjunto'})
          </span>
          <span className="text-sm font-medium text-foreground">
            {formatBudgetDisplay()}
          </span>
        </div>

        {/* Total Budget */}
        <div className="flex flex-col gap-1 p-3 bg-destructive/10 rounded-lg border border-destructive/20">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-destructive">
              Total ({totalCampaigns} campanhas)
            </span>
            <span className="text-lg font-bold text-destructive">
              {isMultiCurrency ? 'Múltiplas' : formatCurrency(totalBudget)}
            </span>
          </div>
          {isMultiCurrency && (
            <div className="text-xs text-muted-foreground text-right space-y-0.5">
              {Object.entries(budgetConfig)
                .filter(([_, v]) => v > 0)
                .map(([currency, value]) => (
                  <div key={currency}>
                    {formatCurrencyUtil(value * totalCampaigns, currency)}
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Rate Limit Indicator */}
        <Separator className="my-2" />
        <RateLimitIndicator estimate={rateLimitEstimate} showDetails={true} />

        {/* Selected Creatives */}
        {config.selectedCreatives.length > 0 && (
          <div className="pt-4 border-t border-border">
            <p className="text-sm font-medium text-foreground mb-3">Criativos Selecionados</p>
            <ScrollArea className="h-40">
              <div className="space-y-2">
                {config.selectedCreatives.map((creative) => (
                  <div
                    key={creative.id}
                    className="flex items-center gap-3 p-2 bg-secondary/50 rounded-lg"
                  >
                    <div className="w-12 h-12 rounded bg-muted flex items-center justify-center overflow-hidden">
                      {creative.thumbnailUrl ? (
                        <img
                          src={creative.thumbnailUrl}
                          alt={creative.name}
                          className="w-full h-full object-cover"
                        />
                      ) : creative.type === 'video' ? (
                        <Video className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <Image className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">
                        {creative.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {creative.type === 'video' ? '🎬 Vídeo' : '🖼️ Imagem'}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <Edit2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
