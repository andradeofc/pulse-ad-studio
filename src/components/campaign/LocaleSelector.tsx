import { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, X, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { cn } from '@/lib/utils';
import { useAdLocales, type FacebookLocale } from '@/hooks/useAdLocales';

interface LocaleSelectorProps {
  value: number[];
  onChange: (locales: number[]) => void;
  disabled?: boolean;
}

export function LocaleSelector({ value, onChange, disabled }: LocaleSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { locales: LOCALES, loading } = useAdLocales();

  const filteredLocales = useMemo(() => {
    if (!searchQuery) return LOCALES;
    const query = searchQuery.toLowerCase();
    return LOCALES.filter(locale =>
      locale.name.toLowerCase().includes(query)
    );
  }, [searchQuery, LOCALES]);

  const selectedLocales = useMemo(() => {
    return LOCALES.filter(l => value.includes(l.id));
  }, [value, LOCALES]);

  const toggleLocale = (id: number) => {
    if (value.includes(id)) {
      onChange(value.filter(l => l !== id));
    } else {
      onChange([...value, id]);
    }
  };

  const removeLocale = (id: number) => {
    onChange(value.filter(l => l !== id));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 min-h-[40px]">
        {selectedLocales.map(locale => (
          <Badge key={locale.id} variant="secondary" className="flex items-center gap-1 py-1">
            <span>{locale.name}</span>
            <button 
              onClick={() => removeLocale(locale.id)} 
              className="ml-1 hover:text-destructive"
              disabled={disabled}
            >
              <X className="w-3 h-3" />
            </button>
          </Badge>
        ))}
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
            disabled={disabled || loading}
          >
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-muted-foreground" />
              <span>
                {loading
                  ? 'Carregando idiomas...'
                  : value.length === 0
                    ? 'Selecionar idiomas...'
                    : `${value.length} idioma(s) selecionado(s)`}
              </span>
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[350px] p-0" align="start">
          <Command>
            <CommandInput
              placeholder="Buscar idioma..."
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <CommandList>
              <CommandEmpty>Nenhum idioma encontrado</CommandEmpty>
              <CommandGroup heading="Idiomas">
                {filteredLocales.map(locale => (
                  <CommandItem
                    key={locale.id}
                    value={`${locale.name}`}
                    onSelect={() => toggleLocale(locale.id)}
                  >
                    <div className="flex items-center gap-2 flex-1">
                      <span>{locale.name}</span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        ID: {locale.id}
                      </span>
                    </div>
                    <Check
                      className={cn(
                        'ml-2 h-4 w-4',
                        value.includes(locale.id) ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <p className="text-xs text-muted-foreground">
        IDs de locale são buscados da API do Facebook (targeting.locales)
      </p>
    </div>
  );
}

// Re-export for backward compatibility
export { useAdLocales, type FacebookLocale };
export { getLocaleNameById } from '@/hooks/useAdLocales';
