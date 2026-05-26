import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

export interface PageCapacity {
  pageId: string;
  pageName: string;
  adsRunning: number;
  adsLimit: number;
  availableSlots: number;
}

export interface PageLimitValidation {
  isValid: boolean;
  totalAdsToCreate: number;
  totalAvailableSlots: number;
  capacityNeeded: number;
  pagesWithCapacity: PageCapacity[];
  errors: string[];
  warnings: string[];
  suggestAntiSpy: boolean;
  antiSpyWouldSolve: boolean;
}

interface UsePageLimitValidationOptions {
  selectedPageIds: string[];
  totalAdsToCreate: number;
  antiSpyEnabled: boolean;
  accountsCount: number;
}

/**
 * Hook for validating page ad limits.
 * Checks if selected pages have enough capacity for the ads to be created.
 */
export function usePageLimitValidation({
  selectedPageIds,
  totalAdsToCreate,
  antiSpyEnabled,
  accountsCount,
}: UsePageLimitValidationOptions): PageLimitValidation & { isLoading: boolean; refetch: () => void } {
  // Fetch pages data
  const { data: pages, isLoading, refetch } = useQuery({
    queryKey: ['facebook-pages-limits', selectedPageIds],
    queryFn: async () => {
      if (selectedPageIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from('facebook_pages')
        .select('page_id, name, ads_running, ads_limit')
        .in('page_id', selectedPageIds);
      
      if (error) throw error;
      return data || [];
    },
    enabled: selectedPageIds.length > 0,
    staleTime: 30000, // Consider data fresh for 30s
  });

  // Fetch all available pages to check if anti-spy could solve the issue
  const { data: allPages } = useQuery({
    queryKey: ['facebook-pages-all-limits'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('facebook_pages')
        .select('page_id, name, ads_running, ads_limit')
        .eq('is_blacklisted', false);
      
      if (error) throw error;
      return data || [];
    },
    staleTime: 60000, // Consider data fresh for 1 minute
  });

  const validation = useMemo((): PageLimitValidation => {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Total ads to create across all accounts
    const totalAds = totalAdsToCreate * accountsCount;
    
    if (selectedPageIds.length === 0) {
      return {
        isValid: false,
        totalAdsToCreate: totalAds,
        totalAvailableSlots: 0,
        capacityNeeded: totalAds,
        pagesWithCapacity: [],
        errors: [],
        warnings: [],
        suggestAntiSpy: false,
        antiSpyWouldSolve: false,
      };
    }

    // Calculate capacity for selected pages
    const pagesWithCapacity: PageCapacity[] = (pages || []).map(page => ({
      pageId: page.page_id,
      pageName: page.name,
      adsRunning: page.ads_running || 0,
      adsLimit: page.ads_limit || 250,
      availableSlots: Math.max(0, (page.ads_limit || 250) - (page.ads_running || 0)),
    }));

    const totalAvailableSlots = pagesWithCapacity.reduce((sum, p) => sum + p.availableSlots, 0);
    
    // Check if we have enough capacity
    const isOverLimit = totalAds > totalAvailableSlots;
    
    // Calculate how many more slots we need
    const capacityNeeded = Math.max(0, totalAds - totalAvailableSlots);

    // Check if using more pages (anti-spy) would solve the issue
    let antiSpyWouldSolve = false;
    let totalPotentialSlots = totalAvailableSlots;
    
    if (isOverLimit && allPages && !antiSpyEnabled) {
      // Calculate total slots available across ALL pages
      const allPagesCapacity = allPages.reduce((sum, p) => {
        return sum + Math.max(0, (p.ads_limit || 250) - (p.ads_running || 0));
      }, 0);
      
      antiSpyWouldSolve = allPagesCapacity >= totalAds;
      totalPotentialSlots = allPagesCapacity;
    }

    // Build validation result
    if (isOverLimit) {
      if (antiSpyEnabled) {
        // Anti-spy is enabled but still not enough capacity
        errors.push(
          `Capacidade insuficiente! Você está tentando criar ${totalAds.toLocaleString('pt-BR')} anúncios, ` +
          `mas as ${pagesWithCapacity.length} páginas selecionadas só suportam ${totalAvailableSlots.toLocaleString('pt-BR')} anúncios. ` +
          `Selecione mais páginas ou reduza a quantidade de anúncios.`
        );
      } else {
        // Single page mode - suggest anti-spy
        const singlePageSlots = pagesWithCapacity[0]?.availableSlots || 0;
        errors.push(
          `A página selecionada só suporta ${singlePageSlots.toLocaleString('pt-BR')} anúncios adicionais, ` +
          `mas você está tentando criar ${totalAds.toLocaleString('pt-BR')}. ` +
          `Ative o Anti-Spy e selecione mais páginas.`
        );
      }
    } else if (antiSpyEnabled && pagesWithCapacity.length > 1) {
      // Check for uneven distribution warnings
      const avgAdsPerPage = Math.ceil(totalAds / pagesWithCapacity.length);
      const pagesNearLimit = pagesWithCapacity.filter(p => p.availableSlots < avgAdsPerPage);
      
      if (pagesNearLimit.length > 0) {
        warnings.push(
          `${pagesNearLimit.length} página(s) têm capacidade limitada. ` +
          `O sistema distribuirá automaticamente respeitando os limites de cada página.`
        );
      }
    }

    // Suggest anti-spy if single page and approaching limit
    const suggestAntiSpy = !antiSpyEnabled && 
      selectedPageIds.length === 1 && 
      pagesWithCapacity[0]?.availableSlots < totalAds * 1.2;

    return {
      isValid: !isOverLimit,
      totalAdsToCreate: totalAds,
      totalAvailableSlots,
      capacityNeeded,
      pagesWithCapacity,
      errors,
      warnings,
      suggestAntiSpy: suggestAntiSpy && isOverLimit,
      antiSpyWouldSolve,
    };
  }, [pages, allPages, selectedPageIds, totalAdsToCreate, antiSpyEnabled, accountsCount]);

  return {
    ...validation,
    isLoading,
    refetch,
  };
}
