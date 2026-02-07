import { useState, useEffect, useMemo } from 'react';
import { Building2, ChevronDown, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface BusinessManager {
  business_id: string;
  business_name: string;
  accountCount: number;
}

interface BusinessManagerSelectorProps {
  selectedAccounts: string[]; // Database UUIDs of selected ad accounts
  value: string; // Selected business_id
  onChange: (businessId: string, businessName: string) => void;
}

export function BusinessManagerSelector({ 
  selectedAccounts, 
  value, 
  onChange 
}: BusinessManagerSelectorProps) {
  const [businessManagers, setBusinessManagers] = useState<BusinessManager[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch BMs from selected accounts
  useEffect(() => {
    const fetchBusinessManagers = async () => {
      if (selectedAccounts.length === 0) {
        setBusinessManagers([]);
        return;
      }

      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('facebook_ad_accounts')
          .select('business_id, business_name')
          .in('id', selectedAccounts)
          .not('business_id', 'is', null);

        if (error) throw error;

        // Group by business_id and count accounts
        const bmMap = new Map<string, BusinessManager>();
        for (const account of data || []) {
          if (!account.business_id) continue;
          
          const existing = bmMap.get(account.business_id);
          if (existing) {
            existing.accountCount++;
          } else {
            bmMap.set(account.business_id, {
              business_id: account.business_id,
              business_name: account.business_name || `BM ${account.business_id}`,
              accountCount: 1,
            });
          }
        }

        const bms = Array.from(bmMap.values());
        setBusinessManagers(bms);

        // Auto-select if only one BM
        if (bms.length === 1 && !value) {
          onChange(bms[0].business_id, bms[0].business_name);
        }
      } catch (err) {
        console.error('Error fetching business managers:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchBusinessManagers();
  }, [selectedAccounts]);

  const selectedBM = useMemo(() => 
    businessManagers.find(bm => bm.business_id === value),
    [businessManagers, value]
  );

  // If no BMs found (personal accounts only)
  if (businessManagers.length === 0 && !loading) {
    return (
      <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
        <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-500">
            Nenhum Business Manager encontrado
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            As contas selecionadas não estão vinculadas a um Business Manager. 
            Catálogos são gerenciados a nível de BM.
          </p>
        </div>
      </div>
    );
  }

  // If only one BM, show it as selected (no dropdown needed)
  if (businessManagers.length === 1) {
    const bm = businessManagers[0];
    return (
      <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Building2 className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {bm.business_name}
          </p>
          <p className="text-xs text-muted-foreground">
            {bm.accountCount} conta{bm.accountCount > 1 ? 's' : ''} selecionada{bm.accountCount > 1 ? 's' : ''}
          </p>
        </div>
        <Badge variant="outline" className="text-xs font-mono">
          {bm.business_id}
        </Badge>
      </div>
    );
  }

  // Multiple BMs - show dropdown
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          className="w-full justify-between h-auto py-3"
          disabled={loading}
        >
          {selectedBM ? (
            <div className="flex items-center gap-3">
              <Building2 className="w-4 h-4 text-primary" />
              <div className="text-left">
                <p className="text-sm font-medium">{selectedBM.business_name}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedBM.accountCount} conta{selectedBM.accountCount > 1 ? 's' : ''}
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
            key={bm.business_id}
            onClick={() => onChange(bm.business_id, bm.business_name)}
            className="flex items-center gap-3 py-3"
          >
            <Building2 className={cn(
              "w-4 h-4",
              value === bm.business_id ? "text-primary" : "text-muted-foreground"
            )} />
            <div className="flex-1">
              <p className="text-sm font-medium">{bm.business_name}</p>
              <p className="text-xs text-muted-foreground">
                {bm.accountCount} conta{bm.accountCount > 1 ? 's' : ''} · ID: {bm.business_id}
              </p>
            </div>
            {value === bm.business_id && (
              <Check className="w-4 h-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
