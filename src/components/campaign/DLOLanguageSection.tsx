import { useState, useEffect } from 'react';
import { Globe, Plus, Trash2, Image, Video, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCampaignStore, type DLOLanguage } from '@/stores/campaignStore';
import { LOCALES } from '@/components/campaign/LocaleSelector';
import { fetchCreatives, type CreativeMetadata } from '@/services/creativesService';

const MAX_LANGUAGES = 48;

function createEmptyLanguage(): DLOLanguage {
  return {
    locale: 0,
    label: '',
    useDefaultMedia: true,
    websiteUrl: '',
    headline: '',
    primaryText: '',
    description: '',
  };
}

interface MediaOption {
  id: string;
  name: string;
  type: 'video' | 'image';
  url: string;
  thumbnailUrl: string;
}

interface LanguageCardProps {
  language: DLOLanguage;
  isDefault: boolean;
  index: number;
  usedLocales: number[];
  allCreatives: MediaOption[];
  onUpdate: (lang: DLOLanguage) => void;
  onRemove?: () => void;
}

function LanguageCard({ language, isDefault, index, usedLocales, allCreatives, onUpdate, onRemove }: LanguageCardProps) {
  const [expanded, setExpanded] = useState(isDefault || index === 0);

  const availableLocales = LOCALES.filter(
    l => l.id === language.locale || !usedLocales.includes(l.id)
  );

  const localeName = LOCALES.find(l => l.id === language.locale)?.name || 'Selecionar idioma';

  return (
    <Card className={`border ${isDefault ? 'border-primary/40 bg-primary/5' : 'border-border'}`}>
      <CardHeader className="p-4 pb-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">
              {isDefault ? 'Idioma Padrão' : `Idioma ${index + 1}`}
            </CardTitle>
            {language.locale > 0 && (
              <Badge variant="secondary" className="text-xs">{localeName}</Badge>
            )}
            {isDefault && (
              <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">Default</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isDefault && onRemove && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onRemove(); }}>
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </Button>
            )}
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="p-4 pt-2 space-y-4">
          {/* Locale Selector */}
          <div className="space-y-2">
            <Label className="text-xs">Idioma (Locale)</Label>
            <Select
              value={language.locale > 0 ? String(language.locale) : ''}
              onValueChange={(v) => {
                const loc = LOCALES.find(l => l.id === Number(v));
                onUpdate({ ...language, locale: Number(v), label: loc?.name || '' });
              }}
            >
              <SelectTrigger className="bg-secondary/50">
                <SelectValue placeholder="Selecionar idioma..." />
              </SelectTrigger>
              <SelectContent>
                {availableLocales.map(loc => (
                  <SelectItem key={loc.id} value={String(loc.id)}>
                    <div className="flex items-center gap-2">
                      <span>{loc.name}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{loc.code}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Media selector (from full library) - always visible */}
          <div className="space-y-2">
            <Label className="text-xs">Mídia (da biblioteca)</Label>
            {allCreatives.length > 0 ? (
              <Select
                value={language.mediaId || ''}
                onValueChange={(v) => {
                  const cr = allCreatives.find(c => c.id === v);
                  if (cr) {
                    onUpdate({
                      ...language,
                      mediaId: cr.id,
                      mediaType: cr.type,
                      mediaUrl: cr.url,
                      mediaThumbnailUrl: cr.thumbnailUrl,
                    });
                  }
                }}
              >
                <SelectTrigger className="bg-secondary/50">
                  <SelectValue placeholder={isDefault ? 'Selecionar criativo...' : 'Vazio = usar mídia do idioma padrão'} />
                </SelectTrigger>
                <SelectContent>
                  {allCreatives.map(cr => (
                    <SelectItem key={cr.id} value={cr.id}>
                      <div className="flex items-center gap-2">
                        {cr.type === 'video' ? <Video className="w-3.5 h-3.5" /> : <Image className="w-3.5 h-3.5" />}
                        <span className="truncate max-w-[200px]">{cr.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-xs text-muted-foreground">Nenhum criativo na biblioteca</p>
            )}
            {language.mediaThumbnailUrl && (
              <div className="w-16 h-16 rounded bg-muted overflow-hidden">
                <img src={language.mediaThumbnailUrl} alt="" className="w-full h-full object-cover" />
              </div>
            )}
          </div>

          {/* Text fields */}
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Texto Principal {isDefault && <span className="text-destructive">*</span>}</Label>
              <Textarea
                value={language.primaryText || ''}
                onChange={(e) => onUpdate({ ...language, primaryText: e.target.value })}
                placeholder={!isDefault ? 'Vazio = usar texto do idioma padrão' : 'Texto principal do anúncio...'}
                className="bg-secondary/50 min-h-[60px] resize-none text-sm"
                maxLength={500}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Título (Headline) {isDefault && <span className="text-destructive">*</span>}</Label>
              <Input
                value={language.headline || ''}
                onChange={(e) => onUpdate({ ...language, headline: e.target.value })}
                placeholder={!isDefault ? 'Vazio = usar título do idioma padrão' : 'Título do anúncio...'}
                className="bg-secondary/50 text-sm"
                maxLength={40}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Descrição</Label>
              <Input
                value={language.description || ''}
                onChange={(e) => onUpdate({ ...language, description: e.target.value })}
                placeholder={!isDefault ? 'Vazio = usar descrição do idioma padrão' : 'Descrição opcional...'}
                className="bg-secondary/50 text-sm"
                maxLength={90}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">URL do Site {isDefault && <span className="text-destructive">*</span>}</Label>
              <Input
                type="url"
                value={language.websiteUrl || ''}
                onChange={(e) => onUpdate({ ...language, websiteUrl: e.target.value })}
                placeholder={!isDefault ? 'Vazio = usar URL do idioma padrão' : 'https://seusite.com'}
                className="bg-secondary/50 text-sm"
              />
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export function DLOLanguageSection() {
  const { config, updateConfig } = useCampaignStore();
  const languageConfig = config.languageConfig;
  const [allCreatives, setAllCreatives] = useState<MediaOption[]>([]);

  // Fetch all creatives from the library (not just Step 1 selection)
  useEffect(() => {
    if (!languageConfig.enabled) return;
    
    fetchCreatives().then(creatives => {
      setAllCreatives(
        creatives.map((c: CreativeMetadata) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          url: c.url,
          thumbnailUrl: c.thumbnail_url || '',
        }))
      );
    }).catch(err => {
      console.error('[DLO] Failed to fetch creatives:', err);
    });
  }, [languageConfig.enabled]);

  const handleToggle = (enabled: boolean) => {
    updateConfig({
      languageConfig: { ...languageConfig, enabled },
    });
  };

  const updateDefaultLanguage = (lang: DLOLanguage) => {
    updateConfig({
      languageConfig: { ...languageConfig, defaultLanguage: lang },
    });
  };

  const updateSecondaryLanguage = (index: number, lang: DLOLanguage) => {
    const updated = [...languageConfig.secondaryLanguages];
    updated[index] = lang;
    updateConfig({
      languageConfig: { ...languageConfig, secondaryLanguages: updated },
    });
  };

  const addSecondaryLanguage = () => {
    const total = 1 + languageConfig.secondaryLanguages.length;
    if (total >= MAX_LANGUAGES) return;
    updateConfig({
      languageConfig: {
        ...languageConfig,
        secondaryLanguages: [...languageConfig.secondaryLanguages, createEmptyLanguage()],
      },
    });
  };

  const removeSecondaryLanguage = (index: number) => {
    const updated = languageConfig.secondaryLanguages.filter((_, i) => i !== index);
    updateConfig({
      languageConfig: { ...languageConfig, secondaryLanguages: updated },
    });
  };

  // All used locales (to prevent duplicates)
  const usedLocales = [
    languageConfig.defaultLanguage.locale,
    ...languageConfig.secondaryLanguages.map(l => l.locale),
  ].filter(l => l > 0);

  const totalLanguages = 1 + languageConfig.secondaryLanguages.length;

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Idiomas (DLO)
        </h3>
        <Badge variant="outline" className="text-xs font-mono">
          asset_feed_spec
        </Badge>
      </div>

      <Card className={languageConfig.enabled ? 'border-primary/50 bg-primary/5' : 'border-border'}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <Globe className="w-5 h-5 text-primary" />
              </div>
              <div>
                <Label className="text-foreground">Ativar Idiomas (DLO)</Label>
                <p className="text-sm text-muted-foreground">
                  Dynamic Language Optimization — conteúdo por idioma
                </p>
              </div>
            </div>
            <Switch checked={languageConfig.enabled} onCheckedChange={handleToggle} />
          </div>
        </CardContent>
      </Card>

      {languageConfig.enabled && (
        <div className="space-y-4">
          <Alert className="border-ads-warning/30 bg-ads-warning/10">
            <AlertTriangle className="h-4 w-4 text-ads-warning" />
            <AlertDescription className="text-ads-warning text-sm">
              Com DLO ativado, os campos de conteúdo global (texto, título, URL) são substituídos pela configuração por idioma abaixo. A mídia é selecionada diretamente da biblioteca. O adset será marcado com <code className="px-1 py-0.5 bg-ads-warning/20 rounded text-xs">is_dynamic_creative: true</code>.
            </AlertDescription>
          </Alert>

          {/* Default Language */}
          <LanguageCard
            language={languageConfig.defaultLanguage}
            isDefault
            index={0}
            usedLocales={usedLocales}
            allCreatives={allCreatives}
            onUpdate={updateDefaultLanguage}
          />

          {/* Secondary Languages */}
          {languageConfig.secondaryLanguages.map((lang, i) => (
            <LanguageCard
              key={i}
              language={lang}
              isDefault={false}
              index={i + 1}
              usedLocales={usedLocales}
              allCreatives={allCreatives}
              onUpdate={(l) => updateSecondaryLanguage(i, l)}
              onRemove={() => removeSecondaryLanguage(i)}
            />
          ))}

          {/* Add Language Button */}
          <Button
            variant="outline"
            className="w-full border-dashed"
            onClick={addSecondaryLanguage}
            disabled={totalLanguages >= MAX_LANGUAGES}
          >
            <Plus className="w-4 h-4 mr-2" />
            Adicionar Idioma ({totalLanguages}/{MAX_LANGUAGES})
          </Button>
        </div>
      )}
    </section>
  );
}