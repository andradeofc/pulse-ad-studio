import { useState, useEffect, useMemo } from 'react';
import { Search, Check, Building2, User, Loader2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface AdAccount {
  id: string;
  account_id: string;
  name: string;
  nickname: string | null;
  currency: string | null;
  timezone: string | null;
  status: string | null;
  business_id: string | null;
  business_name: string | null;
  profile_id: string;
}

interface AdAccountSelectorProps {
  multiSelect: boolean;
  selectedAccounts: string[];
  onSelectionChange: (accountIds: string[]) => void;
}

export function AdAccountSelector({
  multiSelect,
  selectedAccounts,
  onSelectionChange,
}: AdAccountSelectorProps) {
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('facebook_ad_accounts')
        .select('*, facebook_profiles!inner(status)')
        .eq('status', 'active')
        .neq('facebook_profiles.status', 'disconnected')
        .order('name');

      if (error) throw error;
      setAccounts(data || []);
    } catch (error) {
      console.error('Error loading ad accounts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredAccounts = useMemo(() => {
    if (!searchQuery.trim()) return accounts;
    
    const query = searchQuery.toLowerCase();
    return accounts.filter(
      (acc) =>
        acc.name.toLowerCase().includes(query) ||
        acc.account_id.toLowerCase().includes(query) ||
        acc.business_name?.toLowerCase().includes(query) ||
        acc.nickname?.toLowerCase().includes(query)
    );
  }, [accounts, searchQuery]);

  const selectedAccountsData = useMemo(() => {
    return accounts.filter((acc) => selectedAccounts.includes(acc.id));
  }, [accounts, selectedAccounts]);

  const toggleAccount = (accountId: string) => {
    if (multiSelect) {
      if (selectedAccounts.includes(accountId)) {
        onSelectionChange(selectedAccounts.filter((id) => id !== accountId));
      } else {
        onSelectionChange([...selectedAccounts, accountId]);
      }
    } else {
      onSelectionChange([accountId]);
      setOpen(false);
    }
  };

  const removeAccount = (accountId: string) => {
    onSelectionChange(selectedAccounts.filter((id) => id !== accountId));
  };

  const getDisplayText = () => {
    if (selectedAccounts.length === 0) {
      return 'Selecione uma conta...';
    }
    if (!multiSelect && selectedAccountsData.length > 0) {
      const acc = selectedAccountsData[0];
      return acc.nickname ? `${acc.nickname} — ${acc.name}` : acc.name;
    }
    return `${selectedAccounts.length} conta(s) selecionada(s)`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-3 bg-secondary/50 rounded-lg border border-border">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Carregando contas...</span>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="p-4 bg-secondary/50 rounded-lg border border-border text-center">
        <p className="text-sm text-muted-foreground">
          Nenhuma conta de anúncio sincronizada.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Vá em "Contas de Anúncio" e sincronize suas contas primeiro.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between bg-secondary/50 hover:bg-secondary/70 h-auto min-h-10 py-2"
          >
            <span className="truncate">{getDisplayText()}</span>
            <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0 bg-popover border-border" align="start">
          <Command className="bg-transparent" shouldFilter={false}>
            <CommandInput 
              placeholder="Buscar pelo nome, ID ou BM..." 
              value={searchQuery}
              onValueChange={setSearchQuery}
              className="border-0"
            />
            <CommandList>
              <CommandEmpty>
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Nenhuma conta encontrada.
                </div>
              </CommandEmpty>
              <CommandGroup>
                <ScrollArea className="h-[300px]">
                  {filteredAccounts.map((account) => {
                    const isSelected = selectedAccounts.includes(account.id);
                    return (
                      <CommandItem
                        key={account.id}
                        value={`${account.name} ${account.account_id} ${account.business_name || ''}`}
                        onSelect={() => toggleAccount(account.id)}
                        className={cn(
                          "flex items-center gap-3 px-3 py-3 cursor-pointer",
                          isSelected && "bg-primary/10"
                        )}
                      >
                        <div className={cn(
                          "w-5 h-5 rounded border flex items-center justify-center flex-shrink-0",
                          isSelected
                            ? "bg-primary border-primary"
                            : "border-muted-foreground/30"
                        )}>
                          {isSelected && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground truncate">
                              {account.nickname ? `${account.nickname} — ${account.name}` : account.name}
                            </span>
                            <Badge variant="outline" className="text-xs flex-shrink-0">
                              {account.currency || 'N/A'}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground">
                              #{account.account_id.replace('act_', '').slice(-8)}
                            </span>
                            <span className="text-xs text-muted-foreground">·</span>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              {account.business_name ? (
                                <>
                                  <Building2 className="w-3 h-3" />
                                  <span className="truncate max-w-[150px]">{account.business_name}</span>
                                </>
                              ) : (
                                <>
                                  <User className="w-3 h-3" />
                                  <span>Pessoal</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </CommandItem>
                    );
                  })}
                </ScrollArea>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Selected accounts badges (multi-select mode) */}
      {multiSelect && selectedAccountsData.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedAccountsData.map((account) => (
            <Badge
              key={account.id}
              variant="secondary"
              className="flex items-center gap-1.5 py-1.5 px-3 bg-primary/10 text-primary border-primary/20"
            >
              <span className="truncate max-w-[200px]">{account.name}</span>
              <button
                onClick={() => removeAccount(account.id)}
                className="ml-1 hover:bg-primary/20 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Account count info */}
      <p className="text-xs text-muted-foreground">
        {accounts.length} conta(s) disponível(is) · {selectedAccounts.length} selecionada(s)
      </p>
    </div>
  );
}
