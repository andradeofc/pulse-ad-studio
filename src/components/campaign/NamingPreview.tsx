import { useMemo, useEffect, useState } from 'react';
import { Eye, ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useCampaignStore } from '@/stores/campaignStore';
import { resolveTemplate } from '@/lib/namingResolver';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface NamingPreviewProps {
  className?: string;
  compact?: boolean;
}

interface AccountPreviewData {
  name: string;
  nickname: string | null;
  account_id: string;
}

export function NamingPreview({ className, compact = false }: NamingPreviewProps) {
  const [isExpanded, setIsExpanded] = useState(!compact);
  const [selectedAccountsData, setSelectedAccountsData] = useState<AccountPreviewData[]>([]);
  const { config, getTotalCampaigns, getTotalAdsets, getTotalAds } = useCampaignStore();

  // Fetch selected accounts data for real nickname/name
  useEffect(() => {
    if (config.selectedAccounts.length === 0) {
      setSelectedAccountsData([]);
      return;
    }

    const fetchAccounts = async () => {
      const { data } = await supabase
        .from('facebook_ad_accounts')
        .select('name, nickname, account_id')
        .in('id', config.selectedAccounts);
      
      setSelectedAccountsData(data || []);
    };

    fetchAccounts();
  }, [config.selectedAccounts]);

  // Derive account name and nickname for preview
  const accountPreview = useMemo(() => {
    if (selectedAccountsData.length === 1) {
      const acc = selectedAccountsData[0];
      return {
        accountName: acc.name,
        // For conta_apelido: use real nickname, fallback to prefix before " - "
        accountNickname: acc.nickname || acc.name.split(' - ')[0]?.trim() || acc.name,
        accountId: acc.account_id,
      };
    }
    // Multiple or none: use placeholders
    return {
      accountName: selectedAccountsData.length > 1 ? '(múltiplas contas)' : 'Minha Conta Ads',
      accountNickname: selectedAccountsData.length > 1 ? '(apelido)' : 'PP',
      accountId: selectedAccountsData.length > 1 ? '(id)' : '544627',
    };
  }, [selectedAccountsData]);

  const previews = useMemo(() => {
    const totalCampaigns = getTotalCampaigns();
    const totalAdsets = getTotalAdsets();
    const totalAds = getTotalAds();

    const baseContext = {
      budget: config.useCBO ? 'CBO' as const : 'ABO' as const,
      structure: `${totalCampaigns}-${config.adsetsPerCampaign}-${config.adsPerAdset}`,
      productSetName: config.productSetName,
      catalogName: config.catalogName,
      pageNames: config.pageNames,
      pageName: config.pageNames?.[0] || 'Minha Página',
      accountName: accountPreview.accountName,
      accountId: accountPreview.accountId,
      customVariables: {
        ...config.customNamingVariables,
        conta_apelido: config.customNamingVariables?.conta_apelido || accountPreview.accountNickname,
      },
    };

    // Generate sample names for preview
    const campaignSamples = [];
    const adsetSamples = [];
    const adSamples = [];

    // Generate campaign previews (max 3)
    for (let i = 0; i < Math.min(totalCampaigns, 3); i++) {
      campaignSamples.push({
        index: i + 1,
        name: resolveTemplate(config.campaignName, {
          ...baseContext,
          campaignIndex: i,
        }),
      });
    }

    // Generate adset previews (max 3)
    for (let i = 0; i < Math.min(config.adsetsPerCampaign, 3); i++) {
      const creativeName = config.selectedCreatives[i % config.selectedCreatives.length]?.name || `Criativo${i + 1}`;
      adsetSamples.push({
        index: i + 1,
        name: resolveTemplate(config.adsetName, {
          ...baseContext,
          adsetIndex: i,
          creativeName,
        }),
      });
    }

    // Generate ad previews (max 3)
    for (let i = 0; i < Math.min(config.adsPerAdset, 3); i++) {
      const creativeName = config.selectedCreatives[i % config.selectedCreatives.length]?.name || `Criativo${i + 1}`;
      adSamples.push({
        index: i + 1,
        name: resolveTemplate(config.adName, {
          ...baseContext,
          adIndex: i,
          creativeName,
        }),
      });
    }

    return {
      campaigns: campaignSamples,
      adsets: adsetSamples,
      ads: adSamples,
      totals: { campaigns: totalCampaigns, adsets: totalAdsets, ads: totalAds },
    };
  }, [
    config.campaignName, 
    config.adsetName, 
    config.adName, 
    config.useCBO, 
    config.adsetsPerCampaign, 
    config.adsPerAdset,
    config.selectedCreatives,
    config.productSetName,
    config.catalogName,
    config.pageNames,
    config.customNamingVariables,
    accountPreview,
    getTotalCampaigns,
    getTotalAdsets,
    getTotalAds,
  ]);

  if (compact && !isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className={cn(
          'w-full flex items-center justify-between p-3 bg-secondary/30 rounded-lg border border-border hover:bg-secondary/50 transition-colors',
          className
        )}
      >
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <Eye className="w-4 h-4" />
          Preview de nomenclatura
        </span>
        <ChevronDown className="w-4 h-4 text-muted-foreground" />
      </button>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {compact && (
        <button
          onClick={() => setIsExpanded(false)}
          className="w-full flex items-center justify-between text-sm text-muted-foreground"
        >
          <span className="flex items-center gap-2">
            <Eye className="w-4 h-4" />
            Preview de nomenclatura
          </span>
          <ChevronUp className="w-4 h-4" />
        </button>
      )}

      <div className="space-y-3 p-3 bg-secondary/30 rounded-lg border border-border">
        {/* Campaign Preview */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Badge variant="default" className="text-xs bg-ads-success/20 text-ads-success border-ads-success/30">
              Campanha
            </Badge>
            {previews.totals.campaigns > 3 && (
              <span className="text-xs text-muted-foreground">
                (+{previews.totals.campaigns - 3} mais)
              </span>
            )}
          </div>
          {previews.campaigns.map((sample) => (
            <p key={sample.index} className="text-xs font-mono text-foreground truncate pl-2 border-l-2 border-ads-success/30">
              {sample.name || <span className="text-muted-foreground italic">Configure um template...</span>}
            </p>
          ))}
        </div>

        {/* Adset Preview */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Badge variant="default" className="text-xs bg-ads-info/20 text-ads-info border-ads-info/30">
              Conjunto
            </Badge>
            {previews.totals.adsets > 3 && (
              <span className="text-xs text-muted-foreground">
                (+{previews.totals.adsets - 3} mais)
              </span>
            )}
          </div>
          {previews.adsets.map((sample) => (
            <p key={sample.index} className="text-xs font-mono text-foreground truncate pl-2 border-l-2 border-ads-info/30">
              {sample.name || <span className="text-muted-foreground italic">Configure um template...</span>}
            </p>
          ))}
        </div>

        {/* Ad Preview */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Badge variant="default" className="text-xs bg-accent/20 text-accent-foreground border-accent/30">
              Anúncio
            </Badge>
            {previews.totals.ads > 3 && (
              <span className="text-xs text-muted-foreground">
                (+{previews.totals.ads - 3} mais)
              </span>
            )}
          </div>
          {previews.ads.map((sample) => (
            <p key={sample.index} className="text-xs font-mono text-foreground truncate pl-2 border-l-2 border-accent/30">
              {sample.name || <span className="text-muted-foreground italic">Configure um template...</span>}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
