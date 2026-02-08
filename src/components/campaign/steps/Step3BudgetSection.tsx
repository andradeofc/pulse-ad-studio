import { useState, useEffect, useMemo } from 'react';
import { AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCampaignStore } from '@/stores/campaignStore';
import { supabase } from '@/integrations/supabase/client';

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

export function Step3BudgetSection() {
  const { config, updateConfig } = useCampaignStore();
  const [selectedAccountsData, setSelectedAccountsData] = useState<AdAccountData[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch selected accounts data for currency info
  useEffect(() => {
    const fetchAccountsData = async () => {
      if (config.selectedAccounts.length === 0) {
        setSelectedAccountsData([]);
        return;
      }

      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('facebook_ad_accounts')
          .select('id, currency, name')
          .in('id', config.selectedAccounts);

        if (!error && data) {
          setSelectedAccountsData(data);
        }
      } finally {
        setIsLoading(false);
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

  // Only show this section for ABO
  if (config.useCBO) {
    return null;
  }

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
        Orçamento por Conjunto (ABO)
      </h3>

      {/* Mixed currencies - individual inputs per currency */}
      {hasMixedCurrencies ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-ads-warning/10 border border-ads-warning/30 rounded-lg">
            <AlertCircle className="w-5 h-5 text-ads-warning flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-ads-warning">
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
  );
}
