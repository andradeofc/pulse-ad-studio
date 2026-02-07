import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Grid, List, Upload, Video, Image, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCampaignStore, Creative } from '@/stores/campaignStore';
import { cn } from '@/lib/utils';

// Mock creatives data
const mockCreatives: Creative[] = [
  {
    id: '1',
    name: '990_AD005_V01.mp4',
    type: 'video',
    url: '',
    thumbnailUrl: '',
    width: 1136,
    height: 480,
    size: 2070000,
  },
  {
    id: '2',
    name: '991_AD006_V02.mp4',
    type: 'video',
    url: '',
    thumbnailUrl: '',
    width: 1080,
    height: 1920,
    size: 3500000,
  },
  {
    id: '3',
    name: 'banner_principal.jpg',
    type: 'image',
    url: '',
    thumbnailUrl: '',
    width: 1200,
    height: 628,
    size: 450000,
  },
  {
    id: '4',
    name: 'story_promo.jpg',
    type: 'image',
    url: '',
    thumbnailUrl: '',
    width: 1080,
    height: 1920,
    size: 380000,
  },
  {
    id: '5',
    name: '992_AD007_V03.mp4',
    type: 'video',
    url: '',
    thumbnailUrl: '',
    width: 1920,
    height: 1080,
    size: 5200000,
  },
];

export function Step1Creatives() {
  const { config, updateConfig } = useCampaignStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const filteredCreatives = mockCreatives.filter((creative) =>
    creative.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isSelected = (id: string) => config.selectedCreatives.some((c) => c.id === id);

  const toggleSelect = (creative: Creative) => {
    if (isSelected(creative.id)) {
      updateConfig({
        selectedCreatives: config.selectedCreatives.filter((c) => c.id !== creative.id),
      });
    } else {
      updateConfig({
        selectedCreatives: [...config.selectedCreatives, creative],
      });
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-2">Selecione os Criativos</h2>
        <p className="text-muted-foreground">
          Escolha imagens e/ou vídeos para seus anúncios. Cada criativo será um anúncio separado.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar criativos pelo nome..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-secondary/50"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "rounded-none h-10",
                viewMode === 'grid' && "bg-secondary"
              )}
              onClick={() => setViewMode('grid')}
            >
              <Grid className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "rounded-none h-10",
                viewMode === 'list' && "bg-secondary"
              )}
              onClick={() => setViewMode('list')}
            >
              <List className="w-4 h-4" />
            </Button>
          </div>
          <Button variant="destructive" className="glow-primary">
            <Upload className="w-4 h-4 mr-2" />
            Fazer Upload
          </Button>
        </div>
      </div>

      {/* Creatives Grid/List */}
      <div className={cn(
        viewMode === 'grid'
          ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
          : "space-y-2"
      )}>
        {filteredCreatives.map((creative) => (
          <motion.div
            key={creative.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.02 }}
            onClick={() => toggleSelect(creative)}
            className={cn(
              "cursor-pointer transition-all",
              viewMode === 'grid'
                ? "p-4 rounded-xl border bg-card hover:bg-secondary/50"
                : "p-3 rounded-lg border bg-card hover:bg-secondary/50 flex items-center gap-4",
              isSelected(creative.id)
                ? "border-primary ring-2 ring-primary/20"
                : "border-border"
            )}
          >
            {/* Thumbnail */}
            <div className={cn(
              "relative rounded-lg bg-muted flex items-center justify-center overflow-hidden",
              viewMode === 'grid' ? "aspect-video mb-3" : "w-16 h-16 flex-shrink-0"
            )}>
              {creative.thumbnailUrl ? (
                <img
                  src={creative.thumbnailUrl}
                  alt={creative.name}
                  className="w-full h-full object-cover"
                />
              ) : creative.type === 'video' ? (
                <Video className="w-8 h-8 text-muted-foreground/50" />
              ) : (
                <Image className="w-8 h-8 text-muted-foreground/50" />
              )}
              
              {/* Selection Indicator */}
              {isSelected(creative.id) && (
                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                  <Check className="w-4 h-4 text-primary-foreground" />
                </div>
              )}

              {/* Type Badge */}
              <div className="absolute bottom-2 left-2">
                <span className="text-xs px-2 py-1 rounded bg-background/80 backdrop-blur-sm text-foreground">
                  {creative.type === 'video' ? '🎬 Vídeo' : '🖼️ Imagem'}
                </span>
              </div>
            </div>

            {/* Info */}
            <div className={viewMode === 'list' ? "flex-1 min-w-0" : ""}>
              <p className="text-sm font-medium text-foreground truncate">
                {creative.name}
              </p>
              <div className={cn(
                "text-xs text-muted-foreground",
                viewMode === 'grid' ? "mt-1" : "flex gap-4"
              )}>
                <span>{creative.width} x {creative.height}</span>
                {viewMode === 'list' && <span>·</span>}
                <span>{formatSize(creative.size)}</span>
              </div>
            </div>

            {viewMode === 'list' && (
              <div className="flex-shrink-0">
                <div className={cn(
                  "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors",
                  isSelected(creative.id)
                    ? "bg-primary border-primary"
                    : "border-muted-foreground/30"
                )}>
                  {isSelected(creative.id) && (
                    <Check className="w-4 h-4 text-primary-foreground" />
                  )}
                </div>
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between pt-4 border-t border-border">
        <p className="text-sm text-muted-foreground">
          Mostrando 1-{filteredCreatives.length} de {mockCreatives.length}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled>
            Anterior
          </Button>
          <Button variant="outline" size="sm" disabled>
            Próximo
          </Button>
        </div>
      </div>
    </div>
  );
}
