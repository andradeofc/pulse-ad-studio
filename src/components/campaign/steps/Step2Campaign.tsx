import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Layers, Grid3X3, Edit3, AlertCircle } from 'lucide-react';
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

const objectives = [
  { value: 'sales', label: 'Vendas' },
  { value: 'leads', label: 'Leads' },
  { value: 'traffic', label: 'Tráfego' },
  { value: 'engagement', label: 'Engajamento' },
  { value: 'awareness', label: 'Reconhecimento' },
  { value: 'app_installs', label: 'Downloads de App' },
];

const campaignTypes = [
  {
    value: 'cbo',
    title: 'Orçamento de Campanha (CBO)',
    description: 'O Facebook otimiza a distribuição do orçamento entre conjuntos',
    icon: Layers,
  },
  {
    value: 'abo',
    title: 'Orçamento de Conjunto (ABO)',
    description: 'Cada conjunto tem seu próprio orçamento definido',
    icon: Grid3X3,
  },
  {
    value: 'catalog',
    title: 'Catálogo (Dynamic Ads)',
    description: 'Anúncios dinâmicos com produtos do catálogo do Facebook (Ideal para maior aprovação)',
    icon: Sparkles,
    badge: 'Dynamic Product Ads',
  },
];

const bidStrategies = [
  { value: 'volume', label: 'Maior Volume', description: 'Máximo de resultados', available: true },
  { value: 'cost', label: 'Meta de Custo', description: 'Custo por resultado', available: false },
  { value: 'roas', label: 'Meta de ROAS', description: 'Retorno em anúncios', available: false },
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

  const handleApplyNaming = (template: string) => {
    updateConfig({ campaignName: template });
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
            onValueChange={(value) => updateConfig({ objective: value })}
          >
            <SelectTrigger className="bg-secondary/50">
              <SelectValue placeholder="Selecione o objetivo" />
            </SelectTrigger>
            <SelectContent>
              {objectives.map((obj) => (
                <SelectItem key={obj.value} value={obj.value}>
                  {obj.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      {/* Campaign Type Section */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Tipo de Campanha
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {campaignTypes.map((type) => (
            <motion.div key={type.value} whileHover={{ scale: 1.02 }}>
              <Card
                className={cn(
                  "cursor-pointer transition-all h-full",
                  config.campaignType === type.value
                    ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                    : "border-border hover:border-primary/50"
                )}
                onClick={() => updateConfig({ campaignType: type.value as 'cbo' | 'abo' | 'catalog' })}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center",
                      config.campaignType === type.value
                        ? "bg-primary/20"
                        : "bg-secondary"
                    )}>
                      <type.icon className={cn(
                        "w-5 h-5",
                        config.campaignType === type.value
                          ? "text-primary"
                          : "text-muted-foreground"
                      )} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-foreground text-sm">{type.title}</p>
                        {type.badge && (
                          <Badge variant="secondary" className="text-xs bg-pink-500/20 text-pink-400 border-pink-500/30">
                            {type.badge}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {type.description}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Budget Section */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Orçamento
        </h3>

        {/* Mixed currencies warning */}
        {hasMixedCurrencies && (
          <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-500">
                Contas com moedas diferentes selecionadas
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Você selecionou contas em {selectedCurrencies.join(', ')}. 
                O orçamento será aplicado na moeda de cada conta.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>
              Orçamento ({currencyInfo.symbol})
              {hasMixedCurrencies && (
                <Badge variant="outline" className="ml-2 text-xs">
                  {selectedCurrencies.join(' / ')}
                </Badge>
              )}
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
      </section>

      {/* Bid Strategy Section */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Estratégia de Lance
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {bidStrategies.map((strategy) => (
            <Card
              key={strategy.value}
              className={cn(
                "cursor-pointer transition-all",
                !strategy.available && "opacity-50 cursor-not-allowed",
                config.bidStrategy === strategy.value
                  ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                  : "border-border hover:border-primary/50"
              )}
              onClick={() => strategy.available && updateConfig({ bidStrategy: strategy.value as 'volume' | 'cost' | 'roas' })}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-medium text-foreground text-sm">{strategy.label}</p>
                  {!strategy.available && (
                    <Badge variant="secondary" className="text-xs">Em breve</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{strategy.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Naming Modal */}
      <NamingModal
        open={namingModalOpen}
        onOpenChange={setNamingModalOpen}
        context="campaign"
        value={config.campaignName}
        onApply={handleApplyNaming}
      />
    </div>
  );
}
