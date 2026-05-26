import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Facebook,
  RefreshCw,
  Loader2,
  AlertCircle,
  Users,
  Building2,
  Search,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Trash2,
  Cloud,
  Puzzle,
  ArrowUpDown,
  Columns3,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Eye,
  Plus,
  ExternalLink,
  Copy,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
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
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';


interface FacebookPage {
  id: string;
  profile_id: string;
  page_id: string;
  name: string;
  category: string | null;
  picture_url: string | null;
  followers_count: number;
  is_published: boolean;
  business_id: string | null;
  business_name: string | null;
  ads_running: number;
  ads_limit: number;
  tasks: string[] | null;
  created_at: string;
  profile_name?: string;
}

type SortKey = 'name' | 'slots' | 'category' | 'access_type' | 'origin_access';
type SortDir = 'asc' | 'desc';

export default function FacebookPagesPage() {
  const { isAuthenticated } = useAuthStore();

  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [originFilter, setOriginFilter] = useState<string>('all');
  const [accessFilter, setAccessFilter] = useState<string>('all');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'name', dir: 'asc' });

  // Column visibility
  type ColKey =
    | 'page' | 'slots' | 'status' | 'category' | 'access_type' | 'profile_name'
    | 'origin' | 'pools' | 'fb_url' | 'business_manager' | 'bm_verified' | 'followers' | 'created_fb';
  const COLUMNS: { key: ColKey; label: string; available: boolean; defaultVisible: boolean }[] = [
    { key: 'page', label: 'Página', available: true, defaultVisible: true },
    { key: 'slots', label: 'Slots Disponíveis', available: true, defaultVisible: true },
    { key: 'status', label: 'Status', available: true, defaultVisible: true },
    { key: 'category', label: 'Categoria', available: true, defaultVisible: true },
    { key: 'access_type', label: 'Tipo de Acesso', available: true, defaultVisible: true },
    { key: 'profile_name', label: 'Nome do Perfil', available: true, defaultVisible: true },
    { key: 'origin', label: 'Origem', available: true, defaultVisible: true },
    { key: 'pools', label: 'Pools', available: true, defaultVisible: true },
    { key: 'fb_url', label: 'URL Facebook', available: true, defaultVisible: false },
    { key: 'business_manager', label: 'Business Manager', available: true, defaultVisible: false },
    { key: 'bm_verified', label: 'BM verificado', available: false, defaultVisible: false },
    { key: 'followers', label: 'Seguidores', available: true, defaultVisible: false },
    { key: 'created_fb', label: 'Criada em (FB)', available: false, defaultVisible: false },
  ];
  const [visibleCols, setVisibleCols] = useState<Record<ColKey, boolean>>(() =>
    COLUMNS.reduce((acc, c) => ({ ...acc, [c.key]: c.defaultVisible }), {} as Record<ColKey, boolean>)
  );
  const toggleCol = (k: ColKey) => setVisibleCols(prev => ({ ...prev, [k]: !prev[k] }));
  const toggleAllCols = (value: boolean) =>
    setVisibleCols(COLUMNS.reduce((acc, c) => ({ ...acc, [c.key]: c.available ? value : false }), {} as Record<ColKey, boolean>));
  const allColsOn = COLUMNS.filter(c => c.available).every(c => visibleCols[c.key]);

  const loadPages = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('facebook_pages')
        .select('*, facebook_profiles(name)')
        .order('name');

      if (error) throw error;

      const pagesMap = new Map<string, FacebookPage>();
      for (const row of (data || []) as any[]) {
        const existing = pagesMap.get(row.page_id);
        const mapped: FacebookPage = {
          ...row,
          profile_name: row.facebook_profiles?.name ?? null,
        };
        if (!existing || (mapped.ads_running ?? 0) > (existing.ads_running ?? 0)) {
          pagesMap.set(row.page_id, mapped);
        }
      }
      setPages(Array.from(pagesMap.values()));
    } catch (error) {
      console.error('Error loading pages:', error);
      toast.error('Erro ao carregar páginas');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) loadPages();
  }, [isAuthenticated, loadPages]);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Você precisa estar logado');
        return;
      }

      const response = await supabase.functions.invoke('facebook-sync-pages', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (response.error) throw response.error;

      const result = response.data;
      if (result?.success) {
        toast.success(`${result.synced} páginas sincronizadas`);
        await loadPages();
      }
    } catch (error) {
      console.error('Error syncing pages:', error);
      toast.error('Erro ao sincronizar páginas');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm('Deseja realmente excluir TODAS as páginas? Esta ação não pode ser desfeita.')) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('facebook_pages').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) throw error;
      toast.success('Todas as páginas foram removidas');
      setSelectedIds(new Set());
      await loadPages();
    } catch (error) {
      console.error(error);
      toast.error('Erro ao excluir páginas');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Excluir ${selectedIds.size} página(s) selecionada(s)?`)) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('facebook_pages').delete().in('id', Array.from(selectedIds));
      if (error) throw error;
      toast.success('Páginas excluídas');
      setSelectedIds(new Set());
      await loadPages();
    } catch (error) {
      console.error(error);
      toast.error('Erro ao excluir');
    } finally {
      setIsDeleting(false);
    }
  };

  const getStatus = (p: FacebookPage) => {
    const pct = p.ads_limit > 0 ? (p.ads_running / p.ads_limit) * 100 : 0;
    if (pct >= 100) return { label: 'Limite atingido', tone: 'destructive' as const, Icon: XCircle };
    if (pct >= 80) return { label: 'Atenção', tone: 'warning' as const, Icon: AlertTriangle };
    return { label: 'Sem problemas', tone: 'success' as const, Icon: CheckCircle2 };
  };

  const getAccessType = (p: FacebookPage) =>
    p.business_id ? { label: 'Business', color: 'bg-ads-info/10 text-ads-info border-ads-info/30' }
                  : { label: 'Perfil', color: 'bg-purple-500/10 text-purple-500 border-purple-500/30' };

  const filtered = useMemo(() => {
    return pages.filter((p) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match =
          p.name.toLowerCase().includes(q) ||
          p.page_id.includes(q) ||
          p.category?.toLowerCase().includes(q) ||
          p.business_name?.toLowerCase().includes(q) ||
          p.profile_name?.toLowerCase().includes(q);
        if (!match) return false;
      }
      if (statusFilter !== 'all') {
        const s = getStatus(p).label;
        if (statusFilter === 'ok' && s !== 'Sem problemas') return false;
        if (statusFilter === 'warn' && s !== 'Atenção') return false;
        if (statusFilter === 'block' && s !== 'Limite atingido') return false;
      }
      if (accessFilter !== 'all') {
        const at = getAccessType(p).label.toLowerCase();
        if (at !== accessFilter) return false;
      }
      // originFilter: 'all' | 'api' (we currently only track API source)
      if (originFilter !== 'all' && originFilter !== 'api') return false;
      return true;
    });
  }, [pages, searchQuery, statusFilter, accessFilter, originFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sort.dir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      const ga = (x: FacebookPage) => {
        switch (sort.key) {
          case 'slots': return x.ads_limit - x.ads_running;
          case 'category': return (x.category ?? '').toLowerCase();
          case 'access_type': return getAccessType(x).label;
          case 'origin_access': return (x.profile_name ?? '').toLowerCase();
          default: return x.name.toLowerCase();
        }
      };
      const va = ga(a); const vb = ga(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
    return arr;
  }, [filtered, sort]);

  const totalPages = pages.length;
  const totalAdsRunning = pages.reduce((s, p) => s + p.ads_running, 0);
  const totalAdsLimit = pages.reduce((s, p) => s + p.ads_limit, 0);
  const totalFollowers = pages.reduce((s, p) => s + p.followers_count, 0);
  const totalBMs = new Set(pages.map(p => p.business_id || 'personal')).size;

  const totalCount = sorted.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(page, pageCount);
  const startIdx = (currentPage - 1) * pageSize;
  const visiblePages = sorted.slice(startIdx, startIdx + pageSize);

  const allVisibleSelected = visiblePages.length > 0 && visiblePages.every(p => selectedIds.has(p.id));
  const toggleSelectAll = () => {
    const next = new Set(selectedIds);
    if (allVisibleSelected) visiblePages.forEach(p => next.delete(p.id));
    else visiblePages.forEach(p => next.add(p.id));
    setSelectedIds(next);
  };

  const toggleSort = (key: SortKey) => {
    setSort(prev => prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'asc' });
  };

  if (!isAuthenticated) {
    return (
      <Card className="glass-card">
        <CardContent className="py-16 text-center">
          <AlertCircle className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">Autenticação necessária</h3>
          <p className="text-muted-foreground">Faça login para gerenciar suas páginas do Facebook.</p>
        </CardContent>
      </Card>
    );
  }

  const statusBadgeClass = (tone: 'success' | 'warning' | 'destructive') => {
    if (tone === 'success') return 'bg-ads-success/10 text-ads-success border-ads-success/30';
    if (tone === 'warning') return 'bg-ads-warning/10 text-ads-warning border-ads-warning/30';
    return 'bg-destructive/10 text-destructive border-destructive/30';
  };

  const SortHeader = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <TableHead className={className}>
      <button
        onClick={() => toggleSort(k)}
        className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      >
        {children}
        <ArrowUpDown className={cn('w-3 h-3 opacity-60', sort.key === k && 'opacity-100 text-primary')} />
      </button>
    </TableHead>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Páginas do Facebook</h1>
          <p className="text-muted-foreground">
            {isLoading ? 'Carregando...' : `${totalPages} página(s) conectada(s)`}
          </p>
        </div>
        <Button onClick={handleSync} disabled={isSyncing} className="glow-primary">
          <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Sincronizando...' : 'Sincronizar Páginas'}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="glass-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <Facebook className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{totalPages}</p>
                <p className="text-xs text-muted-foreground">Total Páginas</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-ads-info/20 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-ads-info" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{totalBMs}</p>
                <p className="text-xs text-muted-foreground">Business Managers</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-ads-success/20 flex items-center justify-center">
                <Users className="w-5 h-5 text-ads-success" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {totalFollowers >= 1_000_000 ? `${(totalFollowers / 1_000_000).toFixed(1)}M`
                    : totalFollowers >= 1_000 ? `${(totalFollowers / 1_000).toFixed(1)}K`
                    : totalFollowers}
                </p>
                <p className="text-xs text-muted-foreground">Total Seguidores</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent className="pt-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">Slots de Anúncio</p>
                <p className="text-sm font-medium text-foreground">{totalAdsRunning}/{totalAdsLimit}</p>
              </div>
              <Progress value={totalAdsLimit > 0 ? (totalAdsRunning / totalAdsLimit) * 100 : 0} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">{Math.max(0, totalAdsLimit - totalAdsRunning)} slots disponíveis</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Professional Table Card */}
      <Card className="glass-card overflow-hidden">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 px-6 py-5 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground tracking-tight">Páginas do Facebook</h1>
              <p className="text-sm text-muted-foreground">
                {isLoading ? 'Carregando...' : `${totalCount} de ${totalPages} páginas`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <Button variant="outline" size="sm" onClick={handleDeleteSelected} disabled={isDeleting}
                className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive">
                <Trash2 className="w-4 h-4 mr-2" />
                Excluir {selectedIds.size}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleSync} disabled={isSyncing}>
              <Cloud className={cn('w-4 h-4 mr-2', isSyncing && 'animate-pulse')} />
              {isSyncing ? 'Sincronizando...' : 'Buscar via API'}
            </Button>
            <Button variant="outline" size="sm" onClick={handleDeleteAll} disabled={isDeleting || pages.length === 0}
              className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive">
              <Trash2 className="w-4 h-4 mr-2" />
              Deletar Todas
            </Button>
          </div>
        </div>

        {/* Filters Row */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 px-6 py-4 border-b border-border/50 bg-muted/20">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[180px] bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="ok">Sem problemas</SelectItem>
                <SelectItem value="warn">Atenção</SelectItem>
                <SelectItem value="block">Limite atingido</SelectItem>
              </SelectContent>
            </Select>

            <Select value={originFilter} onValueChange={setOriginFilter}>
              <SelectTrigger className="h-9 w-[180px] bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Origens</SelectItem>
                <SelectItem value="api">API</SelectItem>
                <SelectItem value="extension">Extensão</SelectItem>
              </SelectContent>
            </Select>

            <Select value={accessFilter} onValueChange={setAccessFilter}>
              <SelectTrigger className="h-9 w-[180px] bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as fanpages</SelectItem>
                <SelectItem value="perfil">Perfil</SelectItem>
                <SelectItem value="business">Business</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="lg:ml-auto relative w-full lg:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar página..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 bg-background"
            />
          </div>
        </div>

        {/* Top toolbar (columns hint + counter) */}
        <div className="flex items-center justify-between px-6 py-2.5 border-b border-border/50">
          <div className="text-xs text-muted-foreground">
            {totalCount === 0 ? '0 resultados' : `${startIdx + 1}-${Math.min(startIdx + pageSize, totalCount)} de ${totalCount}`}
            <span className="mx-3 opacity-50">·</span>
            <span className="inline-flex items-center gap-2">
              Por página:
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                <SelectTrigger className="h-7 w-[72px] bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[25, 50, 100, 200].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <Columns3 className="w-3.5 h-3.5" />
                Colunas
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 max-h-[480px] overflow-y-auto">
              <DropdownMenuLabel className="text-xs">Exibir colunas</DropdownMenuLabel>
              <DropdownMenuItem
                onSelect={(e) => { e.preventDefault(); toggleAllCols(!allColsOn); }}
                className="text-xs font-medium cursor-pointer"
              >
                {allColsOn ? 'Desmarcar todas' : 'Marcar todas'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {COLUMNS.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.key}
                  checked={visibleCols[c.key]}
                  onCheckedChange={() => c.available && toggleCol(c.key)}
                  disabled={!c.available}
                  className="text-xs cursor-pointer"
                >
                  <span className="flex-1">{c.label}</span>
                  {!c.available && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground/70">em breve</span>
                  )}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}

        {/* Empty */}
        {!isLoading && totalCount === 0 && (
          <div className="py-16 text-center px-6">
            <Facebook className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <h3 className="text-base font-medium text-foreground mb-1">Nenhuma página encontrada</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {pages.length === 0 ? 'Sincronize suas páginas do Facebook para começar.' : 'Ajuste os filtros para ver resultados.'}
            </p>
            {pages.length === 0 && (
              <Button onClick={handleSync} disabled={isSyncing} variant="outline" size="sm">
                <RefreshCw className={cn('w-4 h-4 mr-2', isSyncing && 'animate-spin')} />
                Sincronizar Páginas
              </Button>
            )}
          </div>
        )}

        {/* Table */}
        {!isLoading && totalCount > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-border/50">
                  <TableHead className="w-12">
                    <Checkbox
                      checked={allVisibleSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Selecionar todos"
                    />
                  </TableHead>
                  {visibleCols.page && <SortHeader k="name">Página</SortHeader>}
                  {visibleCols.slots && <SortHeader k="slots">Slots Disponíveis</SortHeader>}
                  {visibleCols.status && (
                    <TableHead>
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</span>
                    </TableHead>
                  )}
                  {visibleCols.category && <SortHeader k="category">Categoria</SortHeader>}
                  {visibleCols.access_type && <SortHeader k="access_type">Tipo de Acesso</SortHeader>}
                  {visibleCols.profile_name && <SortHeader k="origin_access">Nome do Perfil</SortHeader>}
                  {visibleCols.origin && (
                    <TableHead>
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Origem</span>
                    </TableHead>
                  )}
                  {visibleCols.pools && (
                    <TableHead>
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pools</span>
                    </TableHead>
                  )}
                  {visibleCols.fb_url && (
                    <TableHead>
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">URL Facebook</span>
                    </TableHead>
                  )}
                  {visibleCols.business_manager && (
                    <TableHead>
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Business Manager</span>
                    </TableHead>
                  )}
                  {visibleCols.followers && (
                    <TableHead>
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Seguidores</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiblePages.map((p, idx) => {
                  const status = getStatus(p);
                  const access = getAccessType(p);
                  const available = Math.max(0, p.ads_limit - p.ads_running);
                  const pct = p.ads_limit > 0 ? (p.ads_running / p.ads_limit) * 100 : 0;
                  const isSelected = selectedIds.has(p.id);
                  // Stable Graph API picture URL — never expires
                  const stablePic = `https://graph.facebook.com/${p.page_id}/picture?type=square&width=80&height=80`;

                  return (
                    <motion.tr
                      key={p.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(idx * 0.015, 0.2) }}
                      className={cn(
                        'border-border/50 transition-colors hover:bg-muted/30',
                        isSelected && 'bg-primary/5 hover:bg-primary/10'
                      )}
                    >
                      <TableCell>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(c) => {
                            const next = new Set(selectedIds);
                            if (c) next.add(p.id); else next.delete(p.id);
                            setSelectedIds(next);
                          }}
                        />
                      </TableCell>

                      {visibleCols.page && (
                        <TableCell>
                          <div className="flex items-center gap-3 min-w-[220px]">
                            <img
                              src={p.picture_url || stablePic}
                              alt={p.name}
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                const img = e.currentTarget;
                                if (img.src !== stablePic) {
                                  img.src = stablePic;
                                } else {
                                  img.style.display = 'none';
                                  img.nextElementSibling?.classList.remove('hidden');
                                }
                              }}
                              className="w-9 h-9 rounded-full object-cover ring-1 ring-border bg-secondary"
                            />
                            <div className="w-9 h-9 rounded-full bg-secondary hidden items-center justify-center ring-1 ring-border">
                              <Facebook className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-foreground truncate">{p.name}</div>
                              <div className="text-xs text-muted-foreground tabular-nums">ID: {p.page_id}</div>
                            </div>
                          </div>
                        </TableCell>
                      )}

                      {visibleCols.slots && (
                        <TableCell>
                          <div className="min-w-[160px]">
                            <Progress
                              value={pct}
                              className={cn('h-1.5', pct >= 100 ? '[&>div]:bg-destructive' : pct >= 80 ? '[&>div]:bg-ads-warning' : '')}
                            />
                            <div className="mt-1 text-xs tabular-nums text-muted-foreground">
                              <span className="text-foreground font-medium">{available}</span>
                              <span className="opacity-60"> / {p.ads_limit}</span>
                            </div>
                          </div>
                        </TableCell>
                      )}

                      {visibleCols.status && (
                        <TableCell>
                          <Badge variant="outline" className={cn('gap-1 font-normal', statusBadgeClass(status.tone))}>
                            <status.Icon className="w-3 h-3" />
                            {status.label}
                          </Badge>
                        </TableCell>
                      )}

                      {visibleCols.category && (
                        <TableCell>
                          <span className="text-sm text-foreground">{p.category || '—'}</span>
                        </TableCell>
                      )}

                      {visibleCols.access_type && (
                        <TableCell>
                          <Badge variant="outline" className={cn('font-normal gap-1', access.color)}>
                            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                            {access.label}
                          </Badge>
                        </TableCell>
                      )}

                      {visibleCols.profile_name && (
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm">
                            <div className="w-5 h-5 rounded-full bg-ads-info/20 flex items-center justify-center">
                              <Facebook className="w-3 h-3 text-ads-info" />
                            </div>
                            <span className="text-foreground truncate max-w-[160px]">
                              {p.profile_name || '—'}
                            </span>
                          </div>
                        </TableCell>
                      )}

                      {visibleCols.origin && (
                        <TableCell>
                          <Badge variant="outline" className="font-normal gap-1 bg-purple-500/10 text-purple-500 border-purple-500/30">
                            <Puzzle className="w-3 h-3" />
                            API
                          </Badge>
                        </TableCell>
                      )}

                      {visibleCols.pools && (
                        <TableCell>
                          <span className="text-sm text-muted-foreground">—</span>
                        </TableCell>
                      )}

                      {visibleCols.fb_url && (
                        <TableCell>
                          <a
                            href={`https://facebook.com/${p.page_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline"
                          >
                            Abrir
                          </a>
                        </TableCell>
                      )}

                      {visibleCols.business_manager && (
                        <TableCell>
                          <span className="text-sm text-foreground truncate max-w-[180px] inline-block">
                            {p.business_name || '—'}
                          </span>
                        </TableCell>
                      )}

                      {visibleCols.followers && (
                        <TableCell>
                          <span className="text-sm tabular-nums text-foreground">
                            {p.followers_count > 0 ? p.followers_count.toLocaleString('pt-BR') : '—'}
                          </span>
                        </TableCell>
                      )}
                    </motion.tr>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Footer / Pagination */}
        {!isLoading && totalCount > 0 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-border/50">
            <div className="text-xs text-muted-foreground">
              {startIdx + 1}-{Math.min(startIdx + pageSize, totalCount)} de {totalCount}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage === 1} onClick={() => setPage(1)}>
                <ChevronsLeft className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="px-3 text-xs tabular-nums text-muted-foreground">
                {currentPage} / {pageCount}
              </span>
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage === pageCount} onClick={() => setPage(p => Math.min(pageCount, p + 1))}>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage === pageCount} onClick={() => setPage(pageCount)}>
                <ChevronsRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
