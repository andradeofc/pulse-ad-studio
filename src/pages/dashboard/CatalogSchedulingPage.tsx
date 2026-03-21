import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Calendar,
  Clock,
  Plus,
  Trash2,
  Image as ImageIcon,
  FolderOpen,
  Layers,
  Building2,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  RefreshCw,
  Briefcase,
  Eye,
  Check,
  ChevronDown,
} from 'lucide-react';
import { ScheduleProductsModal } from '@/components/catalog/ScheduleProductsModal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { PausedItemsBanner } from '@/components/catalog/PausedItemsBanner';

interface Schedule {
  id: string;
  user_id: string;
  creative_id: string;
  profile_id: string;
  catalog_id: string;
  product_set_id: string;
  scheduled_at: string;
  status: string;
  processed_at: string | null;
  products_updated: number;
  error_message: string | null;
  created_at: string;
  creative?: {
    id: string;
    name: string;
    thumbnail_url: string | null;
    type: string;
  };
  catalog?: {
    id: string;
    name: string;
    catalog_id: string;
  };
  product_set?: {
    id: string;
    name: string;
    product_set_id: string;
    product_count: number | null;
  };
  profile?: {
    id: string;
    name: string;
  };
}

interface Creative {
  id: string;
  name: string;
  thumbnail_url: string | null;
  url: string;
  type: string;
}

interface Profile {
  id: string;
  name: string;
  avatar_url: string | null;
}

interface BusinessManager {
  id: string;
  business_id: string;
  name: string;
  profile_id: string;
}

interface Catalog {
  id: string;
  catalog_id: string;
  name: string;
  profile_id: string;
  business_id: string | null;
  product_count: number | null;
}

interface ProductSet {
  id: string;
  product_set_id: string;
  name: string;
  catalog_id: string;
  product_count: number | null;
}

