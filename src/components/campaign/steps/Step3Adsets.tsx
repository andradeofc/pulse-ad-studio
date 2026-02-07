import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, Users, Edit3, Sparkles, AlertCircle, Layers, CalendarIcon, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useCampaignStore } from '@/stores/campaignStore';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { NamingModal } from '../NamingModal';
import { PixelSelector } from '../PixelSelector';
import { GeoLocationSelector, getCountryByCode } from '../GeoLocationSelector';
import { LocaleSelector, getLocaleById } from '../LocaleSelector';
import { ProductSetSelector } from '../ProductSetSelector';

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

// Currency symbols and minimum budgets
const currencyConfig: Record<string, { symbol: string; minBudget: number }> = {
  BRL: { symbol: 'R$', minBudget: 6 },
  USD: { symbol: '$', minBudget: 1 },
  EUR: { symbol: '€', minBudget: 1 },
  GBP: { symbol: '£', minBudget: 1 },
};

interface AdAccountData {
  id: string;
  currency: string | null;
  name: string;
}

export function Step3Adsets() {
  const { config, updateConfig, getTotalCampaigns, getTotalAdsets, getTotalAds } = useCampaignStore();
  const creativesCount = config.selectedCreatives.length || 1;
  const [selectedAccountsData, setSelectedAccountsData] = useState<AdAccountData[]>([]);

  // Fetch selected accounts data for currency info
  useEffect(() => {
    const fetchAccountsData = async () => {
      if (config.selectedAccounts.length === 0) {
        setSelectedAccountsData([]);
        return;
      }

      const { data, error } = await supabase
        .from('facebook_ad_accounts')
        .select('id, currency, name')
        .in('id', config.selectedAccounts);

      if (!error && data) {
        setSelectedAccountsData(data);
      }
    };

    fetchAccountsData();
  }, [config.selectedAccounts]);

  // Get unique currencies from selected accounts
  const selectedCurrencies = useMemo(() => {
    const currencies = [...new Set(selectedAccountsData.map(a => a.currency || 'BRL'))];
    return currencies;
  }, [selectedAccountsData]);

  // Get primary currency
  const primaryCurrency = selectedCurrencies[0] || 'BRL';
  const currencyInfo = currencyConfig[primaryCurrency] || { symbol: primaryCurrency, minBudget: 1 };

  // Check if there are mixed currencies
  const hasMixedCurrencies = selectedCurrencies.length > 1;

  // Get the effective values based on distribution and creative count
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

  const [adsetNamingModalOpen, setAdsetNamingModalOpen] = useState(false);

  const isFieldAffected = (field: 'campaigns' | 'adsets' | 'ads') => {
    if (field === 'campaigns' && config.distribution === 'campaign') return true;
    if (field === 'adsets' && config.distribution === 'adset') return true;
    if (field === 'ads' && config.distribution === 'ad') return true;
    return false;
  };

  // Helper to get gender display
  const getGenderDisplay = () => {
    if (config.genders.length === 0) return 'Todos';
    if (config.genders.includes(1) && config.genders.includes(2)) return 'Todos';
    if (config.genders.includes(1)) return 'Masculino';
    if (config.genders.includes(2)) return 'Feminino';
    return 'Todos';
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-2">Configuração da Estrutura</h2>
        <p className="text-muted-foreground">
          Defina quantas Campanhas, Conjuntos e Anúncios criar
        </p>
      </div>

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

      {/* Adset Budget (if ABO) */}
      {!config.useCBO && (
        <section className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Orçamento por Conjunto (ABO)
          </h3>

          {/* Mixed currencies - individual inputs per currency */}
          {hasMixedCurrencies ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-500">
                    Contas com moedas diferentes selecionadas
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Defina o orçamento por conjunto para cada moeda separadamente.
                  </p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedCurrencies.map((currency) => {
                  const currInfo = currencyConfig[currency] || { symbol: currency, minBudget: 1 };
                  const accountsInCurrency = selectedAccountsData.filter(a => (a.currency || 'BRL') === currency);
                  const budgetValue = config.adsetBudgetByCurrency[currency] ?? config.adsetBudget;
                  
                  return (
                    <div key={currency} className="space-y-2">
                      <Label className="flex items-center gap-2">
                        Orçamento/Conjunto ({currInfo.symbol})
                        <Badge variant="outline" className="text-xs">
                          {accountsInCurrency.length} conta(s)
                        </Badge>
                      </Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                          {currInfo.symbol}
                        </span>
                        <Input
                          type="number"
                          value={budgetValue}
                          onChange={(e) => {
                            const newValue = parseFloat(e.target.value) || 0;
                            updateConfig({ 
                              adsetBudgetByCurrency: {
                                ...config.adsetBudgetByCurrency,
                                [currency]: newValue
                              }
                            });
                          }}
                          min={currInfo.minBudget}
                          step={1}
                          className="bg-secondary/50 pl-10"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Mínimo: {currInfo.symbol} {currInfo.minBudget.toFixed(2)}
                      </p>
                    </div>
                  );
                })}
              </div>
              
              <div className="space-y-2">
                <Label>Período</Label>
                <Select
                  value={config.adsetBudgetPeriod}
                  onValueChange={(value) => updateConfig({ adsetBudgetPeriod: value as 'daily' | 'lifetime' })}
                >
                  <SelectTrigger className="bg-secondary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Diário</SelectItem>
                    <SelectItem value="lifetime">Vitalício</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Orçamento/Conjunto ({currencyInfo.symbol})</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {currencyInfo.symbol}
                  </span>
                  <Input
                    type="number"
                    value={config.adsetBudget}
                    onChange={(e) => updateConfig({ adsetBudget: parseFloat(e.target.value) || 0 })}
                    min={currencyInfo.minBudget}
                    className="bg-secondary/50 pl-10"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Mínimo: {currencyInfo.symbol} {currencyInfo.minBudget.toFixed(2)}
                  {config.selectedAccounts.length === 0 && ' · Selecione uma conta para ver a moeda correta'}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Período</Label>
                <Select
                  value={config.adsetBudgetPeriod}
                  onValueChange={(value) => updateConfig({ adsetBudgetPeriod: value as 'daily' | 'lifetime' })}
                >
                  <SelectTrigger className="bg-secondary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Diário</SelectItem>
                    <SelectItem value="lifetime">Vitalício</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg border border-border">
            <div>
              <Label className="text-foreground">Compartilhar 20% entre conjuntos</Label>
              <p className="text-sm text-muted-foreground">
                Distribui parte do orçamento entre os melhores performers
              </p>
            </div>
            <Switch
              checked={config.shareAdsetBudget}
              onCheckedChange={(checked) => updateConfig({ shareAdsetBudget: checked })}
            />
          </div>
        </section>
      )}

      {/* Adset Name */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Nome do Conjunto
        </h3>

        <div className="space-y-2">
          <div className="flex gap-2">
            <div 
              className="flex-1 relative cursor-pointer group"
              onClick={() => setAdsetNamingModalOpen(true)}
            >
              <Input
                value={config.adsetName}
                readOnly
                placeholder="Clique para configurar nomenclatura..."
                className="bg-secondary/50 font-mono text-sm cursor-pointer pr-10 hover:border-primary/50 transition-colors"
              />
              <Edit3 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <Button variant="outline" onClick={() => setAdsetNamingModalOpen(true)}>
              <Sparkles className="w-4 h-4 mr-2" />
              Configurar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Clique no campo ou no botão para abrir o editor de nomenclatura com variáveis dinâmicas
          </p>
        </div>
      </section>

      {/* Adset Naming Modal */}
      <NamingModal
        open={adsetNamingModalOpen}
        onOpenChange={setAdsetNamingModalOpen}
        context="adset"
        value={config.adsetName}
        onApply={(template) => updateConfig({ adsetName: template })}
      />

      {/* Pixel Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Pixel de Conversão
          </h3>
          <Badge variant="destructive" className="text-xs">Obrigatório</Badge>
        </div>

        <PixelSelector
          value={config.pixelId}
          onChange={(pixelId) => updateConfig({ pixelId })}
        />
        
        <p className="text-xs text-muted-foreground">
          Busque pelo nome ou ID do pixel. Clique no botão de sincronizar para atualizar a lista do Facebook.
        </p>
      </section>

      {/* Product Set Section - Shown when Dynamic Ads is enabled */}
      {config.useCatalog && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Conjunto de Produtos
            </h3>
            <Badge variant="secondary" className="text-xs bg-pink-500/20 text-pink-400 border-pink-500/30">
              DPA
            </Badge>
            <Badge variant="outline" className="text-xs font-mono">
              product_set_id
            </Badge>
          </div>

          <div className="p-4 bg-pink-500/5 rounded-lg border border-pink-500/20 space-y-4">
            {config.catalogId ? (
              <>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Layers className="w-4 h-4" />
                  <span>Catálogo selecionado: <strong className="text-foreground">{config.catalogId}</strong></span>
                </div>
                <ProductSetSelector
                  catalogDbId={config.catalogDbId}
                  catalogId={config.catalogId}
                  value={config.productSetId}
                  onChange={(productSetId) => updateConfig({ productSetId })}
                />
              </>
            ) : (
              <div className="text-center py-4">
                <Layers className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Selecione um catálogo na etapa anterior (Campanha) para escolher o conjunto de produtos.
                </p>
              </div>
            )}
          </div>
          
          <p className="text-xs text-muted-foreground">
            O conjunto de produtos define quais itens do catálogo serão exibidos nos anúncios dinâmicos.
            Será enviado como <code className="px-1 py-0.5 bg-secondary rounded">promoted_object.product_set_id</code> na API.
          </p>
        </section>
      )}

      {/* Audience Section - API Compatible */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Público-Alvo
          </h3>
          <Badge variant="outline" className="text-xs">API Facebook</Badge>
        </div>

        {/* Advantage+ Toggle */}
        <div className="flex items-center justify-between p-4 bg-primary/5 rounded-lg border border-primary/20">
          <div>
            <Label className="text-foreground flex items-center gap-2">
              Advantage+
              <Badge variant="secondary" className="text-xs">Recomendado</Badge>
            </Label>
            <p className="text-sm text-muted-foreground">
              A I.A. do Meta otimizará seu público automaticamente
            </p>
          </div>
          <Switch
            checked={config.advantagePlus}
            onCheckedChange={(checked) => updateConfig({ advantagePlus: checked })}
          />
        </div>

        {/* Geo Locations - API compatible */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            Localizações
            <Badge variant="outline" className="text-xs font-mono">geo_locations.countries</Badge>
          </Label>
          <GeoLocationSelector
            value={config.geoLocations.countries}
            onChange={(countries) => updateConfig({ 
              geoLocations: { ...config.geoLocations, countries } 
            })}
          />
        </div>

        {/* Age Range */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Idade Mínima
              <Badge variant="outline" className="text-xs font-mono">age_min</Badge>
            </Label>
            <Select
              value={config.ageMin.toString()}
              onValueChange={(value) => updateConfig({ ageMin: parseInt(value) })}
            >
              <SelectTrigger className="bg-secondary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 48 }, (_, i) => i + 18).map((age) => (
                  <SelectItem key={age} value={age.toString()}>{age}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Idade Máxima
              <Badge variant="outline" className="text-xs font-mono">age_max</Badge>
            </Label>
            <Select
              value={config.ageMax.toString()}
              onValueChange={(value) => updateConfig({ ageMax: parseInt(value) })}
              disabled={config.advantagePlus}
            >
              <SelectTrigger className="bg-secondary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 48 }, (_, i) => i + 18).map((age) => (
                  <SelectItem key={age} value={age.toString()}>{age}{age === 65 ? '+' : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {config.advantagePlus && (
              <p className="text-xs text-muted-foreground">Apenas idade mínima com Advantage+</p>
            )}
          </div>
        </div>

        {/* Gender - API compatible */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Gênero
            <Badge variant="outline" className="text-xs font-mono">genders</Badge>
          </Label>
          <div className="flex gap-2">
            {([
              { value: [], label: 'Todos' },
              { value: [1], label: 'Masculino' },
              { value: [2], label: 'Feminino' },
            ]).map((option) => (
              <Button
                key={option.label}
                variant={JSON.stringify(config.genders) === JSON.stringify(option.value) ? 'default' : 'outline'}
                size="sm"
                onClick={() => updateConfig({ genders: option.value })}
                className={JSON.stringify(config.genders) === JSON.stringify(option.value) ? 'glow-primary' : ''}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            API: [] = Todos, [1] = Masculino, [2] = Feminino
          </p>
        </div>

        {/* Locales - API compatible */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            Idiomas
            <Badge variant="outline" className="text-xs font-mono">locales</Badge>
          </Label>
          <LocaleSelector
            value={config.locales}
            onChange={(locales) => updateConfig({ locales })}
          />
        </div>

        {/* Audience Summary */}
        <div className="p-3 bg-secondary/30 rounded-lg text-sm text-muted-foreground">
          📍 {config.geoLocations.countries.length} país(es) · 
          👤 {config.ageMin}-{config.ageMax}+ · 
          🔲 {getGenderDisplay()} · 
          🌐 {config.locales.length} idioma(s)
        </div>

        {/* API Preview */}
        <div className="p-4 bg-secondary/50 rounded-lg border border-border">
          <Label className="text-xs text-muted-foreground mb-2 block">Preview da Targeting Spec (API)</Label>
          <pre className="text-xs font-mono text-foreground overflow-x-auto whitespace-pre-wrap">
{JSON.stringify({
  geo_locations: config.geoLocations,
  age_min: config.ageMin,
  age_max: config.advantagePlus ? undefined : config.ageMax,
  genders: config.genders.length > 0 ? config.genders : undefined,
  locales: config.locales.length > 0 ? config.locales : undefined,
  targeting_optimization: config.advantagePlus ? 'expansion_all' : undefined,
}, null, 2)}
          </pre>
        </div>
      </section>

      {/* Placements Section */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Posicionamentos
        </h3>

        <div className="flex items-center justify-between p-4 bg-primary/5 rounded-lg border border-primary/20">
          <div>
            <Label className="text-foreground">Advantage+ Posicionamentos</Label>
            <p className="text-sm text-muted-foreground">
              A Meta mostrará seus anúncios nos locais com maior probabilidade de resultados
            </p>
          </div>
          <Switch
            checked={config.autoPlacement}
            onCheckedChange={(checked) => updateConfig({ autoPlacement: checked })}
          />
        </div>

        {!config.autoPlacement && (
          <div className="p-4 bg-secondary/50 rounded-lg border border-border space-y-3">
            <Label className="text-sm">Plataformas</Label>
            <div className="flex flex-wrap gap-2">
              {(['facebook', 'instagram', 'messenger', 'audience_network'] as const).map((platform) => (
                <Badge
                  key={platform}
                  variant={config.publisherPlatforms.includes(platform) ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => {
                    const isSelected = config.publisherPlatforms.includes(platform);
                    updateConfig({
                      publisherPlatforms: isSelected
                        ? config.publisherPlatforms.filter(p => p !== platform)
                        : [...config.publisherPlatforms, platform]
                    });
                  }}
                >
                  {platform === 'facebook' && '📘 Facebook'}
                  {platform === 'instagram' && '📷 Instagram'}
                  {platform === 'messenger' && '💬 Messenger'}
                  {platform === 'audience_network' && '🌐 Audience Network'}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Attribution Settings */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Configurações de Atribuição
        </h3>
        <p className="text-sm text-muted-foreground">
          Define a janela de tempo para atribuir conversões aos seus anúncios
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Click Attribution */}
          <div className="space-y-2">
            <Label>Cliques</Label>
            <Select
              value={String(config.attributionClickDays)}
              onValueChange={(value) => updateConfig({ attributionClickDays: parseInt(value) as 1 | 7 })}
            >
              <SelectTrigger className="bg-secondary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 dias</SelectItem>
                <SelectItem value="1">1 dia</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Conversões após clique no anúncio
            </p>
          </div>

          {/* Engaged Video View Attribution */}
          <div className="space-y-2">
            <Label>Visualização com engajamento</Label>
            <Select
              value={String(config.attributionEngagedViewDays)}
              onValueChange={(value) => updateConfig({ attributionEngagedViewDays: parseInt(value) as 0 | 1 })}
            >
              <SelectTrigger className="bg-secondary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 dia</SelectItem>
                <SelectItem value="0">Nenhum</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Conversões após assistir vídeo (15s+)
            </p>
          </div>

          {/* View Attribution */}
          <div className="space-y-2">
            <Label>Visualização</Label>
            <Select
              value={String(config.attributionViewDays)}
              onValueChange={(value) => updateConfig({ attributionViewDays: parseInt(value) as 0 | 1 })}
            >
              <SelectTrigger className="bg-secondary/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 dia</SelectItem>
                <SelectItem value="0">Nenhum</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Conversões após ver o anúncio
            </p>
          </div>
        </div>

        {/* Attribution Summary */}
        <div className="p-3 bg-secondary/30 rounded-lg border border-border">
          <p className="text-sm text-muted-foreground">
            <strong>Configuração atual:</strong>{' '}
            {config.attributionClickDays} dia(s) de clique
            {config.attributionViewDays > 0 && `, ${config.attributionViewDays} dia(s) de visualização`}
            {config.attributionEngagedViewDays > 0 && `, ${config.attributionEngagedViewDays} dia(s) de vídeo`}
          </p>
        </div>
      </section>

      {/* Schedule - Start Date/Time */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Agendamento
        </h3>
        <p className="text-sm text-muted-foreground">
          Data e hora de início dos conjuntos de anúncios
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Start Date */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <CalendarIcon className="w-4 h-4" />
              Data de Início
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal bg-secondary/50",
                    !config.scheduleStart && "text-muted-foreground"
                  )}
                >
                  {config.scheduleStart ? (
                    format(config.scheduleStart, "PPP", { locale: ptBR })
                  ) : (
                    <span>Iniciar imediatamente</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={config.scheduleStart || undefined}
                  onSelect={(date) => {
                    if (date) {
                      // Preserve time if already set, otherwise use current time
                      const currentTime = config.scheduleStart || new Date();
                      date.setHours(currentTime.getHours(), currentTime.getMinutes());
                    }
                    updateConfig({ scheduleStart: date || null });
                  }}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Start Time */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Horário de Início (EST)
            </Label>
            <div className="flex gap-2">
              <Select
                value={config.scheduleStart ? String(config.scheduleStart.getHours()).padStart(2, '0') : ''}
                onValueChange={(hour) => {
                  const date = config.scheduleStart || new Date();
                  date.setHours(parseInt(hour));
                  updateConfig({ scheduleStart: new Date(date) });
                }}
                disabled={!config.scheduleStart}
              >
                <SelectTrigger className="bg-secondary/50 w-24">
                  <SelectValue placeholder="Hora" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, i) => (
                    <SelectItem key={i} value={String(i).padStart(2, '0')}>
                      {String(i).padStart(2, '0')}h
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="flex items-center text-muted-foreground">:</span>
              <Select
                value={config.scheduleStart ? String(config.scheduleStart.getMinutes()).padStart(2, '0') : ''}
                onValueChange={(minute) => {
                  const date = config.scheduleStart || new Date();
                  date.setMinutes(parseInt(minute));
                  updateConfig({ scheduleStart: new Date(date) });
                }}
                disabled={!config.scheduleStart}
              >
                <SelectTrigger className="bg-secondary/50 w-24">
                  <SelectValue placeholder="Min" />
                </SelectTrigger>
                <SelectContent>
                  {[0, 15, 30, 45].map((min) => (
                    <SelectItem key={min} value={String(min).padStart(2, '0')}>
                      {String(min).padStart(2, '0')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Badge variant="outline" className="ml-2 text-xs">
                EST
              </Badge>
            </div>
            {!config.scheduleStart && (
              <p className="text-xs text-muted-foreground">
                Selecione uma data para definir o horário
              </p>
            )}
            {config.scheduleStart && (
              <p className="text-xs text-muted-foreground">
                Fuso horário: Eastern Standard Time (Nova York)
              </p>
            )}
          </div>
        </div>

        {/* Clear Schedule Button */}
        {config.scheduleStart && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => updateConfig({ scheduleStart: null })}
          >
            Limpar agendamento (iniciar imediatamente)
          </Button>
        )}
      </section>
    </div>
  );
}
