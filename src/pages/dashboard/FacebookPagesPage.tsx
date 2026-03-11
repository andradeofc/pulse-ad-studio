import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Facebook,
  RefreshCw,
  ExternalLink,
  Loader2,
  AlertCircle,
  Users,
  Building2,
  Search,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';

interface FacebookPage {
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
  created_at: string;
}

interface GroupedPages {
  [key: string]: {
    businessId: string | null;
    businessName: string;
    pages: FacebookPage[];
  };
}

export default function FacebookPagesPage() {
  const { isAuthenticated } = useAuthStore();
  
  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const loadPages = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('facebook_pages')
        .select('*')
        .order('name');

      if (error) throw error;
      
      // Deduplicate pages by page_id, keeping the one with highest ads_running
      const pagesMap = new Map<string, FacebookPage>();
      for (const page of (data || [])) {
        const existing = pagesMap.get(page.page_id);
        if (!existing || (page.ads_running ?? 0) > (existing.ads_running ?? 0)) {
          pagesMap.set(page.page_id, page as FacebookPage);
        }
      }
      const dedupedPages = Array.from(pagesMap.values());
      setPages(dedupedPages);

      // Expand all groups by default
      const groups: Record<string, boolean> = {};
      data?.forEach(page => {
        const groupKey = page.business_id || 'personal';
        groups[groupKey] = true;
      });
      setExpandedGroups(groups);
    } catch (error) {
      console.error('Error loading pages:', error);
      toast.error('Erro ao carregar páginas');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadPages();
    }
  }, [isAuthenticated, loadPages]);

  const handleSync = async () => {
    setIsSyncing(true);
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
      if (result.success) {
        toast.success(`${result.synced} páginas sincronizadas`);
        await loadPages();
      }
    } catch (error) {
      console.error('Error syncing pages:', error);
      toast.error('Erro ao sincronizar páginas');
    } finally {
      setIsSyncing(false);
    }
  };

  // Filter pages by search
  const filteredPages = pages.filter(page => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      page.name.toLowerCase().includes(query) ||
      page.category?.toLowerCase().includes(query) ||
      page.business_name?.toLowerCase().includes(query)
    );
  });

  // Group pages by business
  const groupedPages: GroupedPages = filteredPages.reduce((acc, page) => {
    const groupKey = page.business_id || 'personal';
    const groupName = page.business_name || 'Páginas Pessoais';

    if (!acc[groupKey]) {
      acc[groupKey] = {
        businessId: page.business_id,
        businessName: groupName,
        pages: [],
      };
    }
    acc[groupKey].pages.push(page);
    return acc;
  }, {} as GroupedPages);

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  };

  // Calculate totals
  const totalPages = pages.length;
  const totalAdsRunning = pages.reduce((sum, p) => sum + p.ads_running, 0);
  const totalAdsLimit = pages.reduce((sum, p) => sum + p.ads_limit, 0);
  const totalFollowers = pages.reduce((sum, p) => sum + p.followers_count, 0);

  if (!isAuthenticated) {
    return (
      <Card className="glass-card">
        <CardContent className="py-16 text-center">
          <AlertCircle className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">
            Autenticação necessária
          </h3>
          <p className="text-muted-foreground">
            Faça login para gerenciar suas páginas do Facebook.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Páginas do Facebook</h1>
          <p className="text-muted-foreground">
            {isLoading ? 'Carregando...' : `${totalPages} página(s) conectada(s)`}
          </p>
        </div>
        <Button onClick={handleSync} disabled={isSyncing} className="glow-primary">
          <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Sincronizando...' : 'Sincronizar Páginas'}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="glass-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <Facebook className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{totalPages}</p>
                <p className="text-xs text-muted-foreground">Total Páginas</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-ads-info/20 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-ads-info" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{Object.keys(groupedPages).length}</p>
                <p className="text-xs text-muted-foreground">Business Managers</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-ads-success/20 flex items-center justify-center">
                <Users className="w-5 h-5 text-ads-success" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {totalFollowers >= 1000000 
                    ? `${(totalFollowers / 1000000).toFixed(1)}M` 
                    : totalFollowers >= 1000 
                    ? `${(totalFollowers / 1000).toFixed(1)}K` 
                    : totalFollowers}
                </p>
                <p className="text-xs text-muted-foreground">Total Seguidores</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="pt-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">Slots de Anúncio</p>
                <p className="text-sm font-medium text-foreground">
                  {totalAdsRunning}/{totalAdsLimit}
                </p>
              </div>
              <Progress value={(totalAdsRunning / totalAdsLimit) * 100} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">
                {totalAdsLimit - totalAdsRunning} slots disponíveis
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar páginas..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 bg-secondary/50"
        />
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && pages.length === 0 && (
        <Card className="glass-card">
          <CardContent className="py-16 text-center">
            <Facebook className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              Nenhuma página encontrada
            </h3>
            <p className="text-muted-foreground mb-4">
              Sincronize suas páginas do Facebook para começar.
            </p>
            <Button onClick={handleSync} disabled={isSyncing}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
              Sincronizar Páginas
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Pages Groups */}
      {!isLoading && Object.entries(groupedPages).map(([groupKey, group], groupIndex) => (
        <motion.div
          key={groupKey}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: groupIndex * 0.1 }}
        >
          <Collapsible
            open={expandedGroups[groupKey]}
            onOpenChange={() => toggleGroup(groupKey)}
          >
            <Card className="glass-card overflow-hidden">
              <CollapsibleTrigger className="w-full">
                <CardHeader className="cursor-pointer hover:bg-secondary/30 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                        {group.businessId ? (
                          <Building2 className="w-5 h-5 text-muted-foreground" />
                        ) : (
                          <Facebook className="w-5 h-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="text-left">
                        <CardTitle className="text-base">{group.businessName}</CardTitle>
                        <CardDescription>{group.pages.length} página(s)</CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-medium text-foreground">
                          {group.pages.reduce((sum, p) => sum + p.ads_running, 0)} anúncios
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {group.pages.reduce((sum, p) => sum + (p.ads_limit - p.ads_running), 0)} slots livres
                        </p>
                      </div>
                      {expandedGroups[groupKey] ? (
                        <ChevronUp className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    {group.pages.map((page, pageIndex) => {
                      const availableSlots = page.ads_limit - page.ads_running;
                      const usagePercent = (page.ads_running / page.ads_limit) * 100;

                      return (
                        <motion.div
                          key={page.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: pageIndex * 0.05 }}
                          className="flex items-center gap-4 p-4 bg-secondary/30 rounded-lg hover:bg-secondary/50 transition-colors"
                        >
                          {/* Page Image */}
                          {page.picture_url ? (
                            <img
                              src={page.picture_url}
                              alt={page.name}
                              className="w-12 h-12 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center">
                              <Facebook className="w-6 h-6 text-muted-foreground" />
                            </div>
                          )}

                          {/* Page Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-foreground truncate">{page.name}</h4>
                              <a
                                href={`https://facebook.com/${page.page_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-primary shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            </div>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                              {page.category && (
                                <span>{page.category}</span>
                              )}
                              {page.followers_count > 0 && (
                                <span className="flex items-center gap-1">
                                  <Users className="w-3.5 h-3.5" />
                                  {page.followers_count.toLocaleString()}
                                </span>
                              )}
                              {!page.is_published && (
                                <Badge variant="secondary" className="text-xs">Não publicada</Badge>
                              )}
                            </div>
                          </div>

                          {/* Ads Usage */}
                          <div className="w-40 shrink-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-muted-foreground">Anúncios</span>
                              <span className="text-xs font-medium text-foreground">
                                {page.ads_running}/{page.ads_limit}
                              </span>
                            </div>
                            <Progress 
                              value={usagePercent} 
                              className={`h-2 ${usagePercent > 90 ? '[&>div]:bg-destructive' : usagePercent > 70 ? '[&>div]:bg-ads-warning' : ''}`}
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              {availableSlots} slots disponíveis
                            </p>
                          </div>

                          {/* Tasks/Permissions */}
                          {page.tasks && page.tasks.length > 0 && (
                            <div className="hidden xl:flex flex-wrap gap-1 max-w-48">
                              {page.tasks.slice(0, 3).map(task => (
                                <Badge key={task} variant="outline" className="text-xs">
                                  {task.replace('_', ' ')}
                                </Badge>
                              ))}
                              {page.tasks.length > 3 && (
                                <Badge variant="secondary" className="text-xs">
                                  +{page.tasks.length - 3}
                                </Badge>
                              )}
                            </div>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </motion.div>
      ))}
    </div>
  );
}
