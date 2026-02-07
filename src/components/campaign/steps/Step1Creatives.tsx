import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, Grid, List, Upload, Video, Image, Check, Loader2, Trash2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCampaignStore, Creative } from '@/stores/campaignStore';
import { fetchCreatives, deleteCreative, CreativeMetadata } from '@/services/creativesService';
import { CreativeUploadModal } from '@/components/campaign/CreativeUploadModal';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// Map database creative to store creative
function mapToStoreCreative(creative: CreativeMetadata): Creative {
  return {
    id: creative.id,
    name: creative.name,
    type: creative.type,
    url: creative.url,
    thumbnailUrl: creative.thumbnail_url || '',
    width: creative.width || 0,
    height: creative.height || 0,
    size: creative.size,
  };
}

export function Step1Creatives() {
  const { config, updateConfig } = useCampaignStore();
  const { toast } = useToast();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [creatives, setCreatives] = useState<CreativeMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<CreativeMetadata | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadCreatives = async () => {
    setIsLoading(true);
    try {
      const data = await fetchCreatives();
      setCreatives(data);
    } catch (error) {
      console.error('Error loading creatives:', error);
      toast({
        title: 'Erro ao carregar criativos',
        description: 'Não foi possível carregar seus criativos.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCreatives();
  }, []);

  const filteredCreatives = creatives.filter((creative) =>
    creative.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isSelected = (id: string) => config.selectedCreatives.some((c) => c.id === id);

  const toggleSelect = (creative: CreativeMetadata) => {
    const storeCreative = mapToStoreCreative(creative);
    if (isSelected(creative.id)) {
      updateConfig({
        selectedCreatives: config.selectedCreatives.filter((c) => c.id !== creative.id),
      });
    } else {
      updateConfig({
        selectedCreatives: [...config.selectedCreatives, storeCreative],
      });
    }
  };

  const handleUploadComplete = (newCreatives: CreativeMetadata[]) => {
    setCreatives((prev) => [...newCreatives, ...prev]);
    toast({
      title: 'Upload concluído!',
      description: `${newCreatives.length} criativo(s) enviado(s) com sucesso.`,
    });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    
    setIsDeleting(true);
    try {
      await deleteCreative(deleteTarget.id, deleteTarget.file_path);
      setCreatives((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      updateConfig({
        selectedCreatives: config.selectedCreatives.filter((c) => c.id !== deleteTarget.id),
      });
      toast({
        title: 'Criativo excluído',
        description: 'O criativo foi removido com sucesso.',
      });
    } catch (error) {
      console.error('Error deleting creative:', error);
      toast({
        title: 'Erro ao excluir',
        description: 'Não foi possível excluir o criativo.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
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
          <Button
            variant="ghost"
            size="icon"
            onClick={loadCreatives}
            disabled={isLoading}
            title="Recarregar"
          >
            <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
          </Button>
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
          <Button 
            variant="destructive" 
            className="glow-primary"
            onClick={() => setIsUploadOpen(true)}
          >
            <Upload className="w-4 h-4 mr-2" />
            Fazer Upload
          </Button>
        </div>
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Carregando criativos...</p>
        </div>
      ) : filteredCreatives.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 border border-dashed border-muted-foreground/25 rounded-xl">
          <div className="p-4 rounded-full bg-muted">
            <Image className="w-8 h-8 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="text-lg font-medium text-foreground">
              {searchQuery ? 'Nenhum criativo encontrado' : 'Nenhum criativo ainda'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {searchQuery 
                ? 'Tente buscar com outros termos'
                : 'Faça upload de imagens ou vídeos para começar'}
            </p>
          </div>
          {!searchQuery && (
            <Button onClick={() => setIsUploadOpen(true)} className="mt-2">
              <Upload className="w-4 h-4 mr-2" />
              Fazer Upload
            </Button>
          )}
        </div>
      ) : (
        <>
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
                className={cn(
                  "cursor-pointer transition-all group relative",
                  viewMode === 'grid'
                    ? "p-4 rounded-xl border bg-card hover:bg-secondary/50"
                    : "p-3 rounded-lg border bg-card hover:bg-secondary/50 flex items-center gap-4",
                  isSelected(creative.id)
                    ? "border-primary ring-2 ring-primary/20"
                    : "border-border"
                )}
              >
                {/* Delete Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(creative);
                  }}
                  className={cn(
                    "absolute z-10 p-1.5 rounded-full bg-destructive/90 text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity",
                    viewMode === 'grid' ? "top-2 left-2" : "right-12"
                  )}
                  title="Excluir criativo"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>

                <div onClick={() => toggleSelect(creative)} className={viewMode === 'list' ? 'flex items-center gap-4 flex-1' : ''}>
                  {/* Thumbnail */}
                  <div className={cn(
                    "relative rounded-lg bg-muted flex items-center justify-center overflow-hidden",
                    viewMode === 'grid' ? "aspect-video mb-3" : "w-16 h-16 flex-shrink-0"
                  )}>
                    {creative.thumbnail_url ? (
                      <img
                        src={creative.thumbnail_url}
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
                </div>

                {viewMode === 'list' && (
                  <div className="flex-shrink-0" onClick={() => toggleSelect(creative)}>
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
              Mostrando 1-{filteredCreatives.length} de {creatives.length}
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
        </>
      )}

      {/* Upload Modal */}
      <CreativeUploadModal
        open={isUploadOpen}
        onOpenChange={setIsUploadOpen}
        onUploadComplete={handleUploadComplete}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir criativo?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{deleteTarget?.name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                'Excluir'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
