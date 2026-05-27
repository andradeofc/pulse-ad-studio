import { useState, useEffect, useMemo } from 'react';
import { Building2, ChevronDown, Check, AlertCircle, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface BusinessManager {
  id: string;
  business_id: string;
  name: string;
  verification_status: string | null;
}

interface BusinessManagerSelectorProps {
  value: string; // Selected business_id
  onChange: (businessId: string, businessName: string) => void;
}

export function BusinessManagerSelector({ 
  value, 
  onChange 
}: BusinessManagerSelectorProps) {
  const { toast } = useToast();
  const [businessManagers, setBusinessManagers] = useState<BusinessManager[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchBusinessManagers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('facebook_business_managers')
        .select('id, business_id, name, verification_status')
        .order('name');

      if (error) throw error;

      // Deduplicate by business_id (same BM pode existir em múltiplos perfis do usuário)
      const seen = new Set<string>();
      const unique: BusinessManager[] = [];
      for (const bm of data || []) {
        if (!bm.business_id || seen.has(bm.business_id)) continue;
        seen.add(bm.business_id);
        unique.push(bm);
      }
      setBusinessManagers(unique);

      // Auto-select if only one BM and none selected
      if (unique.length === 1 && !value) {
        onChange(unique[0].business_id, unique[0].name);
      }
    } catch (err) {
      console.error('Error fetching business managers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBusinessManagers();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('facebook-sync-business-managers');
      
      if (error) throw error;
      
      const syncedCount = data?.business_managers_synced || 0;
      
      toast({
        title: 'Business Managers sincronizados!',
        description: `${syncedCount} BM(s) encontrado(s).`,
      });
      
      await fetchBusinessManagers();
    } catch (err: any) {
      console.error('Error syncing business managers:', err);
      toast({
        title: 'Erro ao sincronizar',
        description: err.message || 'Não foi possível sincronizar os Business Managers.',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  const selectedBM = useMemo(() => 
    businessManagers.find(bm => bm.business_id === value),
    [businessManagers, value]
  );

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center p-4 bg-secondary/30 rounded-lg border border-border">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mr-2" />
        <span className="text-sm text-muted-foreground">Carregando Business Managers...</span>
      </div>
    );
  }

  // No BMs found - show sync button
  if (businessManagers.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 p-4 bg-secondary/30 border border-border rounded-lg">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-foreground">
              Nenhum Business Manager encontrado
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Sincronize os Business Managers do seu perfil do Facebook para continuar.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={syncing}
          className="w-full"
        >
          {syncing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Sincronizando...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4 mr-2" />
              Sincronizar Business Managers
            </>
          )}
        </Button>
      </div>
    );
  }

  // If only one BM, show it as selected (no dropdown needed)
  if (businessManagers.length === 1) {
    const bm = businessManagers[0];
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {bm.name}
            </p>
            <p className="text-xs text-muted-foreground">
              ID: {bm.business_id}
            </p>
          </div>
          {bm.verification_status && (
            <Badge variant="outline" className="text-[10px] font-mono">
              {bm.verification_status}
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSync}
          disabled={syncing}
          className="w-full text-xs"
        >
          {syncing ? (
            <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3 h-3 mr-1.5" />
          )}
          Atualizar lista de BMs
        </Button>
      </div>
    );
  }

  // Multiple BMs - show dropdown
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="outline" 
              className="flex-1 justify-between h-auto py-3"
              disabled={loading}
            >
              {selectedBM ? (
                <div className="flex items-center gap-3">
                  <Building2 className="w-4 h-4 text-primary" />
                  <div className="text-left">
                    <p className="text-sm font-medium">{selectedBM.name}</p>
                    <p className="text-xs text-muted-foreground">
                      ID: {selectedBM.business_id}
                    </p>
                  </div>
                </div>
              ) : (
                <span className="text-muted-foreground">Selecione o Business Manager</span>
              )}
              <ChevronDown className="w-4 h-4 ml-2 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
            {businessManagers.map((bm) => (
              <DropdownMenuItem
                key={bm.id}
                onClick={() => onChange(bm.business_id, bm.name)}
                className="flex items-center gap-3 py-3"
              >
                <Building2 className={cn(
                  "w-4 h-4",
                  value === bm.business_id ? "text-primary" : "text-muted-foreground"
                )} />
                <div className="flex-1">
                  <p className="text-sm font-medium">{bm.name}</p>
                  <p className="text-xs text-muted-foreground">
                    ID: {bm.business_id}
                  </p>
                </div>
                {value === bm.business_id && (
                  <Check className="w-4 h-4 text-primary" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="outline"
          size="icon"
          onClick={handleSync}
          disabled={syncing}
          title="Sincronizar Business Managers"
        >
          <RefreshCw className={cn("w-4 h-4", syncing && "animate-spin")} />
        </Button>
      </div>
      
      {selectedBM && (
        <p className="text-xs text-muted-foreground">
          Os catálogos serão buscados deste Business Manager
        </p>
      )}
    </div>
  );
}
