import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Upload, 
  Image as ImageIcon, 
  Video, 
  Trash2, 
  Search, 
  Filter,
  Grid3X3,
  LayoutList,
  Clock,
  HardDrive,
  FileImage,
  Play,
  MoreVertical,
  Download,
  Eye,
  CheckCircle2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { CreativeUploadModal } from '@/components/campaign/CreativeUploadModal';
import { fetchCreatives, deleteCreative, CreativeMetadata } from '@/services/creativesService';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type ViewMode = 'grid' | 'list';
type FilterType = 'all' | 'image' | 'video';

export default function MediaLibraryPage() {
  const queryClient = useQueryClient();
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCreatives, setSelectedCreatives] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [creativeToDelete, setCreativeToDelete] = useState<CreativeMetadata | null>(null);
  const [previewCreative, setPreviewCreative] = useState<CreativeMetadata | null>(null);

  const { data: creatives = [], isLoading } = useQuery({
    queryKey: ['creatives'],
    queryFn: fetchCreatives,
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, filePath }: { id: string; filePath: string }) => 
      deleteCreative(id, filePath),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creatives'] });
      toast.success('Criativo excluído com sucesso');
      setDeleteDialogOpen(false);
      setCreativeToDelete(null);
    },
    onError: (error) => {
      toast.error('Erro ao excluir criativo');
      console.error('Delete error:', error);
    },
  });

  const filteredCreatives = creatives.filter((creative) => {
    const matchesType = filterType === 'all' || creative.type === filterType;
    const matchesSearch = creative.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return null;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const handleDelete = (creative: CreativeMetadata) => {
    setCreativeToDelete(creative);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (creativeToDelete) {
      deleteMutation.mutate({ 
        id: creativeToDelete.id, 
        filePath: creativeToDelete.file_path 
      });
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedCreatives((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const totalSize = creatives.reduce((acc, c) => acc + c.size, 0);
  const imageCount = creatives.filter((c) => c.type === 'image').length;
  const videoCount = creatives.filter((c) => c.type === 'video').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Biblioteca de Mídia</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie seus criativos para campanhas
          </p>
        </div>
        <Button onClick={() => setUploadModalOpen(true)} className="glow-primary">
          <Upload className="w-4 h-4 mr-2" />
          Fazer Upload
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-secondary/30 border-border/50">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-primary/10">
              <FileImage className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{creatives.length}</p>
              <p className="text-xs text-muted-foreground">Total de arquivos</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-secondary/30 border-border/50">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-500/10">
              <HardDrive className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{formatFileSize(totalSize)}</p>
              <p className="text-xs text-muted-foreground">Espaço utilizado</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-secondary/30 border-border/50">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-emerald-500" />
                <span className="text-lg font-semibold text-foreground">{imageCount}</span>
              </div>
              <div className="w-px h-6 bg-border" />
              <div className="flex items-center gap-2">
                <Video className="w-4 h-4 text-violet-500" />
                <span className="text-lg font-semibold text-foreground">{videoCount}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground ml-auto">Imagens / Vídeos</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar criativos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-secondary/50"
            />
          </div>
          <Select value={filterType} onValueChange={(v) => setFilterType(v as FilterType)}>
            <SelectTrigger className="w-32 bg-secondary/50">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="image">Imagens</SelectItem>
              <SelectItem value="video">Vídeos</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
            size="icon"
            onClick={() => setViewMode('grid')}
          >
            <Grid3X3 className="w-4 h-4" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="icon"
            onClick={() => setViewMode('list')}
          >
            <LayoutList className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className={cn(
          viewMode === 'grid' 
            ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4'
            : 'space-y-2'
        )}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className={viewMode === 'grid' ? 'aspect-square rounded-xl' : 'h-16 rounded-lg'} />
          ))}
        </div>
      ) : filteredCreatives.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="p-4 rounded-full bg-secondary mb-4">
              <FileImage className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-1">
              {searchQuery || filterType !== 'all' ? 'Nenhum resultado' : 'Biblioteca vazia'}
            </h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm mb-4">
              {searchQuery || filterType !== 'all'
                ? 'Tente ajustar os filtros ou a busca'
                : 'Faça upload de imagens e vídeos para usar em suas campanhas'}
            </p>
            {!searchQuery && filterType === 'all' && (
              <Button onClick={() => setUploadModalOpen(true)}>
                <Upload className="w-4 h-4 mr-2" />
                Fazer Upload
              </Button>
            )}
          </CardContent>
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          <AnimatePresence mode="popLayout">
            {filteredCreatives.map((creative) => (
              <motion.div
                key={creative.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="group relative"
              >
                <Card className="overflow-hidden border-border/50 hover:border-primary/50 transition-colors">
                  <div 
                    className="relative cursor-pointer"
                    onClick={() => setPreviewCreative(creative)}
                  >
                    <AspectRatio ratio={1}>
                      <img
                        src={creative.thumbnail_url || creative.url}
                        alt={creative.name}
                        className="w-full h-full object-cover"
                      />
                    </AspectRatio>
                    
                    {/* Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    
                    {/* Type Badge */}
                    <Badge 
                      variant="secondary" 
                      className="absolute top-2 left-2 text-xs bg-black/50 border-0"
                    >
                      {creative.type === 'video' ? (
                        <Video className="w-3 h-3 mr-1" />
                      ) : (
                        <ImageIcon className="w-3 h-3 mr-1" />
                      )}
                      {creative.type === 'video' ? 'Vídeo' : 'Imagem'}
                    </Badge>
                    
                    {/* Duration for videos */}
                    {creative.type === 'video' && creative.duration && (
                      <Badge 
                        variant="secondary" 
                        className="absolute bottom-2 right-2 text-xs bg-black/50 border-0"
                      >
                        {formatDuration(creative.duration)}
                      </Badge>
                    )}

                    {/* Play icon for videos */}
                    {creative.type === 'video' && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="p-3 rounded-full bg-black/50 opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all">
                          <Play className="w-6 h-6 text-white fill-white" />
                        </div>
                      </div>
                    )}

                    {/* Selection checkbox */}
                    <div 
                      className={cn(
                        "absolute top-2 right-2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                        selectedCreatives.has(creative.id)
                          ? "bg-primary border-primary"
                          : "bg-black/30 border-white/50 opacity-0 group-hover:opacity-100"
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelection(creative.id);
                      }}
                    >
                      {selectedCreatives.has(creative.id) && (
                        <CheckCircle2 className="w-4 h-4 text-primary-foreground" />
                      )}
                    </div>

                    {/* Actions on hover */}
                    <div className="absolute bottom-2 left-2 right-10 opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-xs text-white truncate font-medium">{creative.name}</p>
                      <p className="text-[10px] text-white/70">{formatFileSize(creative.size)}</p>
                    </div>
                  </div>

                  {/* Actions dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute bottom-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 hover:bg-black/70"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="w-4 h-4 text-white" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setPreviewCreative(creative)}>
                        <Eye className="w-4 h-4 mr-2" />
                        Visualizar
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <a href={creative.url} download={creative.name} target="_blank" rel="noopener noreferrer">
                          <Download className="w-4 h-4 mr-2" />
                          Download
                        </a>
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        className="text-destructive focus:text-destructive"
                        onClick={() => handleDelete(creative)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {filteredCreatives.map((creative) => (
              <motion.div
                key={creative.id}
                layout
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                <Card 
                  className={cn(
                    "group hover:border-primary/50 transition-colors cursor-pointer",
                    selectedCreatives.has(creative.id) && "border-primary bg-primary/5"
                  )}
                  onClick={() => toggleSelection(creative.id)}
                >
                  <CardContent className="p-3 flex items-center gap-4">
                    {/* Thumbnail */}
                    <div className="relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
                      <img
                        src={creative.thumbnail_url || creative.url}
                        alt={creative.name}
                        className="w-full h-full object-cover"
                      />
                      {creative.type === 'video' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <Play className="w-4 h-4 text-white fill-white" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{creative.name}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                          {creative.type === 'video' ? (
                            <Video className="w-3 h-3" />
                          ) : (
                            <ImageIcon className="w-3 h-3" />
                          )}
                          {creative.type === 'video' ? 'Vídeo' : 'Imagem'}
                        </span>
                        {creative.width && creative.height && (
                          <span>{creative.width}x{creative.height}</span>
                        )}
                        <span>{formatFileSize(creative.size)}</span>
                        {creative.duration && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDuration(creative.duration)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Date */}
                    <div className="hidden sm:block text-sm text-muted-foreground">
                      {formatDate(creative.created_at)}
                    </div>

                    {/* Actions */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setPreviewCreative(creative)}>
                          <Eye className="w-4 h-4 mr-2" />
                          Visualizar
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <a href={creative.url} download={creative.name} target="_blank" rel="noopener noreferrer">
                            <Download className="w-4 h-4 mr-2" />
                            Download
                          </a>
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="text-destructive focus:text-destructive"
                          onClick={() => handleDelete(creative)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Upload Modal */}
      <CreativeUploadModal
        open={uploadModalOpen}
        onOpenChange={setUploadModalOpen}
        onUploadComplete={() => {
          queryClient.invalidateQueries({ queryKey: ['creatives'] });
        }}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir criativo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O arquivo "{creativeToDelete?.name}" será permanentemente excluído.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Preview Dialog */}
      <AlertDialog open={!!previewCreative} onOpenChange={() => setPreviewCreative(null)}>
        <AlertDialogContent className="max-w-4xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="truncate">{previewCreative?.name}</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="relative rounded-lg overflow-hidden bg-black/50">
            {previewCreative?.type === 'video' ? (
              <video
                src={previewCreative.url}
                controls
                autoPlay
                className="w-full max-h-[60vh] object-contain"
              />
            ) : (
              <img
                src={previewCreative?.url}
                alt={previewCreative?.name}
                className="w-full max-h-[60vh] object-contain"
              />
            )}
          </div>
          {previewCreative && (
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>{previewCreative.width}x{previewCreative.height}</span>
              <span>{formatFileSize(previewCreative.size)}</span>
              {previewCreative.duration && (
                <span>{formatDuration(previewCreative.duration)}</span>
              )}
              <span>{formatDate(previewCreative.created_at)}</span>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Fechar</AlertDialogCancel>
            <AlertDialogAction asChild>
              <a 
                href={previewCreative?.url} 
                download={previewCreative?.name} 
                target="_blank" 
                rel="noopener noreferrer"
              >
                <Download className="w-4 h-4 mr-2" />
                Download
              </a>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