export default function CatalogSchedulingPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSyncingCatalogs, setIsSyncingCatalogs] = useState(false);
  const [isSyncingProductSets, setIsSyncingProductSets] = useState(false);
  const [isSyncingBMs, setIsSyncingBMs] = useState(false);
  const [selectedScheduleForProducts, setSelectedScheduleForProducts] = useState<string | null>(null);
  
  // Form state
  const [selectedCreative, setSelectedCreative] = useState<string>('');
  const [selectedProfile, setSelectedProfile] = useState<string>('');
  const [selectedBusinessManager, setSelectedBusinessManager] = useState<string>('');
  const [selectedCatalog, setSelectedCatalog] = useState<string>('');
  const [selectedProductSet, setSelectedProductSet] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedHour, setSelectedHour] = useState<string>('21');
  const [selectedMinute, setSelectedMinute] = useState<string>('00');
  const [productSetSearch, setProductSetSearch] = useState('');
  const [productSetPopoverOpen, setProductSetPopoverOpen] = useState(false);

  // Fetch schedules
  const { data: schedules, isLoading: loadingSchedules } = useQuery({
    queryKey: ['catalog-schedules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalog_schedules')
        .select(`
          *,
          creative:creatives(id, name, thumbnail_url, type),
          catalog:facebook_catalogs(id, name, catalog_id),
          product_set:facebook_product_sets(id, name, product_set_id, product_count),
          profile:facebook_profiles(id, name)
        `)
        .order('scheduled_at', { ascending: true });

      if (error) throw error;
      return data as Schedule[];
    },
  });

  // Fetch creatives
  const { data: creatives, isLoading: loadingCreatives } = useQuery({
    queryKey: ['creatives'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('creatives')
        .select('id, name, thumbnail_url, url, type')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Creative[];
    },
  });

  // Fetch profiles
  const { data: profiles, isLoading: loadingProfiles } = useQuery({
    queryKey: ['facebook-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('facebook_profiles')
        .select('id, name, avatar_url')
        .eq('status', 'active')
        .order('name');

      if (error) throw error;
      return data as Profile[];
    },
  });

  // Fetch business managers based on selected profile
  const { data: businessManagers, isLoading: loadingBusinessManagers } = useQuery({
    queryKey: ['facebook-business-managers', selectedProfile],
    queryFn: async () => {
      if (!selectedProfile) return [];
      const { data, error } = await supabase
        .from('facebook_business_managers')
        .select('id, business_id, name, profile_id')
        .eq('profile_id', selectedProfile)
        .order('name');

      if (error) throw error;
      return data as BusinessManager[];
    },
    enabled: !!selectedProfile,
  });

  // Fetch catalogs based on selected profile (show all catalogs, BM selection is for sync only)
  const { data: catalogs, isLoading: loadingCatalogs, refetch: refetchCatalogs } = useQuery({
    queryKey: ['facebook-catalogs', selectedProfile],
    queryFn: async () => {
      if (!selectedProfile) return [];
      
      const { data, error } = await supabase
        .from('facebook_catalogs')
        .select('id, catalog_id, name, profile_id, business_id, product_count')
        .eq('profile_id', selectedProfile)
        .order('name');

      if (error) throw error;
      return data as Catalog[];
    },
    enabled: !!selectedProfile,
  });

  // Fetch product sets based on selected catalog
  const { data: productSets, isLoading: loadingProductSets, refetch: refetchProductSets } = useQuery({
    queryKey: ['facebook-product-sets', selectedCatalog],
    queryFn: async () => {
      if (!selectedCatalog) return [];
      const { data, error } = await supabase
        .from('facebook_product_sets')
        .select('id, product_set_id, name, catalog_id, product_count')
        .eq('catalog_id', selectedCatalog)
        .order('name');

      if (error) throw error;
      return data as ProductSet[];
    },
    enabled: !!selectedCatalog,
  });

  // Reset dependent selections when parent changes
  useEffect(() => {
    setSelectedBusinessManager('');
    setSelectedCatalog('');
    setSelectedProductSet('');
  }, [selectedProfile]);

  useEffect(() => {
    setSelectedCatalog('');
    setSelectedProductSet('');
  }, [selectedBusinessManager]);

  useEffect(() => {
    setSelectedProductSet('');
  }, [selectedCatalog]);

  // Sync catalogs from Facebook
  const handleSyncCatalogs = async () => {
    if (!selectedProfile || !selectedBusinessManager) {
      toast({
        title: 'Selecione uma BM',
        description: 'Você precisa selecionar um Business Manager antes de sincronizar catálogos.',
        variant: 'destructive',
      });
      return;
    }
    
    const bm = businessManagers?.find(b => b.id === selectedBusinessManager);
    if (!bm) {
      toast({
        title: 'Business Manager não encontrado',
        description: 'Selecione um Business Manager válido.',
        variant: 'destructive',
      });
      return;
    }
    
    setIsSyncingCatalogs(true);
    try {
      const { error } = await supabase.functions.invoke('facebook-sync-catalogs', {
        body: { 
          business_id: bm.business_id,
        },
      });

      if (error) throw error;

      await refetchCatalogs();
      toast({
        title: 'Catálogos sincronizados',
        description: 'Os catálogos foram atualizados com sucesso.',
      });
    } catch (error) {
      toast({
        title: 'Erro ao sincronizar',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setIsSyncingCatalogs(false);
    }
  };

  // Sync product sets from Facebook
  const handleSyncProductSets = async () => {
    if (!selectedCatalog) return;
    
    const catalog = catalogs?.find(c => c.id === selectedCatalog);
    if (!catalog) return;
    
    setIsSyncingProductSets(true);
    try {
      const { error } = await supabase.functions.invoke('facebook-sync-product-sets', {
        body: { 
          profileId: selectedProfile,
          catalogId: catalog.catalog_id,
          internalCatalogId: selectedCatalog,
        },
      });

      if (error) throw error;

      await refetchProductSets();
      toast({
        title: 'Conjuntos sincronizados',
        description: 'Os conjuntos de produtos foram atualizados com sucesso.',
      });
    } catch (error) {
      toast({
        title: 'Erro ao sincronizar',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setIsSyncingProductSets(false);
    }
  };

  // Create schedule mutation
  const createScheduleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDate || !selectedHour || !selectedMinute) throw new Error('Data e hora são obrigatórios');

      // Combine date and time in Brazil timezone
      const hours = parseInt(selectedHour, 10);
      const minutes = parseInt(selectedMinute, 10);
      const scheduledDate = new Date(selectedDate);
      scheduledDate.setHours(hours, minutes, 0, 0);

      // Convert to UTC for storage
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data, error } = await supabase
        .from('catalog_schedules')
        .insert({
          user_id: user.id,
          creative_id: selectedCreative,
          profile_id: selectedProfile,
          catalog_id: selectedCatalog,
          product_set_id: selectedProductSet,
          scheduled_at: scheduledDate.toISOString(),
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['catalog-schedules'] });
      toast({
        title: 'Agendamento criado',
        description: 'O agendamento foi criado com sucesso.',
      });

      // Auto-create monitor for this product set (isolated, won't affect scheduling)
      try {
        const productSet = productSets?.find(ps => ps.id === selectedProductSet);
        if (productSet) {
          supabase.auth.getUser().then(({ data: { user } }) => {
            if (!user) return;
            supabase
              .from('catalog_media_monitors')
              .upsert({
                user_id: user.id,
                profile_id: selectedProfile,
                catalog_id: selectedCatalog,
                product_set_id: selectedProductSet,
                product_set_name: productSet.name,
                creative_id: selectedCreative,
                is_active: true,
                auto_repair: false,
                source: 'schedule',
              }, { onConflict: 'user_id,product_set_id' })
              .then(({ error }) => {
                if (error) console.warn('[CatalogScheduling] Failed to auto-create monitor:', error);
                else console.log('[CatalogScheduling] Auto-created monitor for', productSet.name);
              });
          });
        }
      } catch (e) {
        console.warn('[CatalogScheduling] Monitor auto-create error:', e);
      }

      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao criar agendamento',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Delete schedule mutation
  const deleteScheduleMutation = useMutation({
    mutationFn: async (scheduleId: string) => {
      const { error } = await supabase
        .from('catalog_schedules')
        .delete()
        .eq('id', scheduleId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog-schedules'] });
      toast({
        title: 'Agendamento excluído',
        description: 'O agendamento foi removido com sucesso.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao excluir agendamento',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const resetForm = () => {
    setSelectedCreative('');
    setSelectedProfile('');
    setSelectedBusinessManager('');
    setSelectedCatalog('');
    setSelectedProductSet('');
    setSelectedDate(undefined);
    setSelectedHour('21');
    setSelectedMinute('00');
  };

  const canSubmit = selectedCreative && selectedProfile && selectedCatalog && selectedProductSet && selectedDate && selectedHour && selectedMinute;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30"><Clock className="w-3 h-3 mr-1" /> Pendente</Badge>;
      case 'processing':
        return <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Processando</Badge>;
      case 'completed':
        return <Badge variant="outline" className="bg-success/10 text-success border-success/30"><CheckCircle2 className="w-3 h-3 mr-1" /> Concluído</Badge>;
      case 'failed':
        return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30"><XCircle className="w-3 h-3 mr-1" /> Falhou</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getSelectedCreativePreview = () => {
    const creative = creatives?.find(c => c.id === selectedCreative);
    if (!creative) return null;
    
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
        {creative.thumbnail_url ? (
          <img src={creative.thumbnail_url} alt={creative.name} className="w-12 h-12 object-cover rounded" />
        ) : (
          <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
            <ImageIcon className="w-6 h-6 text-muted-foreground" />
          </div>
        )}
        <div>
          <p className="font-medium text-sm">{creative.name}</p>
          <p className="text-xs text-muted-foreground capitalize">{creative.type}</p>
        </div>
      </div>
    );
  };

  // Generate hour and minute options
  const hourOptions = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  const minuteOptions = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('catalog-schedules-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'catalog_schedules' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['catalog-schedules'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return (
    <div className="space-y-6">
      {/* Paused items banner */}
      <PausedItemsBanner type="schedules" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Agendamento de Catálogo</h1>
          <p className="text-muted-foreground mt-1">
            Agende a atualização de mídia em produtos do catálogo automaticamente
          </p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Novo Agendamento
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Criar Novo Agendamento</DialogTitle>
              <DialogDescription>
                Configure o agendamento para adicionar mídia aos produtos do catálogo
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* Creative Selection */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" />
                  Criativo
                </Label>
                <Select value={selectedCreative} onValueChange={setSelectedCreative}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o criativo" />
                  </SelectTrigger>
                  <SelectContent>
                    {loadingCreatives ? (
                      <div className="p-2 text-center text-muted-foreground">Carregando...</div>
                    ) : creatives?.length === 0 ? (
                      <div className="p-2 text-center text-muted-foreground">
                        Nenhum criativo encontrado. Faça upload na Biblioteca de Mídia.
                      </div>
                    ) : (
                      creatives?.map((creative) => (
                        <SelectItem key={creative.id} value={creative.id}>
                          <div className="flex items-center gap-2">
                            <span>{creative.name}</span>
                            <span className="text-xs text-muted-foreground capitalize">({creative.type})</span>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {selectedCreative && getSelectedCreativePreview()}
              </div>

              {/* Profile Selection */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Perfil do Facebook
                </Label>
                <Select value={selectedProfile} onValueChange={setSelectedProfile}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    {loadingProfiles ? (
                      <div className="p-2 text-center text-muted-foreground">Carregando...</div>
                    ) : profiles?.length === 0 ? (
                      <div className="p-2 text-center text-muted-foreground">
                        Nenhum perfil encontrado
                      </div>
                    ) : (
                      profiles?.map((profile) => (
                        <SelectItem key={profile.id} value={profile.id}>
                          {profile.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Business Manager Selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4" />
                    Business Manager
                  </Label>
                  {selectedProfile && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        setIsSyncingBMs(true);
                        try {
                          const { data, error } = await supabase.functions.invoke('facebook-sync-business-managers', {
                            body: { profile_id: selectedProfile },
                          });
                          if (error) throw error;
                          await queryClient.invalidateQueries({ queryKey: ['facebook-business-managers', selectedProfile] });
                          toast({
                            title: 'Business Managers sincronizados!',
                            description: `${data?.business_managers_synced || 0} BM(s) encontrado(s).`,
                          });
                        } catch (err: any) {
                          console.error('Error syncing BMs:', err);
                          toast({
                            title: 'Erro ao sincronizar BMs',
                            description: err.message || 'Não foi possível sincronizar.',
                            variant: 'destructive',
                          });
                        } finally {
                          setIsSyncingBMs(false);
                        }
                      }}
                      disabled={isSyncingBMs}
                      className="h-7 text-xs"
                    >
                      <RefreshCw className={cn("w-3 h-3 mr-1", isSyncingBMs && "animate-spin")} />
                      Sincronizar
                    </Button>
                  )}
                </div>
                <Select 
                  value={selectedBusinessManager} 
                  onValueChange={setSelectedBusinessManager}
                  disabled={!selectedProfile}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={selectedProfile ? "Selecione o Business Manager" : "Selecione um perfil primeiro"} />
                  </SelectTrigger>
                  <SelectContent>
                    {loadingBusinessManagers ? (
                      <div className="p-2 text-center text-muted-foreground">Carregando...</div>
                    ) : businessManagers?.length === 0 ? (
                      <div className="p-2 text-center text-muted-foreground">
                        Nenhum BM encontrado. Clique em Sincronizar.
                      </div>
                    ) : (
                      <>
                        <SelectItem value="all">Todos os catálogos do perfil</SelectItem>
                        {businessManagers?.map((bm) => (
                          <SelectItem key={bm.id} value={bm.id}>
                            {bm.name}
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Catalog Selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <FolderOpen className="w-4 h-4" />
                    Catálogo
                  </Label>
                  {selectedProfile && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleSyncCatalogs}
                      disabled={isSyncingCatalogs}
                      className="h-7 text-xs"
                    >
                      <RefreshCw className={cn("w-3 h-3 mr-1", isSyncingCatalogs && "animate-spin")} />
                      Sincronizar
                    </Button>
                  )}
                </div>
                <Select 
                  value={selectedCatalog} 
                  onValueChange={setSelectedCatalog}
                  disabled={!selectedProfile}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={selectedProfile ? "Selecione o catálogo" : "Selecione um perfil primeiro"} />
                  </SelectTrigger>
                  <SelectContent>
                    {loadingCatalogs ? (
                      <div className="p-2 text-center text-muted-foreground">Carregando...</div>
                    ) : catalogs?.length === 0 ? (
                      <div className="p-2 text-center text-muted-foreground">
                        Nenhum catálogo encontrado. Clique em Sincronizar.
                      </div>
                    ) : (
                      catalogs?.map((catalog) => (
                        <SelectItem key={catalog.id} value={catalog.id}>
                          <div className="flex items-center justify-between gap-4">
                            <span>{catalog.name}</span>
                            {catalog.product_count !== null && (
                              <span className="text-xs text-muted-foreground">
                                {catalog.product_count} produtos
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Product Set Selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <Layers className="w-4 h-4" />
                    Conjunto de Produtos
                  </Label>
                  {selectedCatalog && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleSyncProductSets}
                      disabled={isSyncingProductSets}
                      className="h-7 text-xs"
                    >
                      <RefreshCw className={cn("w-3 h-3 mr-1", isSyncingProductSets && "animate-spin")} />
                      Sincronizar
                    </Button>
                  )}
                </div>
                <Popover open={productSetPopoverOpen} onOpenChange={(open) => {
                  setProductSetPopoverOpen(open);
                  if (!open) setProductSetSearch('');
                }}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={productSetPopoverOpen}
                      disabled={!selectedCatalog}
                      className={cn(
                        "w-full justify-between font-normal h-10",
                        !selectedProductSet && "text-muted-foreground"
                      )}
                    >
                      <span className="truncate">
                        {selectedProductSet && productSets
                          ? productSets.find(s => s.id === selectedProductSet)?.name || 'Selecione o conjunto'
                          : selectedCatalog ? 'Selecione o conjunto' : 'Selecione um catálogo primeiro'}
                      </span>
                      <ChevronDown className={cn(
                        "ml-2 h-4 w-4 shrink-0 opacity-50 transition-transform duration-200",
                        productSetPopoverOpen && "rotate-180"
                      )} />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent 
                    className="w-[var(--radix-popover-trigger-width)] p-0" 
                    align="start"
                    sideOffset={4}
                  >
                    <Command shouldFilter={false} className="overflow-visible">
                      <CommandInput
                        placeholder="Buscar conjunto..."
                        value={productSetSearch}
                        onValueChange={setProductSetSearch}
                      />
                      <CommandList>
                        <CommandEmpty>
                          {loadingProductSets
                            ? 'Carregando...'
                            : productSets?.length === 0
                              ? 'Nenhum conjunto encontrado. Clique em Sincronizar.'
                              : 'Nenhum resultado para a busca.'}
                        </CommandEmpty>
                        {!loadingProductSets && (productSets || [])
                          .filter(s => s.name.toLowerCase().includes(productSetSearch.toLowerCase()))
                          .map((set) => (
                            <CommandItem
                              key={set.id}
                              value={set.name}
                              onSelect={() => {
                                setSelectedProductSet(set.id);
                                setProductSetPopoverOpen(false);
                                setProductSetSearch('');
                              }}
                              className="flex items-center justify-between"
                            >
                              <span className="truncate">{set.name}</span>
                              <div className="flex items-center gap-2 shrink-0 ml-2">
                                {set.product_count !== null && (
                                  <span className="text-xs text-muted-foreground">
                                    {set.product_count} produtos
                                  </span>
                                )}
                                <Check className={cn(
                                  "h-4 w-4",
                                  selectedProductSet === set.id ? "opacity-100 text-primary" : "opacity-0"
                                )} />
                              </div>
                            </CommandItem>
                          ))}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Date and Time Selection */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Data
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !selectedDate && "text-muted-foreground"
                        )}
                      >
                        <Calendar className="mr-2 h-4 w-4" />
                        {selectedDate ? format(selectedDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecione"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={selectedDate}
                        onSelect={setSelectedDate}
                        disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Horário (Brasil)
                  </Label>
                  <div className="flex items-center gap-2">
                    <Select value={selectedHour} onValueChange={setSelectedHour}>
                      <SelectTrigger className="w-[80px]">
                        <SelectValue placeholder="HH" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[200px]">
                        {hourOptions.map((hour) => (
                          <SelectItem key={hour} value={hour}>
                            {hour}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-lg font-bold text-muted-foreground">:</span>
                    <Select value={selectedMinute} onValueChange={setSelectedMinute}>
                      <SelectTrigger className="w-[80px]">
                        <SelectValue placeholder="MM" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[200px]">
                        {minuteOptions.map((minute) => (
                          <SelectItem key={minute} value={minute}>
                            {minute}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Summary */}
              {canSubmit && (
                <Card className="bg-muted/30">
                  <CardContent className="pt-4">
                    <h4 className="font-medium mb-2">Resumo do Agendamento</h4>
                    <div className="text-sm space-y-1 text-muted-foreground">
                      <p>
                        <strong className="text-foreground">Criativo:</strong>{' '}
                        {creatives?.find(c => c.id === selectedCreative)?.name}
                      </p>
                      <p>
                        <strong className="text-foreground">Catálogo:</strong>{' '}
                        {catalogs?.find(c => c.id === selectedCatalog)?.name}
                      </p>
                      <p>
                        <strong className="text-foreground">Conjunto:</strong>{' '}
                        {productSets?.find(s => s.id === selectedProductSet)?.name}
                        {' '}
                        ({productSets?.find(s => s.id === selectedProductSet)?.product_count || 0} produtos)
                      </p>
                      <p>
                        <strong className="text-foreground">Agendado para:</strong>{' '}
                        {selectedDate && format(selectedDate, "dd/MM/yyyy", { locale: ptBR })} às {selectedHour}:{selectedMinute} (Horário de Brasília)
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => createScheduleMutation.mutate()}
                disabled={!canSubmit || createScheduleMutation.isPending}
              >
                {createScheduleMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Criando...
                  </>
                ) : (
                  'Criar Agendamento'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Schedules List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Agendamentos</CardTitle>
          <CardDescription>
            Lista de todos os agendamentos de mídia para catálogos
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingSchedules ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="w-12 h-12 rounded" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : schedules?.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-medium text-foreground mb-1">Nenhum agendamento</h3>
              <p className="text-sm text-muted-foreground">
                Crie seu primeiro agendamento clicando no botão acima
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Criativo</TableHead>
                    <TableHead>Catálogo / Conjunto</TableHead>
                    <TableHead>Agendado Para</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Produtos</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedules?.map((schedule) => (
                    <TableRow key={schedule.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {schedule.creative?.thumbnail_url ? (
                            <img
                              src={schedule.creative.thumbnail_url}
                              alt={schedule.creative.name}
                              className="w-10 h-10 object-cover rounded"
                            />
                          ) : (
                            <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                              <ImageIcon className="w-5 h-5 text-muted-foreground" />
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-sm">{schedule.creative?.name || 'Criativo removido'}</p>
                            <p className="text-xs text-muted-foreground capitalize">{schedule.creative?.type}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{schedule.catalog?.name || 'Catálogo removido'}</p>
                          <p className="text-xs text-muted-foreground">{schedule.product_set?.name || 'Conjunto removido'}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">
                            {format(new Date(schedule.scheduled_at), "dd/MM/yyyy", { locale: ptBR })}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(schedule.scheduled_at), "HH:mm")} (BR)
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(schedule.status)}
                        {schedule.error_message && (
                          <p className="text-xs text-destructive mt-1 max-w-[200px] truncate" title={schedule.error_message}>
                            {schedule.error_message}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        {schedule.status === 'completed' || schedule.status === 'failed' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedScheduleForProducts(schedule.id)}
                            className="text-sm font-medium"
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            {schedule.products_updated > 0 ? (
                              <span className="text-success">{schedule.products_updated} atualizados</span>
                            ) : (
                              <span className="text-muted-foreground">Ver detalhes</span>
                            )}
                          </Button>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            {schedule.product_set?.product_count || '-'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {schedule.status === 'pending' && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir agendamento?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta ação não pode ser desfeita. O agendamento será removido permanentemente.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteScheduleMutation.mutate(schedule.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <AlertCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h4 className="font-medium text-foreground">Como funciona o agendamento</h4>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Selecione o perfil do Facebook e depois o Business Manager para filtrar os catálogos</li>
                <li>Use o botão "Sincronizar" para buscar catálogos e conjuntos do Facebook</li>
                <li>O sistema verifica agendamentos pendentes a cada minuto</li>
                <li>No horário agendado, a mídia será adicionada a todos os produtos do conjunto selecionado</li>
                <li>Você pode acompanhar o status do processamento em tempo real nesta página</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Products Modal */}
      <ScheduleProductsModal
        scheduleId={selectedScheduleForProducts}
        isOpen={!!selectedScheduleForProducts}
        onClose={() => setSelectedScheduleForProducts(null)}
      />
    </div>
  );
}
