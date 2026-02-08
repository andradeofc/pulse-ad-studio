import { useState, useEffect } from 'react';
import { Search, RefreshCw, Package, Loader2, ShoppingBag } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface Catalog {
  id: string;
  catalog_id: string;
  name: string;
  business_name: string | null;
  product_count: number | null;
  vertical: string | null;
}

interface CatalogSelectorProps {
  value: string;
  onChange: (catalogId: string, catalogDbId: string, catalogName: string) => void;
  businessManagerId: string; // BM to fetch catalogs from
  selectedAccounts: string[]; // DB UUIDs (used to fetch shared catalogs via ad account)
}

export function CatalogSelector({ value, onChange, businessManagerId, selectedAccounts }: CatalogSelectorProps) {
  const { toast } = useToast();
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');

  const fetchCatalogs = async () => {
    if (!businessManagerId) {
      setCatalogs([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('facebook_catalogs')
        .select('id, catalog_id, name, business_name, product_count, vertical')
        .eq('business_id', businessManagerId)
        .order('name');

      if (error) throw error;
      setCatalogs(data || []);
    } catch (err) {
      console.error('Error fetching catalogs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalogs();
  }, [businessManagerId]);

  const handleSync = async () => {
    if (!businessManagerId) {
      toast({
        title: 'Nenhum Business Manager selecionado',
        description: 'Selecione um Business Manager antes de sincronizar catálogos.',
        variant: 'destructive',
      });
      return;
    }

    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('facebook-sync-catalogs', {
        body: { business_id: businessManagerId, ad_account_ids: selectedAccounts }
      });
      
      if (error) throw error;
      
      const syncedCount = data?.catalogs_synced || 0;
      const debug = data?.debug;

      const ownedCount = debug?.owned_product_catalogs?.count ?? null;
      const discoveredCount = debug?.discovered_from_adsets?.catalog_ids_found ?? null;

      const breakdownParts: string[] = [];
      if (ownedCount !== null) breakdownParts.push(`owned: ${ownedCount}`);
      if (discoveredCount !== null) breakdownParts.push(`via adsets: ${discoveredCount}`);

      const breakdown = breakdownParts.length ? ` (${breakdownParts.join(', ')})` : '';

      toast({
        title: 'Catálogos sincronizados!',
        description: `${syncedCount} catálogo(s) encontrado(s).${breakdown}`,
      });
      
      await fetchCatalogs();
    } catch (err: any) {
      console.error('Error syncing catalogs:', err);
      toast({
        title: 'Erro ao sincronizar',
        description: err.message || 'Não foi possível sincronizar os catálogos.',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  const filteredCatalogs = catalogs.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.catalog_id.includes(search) ||
    c.business_name?.toLowerCase().includes(search.toLowerCase())
  );

  const selectedCatalog = catalogs.find(c => c.catalog_id === value);

  const getVerticalIcon = (vertical: string | null) => {
    switch (vertical) {
      case 'commerce':
        return <ShoppingBag className="w-4 h-4" />;
      default:
        return <Package className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-3">
      {/* Search and Sync */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar catálogo por nome ou ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-secondary/50"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={handleSync}
          disabled={syncing}
          title="Sincronizar catálogos do Facebook"
        >
          <RefreshCw className={cn("w-4 h-4", syncing && "animate-spin")} />
        </Button>
      </div>

      {/* Catalog List */}
      <ScrollArea className="h-[200px] rounded-lg border border-border">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredCatalogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <Package className="w-8 h-8 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">
              {catalogs.length === 0
                ? 'Nenhum catálogo encontrado. Clique em sincronizar.'
                : 'Nenhum catálogo corresponde à busca.'}
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {filteredCatalogs.map((catalog) => (
              <div
                key={catalog.id}
                onClick={() => onChange(catalog.catalog_id, catalog.id, catalog.name)}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors",
                  value === catalog.catalog_id
                    ? "bg-primary/10 border border-primary/30"
                    : "hover:bg-secondary/50 border border-transparent"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center",
                  value === catalog.catalog_id
                    ? "bg-primary/20 text-primary"
                    : "bg-secondary text-muted-foreground"
                )}>
                  {getVerticalIcon(catalog.vertical)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {catalog.name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {catalog.business_name || 'Sem BM'} · ID: {catalog.catalog_id}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {catalog.product_count !== null && catalog.product_count > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {catalog.product_count} produtos
                    </Badge>
                  )}
                  {catalog.vertical && (
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {catalog.vertical}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Selected Info */}
      {selectedCatalog && (
        <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">
              {selectedCatalog.name}
            </span>
            <Badge variant="outline" className="text-xs font-mono ml-auto">
              product_catalog_id: {selectedCatalog.catalog_id}
            </Badge>
          </div>
        </div>
      )}
    </div>
  );
}
