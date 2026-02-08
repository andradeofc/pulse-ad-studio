import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useCampaignStore } from '@/stores/campaignStore';
import { cn } from '@/lib/utils';

const distributionOptions = [
  {
    value: 'campaign',
    title: 'Campanha',
    description: 'Cada criativo gera sua própria campanha',
    hint: 'Criativos ÷ Campanhas',
  },
  {
    value: 'adset',
    title: 'Conjunto',
    description: 'Todos criativos em 1 campanha, divididos entre conjuntos',
    hint: 'Criativos ÷ Conjuntos',
  },
  {
    value: 'ad',
    title: 'Anúncio',
    description: 'Todos criativos como anúncios no mesmo conjunto',
    hint: 'Criativos = Anúncios por conjunto',
  },
];

export function Step3DistributionSection() {
  const { config, updateConfig, getTotalCampaigns, getTotalAdsets, getTotalAds } = useCampaignStore();
  const creativesCount = config.selectedCreatives.length || 1;

  const getEffectiveValue = (field: 'campaigns' | 'adsets' | 'ads') => {
    switch (field) {
      case 'campaigns':
        if (config.distribution === 'campaign') {
          return Math.max(creativesCount, config.campaignsPerCreative);
        }
        return config.campaignsPerCreative;
      case 'adsets':
        if (config.distribution === 'adset') {
          return Math.max(creativesCount, config.adsetsPerCampaign);
        }
        return config.adsetsPerCampaign;
      case 'ads':
        if (config.distribution === 'ad') {
          return Math.max(creativesCount, config.adsPerAdset);
        }
        return config.adsPerAdset;
      default:
        return 1;
    }
  };

  const isFieldAffected = (field: 'campaigns' | 'adsets' | 'ads') => {
    if (field === 'campaigns' && config.distribution === 'campaign') return true;
    if (field === 'adsets' && config.distribution === 'adset') return true;
    if (field === 'ads' && config.distribution === 'ad') return true;
    return false;
  };

  return (
    <>
      {/* Distribution Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Distribuição dos Criativos
          </h3>
          <Badge variant="secondary">{creativesCount} criativos</Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {distributionOptions.map((option) => (
            <motion.div key={option.value} whileHover={{ scale: 1.02 }}>
              <Card
                className={cn(
                  "cursor-pointer transition-all h-full",
                  config.distribution === option.value
                    ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                    : "border-border hover:border-primary/50"
                )}
                onClick={() => updateConfig({ distribution: option.value as 'campaign' | 'adset' | 'ad' })}
              >
                <CardContent className="p-4">
                  <p className="font-medium text-foreground text-sm mb-1">{option.title}</p>
                  <p className="text-xs text-muted-foreground">{option.description}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Quantities Section */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Quantidades
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Campaigns */}
          <div className={cn(
            "space-y-2 p-3 rounded-lg border",
            isFieldAffected('campaigns') 
              ? "bg-primary/5 border-primary/30" 
              : "bg-secondary/30 border-border"
          )}>
            <Label className="flex items-center gap-2">
              Campanhas
              {isFieldAffected('campaigns') && (
                <Badge variant="secondary" className="text-xs">
                  Mín: {creativesCount}
                </Badge>
              )}
            </Label>
            <Input
              type="number"
              value={config.campaignsPerCreative}
              onChange={(e) => updateConfig({ campaignsPerCreative: parseInt(e.target.value) || 1 })}
              min={isFieldAffected('campaigns') ? creativesCount : 1}
              className="bg-background"
            />
            {isFieldAffected('campaigns') && config.campaignsPerCreative < creativesCount && (
              <p className="text-xs text-primary">
                Ajustado para {getEffectiveValue('campaigns')} (1 por criativo)
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Total: {getTotalCampaigns()} campanhas
            </p>
          </div>

          {/* Ad Sets */}
          <div className={cn(
            "space-y-2 p-3 rounded-lg border",
            isFieldAffected('adsets') 
              ? "bg-primary/5 border-primary/30" 
              : "bg-secondary/30 border-border"
          )}>
            <Label className="flex items-center gap-2">
              Conjuntos/Campanha
              {isFieldAffected('adsets') && (
                <Badge variant="secondary" className="text-xs">
                  Mín: {creativesCount}
                </Badge>
              )}
            </Label>
            <Input
              type="number"
              value={config.adsetsPerCampaign}
              onChange={(e) => updateConfig({ adsetsPerCampaign: parseInt(e.target.value) || 1 })}
              min={isFieldAffected('adsets') ? creativesCount : 1}
              className="bg-background"
            />
            {isFieldAffected('adsets') && config.adsetsPerCampaign < creativesCount && (
              <p className="text-xs text-primary">
                Ajustado para {getEffectiveValue('adsets')} (1 por criativo)
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Total: {getTotalAdsets()} conjuntos
            </p>
          </div>

          {/* Ads */}
          <div className={cn(
            "space-y-2 p-3 rounded-lg border",
            isFieldAffected('ads') 
              ? "bg-primary/5 border-primary/30" 
              : "bg-secondary/30 border-border"
          )}>
            <Label className="flex items-center gap-2">
              Anúncios/Conjunto
              {isFieldAffected('ads') && (
                <Badge variant="secondary" className="text-xs">
                  Mín: {creativesCount}
                </Badge>
              )}
            </Label>
            <Input
              type="number"
              value={config.adsPerAdset}
              onChange={(e) => updateConfig({ adsPerAdset: parseInt(e.target.value) || 1 })}
              min={isFieldAffected('ads') ? creativesCount : 1}
              className="bg-background"
            />
            {isFieldAffected('ads') && config.adsPerAdset < creativesCount && (
              <p className="text-xs text-primary">
                Ajustado para {getEffectiveValue('ads')} (1 por criativo)
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Total: {getTotalAds()} anúncios
            </p>
          </div>
        </div>

        {/* Summary */}
        <div className="p-4 bg-secondary/30 rounded-lg border border-border space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Estrutura Final</span>
            <Badge variant="outline" className="font-mono">
              {getTotalCampaigns()}-{getTotalAdsets() / getTotalCampaigns()}-{getTotalAds() / getTotalAdsets()}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {getTotalCampaigns()} campanhas × {Math.round(getTotalAdsets() / getTotalCampaigns())} conjuntos × {Math.round(getTotalAds() / getTotalAdsets())} anúncios = <strong>{getTotalAds()} anúncios</strong>
            {getTotalAds() > 250 && (
              <span className="text-destructive ml-2">⚠️ Limite excedido (máx: 250)</span>
            )}
          </p>
        </div>
      </section>
    </>
  );
}
