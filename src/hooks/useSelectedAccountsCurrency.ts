import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCampaignStore } from '@/stores/campaignStore';

export interface AccountWithCurrency {
  id: string;
  account_id: string;
  name: string;
  currency: string | null;
}

export interface CurrencyInfo {
  /** All ad accounts data with currencies */
  allAccounts: AccountWithCurrency[];
  /** Selected accounts data with their currencies */
  selectedAccounts: AccountWithCurrency[];
  /** Unique currencies from selected accounts */
  currencies: string[];
  /** Whether multiple currencies are selected */
  isMultiCurrency: boolean;
  /** Primary currency (first one or BRL as fallback) */
  primaryCurrency: string;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
}

/**
 * Centralized hook for detecting currencies from selected ad accounts.
 * Eliminates duplicate logic across campaign creation components.
 * 
 * Usage:
 * ```tsx
 * const { currencies, isMultiCurrency, primaryCurrency } = useSelectedAccountsCurrency();
 * ```
 */
export function useSelectedAccountsCurrency(): CurrencyInfo {
  const { config } = useCampaignStore();

  // Fetch all ad accounts with their currencies
  const { 
    data: adAccounts = [], 
    isLoading, 
    error 
  } = useQuery({
    queryKey: ['ad-accounts-currencies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('facebook_ad_accounts')
        .select('id, account_id, name, currency');
      if (error) throw error;
      return (data || []) as AccountWithCurrency[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes cache
  });

  // Map selected account IDs to their full data (using database id, not Facebook account_id)
  const selectedAccounts = useMemo(() => {
    if (!config.selectedAccounts.length || !adAccounts.length) return [];
    return config.selectedAccounts
      .map(dbId => adAccounts.find(a => a.id === dbId))
      .filter((a): a is AccountWithCurrency => a !== undefined);
  }, [config.selectedAccounts, adAccounts]);

  // Extract unique currencies from selected accounts
  const currencies = useMemo(() => {
    if (selectedAccounts.length === 0) return ['BRL'];
    const uniqueCurrencies = [...new Set(
      selectedAccounts
        .map(a => a.currency)
        .filter((c): c is string => c !== null && c !== undefined)
    )];
    return uniqueCurrencies.length > 0 ? uniqueCurrencies : ['BRL'];
  }, [selectedAccounts]);

  const isMultiCurrency = currencies.length > 1;
  const primaryCurrency = currencies[0] || 'BRL';

  return {
    allAccounts: adAccounts,
    selectedAccounts,
    currencies,
    isMultiCurrency,
    primaryCurrency,
    isLoading,
    error: error as Error | null,
  };
}

/**
 * Helper to validate and safely parse a URL
 * Returns the parsed URL or null if invalid
 */
export function safeParseUrl(url: string | undefined | null): URL | null {
  if (!url || typeof url !== 'string') return null;
  try {
    // Handle relative URLs or URLs without protocol
    const urlToParse = url.startsWith('http') ? url : `https://${url}`;
    return new URL(urlToParse);
  } catch {
    return null;
  }
}

/**
 * Extract hostname from URL safely
 * Returns the hostname or the original string if parsing fails
 */
export function safeGetHostname(url: string | undefined | null): string {
  const parsed = safeParseUrl(url);
  return parsed?.hostname || url || '';
}
