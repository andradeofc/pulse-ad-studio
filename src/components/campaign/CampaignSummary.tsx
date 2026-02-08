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
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { 
  formatCurrency as formatCurrencyUtil, 
  formatMultiCurrencyBudget,
  hasMultipleCurrencies,
  getPrimaryCurrency,
  getCurrencySymbol
} from '@/lib/currencyUtils';

export function CampaignSummary() {
  const { config, getTotalCampaigns, getTotalAdsets, getTotalAds, getTotalBudget } = useCampaignStore();
  
  const totalCampaigns = getTotalCampaigns();
  const totalAdsets = getTotalAdsets();
  const totalAds = getTotalAds();
  const totalBudget = getTotalBudget();

  // Fetch ad account data to get currencies
  const { data: adAccounts = [] } = useQuery({
    queryKey: ['ad-accounts-for-summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('facebook_ad_accounts')
        .select('id, account_id, name, currency');
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Get selected accounts data with currencies (using database id, not Facebook account_id)
  const selectedAccountsData = useMemo(() => {
    return config.selectedAccounts
      .map(dbId => adAccounts.find(a => a.id === dbId))
      .filter(Boolean) as typeof adAccounts;
  }, [config.selectedAccounts, adAccounts]);

  // Get unique currencies from selected accounts
  const selectedCurrencies = useMemo(() => {
    if (selectedAccountsData.length === 0) return ['BRL'];
    return [...new Set(selectedAccountsData.map(a => a.currency || 'BRL'))];
  }, [selectedAccountsData]);

  const isMultiCurrency = selectedCurrencies.length > 1;
  const primaryCurrency = selectedCurrencies[0] || 'BRL';

  // Calculate rate limit estimate
  const rateLimitEstimate = useMemo(() => {
    const accountsCount = config.selectedAccounts.length || 1;
    return estimateRateLimitUsage(
      totalCampaigns,
      config.adsetsPerCampaign,
      config.adsPerAdset,
      config.useCatalog,
      0,
      accountsCount
    );
  }, [totalCampaigns, config.adsetsPerCampaign, config.adsPerAdset, config.useCatalog, config.selectedAccounts.length]);

  const distributionLabel = {
    campaign: 'Por Campanha',
    adset: 'Por Conjunto',
    ad: 'Por Anúncio',
  };

  // Get budget config based on CBO/ABO mode
  const budgetConfig = config.useCBO ? config.budgetByCurrency : config.adsetBudgetByCurrency;
  const baseBudget = config.useCBO ? config.budget : config.adsetBudget;

  // Format currency with detected currency from accounts
  const formatCurrency = (value: number) => {
    return formatCurrencyUtil(value, primaryCurrency);
  };
  
  // Format budget showing all currencies if multi-currency
  const formatBudgetDisplay = () => {
    // Check if we have budgets configured per currency
    const hasBudgetConfig = Object.keys(budgetConfig).some(c => budgetConfig[c] > 0);
    
    if (hasBudgetConfig && isMultiCurrency) {
      return formatMultiCurrencyBudget(budgetConfig);
    }
    
    if (hasBudgetConfig) {
      const currency = Object.keys(budgetConfig).find(c => budgetConfig[c] > 0) || primaryCurrency;
      return formatCurrencyUtil(budgetConfig[currency] || baseBudget, currency);
    }
    
    // Fallback to base budget with detected currency
    return formatCurrencyUtil(baseBudget, primaryCurrency);
  };

  // Calculate and format total budget per currency
  const formatTotalBudgetDisplay = () => {
    const hasBudgetConfig = Object.keys(budgetConfig).some(c => budgetConfig[c] > 0);
    const multiplier = config.useCBO ? totalCampaigns : totalAdsets;
    
    if (hasBudgetConfig && isMultiCurrency) {
      // Show each currency total separately
      return null; // Will render separately
    }
    
    if (hasBudgetConfig) {
      const currency = Object.keys(budgetConfig).find(c => budgetConfig[c] > 0) || primaryCurrency;
      return formatCurrencyUtil((budgetConfig[currency] || baseBudget) * multiplier, currency);
    }
    
    return formatCurrencyUtil(baseBudget * multiplier, primaryCurrency);
  };

  // Get budget totals per currency for multi-currency display
  const budgetTotalsByCurrency = useMemo(() => {
    const hasBudgetConfig = Object.keys(budgetConfig).some(c => budgetConfig[c] > 0);
    const multiplier = config.useCBO ? totalCampaigns : totalAdsets;
    
    if (hasBudgetConfig) {
      return Object.entries(budgetConfig)
        .filter(([_, v]) => v > 0)
        .map(([currency, value]) => ({
          currency,
          total: value * multiplier,
          formatted: formatCurrencyUtil(value * multiplier, currency),
        }));
    }
    
    // Single currency based on selected accounts
    return selectedCurrencies.map(currency => ({
      currency,
      total: baseBudget * multiplier,
      formatted: formatCurrencyUtil(baseBudget * multiplier, currency),
    }));
  }, [budgetConfig, baseBudget, totalCampaigns, totalAdsets, config.useCBO, selectedCurrencies]);

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

        {/* Budget per Campaign/Adset */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Orçamento ({config.useCBO ? 'por campanha' : 'por conjunto'})
          </span>
          <span className="text-sm font-medium text-foreground">
            {formatBudgetDisplay()}
          </span>
        </div>

        {/* Currency indicator */}
        {selectedAccountsData.length > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Moeda(s)</span>
            <div className="flex gap-1">
              {selectedCurrencies.map(currency => (
                <Badge 
                  key={currency} 
                  variant="outline" 
                  className="text-xs font-mono"
                >
                  {getCurrencySymbol(currency)} {currency}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Total Budget */}
        <div className="flex flex-col gap-1 p-3 bg-destructive/10 rounded-lg border border-destructive/20">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-destructive">
              Total ({totalCampaigns} campanhas)
            </span>
            {budgetTotalsByCurrency.length === 1 ? (
              <span className="text-lg font-bold text-destructive">
                {budgetTotalsByCurrency[0].formatted}
              </span>
            ) : (
              <span className="text-lg font-bold text-destructive">
                Múltiplas
              </span>
            )}
          </div>
          {budgetTotalsByCurrency.length > 1 && (
            <div className="text-xs text-muted-foreground text-right space-y-0.5">
              {budgetTotalsByCurrency.map(({ currency, formatted }) => (
                <div key={currency} className="flex items-center justify-end gap-1">
                  <span className="text-muted-foreground/70">{currency}:</span>
                  <span className="font-medium">{formatted}</span>
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
