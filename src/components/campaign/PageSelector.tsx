import { useState, useEffect, useMemo, useCallback } from 'react';
import { Check, ChevronsUpDown, RefreshCw, Facebook, ExternalLink, AlertTriangle, Shuffle, Users, Shield, Info, CheckSquare, Square, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { fetchPools, type PoolWithPages } from '@/services/fanpagePoolsService';

export interface FacebookPage {
  id: string;
  profile_id: string;
  page_id: string;
  name: string;
  category: string | null;
  picture_url: string | null;
  followers_count: number;
  is_published: boolean;
  business_id: string | null;
  business_name: string | null;
  ads_running: number;
  ads_limit: number;
  tasks: string[] | null;
}

interface PageSelectorProps {
  selectedPages: string[];
  onSelectionChange: (pageIds: string[], pageNames: string[]) => void;
  multiSelect?: boolean;
  totalAdsToCreate: number;
  onValidationChange?: (isValid: boolean, error?: string) => void;
  selectedPoolId?: string | null;
  onPoolChange?: (poolId: string | null) => void;
}

interface PageDistribution {
  pageId: string;
  pageName: string;
  adsCount: number;
  maxCapacity: number;
  isOverLimit: boolean;
}

const ADS_LIMIT_PER_PAGE = 250;

export function PageSelector({
  selectedPages,
  onSelectionChange,
  multiSelect = false,
  totalAdsToCreate,
  onValidationChange,
}: PageSelectorProps) {
  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [distribution, setDistribution] = useState<PageDistribution[]>([]);

  // Fetch pages on mount
  useEffect(() => {
    fetchPages();
  }, []);

  // Calculate distribution when selection changes
  useEffect(() => {
    if (multiSelect && selectedPages.length > 0) {
      calculateDistribution();
    } else {
      setDistribution([]);
    }
  }, [selectedPages, totalAdsToCreate, multiSelect, pages]);

  const fetchPages = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('facebook_pages')
        .select('*, facebook_profiles!inner(status)')
        .neq('facebook_profiles.status', 'disconnected')
        .eq('is_blacklisted', false)
        .order('name');

      if (error) throw error;
      
      // Deduplicate by page_id — keep the entry with the most ads_running data (most complete)
      const pageMap = new Map<string, FacebookPage>();
      for (const row of (data || [])) {
        const existing = pageMap.get(row.page_id);
        if (!existing || (row.ads_running || 0) > (existing.ads_running || 0)) {
          pageMap.set(row.page_id, row);
        }
      }
      setPages(Array.from(pageMap.values()));
    } catch (error) {
      console.error('Error fetching pages:', error);
      toast.error('Erro ao carregar páginas');
    } finally {
      setLoading(false);
    }
  };

  const syncPages = async () => {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Você precisa estar logado');
        return;
      }

      const response = await supabase.functions.invoke('facebook-sync-pages', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.error) throw response.error;

      const result = response.data;
      if (result.pages) {
        setPages(result.pages);
        toast.success(`${result.synced} páginas sincronizadas`);
      }
    } catch (error) {
      console.error('Error syncing pages:', error);
      toast.error('Erro ao sincronizar páginas');
    } finally {
      setSyncing(false);
    }
  };

  const calculateDistribution = useCallback(() => {
    if (selectedPages.length === 0 || totalAdsToCreate === 0) {
      setDistribution([]);
      onValidationChange?.(true);
      return;
    }

    const selectedPagesData = pages.filter(p => selectedPages.includes(p.page_id));
    
    // Calculate smart distribution respecting page limits
    let remainingAds = totalAdsToCreate;
    const dist: PageDistribution[] = [];
    
    // Sort pages by available capacity (most capacity first for better distribution)
    const sortedPages = [...selectedPagesData].sort((a, b) => {
      const aSlots = (a.ads_limit || 250) - (a.ads_running || 0);
      const bSlots = (b.ads_limit || 250) - (b.ads_running || 0);
      return bSlots - aSlots;
    });
    
    // First pass: calculate fair distribution respecting limits
    for (let i = 0; i < sortedPages.length && remainingAds > 0; i++) {
      const page = sortedPages[i];
      const availableSlots = Math.max(0, (page.ads_limit || 250) - (page.ads_running || 0));
      const remainingPages = sortedPages.length - i;
      const fairShare = Math.ceil(remainingAds / remainingPages);
      
      // Assign minimum of fair share and available slots
      const adsForThisPage = Math.min(fairShare, availableSlots, remainingAds);
      remainingAds -= adsForThisPage;
      
      dist.push({
        pageId: page.page_id,
        pageName: page.name,
        adsCount: adsForThisPage,
        maxCapacity: availableSlots,
        isOverLimit: adsForThisPage > availableSlots,
      });
    }
    
    // Check if we still have remaining ads (not enough capacity)
    const totalCapacity = selectedPagesData.reduce((sum, p) => 
      sum + Math.max(0, (p.ads_limit || 250) - (p.ads_running || 0)), 0
    );
    const isOverLimit = totalAdsToCreate > totalCapacity;
    
    // Report validation state
    if (isOverLimit) {
      const deficit = totalAdsToCreate - totalCapacity;
      onValidationChange?.(
        false, 
        `Capacidade insuficiente! Faltam ${deficit.toLocaleString('pt-BR')} slots. ` +
        `Selecione mais páginas ou reduza os anúncios.`
      );
    } else {
      onValidationChange?.(true);
    }
    
    setDistribution(dist);
  }, [selectedPages, totalAdsToCreate, pages, onValidationChange]);

  const randomizeDistribution = () => {
    if (selectedPages.length === 0 || totalAdsToCreate === 0) return;

    const selectedPagesData = pages.filter(p => selectedPages.includes(p.page_id));
    let remainingAds = totalAdsToCreate;
    const shuffled = [...selectedPagesData].sort(() => Math.random() - 0.5);

    const dist: PageDistribution[] = shuffled.map((page, index) => {
      const isLast = index === shuffled.length - 1;
      const availableSlots = Math.max(0, (page.ads_limit || 250) - (page.ads_running || 0));
      
      // Random distribution with some variance, respecting page limits
      let adsForThisPage: number;
      if (isLast) {
        adsForThisPage = Math.min(remainingAds, availableSlots);
      } else {
        const avgRemaining = remainingAds / (shuffled.length - index);
        const variance = Math.floor(avgRemaining * 0.3);
        adsForThisPage = Math.max(1, Math.floor(avgRemaining + (Math.random() * variance * 2 - variance)));
        adsForThisPage = Math.min(adsForThisPage, remainingAds - (shuffled.length - index - 1), availableSlots);
      }
      
      remainingAds -= adsForThisPage;

      return {
        pageId: page.page_id,
        pageName: page.name,
        adsCount: adsForThisPage,
        maxCapacity: availableSlots,
        isOverLimit: adsForThisPage > availableSlots,
      };
    });

    setDistribution(dist);
    toast.success('Distribuição randomizada');
  };

  const handleTogglePage = (pageId: string, pageName: string) => {
    if (multiSelect) {
      const isRemoving = selectedPages.includes(pageId);
      const newSelection = isRemoving
        ? selectedPages.filter(id => id !== pageId)
        : [...selectedPages, pageId];
      
      // Build corresponding names array
      const newNames = newSelection.map(id => {
        const page = pages.find(p => p.page_id === id);
        return page?.name || '';
      });
      
      onSelectionChange(newSelection, newNames);
    } else {
      onSelectionChange([pageId], [pageName]);
      setOpen(false);
    }
  };

  const filteredPages = useMemo(() => {
    if (!searchQuery) return pages;
    const query = searchQuery.toLowerCase();
    return pages.filter(
      p => p.name.toLowerCase().includes(query) ||
           p.business_name?.toLowerCase().includes(query) ||
           p.category?.toLowerCase().includes(query)
    );
  }, [pages, searchQuery]);

  // Group pages by business
  const groupedPages = useMemo(() => {
    const groups: Record<string, FacebookPage[]> = {
      'Pessoal': [],
    };

    filteredPages.forEach(page => {
      const groupName = page.business_name || 'Pessoal';
      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      groups[groupName].push(page);
    });

    return groups;
  }, [filteredPages]);

  const selectedPage = pages.find(p => selectedPages.includes(p.page_id));
  
  // Calculate total capacity and validation state
  const { totalCapacity, totalAdsOverLimit, hasOverLimitWarning, capacityPercent, deficit } = useMemo(() => {
    const selectedPagesData = pages.filter(p => selectedPages.includes(p.page_id));
    const capacity = selectedPagesData.reduce((sum, p) => 
      sum + Math.max(0, (p.ads_limit || 250) - (p.ads_running || 0)), 0
    );
    const isOver = totalAdsToCreate > capacity;
    const def = Math.max(0, totalAdsToCreate - capacity);
    const percent = capacity > 0 ? Math.min(100, (totalAdsToCreate / capacity) * 100) : 0;
    
    return {
      totalCapacity: capacity,
      totalAdsOverLimit: def,
      hasOverLimitWarning: isOver,
      capacityPercent: percent,
      deficit: def,
    };
  }, [pages, selectedPages, totalAdsToCreate]);

  if (multiSelect) {
    return (
      <div className="space-y-4">
        {/* Header with sync button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">
              {selectedPages.length} página(s) selecionada(s)
            </Label>
            {selectedPages.length > 0 && (
              <Badge variant={hasOverLimitWarning ? "destructive" : "secondary"} className="text-xs">
                {totalAdsToCreate.toLocaleString('pt-BR')} / {totalCapacity.toLocaleString('pt-BR')} slots
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            {selectedPages.length > 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={randomizeDistribution}
                className="gap-2"
              >
                <Shuffle className="w-4 h-4" />
                Randomizar
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={syncPages}
              disabled={syncing}
              className="gap-2"
            >
              <RefreshCw className={cn("w-4 h-4", syncing && "animate-spin")} />
              {syncing ? 'Sincronizando...' : 'Sincronizar'}
            </Button>
          </div>
        </div>

        {/* Capacity info bar */}
        {selectedPages.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Capacidade utilizada</span>
              <span className={cn(
                "font-medium",
                hasOverLimitWarning ? "text-destructive" : capacityPercent > 80 ? "text-yellow-500" : "text-green-500"
              )}>
                {capacityPercent.toFixed(0)}%
              </span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div 
                className={cn(
                  "h-full transition-all duration-300",
                  hasOverLimitWarning ? "bg-destructive" : capacityPercent > 80 ? "bg-yellow-500" : "bg-green-500"
                )}
                style={{ width: `${Math.min(100, capacityPercent)}%` }}
              />
            </div>
          </div>
        )}

        {/* Warning if over limit */}
        {hasOverLimitWarning && (
          <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">Capacidade insuficiente!</p>
              <p className="text-xs text-destructive/80">
                Você precisa de mais <strong>{deficit.toLocaleString('pt-BR')}</strong> slots. 
                Selecione mais páginas ou reduza a quantidade de anúncios.
              </p>
            </div>
          </div>
        )}
        
        {/* Info when capacity is sufficient */}
        {!hasOverLimitWarning && selectedPages.length > 0 && totalAdsToCreate > 0 && (
          <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg flex items-start gap-3">
            <Shield className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-green-600 dark:text-green-400">Capacidade OK</p>
              <p className="text-xs text-green-600/80 dark:text-green-400/80">
                Os anúncios serão distribuídos automaticamente entre as páginas respeitando os limites individuais.
              </p>
            </div>
          </div>
        )}

        {/* Pages list with checkboxes */}
        <ScrollArea className="h-[300px] border rounded-lg">
          {loading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" />
              Carregando...
            </div>
          ) : pages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
              <Facebook className="w-10 h-10 mb-2 opacity-50" />
              <p className="text-sm">Nenhuma página encontrada</p>
              <Button variant="link" size="sm" onClick={syncPages} className="mt-2">
                Sincronizar páginas
              </Button>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {Object.entries(groupedPages).map(([groupName, groupPages]) => (
                groupPages.length > 0 && (
                  <div key={groupName} className="mb-3">
                    <div className="text-xs font-medium text-muted-foreground px-2 py-1 uppercase tracking-wider">
                      {groupName}
                    </div>
                    {groupPages.map(page => {
                      const isSelected = selectedPages.includes(page.page_id);
                      const availableSlots = page.ads_limit - page.ads_running;
                      const distInfo = distribution.find(d => d.pageId === page.page_id);

                      return (
                        <div
                          key={page.id}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors",
                            isSelected ? "bg-primary/10 border border-primary/30" : "hover:bg-secondary/50"
                          )}
                          onClick={() => handleTogglePage(page.page_id, page.name)}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => handleTogglePage(page.page_id, page.name)}
                          />
                          
                          {page.picture_url ? (
                            <img
                              src={page.picture_url}
                              alt={page.name}
                              className="w-10 h-10 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                              <Facebook className="w-5 h-5 text-muted-foreground" />
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm truncate">{page.name}</span>
                              <a
                                href={`https://facebook.com/${page.page_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-muted-foreground hover:text-primary"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {page.category && (
                                <span>{page.category}</span>
                              )}
                              {page.followers_count > 0 && (
                                <span className="flex items-center gap-1">
                                  <Users className="w-3 h-3" />
                                  {page.followers_count.toLocaleString()}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-xs text-muted-foreground">
                              {page.ads_running}/{page.ads_limit} anúncios
                            </div>
                            <Badge 
                              variant={availableSlots > 50 ? "secondary" : availableSlots > 0 ? "outline" : "destructive"}
                              className="text-xs"
                            >
                              {availableSlots} slots
                            </Badge>
                          </div>

                          {isSelected && distInfo && (
                            <Badge 
                              variant={distInfo.isOverLimit ? "destructive" : "default"}
                              className="ml-2"
                            >
                              +{distInfo.adsCount}
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Distribution summary */}
        {distribution.length > 0 && (
          <div className="p-3 bg-secondary/30 rounded-lg">
            <p className="text-xs font-medium text-muted-foreground mb-2">Distribuição de anúncios:</p>
            <div className="flex flex-wrap gap-2">
              {distribution.map(d => (
                <Badge
                  key={d.pageId}
                  variant={d.isOverLimit ? "destructive" : "secondary"}
                  className="text-xs"
                >
                  {d.pageName}: {d.adsCount}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Single select mode
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm">Página do Facebook</Label>
        <Button
          variant="ghost"
          size="sm"
          onClick={syncPages}
          disabled={syncing}
          className="h-7 px-2 text-xs"
        >
          <RefreshCw className={cn("w-3.5 h-3.5 mr-1", syncing && "animate-spin")} />
          {syncing ? 'Sincronizando...' : 'Sincronizar'}
        </Button>
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between bg-secondary/50"
          >
            {selectedPage ? (
              <div className="flex items-center gap-2">
                {selectedPage.picture_url ? (
                  <img
                    src={selectedPage.picture_url}
                    alt={selectedPage.name}
                    className="w-5 h-5 rounded"
                  />
                ) : (
                  <Facebook className="w-4 h-4" />
                )}
                <span className="truncate">{selectedPage.name}</span>
              </div>
            ) : (
              <span className="text-muted-foreground">Selecione uma página</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <Command>
            <CommandInput 
              placeholder="Buscar página..." 
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <CommandList>
              <CommandEmpty>
                {loading ? 'Carregando...' : 'Nenhuma página encontrada'}
              </CommandEmpty>
              {Object.entries(groupedPages).map(([groupName, groupPages]) => (
                groupPages.length > 0 && (
                  <CommandGroup key={groupName} heading={groupName}>
                    {groupPages.map(page => {
                      const availableSlots = page.ads_limit - page.ads_running;
                      const isSelected = selectedPages.includes(page.page_id);

                      return (
                        <CommandItem
                          key={page.id}
                          value={`${page.name} ${page.business_name || ''} ${page.category || ''}`}
                          onSelect={() => handleTogglePage(page.page_id, page.name)}
                          className="flex items-center gap-3 py-3"
                        >
                          <Check
                            className={cn(
                              "h-4 w-4",
                              isSelected ? "opacity-100" : "opacity-0"
                            )}
                          />
                          
                          {page.picture_url ? (
                            <img
                              src={page.picture_url}
                              alt={page.name}
                              className="w-8 h-8 rounded"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded bg-secondary flex items-center justify-center">
                              <Facebook className="w-4 h-4 text-muted-foreground" />
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{page.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {page.ads_running}/{page.ads_limit} · {availableSlots} slots disponíveis
                            </div>
                          </div>

                          <a
                            href={`https://facebook.com/${page.page_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-muted-foreground hover:text-primary"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                )
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedPage && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{selectedPage.ads_running} anúncios ativos</span>
          <span>{selectedPage.ads_limit - selectedPage.ads_running} slots disponíveis</span>
        </div>
      )}
    </div>
  );
}
