import { useState } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, Plus, X, MapPin, Globe, Users, Edit3, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useCampaignStore } from '@/stores/campaignStore';
import { cn } from '@/lib/utils';
import { NamingModal } from '../NamingModal';

const distributionOptions = [
  {
    value: 'campaign',
    title: 'Campanha',
    description: 'Cada criativo gera sua própria campanha',
    hint: 'Criativos ÷ Campanhas',
  },
  {
    value: 'adset',
    title: 'Conjunto',
    description: 'Todos criativos em 1 campanha, divididos entre conjuntos',
    hint: 'Criativos ÷ Conjuntos',
  },
  {
    value: 'ad',
    title: 'Anúncio',
    description: 'Todos criativos como anúncios no mesmo conjunto',
    hint: 'Criativos = Anúncios por conjunto',
  },
];

// Mock pixels
const mockPixels = [
  { id: '1', name: 'Pixel Principal', language: 'PT-BR', bm: 'BM 01', date: '2024-01-15' },
  { id: '2', name: 'Pixel Conversões', language: 'EN', bm: 'BM 02', date: '2024-01-20' },
];

export function Step3Adsets() {
  const { config, updateConfig, getTotalCampaigns, getTotalAdsets, getTotalAds } = useCampaignStore();
  const creativesCount = config.selectedCreatives.length || 1;

  // Get the effective values based on distribution and creative count
  const getEffectiveValue = (field: 'campaigns' | 'adsets' | 'ads') => {
    switch (field) {
      case 'campaigns':
        if (config.distribution === 'campaign') {
          return Math.max(creativesCount, config.campaignsPerCreative);
        }
        return config.campaignsPerCreative;
      case 'adsets':
        if (config.distribution === 'adset') {
          return Math.max(creativesCount, config.adsetsPerCampaign);
        }
        return config.adsetsPerCampaign;
      case 'ads':
        if (config.distribution === 'ad') {
          return Math.max(creativesCount, config.adsPerAdset);
        }
        return config.adsPerAdset;
      default:
        return 1;
    }
  };

  const [adsetNamingModalOpen, setAdsetNamingModalOpen] = useState(false);

  const isFieldAffected = (field: 'campaigns' | 'adsets' | 'ads') => {
    if (field === 'campaigns' && config.distribution === 'campaign') return true;
    if (field === 'adsets' && config.distribution === 'adset') return true;
    if (field === 'ads' && config.distribution === 'ad') return true;
    return false;
  };

  const removeLocation = (location: string) => {
    updateConfig({
      locations: config.locations.filter((l) => l !== location),
    });
  };

  const removeLanguage = (language: string) => {
    updateConfig({
      languages: config.languages.filter((l) => l !== language),
    });
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-2">Configuração da Estrutura</h2>
        <p className="text-muted-foreground">
          Defina quantas Campanhas, Conjuntos e Anúncios criar
        </p>
      </div>

      {/* Distribution Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Distribuição dos Criativos
          </h3>
          <Badge variant="secondary">{creativesCount} criativos</Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {distributionOptions.map((option) => (
            <motion.div key={option.value} whileHover={{ scale: 1.02 }}>
              <Card
                className={cn(
                  "cursor-pointer transition-all h-full",
                  config.distribution === option.value
                    ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                    : "border-border hover:border-primary/50"
                )}
                onClick={() => updateConfig({ distribution: option.value as 'campaign' | 'adset' | 'ad' })}
              >
                <CardContent className="p-4">
                  <p className="font-medium text-foreground text-sm mb-1">{option.title}</p>
                  <p className="text-xs text-muted-foreground">{option.description}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Quantities Section */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Quantidades
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Campaigns */}
          <div className={cn(
            "space-y-2 p-3 rounded-lg border",
            isFieldAffected('campaigns') 
              ? "bg-primary/5 border-primary/30" 
              : "bg-secondary/30 border-border"
          )}>
            <Label className="flex items-center gap-2">
              Campanhas
              {isFieldAffected('campaigns') && (
                <Badge variant="secondary" className="text-xs">
                  Mín: {creativesCount}
                </Badge>
              )}
            </Label>
            <Input
              type="number"
              value={config.campaignsPerCreative}
              onChange={(e) => updateConfig({ campaignsPerCreative: parseInt(e.target.value) || 1 })}
              min={isFieldAffected('campaigns') ? creativesCount : 1}
              className="bg-background"
            />
            {isFieldAffected('campaigns') && config.campaignsPerCreative < creativesCount && (
              <p className="text-xs text-primary">
                Ajustado para {getEffectiveValue('campaigns')} (1 por criativo)
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Total: {getTotalCampaigns()} campanhas
            </p>
          </div>

          {/* Ad Sets */}
          <div className={cn(
            "space-y-2 p-3 rounded-lg border",
            isFieldAffected('adsets') 
              ? "bg-primary/5 border-primary/30" 
              : "bg-secondary/30 border-border"
          )}>
            <Label className="flex items-center gap-2">
              Conjuntos/Campanha
              {isFieldAffected('adsets') && (
                <Badge variant="secondary" className="text-xs">
                  Mín: {creativesCount}
                </Badge>
              )}
            </Label>
            <Input
              type="number"
              value={config.adsetsPerCampaign}
              onChange={(e) => updateConfig({ adsetsPerCampaign: parseInt(e.target.value) || 1 })}
              min={isFieldAffected('adsets') ? creativesCount : 1}
              className="bg-background"
            />
            {isFieldAffected('adsets') && config.adsetsPerCampaign < creativesCount && (
              <p className="text-xs text-primary">
                Ajustado para {getEffectiveValue('adsets')} (1 por criativo)
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Total: {getTotalAdsets()} conjuntos
            </p>
          </div>

          {/* Ads */}
          <div className={cn(
            "space-y-2 p-3 rounded-lg border",
            isFieldAffected('ads') 
              ? "bg-primary/5 border-primary/30" 
              : "bg-secondary/30 border-border"
          )}>
            <Label className="flex items-center gap-2">
              Anúncios/Conjunto
              {isFieldAffected('ads') && (
                <Badge variant="secondary" className="text-xs">
                  Mín: {creativesCount}
                </Badge>
              )}
            </Label>
            <Input
              type="number"
              value={config.adsPerAdset}
              onChange={(e) => updateConfig({ adsPerAdset: parseInt(e.target.value) || 1 })}
              min={isFieldAffected('ads') ? creativesCount : 1}
              className="bg-background"
            />
            {isFieldAffected('ads') && config.adsPerAdset < creativesCount && (
              <p className="text-xs text-primary">
                Ajustado para {getEffectiveValue('ads')} (1 por criativo)
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Total: {getTotalAds()} anúncios
            </p>
          </div>
        </div>

        {/* Summary */}
        <div className="p-4 bg-secondary/30 rounded-lg border border-border space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Estrutura Final</span>
            <Badge variant="outline" className="font-mono">
              {getTotalCampaigns()}-{getTotalAdsets() / getTotalCampaigns()}-{getTotalAds() / getTotalAdsets()}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {getTotalCampaigns()} campanhas × {Math.round(getTotalAdsets() / getTotalCampaigns())} conjuntos × {Math.round(getTotalAds() / getTotalAdsets())} anúncios = <strong>{getTotalAds()} anúncios</strong>
            {getTotalAds() > 250 && (
              <span className="text-destructive ml-2">⚠️ Limite excedido (máx: 250)</span>
            )}
          </p>
        </div>
      </section>

      {/* Adset Budget (if ABO) */}
      {!config.useCBO && (
        <section className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Orçamento por Conjunto
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Orçamento/Conjunto (R$)</Label>
              <Input
                type="number"
                value={config.adsetBudget}
                onChange={(e) => updateConfig({ adsetBudget: parseFloat(e.target.value) || 0 })}
                min={6}
                className="bg-secondary/50"
              />
            </div>
            <div className="space-y-2">
              <Label>Período</Label>
              <Select
                value={config.adsetBudgetPeriod}
                onValueChange={(value) => updateConfig({ adsetBudgetPeriod: value as 'daily' | 'lifetime' })}
              >
                <SelectTrigger className="bg-secondary/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Diário</SelectItem>
                  <SelectItem value="lifetime">Vitalício</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg border border-border">
            <div>
              <Label className="text-foreground">Compartilhar 20% entre conjuntos</Label>
              <p className="text-sm text-muted-foreground">
                Distribui parte do orçamento entre os melhores performers
              </p>
            </div>
            <Switch
              checked={config.shareAdsetBudget}
              onCheckedChange={(checked) => updateConfig({ shareAdsetBudget: checked })}
            />
          </div>
        </section>
      )}

      {/* Adset Name */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Nome do Conjunto
        </h3>

        <div className="space-y-2">
          <div className="flex gap-2">
            <div 
              className="flex-1 relative cursor-pointer group"
              onClick={() => setAdsetNamingModalOpen(true)}
            >
              <Input
                value={config.adsetName}
                readOnly
                placeholder="Clique para configurar nomenclatura..."
                className="bg-secondary/50 font-mono text-sm cursor-pointer pr-10 hover:border-primary/50 transition-colors"
              />
              <Edit3 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <Button variant="outline" onClick={() => setAdsetNamingModalOpen(true)}>
              <Sparkles className="w-4 h-4 mr-2" />
              Configurar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Clique no campo ou no botão para abrir o editor de nomenclatura com variáveis dinâmicas
          </p>
        </div>
      </section>

      {/* Adset Naming Modal */}
      <NamingModal
        open={adsetNamingModalOpen}
        onOpenChange={setAdsetNamingModalOpen}
        context="adset"
        value={config.adsetName}
        onApply={(template) => updateConfig({ adsetName: template })}
      />

      {/* Pixel Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Pixel de Conversão
          </h3>
          <Badge variant="destructive" className="text-xs">Obrigatório</Badge>
        </div>

        <div className="flex gap-2">
          <Select
            value={config.pixelId}
            onValueChange={(value) => updateConfig({ pixelId: value })}
          >
            <SelectTrigger className="bg-secondary/50 flex-1">
              <SelectValue placeholder="Selecione um pixel" />
            </SelectTrigger>
            <SelectContent>
              {mockPixels.map((pixel) => (
                <SelectItem key={pixel.id} value={pixel.id}>
                  <div className="flex items-center gap-2">
                    <span>{pixel.name}</span>
                    <span className="text-muted-foreground">|</span>
                    <span className="text-muted-foreground">{pixel.language}</span>
                    <span className="text-muted-foreground">|</span>
                    <span className="text-muted-foreground">{pixel.bm}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon">
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </section>

      {/* Audience Section */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Público-Alvo
        </h3>

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

        {/* Locations */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            Localizações
          </Label>
          <div className="flex flex-wrap gap-2 p-3 bg-secondary/50 rounded-lg border border-border min-h-[48px]">
            {config.locations.map((location) => (
              <Badge key={location} variant="secondary" className="flex items-center gap-1">
                🇧🇷 {location}
                <button onClick={() => removeLocation(location)} className="ml-1 hover:text-destructive">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
            <Button variant="ghost" size="sm" className="h-6 text-xs text-primary">
              <Plus className="w-3 h-3 mr-1" />
              Adicionar
            </Button>
          </div>
        </div>

        {/* Age Range */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Idade Mínima</Label>
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
            <Label>Idade Máxima</Label>
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

        {/* Gender */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Gênero
          </Label>
          <div className="flex gap-2">
            {(['all', 'male', 'female'] as const).map((gender) => (
              <Button
                key={gender}
                variant={config.gender === gender ? 'default' : 'outline'}
                size="sm"
                onClick={() => updateConfig({ gender })}
                className={config.gender === gender ? 'glow-primary' : ''}
              >
                {gender === 'all' ? 'Todos' : gender === 'male' ? 'Masculino' : 'Feminino'}
              </Button>
            ))}
          </div>
        </div>

        {/* Languages */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Idiomas
          </Label>
          <div className="flex flex-wrap gap-2 p-3 bg-secondary/50 rounded-lg border border-border min-h-[48px]">
            {config.languages.map((language) => (
              <Badge key={language} variant="secondary" className="flex items-center gap-1">
                {language}
                <button onClick={() => removeLanguage(language)} className="ml-1 hover:text-destructive">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
            <Button variant="ghost" size="sm" className="h-6 text-xs text-primary">
              <Plus className="w-3 h-3 mr-1" />
              Adicionar
            </Button>
          </div>
        </div>

        {/* Audience Summary */}
        <div className="p-3 bg-secondary/30 rounded-lg text-sm text-muted-foreground">
          📍 {config.locations.length} local(is) · 👤 {config.ageMin}+ · 🔲 {config.gender === 'all' ? 'Todos' : config.gender === 'male' ? 'Masculino' : 'Feminino'} · 🌐 {config.languages.length} idioma(s)
        </div>
      </section>

      {/* Placements Section */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Posicionamentos
        </h3>

        <div className="flex items-center justify-between p-4 bg-primary/5 rounded-lg border border-primary/20">
          <div>
            <Label className="text-foreground">Advantage+ Posicionamentos</Label>
            <p className="text-sm text-muted-foreground">
              A Meta mostrará seus anúncios nos locais com maior probabilidade de resultados
            </p>
          </div>
          <Switch
            checked={config.autoPlacement}
            onCheckedChange={(checked) => updateConfig({ autoPlacement: checked })}
          />
        </div>
      </section>
    </div>
  );
}
