import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Shield,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Bell,
  Wrench,
  Eye,
  EyeOff,
  Loader2,
  Building2,
  FolderOpen,
  Layers,
  Briefcase,
  Image as ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { PausedItemsBanner } from '@/components/catalog/PausedItemsBanner';

interface Monitor {
  id: string;
  user_id: string;
  profile_id: string;
  catalog_id: string;
  product_set_id: string;
  product_set_name: string;
  creative_id: string | null;
  is_active: boolean;
  auto_repair: boolean;
  webhook_url: string | null;
  source: string;
  last_checked_at: string | null;
  last_issue_at: string | null;
  issues_found: number;
  created_at: string;
  catalog?: { id: string; name: string; catalog_id: string };
  product_set?: { id: string; name: string; product_set_id: string };
  profile?: { id: string; name: string };
  creative?: { id: string; name: string; thumbnail_url: string | null };
}

interface Alert {
  id: string;
  monitor_id: string;
  retailer_id: string;
  product_name: string | null;
  product_set_name: string;
  catalog_name: string;
  alert_type: string;
  status: string;
  repaired_at: string | null;
  webhook_sent: boolean;
  created_at: string;
}

export default function CatalogMonitorPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [globalWebhookUrl, setGlobalWebhookUrl] = useState('');
  const [alertStatusFilter, setAlertStatusFilter] = useState<string>('all');

  // Form state for adding monitor
  const [selectedProfile, setSelectedProfile] = useState('');
  const [selectedBM, setSelectedBM] = useState('');
  const [selectedCatalog, setSelectedCatalog] = useState('');
  const [selectedProductSet, setSelectedProductSet] = useState('');
  const [selectedCreative, setSelectedCreative] = useState('');
  const [monitorWebhookUrl, setMonitorWebhookUrl] = useState('');

  // Fetch monitors
  const { data: monitors, isLoading: loadingMonitors } = useQuery({
    queryKey: ['catalog-monitors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalog_media_monitors')
        .select(`
          *,
          catalog:facebook_catalogs(id, name, catalog_id),
          product_set:facebook_product_sets(id, name, product_set_id),
          profile:facebook_profiles(id, name),
          creative:creatives(id, name, thumbnail_url)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as unknown as Monitor[];
    },
  });

  // Fetch alerts
  const { data: alerts, isLoading: loadingAlerts } = useQuery({
    queryKey: ['catalog-alerts', alertStatusFilter],
    queryFn: async () => {
      let query = supabase
        .from('catalog_media_alerts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (alertStatusFilter !== 'all') {
        query = query.eq('status', alertStatusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Alert[];
    },
  });

  // Fetch profiles
  const { data: profiles } = useQuery({
    queryKey: ['facebook-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('facebook_profiles')
        .select('id, name, avatar_url')
        .eq('status', 'active')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  // Fetch BMs
  const { data: businessManagers } = useQuery({
    queryKey: ['facebook-business-managers', selectedProfile],
    queryFn: async () => {
      if (!selectedProfile) return [];
      const { data, error } = await supabase
        .from('facebook_business_managers')
        .select('id, business_id, name, profile_id')
        .eq('profile_id', selectedProfile)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!selectedProfile,
  });

  // Fetch catalogs
  const { data: catalogs } = useQuery({
    queryKey: ['facebook-catalogs', selectedProfile, selectedBM],
    queryFn: async () => {
      if (!selectedProfile) return [];
      let query = supabase
        .from('facebook_catalogs')
        .select('id, catalog_id, name, profile_id, business_id, product_count')
        .eq('profile_id', selectedProfile);
      if (selectedBM) {
        const bm = businessManagers?.find(b => b.id === selectedBM);
        if (bm) query = query.eq('business_id', bm.business_id);
      }
      const { data, error } = await query.order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!selectedProfile,
  });

  // Fetch product sets
  const { data: productSets } = useQuery({
    queryKey: ['facebook-product-sets', selectedCatalog],
    queryFn: async () => {
      if (!selectedCatalog) return [];
      const { data, error } = await supabase
        .from('facebook_product_sets')
        .select('id, product_set_id, name, catalog_id, product_count')
        .eq('catalog_id', selectedCatalog)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!selectedCatalog,
  });

  // Fetch creatives
  const { data: creatives } = useQuery({
    queryKey: ['creatives'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('creatives')
        .select('id, name, thumbnail_url, url, type')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Sync state
  const [isSyncingCatalogs, setIsSyncingCatalogs] = useState(false);
  const [isSyncingProductSets, setIsSyncingProductSets] = useState(false);

  // Reset cascading selects
  useEffect(() => { setSelectedBM(''); setSelectedCatalog(''); setSelectedProductSet(''); }, [selectedProfile]);
  useEffect(() => { setSelectedCatalog(''); setSelectedProductSet(''); }, [selectedBM]);
  useEffect(() => { setSelectedProductSet(''); }, [selectedCatalog]);

  // Sync catalogs
  const handleSyncCatalogs = async () => {
    if (!selectedProfile || !selectedBM) {
      toast({ title: 'Selecione uma BM', description: 'Selecione um Business Manager antes de sincronizar.', variant: 'destructive' });
      return;
    }
    const bm = businessManagers?.find(b => b.id === selectedBM);
    if (!bm) return;
    setIsSyncingCatalogs(true);
    try {
      const { error } = await supabase.functions.invoke('facebook-sync-catalogs', { body: { business_id: bm.business_id } });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['facebook-catalogs', selectedProfile, selectedBM] });
      toast({ title: 'Catálogos sincronizados' });
    } catch (error) {
      toast({ title: 'Erro ao sincronizar', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
    } finally {
      setIsSyncingCatalogs(false);
    }
  };

  // Sync product sets
  const handleSyncProductSets = async () => {
    if (!selectedCatalog) return;
    const catalog = catalogs?.find(c => c.id === selectedCatalog);
    if (!catalog) return;
    setIsSyncingProductSets(true);
    try {
      const { error } = await supabase.functions.invoke('facebook-sync-product-sets', { body: { profileId: selectedProfile, catalogId: catalog.catalog_id, internalCatalogId: selectedCatalog } });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['facebook-product-sets', selectedCatalog] });
      toast({ title: 'Conjuntos sincronizados' });
    } catch (error) {
      toast({ title: 'Erro ao sincronizar', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
    } finally {
      setIsSyncingProductSets(false);
    }
  };

  // Toggle active
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('catalog_media_monitors')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['catalog-monitors'] }),
  });

  // Toggle auto_repair
  const toggleRepairMutation = useMutation({
    mutationFn: async ({ id, auto_repair }: { id: string; auto_repair: boolean }) => {
      const { error } = await supabase
        .from('catalog_media_monitors')
        .update({ auto_repair })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['catalog-monitors'] }),
  });

  // Delete monitor
  const deleteMonitorMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('catalog_media_monitors')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog-monitors'] });
      toast({ title: 'Monitor removido' });
    },
  });

  // Create monitor
  const createMonitorMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');

      const productSet = productSets?.find(ps => ps.id === selectedProductSet);
      if (!productSet) throw new Error('Conjunto não encontrado');

      const { error } = await supabase
        .from('catalog_media_monitors')
        .insert({
          user_id: user.id,
          profile_id: selectedProfile,
          catalog_id: selectedCatalog,
          product_set_id: selectedProductSet,
          product_set_name: productSet.name,
          creative_id: selectedCreative || null,
          is_active: true,
          auto_repair: !!selectedCreative,
          webhook_url: monitorWebhookUrl || globalWebhookUrl || null,
          source: 'manual',
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog-monitors'] });
      toast({ title: 'Monitor criado', description: 'O conjunto será monitorado a cada 15 minutos.' });
      resetForm();
      setIsAddDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao criar monitor', description: error.message, variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setSelectedProfile('');
    setSelectedBM('');
    setSelectedCatalog('');
    setSelectedProductSet('');
    setSelectedCreative('');
    setMonitorWebhookUrl('');
  };

  const canSubmit = selectedProfile && selectedCatalog && selectedProductSet;

  const getAlertStatusBadge = (status: string) => {
    switch (status) {
      case 'detected': return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30"><AlertTriangle className="w-3 h-3 mr-1" /> Detectado</Badge>;
      case 'repaired': return <Badge variant="outline" className="bg-success/10 text-success border-success/30"><Wrench className="w-3 h-3 mr-1" /> Reparado</Badge>;
      case 'notified': return <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30"><Bell className="w-3 h-3 mr-1" /> Notificado</Badge>;
      case 'ignored': return <Badge variant="outline" className="bg-muted text-muted-foreground"><EyeOff className="w-3 h-3 mr-1" /> Ignorado</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Paused items banner */}
      <PausedItemsBanner type="monitors" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            Monitor de Catálogo
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitore automaticamente seus conjuntos de produtos e receba alertas quando vídeos forem removidos.
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Adicionar Conjunto
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Adicionar Conjunto ao Monitor</DialogTitle>
              <DialogDescription>Selecione o conjunto de produtos que deseja monitorar.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* Profile */}
              <div className="space-y-2">
                <Label>Perfil Facebook</Label>
                <Select value={selectedProfile} onValueChange={setSelectedProfile}>
                  <SelectTrigger><SelectValue placeholder="Selecione um perfil" /></SelectTrigger>
                  <SelectContent>
                    {profiles?.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* BM */}
              {selectedProfile && (
                <div className="space-y-2">
                  <Label>Business Manager (opcional)</Label>
                  <Select value={selectedBM} onValueChange={setSelectedBM}>
                    <SelectTrigger><SelectValue placeholder="Filtrar por BM" /></SelectTrigger>
                    <SelectContent>
                      {businessManagers?.map(bm => (
                        <SelectItem key={bm.id} value={bm.id}>{bm.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Catalog */}
              {selectedProfile && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Catálogo</Label>
                    {selectedBM && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={handleSyncCatalogs} disabled={isSyncingCatalogs}>
                        <RefreshCw className={cn("w-3 h-3", isSyncingCatalogs && "animate-spin")} />
                        Sincronizar
                      </Button>
                    )}
                  </div>
                  <Select value={selectedCatalog} onValueChange={setSelectedCatalog}>
                    <SelectTrigger><SelectValue placeholder="Selecione um catálogo" /></SelectTrigger>
                    <SelectContent>
                      {catalogs?.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Product Set */}
              {selectedCatalog && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Conjunto de Produtos</Label>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={handleSyncProductSets} disabled={isSyncingProductSets}>
                      <RefreshCw className={cn("w-3 h-3", isSyncingProductSets && "animate-spin")} />
                      Sincronizar
                    </Button>
                  </div>
                  <Select value={selectedProductSet} onValueChange={setSelectedProductSet}>
                    <SelectTrigger><SelectValue placeholder="Selecione um conjunto" /></SelectTrigger>
                    <SelectContent>
                      {productSets?.map(ps => (
                        <SelectItem key={ps.id} value={ps.id}>
                          {ps.name} {ps.product_count ? `(${ps.product_count} produtos)` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Creative (optional for auto-repair) */}
              <div className="space-y-2">
                <Label>Criativo para Auto-reparo (opcional)</Label>
                <Select value={selectedCreative} onValueChange={setSelectedCreative}>
                  <SelectTrigger><SelectValue placeholder="Selecione um criativo" /></SelectTrigger>
                  <SelectContent>
                    {creatives?.filter(c => c.type === 'video').map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Se selecionado, o vídeo será reenviado automaticamente quando detectada perda.</p>
              </div>

              {/* Webhook URL */}
              <div className="space-y-2">
                <Label>Webhook URL (opcional)</Label>
                <Input
                  placeholder="https://seu-webhook.com/endpoint"
                  value={monitorWebhookUrl}
                  onChange={(e) => setMonitorWebhookUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">URL para receber alertas via WhatsApp (n8n/Make).</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancelar</Button>
              <Button
                onClick={() => createMonitorMutation.mutate()}
                disabled={!canSubmit || createMonitorMutation.isPending}
              >
                {createMonitorMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Adicionar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Webhook Global */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Configuração Global</CardTitle>
          <CardDescription>Webhook padrão usado para novos monitores.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 items-end">
            <div className="flex-1 space-y-2">
              <Label>Webhook URL padrão</Label>
              <Input
                placeholder="https://seu-webhook.com/endpoint"
                value={globalWebhookUrl}
                onChange={(e) => setGlobalWebhookUrl(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="monitors" className="space-y-4">
        <TabsList>
          <TabsTrigger value="monitors" className="gap-2">
            <Shield className="w-4 h-4" /> Conjuntos Monitorados
            {monitors && monitors.length > 0 && (
              <Badge variant="secondary" className="ml-1">{monitors.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-2">
            <AlertTriangle className="w-4 h-4" /> Histórico de Alertas
            {alerts && alerts.length > 0 && (
              <Badge variant="secondary" className="ml-1">{alerts.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Monitors Tab */}
        <TabsContent value="monitors">
          <Card>
            <CardContent className="pt-6">
              {loadingMonitors ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : !monitors || monitors.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Shield className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p className="text-lg font-medium">Nenhum conjunto monitorado</p>
                  <p className="text-sm mt-1">Adicione conjuntos manualmente ou crie agendamentos de catálogo.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Conjunto</TableHead>
                      <TableHead>Catálogo</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead>Auto-reparo</TableHead>
                      <TableHead>Ativo</TableHead>
                      <TableHead>Última verificação</TableHead>
                      <TableHead>Problemas</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monitors.map(monitor => (
                      <TableRow key={monitor.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Layers className="w-4 h-4 text-muted-foreground" />
                            {monitor.product_set_name}
                          </div>
                        </TableCell>
                        <TableCell>{monitor.catalog?.name || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {monitor.source === 'schedule' ? 'Agendamento' : 'Manual'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {monitor.creative_id ? (
                            <Switch
                              checked={monitor.auto_repair}
                              onCheckedChange={(checked) =>
                                toggleRepairMutation.mutate({ id: monitor.id, auto_repair: checked })
                              }
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">Sem criativo</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={monitor.is_active}
                            onCheckedChange={(checked) =>
                              toggleActiveMutation.mutate({ id: monitor.id, is_active: checked })
                            }
                          />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {monitor.last_checked_at
                            ? format(new Date(monitor.last_checked_at), "dd/MM HH:mm", { locale: ptBR })
                            : 'Nunca'}
                        </TableCell>
                        <TableCell>
                          {monitor.issues_found > 0 ? (
                            <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                              {monitor.issues_found}
                            </Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remover monitor?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  O conjunto "{monitor.product_set_name}" deixará de ser monitorado. Os alertas existentes serão mantidos.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteMonitorMutation.mutate(monitor.id)}>
                                  Remover
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Histórico de Alertas</CardTitle>
                <Select value={alertStatusFilter} onValueChange={setAlertStatusFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filtrar status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="detected">Detectados</SelectItem>
                    <SelectItem value="repaired">Reparados</SelectItem>
                    <SelectItem value="notified">Notificados</SelectItem>
                    <SelectItem value="ignored">Ignorados</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {loadingAlerts ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : !alerts || alerts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p className="text-lg font-medium">Nenhum alerta encontrado</p>
                  <p className="text-sm mt-1">Quando problemas forem detectados, eles aparecerão aqui.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Conjunto</TableHead>
                      <TableHead>Catálogo</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Webhook</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alerts.map(alert => (
                      <TableRow key={alert.id}>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(alert.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell className="font-medium">{alert.product_set_name}</TableCell>
                        <TableCell>{alert.catalog_name}</TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm">{alert.product_name || alert.retailer_id}</p>
                            {alert.product_name && (
                              <p className="text-xs text-muted-foreground">{alert.retailer_id}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{getAlertStatusBadge(alert.status)}</TableCell>
                        <TableCell>
                          {alert.webhook_sent ? (
                            <CheckCircle2 className="w-4 h-4 text-success" />
                          ) : (
                            <XCircle className="w-4 h-4 text-muted-foreground" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
