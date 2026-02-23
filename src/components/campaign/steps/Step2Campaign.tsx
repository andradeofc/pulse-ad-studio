import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Layers, Grid3X3, Edit3, AlertCircle, Package } from 'lucide-react';
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
import { useCampaignStore } from '@/stores/campaignStore';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { NamingModal } from '../NamingModal';
import { AdAccountSelector } from '../AdAccountSelector';
import { CatalogSelector } from '../CatalogSelector';
import { BusinessManagerSelector } from '../BusinessManagerSelector';

const objectives = [
  { value: 'OUTCOME_SALES', label: 'Vendas', description: 'Conversões e compras no site' },
  { value: 'OUTCOME_LEADS', label: 'Leads', description: 'Formulários e cadastros' },
  { value: 'OUTCOME_TRAFFIC', label: 'Tráfego', description: 'Visitas ao site ou app' },
  { value: 'OUTCOME_ENGAGEMENT', label: 'Engajamento', description: 'Curtidas, comentários, compartilhamentos' },
  { value: 'OUTCOME_AWARENESS', label: 'Reconhecimento', description: 'Alcance e impressões' },
  { value: 'OUTCOME_APP_PROMOTION', label: 'Downloads de App', description: 'Instalações de aplicativo' },
];

const specialAdCategories = [
  { value: 'NONE', label: 'Nenhuma', description: 'Anúncios comuns sem restrições' },
  { value: 'HOUSING', label: 'Habitação', description: 'Imóveis, hipotecas, seguros residenciais' },
  { value: 'EMPLOYMENT', label: 'Emprego', description: 'Vagas de trabalho, recrutamento' },
  { value: 'FINANCIAL_PRODUCTS_SERVICES', label: 'Serviços Financeiros', description: 'Crédito, empréstimos, investimentos' },
  { value: 'ISSUES_ELECTIONS_POLITICS', label: 'Política', description: 'Eleições, causas sociais' },
];

// Budget optimization options (CBO vs ABO)
const budgetOptimizationOptions = [
  {
    value: true,
    title: 'Orçamento de Campanha (CBO)',
    description: 'O Facebook otimiza a distribuição do orçamento entre conjuntos automaticamente',
    icon: Layers,
    apiNote: 'is_campaign_budget_optimization: true',
  },
  {
    value: false,
    title: 'Orçamento de Conjunto (ABO)',
    description: 'Cada conjunto tem seu próprio orçamento definido manualmente',
    icon: Grid3X3,
    apiNote: 'is_campaign_budget_optimization: false',
  },
];

