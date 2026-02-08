import { useState, useEffect } from 'react';
import { Search, RefreshCw, Layers, Loader2, Package } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ProductSet {
  id: string;
  product_set_id: string;
  name: string;
  product_count: number | null;
  filter: string | null;
}

interface ProductSetSelectorProps {
  catalogDbId: string; // Database UUID of the catalog
  catalogId: string; // Facebook catalog_id
  value: string;
  onChange: (productSetId: string, productSetName: string) => void;
}

export function ProductSetSelector({ catalogDbId, catalogId, value, onChange }: ProductSetSelectorProps) {
  const { toast } = useToast();
  const [productSets, setProductSets] = useState<ProductSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');

  const fetchProductSets = async () => {
    if (!catalogDbId) {
      setProductSets([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('facebook_product_sets')
        .select('id, product_set_id, name, product_count, filter')
        .eq('catalog_id', catalogDbId)
        .order('name');

      if (error) throw error;
      setProductSets(data || []);
    } catch (err) {
      console.error('Error fetching product sets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProductSets();
  }, [catalogDbId]);

  const handleSync = async () => {
    if (!catalogId) {
      toast({
        title: 'Selecione um catálogo',
        description: 'Primeiro selecione um catálogo para sincronizar os conjuntos de produtos.',
        variant: 'destructive',
      });
      return;
    }

    setSyncing(true);
    try {
      const { error } = await supabase.functions.invoke('facebook-sync-product-sets', {
        body: { catalog_id: catalogId, catalog_db_id: catalogDbId }
      });
      
      if (error) throw error;
      
      toast({
        title: 'Conjuntos sincronizados!',
        description: 'A lista de conjuntos de produtos foi atualizada.',
      });
      
      await fetchProductSets();
    } catch (err: any) {
      console.error('Error syncing product sets:', err);
      toast({
        title: 'Erro ao sincronizar',
        description: err.message || 'Não foi possível sincronizar os conjuntos de produtos.',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  const filteredSets = productSets.filter(ps =>
    ps.name.toLowerCase().includes(search.toLowerCase()) ||
    ps.product_set_id.includes(search)
  );

  const selectedSet = productSets.find(ps => ps.product_set_id === value);

  if (!catalogDbId) {
    return (
      <div className="p-4 bg-secondary/30 rounded-lg border border-border text-center">
        <Package className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">
          Selecione um catálogo primeiro para ver os conjuntos de produtos.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search and Sync */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar conjunto por nome ou ID..."
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
          title="Sincronizar conjuntos de produtos"
        >
          <RefreshCw className={cn("w-4 h-4", syncing && "animate-spin")} />
        </Button>
      </div>

      {/* Product Set List */}
      <ScrollArea className="h-[180px] rounded-lg border border-border">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredSets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <Layers className="w-8 h-8 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">
              {productSets.length === 0
                ? 'Nenhum conjunto encontrado. Clique em sincronizar.'
                : 'Nenhum conjunto corresponde à busca.'}
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {filteredSets.map((set) => (
              <div
                key={set.id}
                onClick={() => onChange(set.product_set_id, set.name)}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors",
                  value === set.product_set_id
                    ? "bg-primary/10 border border-primary/30"
                    : "hover:bg-secondary/50 border border-transparent"
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center",
                  value === set.product_set_id
                    ? "bg-primary/20 text-primary"
                    : "bg-secondary text-muted-foreground"
                )}>
                  <Layers className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {set.name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    ID: {set.product_set_id}
                  </p>
                </div>
                {set.product_count !== null && set.product_count > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {set.product_count} produtos
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Selected Info */}
      {selectedSet && (
        <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">
              {selectedSet.name}
            </span>
            <Badge variant="outline" className="text-xs font-mono ml-auto">
              product_set_id: {selectedSet.product_set_id}
            </Badge>
          </div>
        </div>
      )}
    </div>
  );
}
