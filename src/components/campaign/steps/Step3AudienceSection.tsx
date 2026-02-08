import { Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCampaignStore } from '@/stores/campaignStore';
import { GeoLocationSelector } from '../GeoLocationSelector';
import { LocaleSelector } from '../LocaleSelector';

export function Step3AudienceSection() {
  const { config, updateConfig } = useCampaignStore();

  // Helper to get gender display
  const getGenderDisplay = () => {
    if (config.genders.length === 0) return 'Todos';
    if (config.genders.includes(1) && config.genders.includes(2)) return 'Todos';
    if (config.genders.includes(1)) return 'Masculino';
    if (config.genders.includes(2)) return 'Feminino';
    return 'Todos';
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Público-Alvo
        </h3>
        <Badge variant="outline" className="text-xs">API Facebook</Badge>
      </div>

      {/* Advantage+ Toggle */}
      <div className="flex items-center justify-between p-4 bg-primary/5 rounded-lg border border-primary/20">
        <div>
          <Label className="text-foreground flex items-center gap-2">
            Advantage+
            <Badge variant="secondary" className="text-xs">Recomendado</Badge>
          </Label>
          <p className="text-sm text-muted-foreground">
            A I.A. do Meta otimizará seu público automaticamente
          </p>
        </div>
        <Switch
          checked={config.advantagePlus}
          onCheckedChange={(checked) => updateConfig({ advantagePlus: checked })}
        />
      </div>

      {/* Geo Locations - API compatible */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          Localizações
          <Badge variant="outline" className="text-xs font-mono">geo_locations.countries</Badge>
        </Label>
        <GeoLocationSelector
          value={config.geoLocations.countries}
          onChange={(countries) => updateConfig({ 
            geoLocations: { ...config.geoLocations, countries } 
          })}
        />
      </div>

      {/* Age Range */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            Idade Mínima
            <Badge variant="outline" className="text-xs font-mono">age_min</Badge>
          </Label>
          <Select
            value={config.ageMin.toString()}
            onValueChange={(value) => updateConfig({ ageMin: parseInt(value) })}
          >
            <SelectTrigger className="bg-secondary/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 48 }, (_, i) => i + 18).map((age) => (
                <SelectItem key={age} value={age.toString()}>{age}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            Idade Máxima
            <Badge variant="outline" className="text-xs font-mono">age_max</Badge>
          </Label>
          <Select
            value={config.ageMax.toString()}
            onValueChange={(value) => updateConfig({ ageMax: parseInt(value) })}
            disabled={config.advantagePlus}
          >
            <SelectTrigger className="bg-secondary/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 48 }, (_, i) => i + 18).map((age) => (
                <SelectItem key={age} value={age.toString()}>{age}{age === 65 ? '+' : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {config.advantagePlus && (
            <p className="text-xs text-muted-foreground">Apenas idade mínima com Advantage+</p>
          )}
        </div>
      </div>

      {/* Gender - API compatible */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Users className="w-4 h-4" />
          Gênero
          <Badge variant="outline" className="text-xs font-mono">genders</Badge>
        </Label>
        <div className="flex gap-2">
          {([
            { value: [], label: 'Todos' },
            { value: [1], label: 'Masculino' },
            { value: [2], label: 'Feminino' },
          ]).map((option) => (
            <Button
              key={option.label}
              variant={JSON.stringify(config.genders) === JSON.stringify(option.value) ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateConfig({ genders: option.value })}
              className={JSON.stringify(config.genders) === JSON.stringify(option.value) ? 'glow-primary' : ''}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          API: [] = Todos, [1] = Masculino, [2] = Feminino
        </p>
      </div>

      {/* Locales - API compatible */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          Idiomas
          <Badge variant="outline" className="text-xs font-mono">locales</Badge>
        </Label>
        <LocaleSelector
          value={config.locales}
          onChange={(locales) => updateConfig({ locales })}
        />
      </div>

      {/* Audience Summary */}
      <div className="p-3 bg-secondary/30 rounded-lg text-sm text-muted-foreground">
        📍 {config.geoLocations.countries.length} país(es) · 
        👤 {config.ageMin}-{config.ageMax}+ · 
        🔲 {getGenderDisplay()} · 
        🌐 {config.locales.length} idioma(s)
      </div>

      {/* API Preview */}
      <div className="p-4 bg-secondary/50 rounded-lg border border-border">
        <Label className="text-xs text-muted-foreground mb-2 block">Preview da Targeting Spec (API)</Label>
        <pre className="text-xs font-mono text-foreground overflow-x-auto whitespace-pre-wrap">
{JSON.stringify({
  geo_locations: config.geoLocations,
  age_min: config.ageMin,
  age_max: config.advantagePlus ? undefined : config.ageMax,
  genders: config.genders.length > 0 ? config.genders : undefined,
  locales: config.locales.length > 0 ? config.locales : undefined,
  targeting_optimization: config.advantagePlus ? 'expansion_all' : undefined,
}, null, 2)}
        </pre>
      </div>
    </section>
  );
}