const bidStrategies = [
  { 
    value: 'LOWEST_COST_WITHOUT_CAP', 
    label: 'Maior Volume', 
    description: 'Máximo de resultados pelo menor custo possível',
    requiresInput: false 
  },
  { 
    value: 'COST_CAP', 
    label: 'Meta de Custo', 
    description: 'Define um custo máximo por resultado',
    requiresInput: true,
    inputType: 'costCap',
    inputLabel: 'Custo máximo por resultado'
  },
  { 
    value: 'LOWEST_COST_WITH_BID_CAP', 
    label: 'Limite de Lance', 
    description: 'Define um limite máximo para cada lance',
    requiresInput: true,
    inputType: 'bidCap',
    inputLabel: 'Lance máximo'
  },
  { 
    value: 'LOWEST_COST_WITH_MIN_ROAS', 
    label: 'Meta de ROAS', 
    description: 'Define um retorno mínimo sobre gastos',
    requiresInput: true,
    inputType: 'roasGoal',
    inputLabel: 'ROAS mínimo',
    inputSuffix: 'x'
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

export function Step2Campaign() {
  const { config, updateConfig } = useCampaignStore();
  const [namingModalOpen, setNamingModalOpen] = useState(false);
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

  // Get primary currency (first selected account's currency)
  const primaryCurrency = selectedCurrencies[0] || 'BRL';
  const currencyInfo = currencyConfig[primaryCurrency] || { symbol: primaryCurrency, minBudget: 1 };
  
  // Check if there are mixed currencies
  const hasMixedCurrencies = selectedCurrencies.length > 1;

  const handleApplyNaming = (template: string, customVariables?: Record<string, string>) => {
    updateConfig({ 
      campaignName: template,
      ...(customVariables ? { customNamingVariables: customVariables } : {})
    });
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-2">Configuração da Campanha</h2>
        <p className="text-muted-foreground">
          Defina o objetivo e as configurações principais
        </p>
      </div>

      {/* Identification Section */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Identificação
        </h3>

        {/* Multi-Account Mode */}
        <div className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg border border-border">
          <div>
            <Label className="text-foreground">Modo Multi-Contas</Label>
            <p className="text-sm text-muted-foreground">
              Criar campanhas replicadas em múltiplas contas
            </p>
          </div>
          <Switch
            checked={config.multiAccountMode}
            onCheckedChange={(checked) => updateConfig({ multiAccountMode: checked })}
          />
        </div>

        {/* Ad Account Selection */}
        <div className="space-y-2">
          <Label>
            {config.multiAccountMode ? 'Contas de Anúncio' : 'Conta de Anúncio'}
          </Label>
          <AdAccountSelector
            multiSelect={config.multiAccountMode}
            selectedAccounts={config.selectedAccounts}
            onSelectionChange={(accountIds) => updateConfig({ selectedAccounts: accountIds })}
          />
        </div>

        {/* Paused Toggle */}
        <div className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg border border-border">
          <div>
            <Label className="text-foreground">Criar Pausada</Label>
            <p className="text-sm text-muted-foreground">
              A campanha será criada em status pausado
            </p>
          </div>
          <Switch
            checked={config.isPaused}
            onCheckedChange={(checked) => updateConfig({ isPaused: checked })}
          />
        </div>
      </section>

      {/* Name and Objective Section */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Nome e Objetivo
        </h3>

        {/* Campaign Name */}
        <div className="space-y-2">
          <Label>Nome da Campanha</Label>
          <div className="flex gap-2">
            <div 
              className="flex-1 relative cursor-pointer group"
              onClick={() => setNamingModalOpen(true)}
            >
              <Input
                value={config.campaignName}
                readOnly
                placeholder="Clique para configurar nomenclatura..."
                className="bg-secondary/50 font-mono text-sm cursor-pointer pr-10 hover:border-primary/50 transition-colors"
              />
              <Edit3 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <Button variant="outline" onClick={() => setNamingModalOpen(true)}>
              <Sparkles className="w-4 h-4 mr-2" />
              Configurar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Clique no campo ou no botão para abrir o editor de nomenclatura com variáveis dinâmicas
          </p>
        </div>

        {/* Objective */}
        <div className="space-y-2">
          <Label>Objetivo</Label>
          <Select
            value={config.objective}
            onValueChange={(value) => updateConfig({ objective: value as 'OUTCOME_SALES' | 'OUTCOME_LEADS' | 'OUTCOME_TRAFFIC' | 'OUTCOME_ENGAGEMENT' | 'OUTCOME_AWARENESS' | 'OUTCOME_APP_PROMOTION' })}
          >
            <SelectTrigger className="bg-secondary/50">
              <SelectValue placeholder="Selecione o objetivo" />
            </SelectTrigger>
            <SelectContent>
              {objectives.map((obj) => (
                <SelectItem key={obj.value} value={obj.value}>
                  <div className="flex flex-col">
                    <span>{obj.label}</span>
                    <span className="text-xs text-muted-foreground">{obj.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Special Ad Category */}
        <div className="space-y-2">
          <Label>Categoria Especial de Anúncio</Label>
          <Select
            value={config.specialAdCategory}
            onValueChange={(value) => updateConfig({ specialAdCategory: value as 'NONE' | 'HOUSING' | 'EMPLOYMENT' | 'FINANCIAL_PRODUCTS_SERVICES' | 'ISSUES_ELECTIONS_POLITICS' })}
          >
            <SelectTrigger className="bg-secondary/50">
              <SelectValue placeholder="Selecione a categoria" />
            </SelectTrigger>
            <SelectContent>
              {specialAdCategories.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  <div className="flex flex-col">
                    <span>{cat.label}</span>
                    <span className="text-xs text-muted-foreground">{cat.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Obrigatório pela API do Facebook. Anúncios em categorias especiais têm restrições de segmentação.
          </p>
        </div>
      </section>

      {/* Budget Optimization Section (CBO vs ABO) */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Otimização de Orçamento
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {budgetOptimizationOptions.map((option) => (
            <motion.div key={String(option.value)} whileHover={{ scale: 1.02 }}>
              <Card
                className={cn(
                  "cursor-pointer transition-all h-full",
                  config.useCBO === option.value
                    ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                    : "border-border hover:border-primary/50"
                )}
                onClick={() => updateConfig({ useCBO: option.value })}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center",
                      config.useCBO === option.value
                        ? "bg-primary/20"
                        : "bg-secondary"
                    )}>
                      <option.icon className={cn(
                        "w-5 h-5",
                        config.useCBO === option.value
                          ? "text-primary"
                          : "text-muted-foreground"
                      )} />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-foreground text-sm">{option.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {option.description}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Ad Set Budget Sharing - Only for ABO with explicit bid strategy */}
        {!config.useCBO && config.bidStrategy !== 'LOWEST_COST_WITHOUT_CAP' && (
          <div className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg border border-border">
            <div>
              <Label className="text-foreground">Compartilhar 20% entre conjuntos</Label>
              <p className="text-sm text-muted-foreground">
                Permite que até 20% do orçamento de cada conjunto seja redistribuído para os melhores performers
              </p>
            </div>
            <Switch
              checked={config.shareAdsetBudget}
              onCheckedChange={(checked) => updateConfig({ shareAdsetBudget: checked })}
            />
          </div>
        )}

        {/* Dynamic Ads / Catalog Toggle */}
        <div className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg border border-border">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center",
              config.useCatalog ? "bg-primary/20" : "bg-secondary"
            )}>
              <Package className={cn(
                "w-5 h-5",
                config.useCatalog ? "text-primary" : "text-muted-foreground"
              )} />
            </div>
            <div>
              <Label className="text-foreground">Dynamic Ads (Catálogo)</Label>
              <p className="text-sm text-muted-foreground">
                Anúncios dinâmicos com produtos do catálogo
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs bg-pink-500/20 text-pink-400 border-pink-500/30">
              DPA
            </Badge>
            <Switch
              checked={config.useCatalog}
              onCheckedChange={(checked) => {
                updateConfig({ useCatalog: checked });
                // Clear catalog selection when disabling
                if (!checked) {
                  updateConfig({ catalogId: '', catalogDbId: '', productSetId: '' });
                }
              }}
            />
          </div>
        </div>

        {/* Business Manager & Catalog Selector - Shown when Dynamic Ads is enabled */}
        {config.useCatalog && (
          <div className="space-y-4 p-4 bg-secondary/30 rounded-lg border border-border">
            {/* Business Manager Selection */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label className="text-foreground">Business Manager</Label>
                <Badge variant="outline" className="text-xs font-mono">
                  Todos os BMs do perfil
                </Badge>
              </div>
              <BusinessManagerSelector
                value={config.selectedBusinessManagerId}
                onChange={(businessId, businessName) => {
                  updateConfig({ 
                    selectedBusinessManagerId: businessId, 
                    selectedBusinessManagerName: businessName,
                    catalogId: '', // Reset catalog when BM changes
                    catalogDbId: '',
                    productSetId: ''
                  });
                }}
              />
              <p className="text-xs text-muted-foreground">
                O BM é detectado automaticamente das contas selecionadas.
              </p>
            </div>

            {/* Catalog Selection - Only shown if BM is selected */}
            {config.selectedBusinessManagerId && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="text-foreground">Selecionar Catálogo</Label>
                  <Badge variant="outline" className="text-xs font-mono">
                    product_catalog_id
                  </Badge>
                </div>
                <CatalogSelector
                  value={config.catalogId}
                  onChange={(catalogId, catalogDbId, catalogName) => {
                    updateConfig({ catalogId, catalogDbId, catalogName, productSetId: '' });
                  }}
                  businessManagerId={config.selectedBusinessManagerId}
                  selectedAccounts={config.selectedAccounts}
                />
                <p className="text-xs text-muted-foreground">
                  Catálogos do BM "{config.selectedBusinessManagerName}". O conjunto de produtos será selecionado na próxima etapa.
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Budget Section */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Orçamento
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
                  Defina o orçamento para cada moeda separadamente.
                </p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {selectedCurrencies.map((currency) => {
                const currInfo = currencyConfig[currency] || { symbol: currency, minBudget: 1 };
                const accountsInCurrency = selectedAccountsData.filter(a => (a.currency || 'BRL') === currency);
                const budgetValue = config.budgetByCurrency[currency] ?? config.budget;
                
                return (
                  <div key={currency} className="space-y-2">
                    <Label className="flex items-center gap-2">
                      Orçamento ({currInfo.symbol})
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
                            budgetByCurrency: {
                              ...config.budgetByCurrency,
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
                value={config.budgetPeriod}
                onValueChange={(value) => updateConfig({ budgetPeriod: value as 'daily' | 'lifetime' })}
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
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  Orçamento ({currencyInfo.symbol})
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {currencyInfo.symbol}
                  </span>
                  <Input
                    type="number"
                    value={config.budget}
                    onChange={(e) => updateConfig({ budget: parseFloat(e.target.value) || 0 })}
                    min={currencyInfo.minBudget}
                    step={1}
                    className="bg-secondary/50 pl-10"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Período</Label>
                <Select
                  value={config.budgetPeriod}
                  onValueChange={(value) => updateConfig({ budgetPeriod: value as 'daily' | 'lifetime' })}
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
            <p className="text-xs text-muted-foreground">
              Mínimo: {currencyInfo.symbol} {currencyInfo.minBudget.toFixed(2)}
              {config.selectedAccounts.length === 0 && ' · Selecione uma conta para ver a moeda correta'}
            </p>
          </>
        )}
      </section>

      {/* Bid Strategy Section */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Estratégia de Lance
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {bidStrategies.map((strategy) => (
            <Card
              key={strategy.value}
              className={cn(
                "cursor-pointer transition-all",
                config.bidStrategy === strategy.value
                  ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                  : "border-border hover:border-primary/50"
              )}
              onClick={() => {
                const newStrategy = strategy.value as 'LOWEST_COST_WITHOUT_CAP' | 'COST_CAP' | 'LOWEST_COST_WITH_BID_CAP' | 'LOWEST_COST_WITH_MIN_ROAS';
                const updates: Partial<typeof config> = { bidStrategy: newStrategy };
                // Reset budget sharing if switching to a strategy that doesn't support it
                if (newStrategy === 'LOWEST_COST_WITHOUT_CAP') {
                  updates.shareAdsetBudget = false;
                }
                updateConfig(updates);
              }}
            >
              <CardContent className="p-4">
                <p className="font-medium text-foreground text-sm">{strategy.label}</p>
                <p className="text-xs text-muted-foreground mt-1">{strategy.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Additional inputs based on strategy */}
        {config.bidStrategy === 'COST_CAP' && (
          <div className="space-y-2 p-4 bg-secondary/50 rounded-lg border border-border">
            <Label>Custo máximo por resultado ({currencyInfo.symbol})</Label>
            <div className="relative max-w-xs">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {currencyInfo.symbol}
              </span>
              <Input
                type="number"
                value={config.costCap ?? ''}
                onChange={(e) => updateConfig({ costCap: parseFloat(e.target.value) || null })}
                min={0.01}
                step={0.01}
                placeholder="Ex: 15.00"
                className="bg-background pl-10"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              O Facebook tentará manter o custo médio por resultado abaixo deste valor.
            </p>
          </div>
        )}

        {config.bidStrategy === 'LOWEST_COST_WITH_BID_CAP' && (
          <div className="space-y-2 p-4 bg-secondary/50 rounded-lg border border-border">
            <Label>Lance máximo ({currencyInfo.symbol})</Label>
            <div className="relative max-w-xs">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {currencyInfo.symbol}
              </span>
              <Input
                type="number"
                value={config.bidCap ?? ''}
                onChange={(e) => updateConfig({ bidCap: parseFloat(e.target.value) || null })}
                min={0.01}
                step={0.01}
                placeholder="Ex: 10.00"
                className="bg-background pl-10"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              O Facebook nunca dará um lance acima deste valor nos leilões.
            </p>
          </div>
        )}

        {config.bidStrategy === 'LOWEST_COST_WITH_MIN_ROAS' && (
          <div className="space-y-2 p-4 bg-secondary/50 rounded-lg border border-border">
            <Label>ROAS mínimo desejado</Label>
            <div className="relative max-w-xs">
              <Input
                type="number"
                value={config.roasGoal ?? ''}
                onChange={(e) => updateConfig({ roasGoal: parseFloat(e.target.value) || null })}
                min={0.01}
                step={0.1}
                placeholder="Ex: 2.5"
                className="bg-background pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                x
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Ex: 2.5x significa que para cada {currencyInfo.symbol}1 gasto, você espera {currencyInfo.symbol}2.50 em retorno.
            </p>
          </div>
        )}
      </section>

      {/* Naming Modal */}
      <NamingModal
        open={namingModalOpen}
        onOpenChange={setNamingModalOpen}
        context="campaign"
        value={config.campaignName}
        onApply={handleApplyNaming}
        initialCustomVariables={config.customNamingVariables}
      />
    </div>
  );
}
