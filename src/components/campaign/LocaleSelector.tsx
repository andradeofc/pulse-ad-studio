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

// Facebook API Locale IDs - these are the exact IDs from Facebook's API
// Reference: https://developers.facebook.com/docs/marketing-api/audiences/reference/advanced-targeting/#locales
const LOCALES = [
  { id: 24, name: 'Português (Brasil)', code: 'pt_BR' },
  { id: 25, name: 'Português (Portugal)', code: 'pt_PT' },
  { id: 6, name: 'English (US)', code: 'en_US' },
  { id: 7, name: 'English (UK)', code: 'en_GB' },
  { id: 5, name: 'Español', code: 'es_ES' },
  { id: 8, name: 'Español (México)', code: 'es_MX' },
  { id: 9, name: 'Español (Argentina)', code: 'es_AR' },
  { id: 3, name: 'Deutsch', code: 'de_DE' },
  { id: 4, name: 'Français', code: 'fr_FR' },
  { id: 10, name: 'Italiano', code: 'it_IT' },
  { id: 11, name: 'Nederlands', code: 'nl_NL' },
  { id: 12, name: 'Polski', code: 'pl_PL' },
  { id: 13, name: 'Русский', code: 'ru_RU' },
  { id: 14, name: '日本語', code: 'ja_JP' },
  { id: 15, name: '中文(简体)', code: 'zh_CN' },
  { id: 16, name: '中文(繁體)', code: 'zh_TW' },
  { id: 17, name: '한국어', code: 'ko_KR' },
  { id: 18, name: 'العربية', code: 'ar_AR' },
  { id: 19, name: 'हिन्दी', code: 'hi_IN' },
  { id: 20, name: 'Türkçe', code: 'tr_TR' },
];

interface LocaleSelectorProps {
  value: number[];
  onChange: (locales: number[]) => void;
  disabled?: boolean;
}

export function LocaleSelector({ value, onChange, disabled }: LocaleSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLocales = useMemo(() => {
    if (!searchQuery) return LOCALES;
    const query = searchQuery.toLowerCase();
    return LOCALES.filter(locale =>
      locale.name.toLowerCase().includes(query) ||
      locale.code.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  const selectedLocales = useMemo(() => {
    return LOCALES.filter(l => value.includes(l.id));
  }, [value]);

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
            disabled={disabled}
          >
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-muted-foreground" />
              <span>
                {value.length === 0
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
                    value={`${locale.name} ${locale.code}`}
                    onSelect={() => toggleLocale(locale.id)}
                  >
                    <div className="flex items-center gap-2 flex-1">
                      <span>{locale.name}</span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {locale.code}
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
        IDs de locale são enviados para a API do Facebook (targeting.locales)
      </p>
    </div>
  );
}

// Get locale display info by ID
export function getLocaleById(id: number) {
  return LOCALES.find(l => l.id === id);
}

export { LOCALES };
