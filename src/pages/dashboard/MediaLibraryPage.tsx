import { useState, useRef, useEffect } from 'react';
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
  CheckCircle2,
  Pencil,
  Check,
  X,
  FolderPlus,
  Folder,
  FolderOpen,
  ChevronRight,
  ArrowLeft,
  FolderInput,
  Sparkles
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { CreativeUploadModal } from '@/components/campaign/CreativeUploadModal';
import { fetchCreatives, deleteCreative, renameCreative, CreativeMetadata } from '@/services/creativesService';
import { fetchFolders, createFolder, renameFolder, deleteFolder, moveCreativesToFolder, CreativeFolder } from '@/services/folderService';
import { changeImageMetadata } from '@/services/imageMetadataService';
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
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Folder state
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderToDelete, setFolderToDelete] = useState<CreativeFolder | null>(null);
  const [folderToRename, setFolderToRename] = useState<CreativeFolder | null>(null);
  const [renameFolderName, setRenameFolderName] = useState('');
  const folderNameInputRef = useRef<HTMLInputElement>(null);

  const { data: creatives = [], isLoading } = useQuery({
    queryKey: ['creatives'],
    queryFn: fetchCreatives,
  });

  const { data: folders = [], isLoading: foldersLoading } = useQuery({
    queryKey: ['creative-folders'],
    queryFn: fetchFolders,
  });

  // Mutations
  const deleteMutation = useMutation({
    mutationFn: ({ id, filePath }: { id: string; filePath: string }) => 
      deleteCreative(id, filePath),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creatives'] });
      toast.success('Criativo excluído com sucesso');
      setDeleteDialogOpen(false);
      setCreativeToDelete(null);
    },
    onError: () => toast.error('Erro ao excluir criativo'),
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => 
      renameCreative(id, name),
    onSuccess: (updatedCreative) => {
      queryClient.invalidateQueries({ queryKey: ['creatives'] });
      setPreviewCreative(updatedCreative);
      toast.success('Nome atualizado com sucesso');
      setIsEditingName(false);
    },
    onError: () => toast.error('Erro ao renomear criativo'),
  });

  const createFolderMutation = useMutation({
    mutationFn: (name: string) => createFolder(name, currentFolderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creative-folders'] });
      toast.success('Pasta criada com sucesso');
      setNewFolderDialogOpen(false);
      setNewFolderName('');
    },
    onError: () => toast.error('Erro ao criar pasta'),
  });

  const renameFolderMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameFolder(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creative-folders'] });
      toast.success('Pasta renomeada com sucesso');
      setFolderToRename(null);
      setRenameFolderName('');
    },
    onError: () => toast.error('Erro ao renomear pasta'),
  });

  const deleteFolderMutation = useMutation({
    mutationFn: (id: string) => deleteFolder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creative-folders'] });
      queryClient.invalidateQueries({ queryKey: ['creatives'] });
      toast.success('Pasta excluída. Os criativos foram movidos para a raiz.');
      setFolderToDelete(null);
    },
    onError: () => toast.error('Erro ao excluir pasta'),
  });

  const moveCreativesMutation = useMutation({
    mutationFn: ({ ids, folderId }: { ids: string[]; folderId: string | null }) => 
      moveCreativesToFolder(ids, folderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creatives'] });
      setSelectedCreatives(new Set());
      toast.success('Criativos movidos com sucesso');
    },
    onError: () => toast.error('Erro ao mover criativos'),
  });

  const metadataMutation = useMutation({
    mutationFn: (params: { creativeIds?: string[]; folderId?: string | null }) =>
      changeImageMetadata(params),
    onMutate: () => {
      toast.loading('Alterando metadados das imagens...', { id: 'metadata' });
    },
    onSuccess: (data) => {
      toast.dismiss('metadata');
      if (data.failed === 0) {
        toast.success(`Metadados alterados em ${data.succeeded} imagem(ns)`);
      } else {
        toast.warning(`Concluído: ${data.succeeded} sucesso(s), ${data.failed} falha(s)`);
      }
      queryClient.invalidateQueries({ queryKey: ['creatives'] });
      setSelectedCreatives(new Set());
    },
    onError: (e: any) => {
      toast.dismiss('metadata');
      toast.error(e?.message || 'Erro ao alterar metadados');
    },
  });

  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  useEffect(() => {
    if (folderToRename && folderNameInputRef.current) {
      setTimeout(() => folderNameInputRef.current?.focus(), 50);
    }
  }, [folderToRename]);

  const startEditing = () => {
    if (previewCreative) {
      setEditedName(previewCreative.name);
      setIsEditingName(true);
    }
  };

  const cancelEditing = () => {
    setIsEditingName(false);
    setEditedName('');
  };

  const saveNewName = () => {
    if (previewCreative && editedName.trim() && editedName !== previewCreative.name) {
      renameMutation.mutate({ id: previewCreative.id, name: editedName.trim() });
    } else {
      cancelEditing();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') saveNewName();
    else if (e.key === 'Escape') cancelEditing();
  };

  // Folder navigation
  const currentFolder = folders.find(f => f.id === currentFolderId) || null;
  const subFolders = folders.filter(f => f.parent_id === currentFolderId);

  // Build breadcrumb path
  const getBreadcrumbs = () => {
    const crumbs: (CreativeFolder | null)[] = [null]; // root
    let current = currentFolder;
    const path: CreativeFolder[] = [];
    while (current) {
      path.unshift(current);
      current = folders.find(f => f.id === current!.parent_id) || null;
    }
    return [...crumbs, ...path];
  };

  // Filter creatives for current folder
  const creativesInCurrentFolder = creatives.filter(c => {
    if (searchQuery) {
      // When searching, search across all folders
      return c.name.toLowerCase().includes(searchQuery.toLowerCase());
    }
    return currentFolderId ? c.folder_id === currentFolderId : !c.folder_id;
  });

  const filteredCreatives = creativesInCurrentFolder.filter((creative) => {
    const matchesType = filterType === 'all' || creative.type === filterType;
    const matchesSearch = searchQuery ? creative.name.toLowerCase().includes(searchQuery.toLowerCase()) : true;
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
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  const totalSize = creatives.reduce((acc, c) => acc + c.size, 0);
  const imageCount = creatives.filter((c) => c.type === 'image').length;
  const videoCount = creatives.filter((c) => c.type === 'video').length;

  const breadcrumbs = getBreadcrumbs();

  // Count creatives in a folder
  const getCreativeCount = (folderId: string) => {
    return creatives.filter(c => c.folder_id === folderId).length;
  };

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
        <div className="flex items-center gap-2">
          {currentFolderId && (
            <Button
              variant="outline"
              onClick={() => {
                if (confirm(`Alterar metadados de TODAS as imagens da pasta "${currentFolder?.name}"? Isso reescreve EXIF e hash de cada arquivo.`)) {
                  metadataMutation.mutate({ folderId: currentFolderId });
                }
              }}
              disabled={metadataMutation.isPending}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Alterar metadados da pasta
            </Button>
          )}
          <Button 
            variant="outline" 
            onClick={() => setNewFolderDialogOpen(true)}
          >
            <FolderPlus className="w-4 h-4 mr-2" />
            Nova Pasta
          </Button>
          <Button onClick={() => setUploadModalOpen(true)} className="glow-primary">
            <Upload className="w-4 h-4 mr-2" />
            Fazer Upload
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
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
        <Card className="bg-secondary/30 border-border/50">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-500/10">
              <Folder className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{folders.length}</p>
              <p className="text-xs text-muted-foreground">Pastas</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Breadcrumb Navigation */}
      {(currentFolderId || searchQuery) && !searchQuery && (
        <div className="flex items-center gap-1 text-sm">
          {breadcrumbs.map((crumb, index) => (
            <div key={crumb?.id || 'root'} className="flex items-center gap-1">
              {index > 0 && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              <button
                onClick={() => setCurrentFolderId(crumb?.id || null)}
                className={cn(
                  "px-2 py-1 rounded-md hover:bg-secondary transition-colors",
                  index === breadcrumbs.length - 1 
                    ? "text-foreground font-medium" 
                    : "text-muted-foreground"
                )}
              >
                {crumb ? crumb.name : 'Todos os Arquivos'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Bulk actions bar */}
      {selectedCreatives.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 px-4 py-3 rounded-lg bg-primary/10 border border-primary/20"
        >
          <span className="text-sm font-medium text-foreground">
            {selectedCreatives.size} selecionado(s)
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <FolderInput className="w-4 h-4 mr-2" />
                  Mover para pasta
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => moveCreativesMutation.mutate({ 
                    ids: Array.from(selectedCreatives), 
                    folderId: null 
                  })}
                >
                  <Folder className="w-4 h-4 mr-2 text-muted-foreground" />
                  Raiz (sem pasta)
                </DropdownMenuItem>
                {folders.length > 0 && <DropdownMenuSeparator />}
                {folders.map(folder => (
                  <DropdownMenuItem
                    key={folder.id}
                    onClick={() => moveCreativesMutation.mutate({ 
                      ids: Array.from(selectedCreatives), 
                      folderId: folder.id 
                    })}
                    disabled={folder.id === currentFolderId}
                  >
                    <Folder className="w-4 h-4 mr-2" style={{ color: folder.color }} />
                    {folder.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="sm"
              onClick={() => metadataMutation.mutate({ creativeIds: Array.from(selectedCreatives) })}
              disabled={metadataMutation.isPending}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Alterar metadados
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedCreatives(new Set())}
            >
              <X className="w-4 h-4 mr-1" />
              Limpar
            </Button>
          </div>
        </motion.div>
      )}

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
          {filteredCreatives.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const allIds = filteredCreatives.map((c) => c.id);
                const allSelected = allIds.every((id) => selectedCreatives.has(id));
                if (allSelected) {
                  setSelectedCreatives((prev) => {
                    const next = new Set(prev);
                    allIds.forEach((id) => next.delete(id));
                    return next;
                  });
                } else {
                  setSelectedCreatives((prev) => {
                    const next = new Set(prev);
                    allIds.forEach((id) => next.add(id));
                    return next;
                  });
                }
              }}
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              {filteredCreatives.every((c) => selectedCreatives.has(c.id))
                ? 'Limpar seleção'
                : 'Selecionar tudo'}
            </Button>
          )}
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
      {isLoading || foldersLoading ? (
        <div className={cn(
          viewMode === 'grid' 
            ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4'
            : 'space-y-2'
        )}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className={viewMode === 'grid' ? 'aspect-square rounded-xl' : 'h-16 rounded-lg'} />
          ))}
        </div>
      ) : (
        <>
          {/* Folders (only show when not searching) */}
          {!searchQuery && subFolders.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              <AnimatePresence mode="popLayout">
                {subFolders.map((folder) => (
                  <motion.div
                    key={folder.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="group"
                  >
                    <Card 
                      className="overflow-hidden border-border/50 hover:border-primary/50 transition-colors cursor-pointer"
                      onDoubleClick={() => setCurrentFolderId(folder.id)}
                      onClick={() => setCurrentFolderId(folder.id)}
                    >
                      <CardContent className="p-4 flex items-center gap-3">
                        <FolderOpen className="w-8 h-8 flex-shrink-0" style={{ color: folder.color }} />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate text-sm">{folder.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {getCreativeCount(folder.id)} arquivo(s)
                          </p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              setFolderToRename(folder);
                              setRenameFolderName(folder.name);
                            }}>
                              <Pencil className="w-4 h-4 mr-2" />
                              Renomear
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-destructive focus:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                setFolderToDelete(folder);
                              }}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Excluir pasta
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

          {/* Back button when inside a folder */}
          {currentFolderId && !searchQuery && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-muted-foreground"
              onClick={() => {
                const parent = currentFolder?.parent_id || null;
                setCurrentFolderId(parent);
              }}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
          )}

          {/* Creatives */}
          {filteredCreatives.length === 0 && subFolders.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className="p-4 rounded-full bg-secondary mb-4">
                  <FileImage className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-1">
                  {searchQuery || filterType !== 'all' ? 'Nenhum resultado' : currentFolderId ? 'Pasta vazia' : 'Biblioteca vazia'}
                </h3>
                <p className="text-sm text-muted-foreground text-center max-w-sm mb-4">
                  {searchQuery || filterType !== 'all'
                    ? 'Tente ajustar os filtros ou a busca'
                    : currentFolderId 
                      ? 'Faça upload de arquivos ou mova criativos para esta pasta'
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
          ) : filteredCreatives.length === 0 ? null : viewMode === 'grid' ? (
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
                        
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        
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
                        
                        {creative.type === 'video' && creative.duration && (
                          <Badge 
                            variant="secondary" 
                            className="absolute bottom-2 right-2 text-xs bg-black/50 border-0"
                          >
                            {formatDuration(creative.duration)}
                          </Badge>
                        )}

                        {creative.type === 'video' && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="p-3 rounded-full bg-black/50 opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all">
                              <Play className="w-6 h-6 text-white fill-white" />
                            </div>
                          </div>
                        )}

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

                        <div className="absolute bottom-2 left-2 right-10 opacity-0 group-hover:opacity-100 transition-opacity">
                          <p className="text-xs text-white truncate font-medium">{creative.name}</p>
                          <p className="text-[10px] text-white/70">{formatFileSize(creative.size)}</p>
                        </div>
                      </div>

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
                          {creative.type === 'image' && (
                            <DropdownMenuItem
                              onClick={() => metadataMutation.mutate({ creativeIds: [creative.id] })}
                              disabled={metadataMutation.isPending}
                            >
                              <Sparkles className="w-4 h-4 mr-2" />
                              Alterar metadados
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                              <FolderInput className="w-4 h-4 mr-2" />
                              Mover para
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                              <DropdownMenuItem
                                onClick={() => moveCreativesMutation.mutate({ 
                                  ids: [creative.id], 
                                  folderId: null 
                                })}
                                disabled={!creative.folder_id}
                              >
                                <Folder className="w-4 h-4 mr-2 text-muted-foreground" />
                                Raiz (sem pasta)
                              </DropdownMenuItem>
                              {folders.length > 0 && <DropdownMenuSeparator />}
                              {folders.map(folder => (
                                <DropdownMenuItem
                                  key={folder.id}
                                  onClick={() => moveCreativesMutation.mutate({ 
                                    ids: [creative.id], 
                                    folderId: folder.id 
                                  })}
                                  disabled={creative.folder_id === folder.id}
                                >
                                  <Folder className="w-4 h-4 mr-2" style={{ color: folder.color }} />
                                  {folder.name}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                          <DropdownMenuSeparator />
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

                        <div className="hidden sm:block text-sm text-muted-foreground">
                          {formatDate(creative.created_at)}
                        </div>

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
                            <DropdownMenuSeparator />
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger>
                                <FolderInput className="w-4 h-4 mr-2" />
                                Mover para
                              </DropdownMenuSubTrigger>
                              <DropdownMenuSubContent>
                                <DropdownMenuItem
                                  onClick={() => moveCreativesMutation.mutate({ 
                                    ids: [creative.id], 
                                    folderId: null 
                                  })}
                                  disabled={!creative.folder_id}
                                >
                                  <Folder className="w-4 h-4 mr-2 text-muted-foreground" />
                                  Raiz (sem pasta)
                                </DropdownMenuItem>
                                {folders.length > 0 && <DropdownMenuSeparator />}
                                {folders.map(folder => (
                                  <DropdownMenuItem
                                    key={folder.id}
                                    onClick={() => moveCreativesMutation.mutate({ 
                                      ids: [creative.id], 
                                      folderId: folder.id 
                                    })}
                                    disabled={creative.folder_id === folder.id}
                                  >
                                    <Folder className="w-4 h-4 mr-2" style={{ color: folder.color }} />
                                    {folder.name}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                            <DropdownMenuSeparator />
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
        </>
      )}

      {/* Upload Modal */}
      <CreativeUploadModal
        open={uploadModalOpen}
        onOpenChange={setUploadModalOpen}
        folderId={currentFolderId}
        onUploadComplete={() => {
          queryClient.invalidateQueries({ queryKey: ['creatives'] });
        }}
      />

      {/* New Folder Dialog */}
      <Dialog open={newFolderDialogOpen} onOpenChange={setNewFolderDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Pasta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Nome da pasta"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newFolderName.trim()) {
                  createFolderMutation.mutate(newFolderName.trim());
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFolderDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => createFolderMutation.mutate(newFolderName.trim())}
              disabled={!newFolderName.trim() || createFolderMutation.isPending}
            >
              {createFolderMutation.isPending ? 'Criando...' : 'Criar Pasta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Folder Dialog */}
      <Dialog open={!!folderToRename} onOpenChange={(open) => !open && setFolderToRename(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Renomear Pasta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              ref={folderNameInputRef}
              placeholder="Nome da pasta"
              value={renameFolderName}
              onChange={(e) => setRenameFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && renameFolderName.trim() && folderToRename) {
                  renameFolderMutation.mutate({ id: folderToRename.id, name: renameFolderName.trim() });
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderToRename(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (folderToRename && renameFolderName.trim()) {
                  renameFolderMutation.mutate({ id: folderToRename.id, name: renameFolderName.trim() });
                }
              }}
              disabled={!renameFolderName.trim() || renameFolderMutation.isPending}
            >
              {renameFolderMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Folder Dialog */}
      <AlertDialog open={!!folderToDelete} onOpenChange={(open) => !open && setFolderToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pasta?</AlertDialogTitle>
            <AlertDialogDescription>
              A pasta "{folderToDelete?.name}" será excluída. Os criativos dentro dela serão movidos para a raiz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => folderToDelete && deleteFolderMutation.mutate(folderToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteFolderMutation.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Creative Confirmation Dialog */}
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
      <AlertDialog 
        open={!!previewCreative} 
        onOpenChange={(open) => {
          if (!open) {
            setPreviewCreative(null);
            setIsEditingName(false);
            setEditedName('');
          }
        }}
      >
        <AlertDialogContent className="max-w-4xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {isEditingName ? (
                <div className="flex items-center gap-2 flex-1">
                  <Input
                    ref={nameInputRef}
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="flex-1 h-8"
                    disabled={renameMutation.isPending}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10"
                    onClick={saveNewName}
                    disabled={renameMutation.isPending}
                  >
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={cancelEditing}
                    disabled={renameMutation.isPending}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 group/title flex-1 min-w-0">
                  <span className="truncate">{previewCreative?.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover/title:opacity-100 transition-opacity"
                    onClick={startEditing}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <div className="relative rounded-lg overflow-hidden bg-secondary/50">
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
          <AlertDialogFooter className="flex-row gap-2 sm:justify-between">
            <Button
              variant="destructive"
              onClick={() => {
                if (previewCreative) {
                  handleDelete(previewCreative);
                  setPreviewCreative(null);
                }
              }}
              className="mr-auto"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Excluir
            </Button>
            <div className="flex gap-2">
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
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
