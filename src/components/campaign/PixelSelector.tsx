import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Search, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface Pixel {
  id: string;
  pixel_id: string;
  name: string;
  account_id: string | null;
  account_name: string | null;
  business_id: string | null;
  business_name: string | null;
}

interface PixelSelectorProps {
  value: string;
  onChange: (pixelId: string) => void;
}

export function PixelSelector({ value, onChange }: PixelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [pixels, setPixels] = useState<Pixel[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { toast } = useToast();

  // Fetch pixels from database
  const fetchPixels = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('facebook_pixels')
        .select('*, facebook_profiles!inner(role, status)')
        .neq('facebook_profiles.role', 'monitor')
        .order('name');


      if (error) throw error;
      // Dedupe by pixel_id, preferring rows whose owning profile is active
      const sorted = (data || []).slice().sort((a: any, b: any) => {
        const aActive = a.facebook_profiles?.status === 'active' ? 0 : 1;
        const bActive = b.facebook_profiles?.status === 'active' ? 0 : 1;
        return aActive - bActive;
      });
      const seen = new Set<string>();
      const deduped = sorted.filter((p: any) => {
        if (seen.has(p.pixel_id)) return false;
        seen.add(p.pixel_id);
        return true;
      });
      setPixels(deduped);
    } catch (error) {
      console.error('Error fetching pixels:', error);
      toast({
        title: 'Erro ao carregar pixels',
        description: 'Não foi possível carregar a lista de pixels.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Sync pixels from Facebook
  const syncPixels = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('facebook-sync-pixels');
      
      if (error) throw error;
      
      if (data?.pixels) {
        setPixels(data.pixels);
        toast({
          title: 'Pixels sincronizados',
          description: `${data.synced || 0} pixel(s) sincronizado(s) com sucesso.`,
        });
      }
    } catch (error) {
      console.error('Error syncing pixels:', error);
      toast({
        title: 'Erro ao sincronizar',
        description: 'Não foi possível sincronizar os pixels do Facebook.',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchPixels();
  }, []);

  // Filter pixels based on search query (name or ID)
  const filteredPixels = useMemo(() => {
    if (!searchQuery) return pixels;
    
    const query = searchQuery.toLowerCase();
    return pixels.filter(pixel => 
      pixel.name.toLowerCase().includes(query) ||
      pixel.pixel_id.toLowerCase().includes(query) ||
      pixel.account_name?.toLowerCase().includes(query) ||
      pixel.business_name?.toLowerCase().includes(query)
    );
  }, [pixels, searchQuery]);

  // Get selected pixel details
  const selectedPixel = useMemo(() => {
    return pixels.find(p => p.pixel_id === value);
  }, [pixels, value]);

  return (
    <div className="flex gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="flex-1 justify-between bg-secondary/50 hover:bg-secondary/70"
          >
            {selectedPixel ? (
              <div className="flex items-center gap-2 truncate">
                <span className="truncate">{selectedPixel.name}</span>
                <Badge variant="outline" className="text-xs font-mono">
                  {selectedPixel.pixel_id}
                </Badge>
              </div>
            ) : (
              <span className="text-muted-foreground">Selecione um pixel...</span>
            )}
            <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[500px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput 
              placeholder="Buscar por nome ou ID do pixel..." 
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <CommandList>
              {loading ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Carregando pixels...
                </div>
              ) : filteredPixels.length === 0 ? (
                <CommandEmpty>
                  <div className="flex flex-col items-center gap-2 py-4">
                    <AlertCircle className="h-8 w-8 text-muted-foreground" />
                    <p>Nenhum pixel encontrado.</p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={syncPixels}
                      disabled={syncing}
                    >
                      <RefreshCw className={cn("h-4 w-4 mr-2", syncing && "animate-spin")} />
                      Sincronizar do Facebook
                    </Button>
                  </div>
                </CommandEmpty>
              ) : (
                <CommandGroup heading={`${filteredPixels.length} pixel(s) disponível(is)`}>
                  {filteredPixels.map((pixel) => (
                    <CommandItem
                      key={pixel.id}
                      value={`${pixel.name} ${pixel.pixel_id} ${pixel.account_name || ''}`}
                      onSelect={() => {
                        onChange(pixel.pixel_id);
                        setOpen(false);
                        setSearchQuery('');
                      }}
                      className="flex items-center justify-between py-3"
                    >
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{pixel.name}</span>
                          <Badge variant="outline" className="text-xs font-mono">
                            {pixel.pixel_id}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {pixel.account_name && (
                            <span>Conta: {pixel.account_name}</span>
                          )}
                          {pixel.business_name && (
                            <>
                              <span>•</span>
                              <span>BM: {pixel.business_name}</span>
                            </>
                          )}
                        </div>
                      </div>
                      {value === pixel.pixel_id && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Button 
        variant="outline" 
        size="icon"
        onClick={syncPixels}
        disabled={syncing}
        title="Sincronizar pixels do Facebook"
      >
        <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
      </Button>
    </div>
  );
}
