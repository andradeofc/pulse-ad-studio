import { useState, useMemo, useEffect } from 'react';
import { Check, ChevronsUpDown, X, RefreshCw, Search, MapPin } from 'lucide-react';
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

// Facebook API supported countries with ISO codes
const COUNTRIES = [
  { code: 'BR', name: 'Brasil', flag: '🇧🇷' },
  { code: 'US', name: 'Estados Unidos', flag: '🇺🇸' },
  { code: 'PT', name: 'Portugal', flag: '🇵🇹' },
  { code: 'ES', name: 'Espanha', flag: '🇪🇸' },
  { code: 'MX', name: 'México', flag: '🇲🇽' },
  { code: 'AR', name: 'Argentina', flag: '🇦🇷' },
  { code: 'CO', name: 'Colômbia', flag: '🇨🇴' },
  { code: 'CL', name: 'Chile', flag: '🇨🇱' },
  { code: 'PE', name: 'Peru', flag: '🇵🇪' },
  { code: 'GB', name: 'Reino Unido', flag: '🇬🇧' },
  { code: 'DE', name: 'Alemanha', flag: '🇩🇪' },
  { code: 'FR', name: 'França', flag: '🇫🇷' },
  { code: 'IT', name: 'Itália', flag: '🇮🇹' },
  { code: 'CA', name: 'Canadá', flag: '🇨🇦' },
  { code: 'AU', name: 'Austrália', flag: '🇦🇺' },
  { code: 'JP', name: 'Japão', flag: '🇯🇵' },
  { code: 'IN', name: 'Índia', flag: '🇮🇳' },
  { code: 'AO', name: 'Angola', flag: '🇦🇴' },
  { code: 'MZ', name: 'Moçambique', flag: '🇲🇿' },
  { code: 'CV', name: 'Cabo Verde', flag: '🇨🇻' },
];

interface GeoLocationSelectorProps {
  value: string[];
  onChange: (countries: string[]) => void;
  disabled?: boolean;
}

export function GeoLocationSelector({ value, onChange, disabled }: GeoLocationSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCountries = useMemo(() => {
    if (!searchQuery) return COUNTRIES;
    const query = searchQuery.toLowerCase();
    return COUNTRIES.filter(country =>
      country.name.toLowerCase().includes(query) ||
      country.code.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  const selectedCountries = useMemo(() => {
    return COUNTRIES.filter(c => value.includes(c.code));
  }, [value]);

  const toggleCountry = (code: string) => {
    if (value.includes(code)) {
      onChange(value.filter(c => c !== code));
    } else {
      onChange([...value, code]);
    }
  };

  const removeCountry = (code: string) => {
    onChange(value.filter(c => c !== code));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 min-h-[40px]">
        {selectedCountries.map(country => (
          <Badge key={country.code} variant="secondary" className="flex items-center gap-1 py-1">
            <span>{country.flag}</span>
            <span>{country.name}</span>
            <button 
              onClick={() => removeCountry(country.code)} 
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
              <MapPin className="w-4 h-4 text-muted-foreground" />
              <span>
                {value.length === 0
                  ? 'Selecionar países...'
                  : `${value.length} país(es) selecionado(s)`}
              </span>
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[350px] p-0" align="start">
          <Command>
            <CommandInput
              placeholder="Buscar país..."
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <CommandList>
              <CommandEmpty>Nenhum país encontrado</CommandEmpty>
              <CommandGroup heading="Países">
                {filteredCountries.map(country => (
                  <CommandItem
                    key={country.code}
                    value={`${country.name} ${country.code}`}
                    onSelect={() => toggleCountry(country.code)}
                  >
                    <div className="flex items-center gap-2 flex-1">
                      <span>{country.flag}</span>
                      <span>{country.name}</span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {country.code}
                      </span>
                    </div>
                    <Check
                      className={cn(
                        'ml-2 h-4 w-4',
                        value.includes(country.code) ? 'opacity-100' : 'opacity-0'
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
        Os códigos ISO são enviados diretamente para a API do Facebook (geo_locations.countries)
      </p>
    </div>
  );
}

// Get country display info by code
export function getCountryByCode(code: string) {
  return COUNTRIES.find(c => c.code === code);
}

export { COUNTRIES };
