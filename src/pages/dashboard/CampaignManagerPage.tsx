import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, subDays, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Folder,
  Plus,
  RefreshCw,
  Search,
  Calendar as CalendarIcon,
  Filter,
  Columns3,
  Megaphone,
  Layers,
  FileText,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Loader2,
  Play,
  Pause,
  Trash2,
  Pencil,
  ExternalLink,
  Copy,
  Facebook,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { AdAccountSelector } from '@/components/campaign/AdAccountSelector';
import { BulkEditDialog } from '@/components/campaign/BulkEditDialog';

type Level = 'campaign' | 'adset' | 'ad';

const STATUS_OPTIONS = [
  { value: 'WITH_ISSUES', label: 'Rascunho', dot: 'border-emerald-500' },
  { value: 'PENDING_REVIEW', label: 'Pendente', dot: 'border-muted-foreground' },
  { value: 'ACTIVE', label: 'Ativa', dot: 'bg-emerald-500 border-emerald-500' },
  { value: 'PAUSED', label: 'Inativa', dot: 'bg-muted-foreground border-muted-foreground' },
  { value: 'CAMPAIGN_PAUSED', label: 'Não veiculando', dot: 'bg-muted-foreground/60 border-muted-foreground/60' },
  { value: 'DELETED', label: 'Excluída', dot: 'bg-muted-foreground border-muted-foreground' },
  { value: 'ARCHIVED', label: 'Concluída', dot: 'bg-muted-foreground border-muted-foreground' },
  { value: 'DISAPPROVED', label: 'Desativada', dot: 'border-muted-foreground' },
];

type DatePreset = { id: string; label: string; range: () => { from: Date; to: Date } };

const today = () => startOfDay(new Date());
const DATE_PRESETS: DatePreset[] = [
  { id: 'today', label: 'hoje', range: () => ({ from: today(), to: today() }) },
  { id: 'yesterday', label: 'Ontem', range: () => ({ from: subDays(today(), 1), to: subDays(today(), 1) }) },
  { id: '7d', label: '7 dias', range: () => ({ from: subDays(today(), 6), to: today() }) },
  { id: '30d', label: '30 dias', range: () => ({ from: subDays(today(), 29), to: today() }) },
  { id: '90d', label: '90 dias', range: () => ({ from: subDays(today(), 89), to: today() }) },
  { id: 'all', label: 'Todo período', range: () => ({ from: subDays(today(), 365 * 3), to: today() }) },
];

function formatDateLabel(presetId: string, range: { from: Date; to: Date }) {
  const preset = DATE_PRESETS.find((p) => p.id === presetId);
  if (preset) return preset.label;
  if (!range.from) return 'Selecionar';
  if (range.from.getTime() === range.to.getTime()) {
    return format(range.from, 'dd MMM', { locale: ptBR });
  }
  return `${format(range.from, 'dd MMM', { locale: ptBR })} - ${format(range.to, 'dd MMM', { locale: ptBR })}`;
}

function StatusFilter({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const allSelected = value.length === 0 || value.length === STATUS_OPTIONS.length;
  const labelCount = allSelected ? 'Todos os Status' : `${value.length} Status`;
  const toggle = (v: string) => {
    if (value.includes(v)) onChange(value.filter((x) => x !== v));
    else onChange([...value, v]);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2 min-w-[180px] justify-between">
          <span className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-primary" />
            {labelCount}
          </span>
          <ChevronRight className="w-4 h-4 rotate-90 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="flex items-center justify-between mb-3 text-sm">
          <span className="font-medium">Filtrar por status</span>
          <div className="flex items-center gap-2 text-xs">
            <button type="button" className="text-primary hover:underline" onClick={() => onChange(STATUS_OPTIONS.map((s) => s.value))}>
              Selecionar todos
            </button>
            <span className="text-muted-foreground">·</span>
            <button type="button" className="text-primary hover:underline" onClick={() => onChange([])}>Limpar</button>
          </div>
        </div>
        <div className="space-y-1.5">
          {STATUS_OPTIONS.map((s) => (
            <label key={s.value} className="flex items-center gap-2.5 text-sm py-1.5 cursor-pointer hover:bg-accent/40 rounded px-1">
              <Checkbox checked={value.length === 0 ? true : value.includes(s.value)} onCheckedChange={() => toggle(s.value)} />
              <span className={cn('w-2.5 h-2.5 rounded-full border-2', s.dot)} />
              <span>{s.label}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DateRangeFilter({
  preset, range, onChange,
}: { preset: string; range: { from: Date; to: Date }; onChange: (preset: string, range: { from: Date; to: Date }) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2 min-w-[140px] justify-start">
          <CalendarIcon className="w-4 h-4" />
          {formatDateLabel(preset, range)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4 space-y-4" align="start">
        <div>
          <p className="text-sm font-semibold mb-2">Período rápido</p>
          <div className="grid grid-cols-2 gap-2">
            {DATE_PRESETS.map((p) => (
              <Button
                key={p.id}
                variant={preset === p.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => { onChange(p.id, p.range()); setOpen(false); }}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold mb-2">Personalizado</p>
          <Calendar
            mode="range"
            selected={{ from: range.from, to: range.to }}
            onSelect={(r: any) => { if (r?.from && r?.to) onChange('custom', { from: r.from, to: r.to }); }}
            numberOfMonths={1}
            locale={ptBR}
            className={cn('p-0 pointer-events-auto')}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface Insights {
  spend?: number; reach?: number; impressions?: number; clicks?: number;
  ctr?: number; cpc?: number; frequency?: number;
  inline_link_clicks?: number; cost_per_inline_link_click?: number;
  unique_clicks?: number; outbound_clicks?: number; cost_per_outbound_click?: number;
  page_views?: number; cost_per_page_view?: number;
  view_content?: number; cost_per_view_content?: number;
  add_to_cart?: number; cost_per_add_to_cart?: number;
  initiate_checkout?: number; cost_per_initiate_checkout?: number;
  add_payment_info?: number; cost_per_add_payment_info?: number;
  purchases?: number; cost_per_purchase?: number;
  purchase_value?: number; roas?: number;
  leads?: number; cost_per_lead?: number;
}

interface Row {
  id: string; name: string; status: string; effective_status: string;
  objective?: string | null; campaign_id?: string | null; adset_id?: string | null;
  daily_budget?: number | null; lifetime_budget?: number | null;
  budget_source?: 'self' | 'adset';
  account: { id: string; account_id: string; name: string; currency?: string | null };
  insights: Insights;
}

function formatMoney(v: number | undefined, currency = 'BRL') {
  if (v == null || isNaN(v)) return '—';
  try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(v); }
  catch { return v.toFixed(2); }
}
function formatNumber(v: number | undefined) {
  if (v == null || isNaN(v)) return '—';
  return new Intl.NumberFormat('pt-BR').format(v);
}
function formatPct(v: number | undefined) {
  if (v == null || isNaN(v)) return '—';
  return `${v.toFixed(2)}%`;
}
function formatDec(v: number | undefined, d = 2) {
  if (v == null || isNaN(v)) return '—';
  return v.toFixed(d);
}

type ColumnId =
  | 'name' | 'delivery' | 'objective' | 'budget' | 'spend' | 'reach' | 'impressions'
  | 'ctr' | 'inlineLinkClicks' | 'costPerInlineLinkClick' | 'frequency'
  | 'uniqueClicks' | 'outboundClicks' | 'costPerOutboundClick'
  | 'pageViews' | 'costPerPageView' | 'viewContent' | 'costPerViewContent'
  | 'addToCart' | 'costPerAddToCart' | 'initiateCheckout' | 'costPerInitiateCheckout'
  | 'addPaymentInfo' | 'costPerAddPaymentInfo'
  | 'purchases' | 'costPerPurchase' | 'purchaseValue' | 'roas'
  | 'leads' | 'costPerLead';

const COLUMNS: { id: ColumnId; label: string }[] = [
  { id: 'name', label: 'Nome' },
  { id: 'delivery', label: 'Veiculação' },
  { id: 'objective', label: 'Objetivo' },
  { id: 'budget', label: 'Orçamento' },
  { id: 'spend', label: 'Gasto' },
  { id: 'reach', label: 'Alcance' },
  { id: 'impressions', label: 'Impressões' },
  { id: 'ctr', label: 'CTR' },
  { id: 'inlineLinkClicks', label: 'Cliques no link' },
  { id: 'costPerInlineLinkClick', label: 'CPC do link' },
  { id: 'frequency', label: 'Frequência' },
  { id: 'uniqueClicks', label: 'Cliques únicos' },
  { id: 'outboundClicks', label: 'Cliques de saída' },
  { id: 'costPerOutboundClick', label: 'Custo p/ clique de saída' },
  { id: 'pageViews', label: 'Visualizações de página' },
  { id: 'costPerPageView', label: 'Custo p/ visualização de página' },
  { id: 'viewContent', label: 'View Content' },
  { id: 'costPerViewContent', label: 'Custo p/ View Content' },
  { id: 'addToCart', label: 'Add to Cart' },
  { id: 'costPerAddToCart', label: 'Custo p/ Add to Cart' },
  { id: 'initiateCheckout', label: 'Initiate Checkout' },
  { id: 'costPerInitiateCheckout', label: 'Custo p/ Initiate Checkout' },
  { id: 'addPaymentInfo', label: 'Add Payment Info' },
  { id: 'costPerAddPaymentInfo', label: 'Custo p/ Add Payment Info' },
  { id: 'purchases', label: 'Compras' },
  { id: 'costPerPurchase', label: 'Custo p/ compra' },
  { id: 'purchaseValue', label: 'Valor de compras' },
  { id: 'roas', label: 'ROAS' },
  { id: 'leads', label: 'Leads' },
  { id: 'costPerLead', label: 'Custo p/ lead' },
];

const DEFAULT_VISIBLE: ColumnId[] = COLUMNS.map((c) => c.id);
const STORAGE_KEY = 'fb-campaign-mgr-cols-v1';

function ColumnsMenu({ visible, onChange }: { visible: ColumnId[]; onChange: (v: ColumnId[]) => void }) {
  const allChecked = visible.length === COLUMNS.length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Columns3 className="w-4 h-4" /> Colunas
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[220px]">
        <div
          className="flex items-center gap-2 px-2 py-1.5 hover:bg-accent rounded-sm cursor-pointer"
          onClick={() => onChange(allChecked ? ['name'] : COLUMNS.map((c) => c.id))}
        >
          <Checkbox checked={allChecked} />
          <span className="text-xs font-medium">{allChecked ? 'Desmarcar todas' : 'Marcar todas'}</span>
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-[60vh] overflow-y-auto">
          {COLUMNS.map((c) => (
            <DropdownMenuCheckboxItem
              key={c.id}
              checked={visible.includes(c.id)}
              disabled={c.id === 'name'}
              onCheckedChange={(checked) => {
                if (checked) onChange([...visible, c.id]);
                else onChange(visible.filter((x) => x !== c.id));
              }}
              onSelect={(e) => e.preventDefault()}
              className="text-xs"
            >
              {c.label}
            </DropdownMenuCheckboxItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const DELIVERY_LABEL: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: 'Ativa', cls: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' },
  PAUSED: { label: 'Inativa', cls: 'bg-muted text-muted-foreground' },
  CAMPAIGN_PAUSED: { label: 'Camp. pausada', cls: 'bg-muted text-muted-foreground' },
  ADSET_PAUSED: { label: 'Conj. pausado', cls: 'bg-muted text-muted-foreground' },
  ARCHIVED: { label: 'Arquivada', cls: 'bg-muted text-muted-foreground' },
  DELETED: { label: 'Excluída', cls: 'bg-destructive/15 text-destructive' },
  PENDING_REVIEW: { label: 'Em revisão', cls: 'bg-amber-500/15 text-amber-600' },
  DISAPPROVED: { label: 'Desaprovada', cls: 'bg-destructive/15 text-destructive' },
  WITH_ISSUES: { label: 'Rascunho', cls: 'bg-amber-500/15 text-amber-600' },
};

export default function CampaignManagerPage() {
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [datePreset, setDatePreset] = useState<string>('today');
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>(() => DATE_PRESETS[0].range());
  const [statuses, setStatuses] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState<Level>('campaign');
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(0);
  const [visibleCols, setVisibleCols] = useState<ColumnId[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return DEFAULT_VISIBLE;
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(visibleCols)); } catch {}
  }, [visibleCols]);

  // Optimistic toggle state: id -> 'ACTIVE' | 'PAUSED'
  const [statusOverride, setStatusOverride] = useState<Record<string, 'ACTIVE' | 'PAUSED'>>({});
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  const handleToggleStatus = async (r: Row, next: boolean) => {
    const newStatus: 'ACTIVE' | 'PAUSED' = next ? 'ACTIVE' : 'PAUSED';
    setStatusOverride((s) => ({ ...s, [r.id]: newStatus }));
    setTogglingIds((s) => new Set(s).add(r.id));
    try {
      const { data, error } = await supabase.functions.invoke('update-fb-entity-status', {
        body: { accountId: r.account.id, entityId: r.id, level, status: newStatus },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(newStatus === 'ACTIVE' ? 'Ativado' : 'Pausado');
    } catch (e: any) {
      setStatusOverride((s) => {
        const cp = { ...s };
        delete cp[r.id];
        return cp;
      });
      toast.error(e?.message || 'Falha ao atualizar status');
    } finally {
      setTogglingIds((s) => {
        const cp = new Set(s);
        cp.delete(r.id);
        return cp;
      });
    }
  };

  // ---- Bulk selection ----
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  useEffect(() => { setSelectedIds(new Set()); }, [accountIds, level, datePreset, dateRange.from, dateRange.to, statuses]);

  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds((s) => {
      const cp = new Set(s);
      if (checked) cp.add(id); else cp.delete(id);
      return cp;
    });
  };
  const toggleAllVisible = (checked: boolean) => {
    setSelectedIds((s) => {
      const cp = new Set(s);
      if (checked) visible.forEach((r) => cp.add(r.id));
      else visible.forEach((r) => cp.delete(r.id));
      return cp;
    });
  };

  const runBulk = async (status: 'ACTIVE' | 'PAUSED' | 'DELETED') => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (status === 'DELETED' && !confirm(`Excluir ${ids.length} ${level === 'campaign' ? 'campanha(s)' : level === 'adset' ? 'conjunto(s)' : 'anúncio(s)'}? Esta ação não pode ser desfeita.`)) return;
    setBulkBusy(true);
    let ok = 0, fail = 0;
    const byId = new Map(rows.map((r) => [r.id, r] as const));
    for (const id of ids) {
      const r = byId.get(id);
      if (!r) { fail++; continue; }
      try {
        const { data, error } = await supabase.functions.invoke('update-fb-entity-status', {
          body: { accountId: r.account.id, entityId: id, level, status },
        });
        if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
        if (status !== 'DELETED') {
          setStatusOverride((s) => ({ ...s, [id]: status }));
        }
        ok++;
      } catch (e: any) {
        fail++;
      }
    }
    setBulkBusy(false);
    if (status === 'DELETED') {
      setSelectedIds(new Set());
      refetch();
    }
    toast[fail === 0 ? 'success' : 'warning'](
      `${ok} concluído(s)${fail ? `, ${fail} falha(s)` : ''}`
    );
  };

  const [managerDialogOpen, setManagerDialogOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const buildManagerLinks = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return [] as { accountName: string; accountId: string; url: string; count: number }[];
    const byId = new Map(rows.map((r) => [r.id, r] as const));
    const grouped = new Map<string, { accountName: string; accountId: string; ids: string[] }>();
    for (const id of ids) {
      const r = byId.get(id);
      if (!r) continue;
      const actId = r.account.account_id.replace(/^act_/, '');
      const g = grouped.get(actId) || { accountName: r.account.name, accountId: actId, ids: [] };
      g.ids.push(id);
      grouped.set(actId, g);
    }
    const param = level === 'campaign' ? 'selected_campaign_ids' : level === 'adset' ? 'selected_adset_ids' : 'selected_ad_ids';
    const path = level === 'campaign' ? 'campaigns' : level === 'adset' ? 'adsets' : 'ads';
    return Array.from(grouped.values()).map((g) => ({
      accountName: g.accountName,
      accountId: g.accountId,
      count: g.ids.length,
      url: `https://business.facebook.com/adsmanager/manage/${path}?act=${g.accountId}&${param}=${g.ids.join(',')}`,
    }));
  };

  const openInManager = () => setManagerDialogOpen(true);
  const copyAllLinks = async (links: { url: string }[]) => {
    try {
      await navigator.clipboard.writeText(links.map((l) => l.url).join('\n'));
      toast.success('Links copiados');
    } catch { toast.error('Falha ao copiar'); }
  };
  const openAllLinks = (links: { url: string }[]) => {
    links.forEach((l) => window.open(l.url, '_blank', 'noopener'));
    setManagerDialogOpen(false);
  };



  const filterKey = useMemo(
    () => ({
      accountIds, level,
      dateFrom: format(dateRange.from, 'yyyy-MM-dd'),
      dateTo: format(dateRange.to, 'yyyy-MM-dd'),
      statuses,
    }),
    [accountIds, level, dateRange, statuses]
  );

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['fb-campaign-manager', filterKey],
    enabled: accountIds.length > 0,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('fetch-fb-campaign-manager', { body: filterKey });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { rows: Row[]; cached: boolean; fetchedAt: string };
    },
  });

  const rows = data?.rows || [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name?.toLowerCase().includes(q) || r.id.includes(q));
  }, [rows, search]);

  const [sort, setSort] = useState<{ col: ColumnId; dir: 'asc' | 'desc' } | null>({ col: 'spend', dir: 'desc' });

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const getVal = (r: Row, col: ColumnId): number | string | null => {
      const ins: any = r.insights || {};
      switch (col) {
        case 'name': return r.name || '';
        case 'delivery': return r.effective_status || '';
        case 'objective': return r.objective || '';
        case 'budget': return r.daily_budget ?? r.lifetime_budget ?? 0;
        case 'spend': return ins.spend ?? 0;
        case 'reach': return ins.reach ?? 0;
        case 'impressions': return ins.impressions ?? 0;
        case 'ctr': return ins.ctr ?? 0;
        case 'inlineLinkClicks': return ins.inline_link_clicks ?? 0;
        case 'costPerInlineLinkClick': return ins.cost_per_inline_link_click ?? 0;
        case 'frequency': return ins.frequency ?? 0;
        case 'uniqueClicks': return ins.unique_clicks ?? 0;
        case 'outboundClicks': return ins.outbound_clicks ?? 0;
        case 'costPerOutboundClick': return ins.cost_per_outbound_click ?? 0;
        case 'pageViews': return ins.page_views ?? 0;
        case 'costPerPageView': return ins.cost_per_page_view ?? 0;
        case 'viewContent': return ins.view_content ?? 0;
        case 'costPerViewContent': return ins.cost_per_view_content ?? 0;
        case 'addToCart': return ins.add_to_cart ?? 0;
        case 'costPerAddToCart': return ins.cost_per_add_to_cart ?? 0;
        case 'initiateCheckout': return ins.initiate_checkout ?? 0;
        case 'costPerInitiateCheckout': return ins.cost_per_initiate_checkout ?? 0;
        case 'addPaymentInfo': return ins.add_payment_info ?? 0;
        case 'costPerAddPaymentInfo': return ins.cost_per_add_payment_info ?? 0;
        case 'purchases': return ins.purchases ?? 0;
        case 'costPerPurchase': return ins.cost_per_purchase ?? 0;
        case 'purchaseValue': return ins.purchase_value ?? 0;
        case 'roas': return ins.roas ?? 0;
        case 'leads': return ins.leads ?? 0;
        case 'costPerLead': return ins.cost_per_lead ?? 0;
        default: return 0;
      }
    };
    const mult = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = getVal(a, sort.col);
      const vb = getVal(b, sort.col);
      if (typeof va === 'string' || typeof vb === 'string') {
        return String(va ?? '').localeCompare(String(vb ?? ''), 'pt-BR', { numeric: true }) * mult;
      }
      return (((va as number) || 0) - ((vb as number) || 0)) * mult;
    });
  }, [filtered, sort]);

  const handleSort = (col: ColumnId) => {
    setSort((prev) => {
      if (!prev || prev.col !== col) return { col, dir: 'desc' };
      if (prev.dir === 'desc') return { col, dir: 'asc' };
      return null;
    });
  };

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const visible = useMemo(
    () => sorted.slice(page * pageSize, page * pageSize + pageSize),
    [sorted, page, pageSize]
  );


  useEffect(() => { setPage(0); }, [filtered.length, level, accountIds, datePreset, statuses]);

  const [counts, setCounts] = useState<{ campaign?: number; adset?: number; ad?: number }>({});
  useEffect(() => { if (data?.rows) setCounts((prev) => ({ ...prev, [level]: data.rows.length })); }, [data, level]);
  useEffect(() => { setCounts({}); }, [accountIds, datePreset, dateRange.from, dateRange.to, statuses]);

  const showCol = (id: ColumnId) => visibleCols.includes(id);

  const renderCell = (id: ColumnId, r: Row) => {
    const currency = r.account.currency || 'BRL';
    const ins = r.insights || {};
    switch (id) {
      case 'name':
        return (
          <td className="p-3" key={id}>
            <div className="font-medium truncate max-w-[260px]">{r.name}</div>
            <div className="text-xs text-muted-foreground">{r.account.name}</div>
          </td>
        );
      case 'delivery': {
        const d = DELIVERY_LABEL[r.effective_status] || { label: r.effective_status, cls: 'bg-muted' };
        return (
          <td className="p-3" key={id}>
            <span className={cn('inline-flex items-center px-2 py-0.5 text-xs rounded-md border border-transparent', d.cls)}>
              {d.label}
            </span>
          </td>
        );
      }
      case 'objective':
        return <td className="p-3 text-xs" key={id}>{r.objective || '—'}</td>;
      case 'budget': {
        if (r.budget_source === 'adset') {
          return (
            <td className="p-3" key={id}>
              <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-md bg-muted text-muted-foreground">
                Conjuntos
              </span>
            </td>
          );
        }
        const budget = r.daily_budget || r.lifetime_budget;
        return (
          <td className="p-3" key={id}>
            {budget != null ? (
              <>
                {formatMoney(budget, currency)}
                <span className="text-xs text-muted-foreground ml-1">/{r.daily_budget ? 'dia' : 'vida'}</span>
              </>
            ) : '—'}
          </td>
        );
      }
      case 'spend': return <td className="p-3" key={id}>{formatMoney(ins.spend, currency)}</td>;
      case 'reach': return <td className="p-3" key={id}>{formatNumber(ins.reach)}</td>;
      case 'impressions': return <td className="p-3" key={id}>{formatNumber(ins.impressions)}</td>;
      case 'ctr': return <td className="p-3" key={id}>{formatPct(ins.ctr)}</td>;
      case 'inlineLinkClicks': return <td className="p-3" key={id}>{formatNumber(ins.inline_link_clicks)}</td>;
      case 'costPerInlineLinkClick': return <td className="p-3" key={id}>{formatMoney(ins.cost_per_inline_link_click, currency)}</td>;
      case 'frequency': return <td className="p-3" key={id}>{formatDec(ins.frequency)}</td>;
      case 'uniqueClicks': return <td className="p-3" key={id}>{formatNumber(ins.unique_clicks)}</td>;
      case 'outboundClicks': return <td className="p-3" key={id}>{formatNumber(ins.outbound_clicks)}</td>;
      case 'costPerOutboundClick': return <td className="p-3" key={id}>{formatMoney(ins.cost_per_outbound_click, currency)}</td>;
      case 'pageViews': return <td className="p-3" key={id}>{formatNumber(ins.page_views)}</td>;
      case 'costPerPageView': return <td className="p-3" key={id}>{formatMoney(ins.cost_per_page_view, currency)}</td>;
      case 'viewContent': return <td className="p-3" key={id}>{formatNumber(ins.view_content)}</td>;
      case 'costPerViewContent': return <td className="p-3" key={id}>{formatMoney(ins.cost_per_view_content, currency)}</td>;
      case 'addToCart': return <td className="p-3" key={id}>{formatNumber(ins.add_to_cart)}</td>;
      case 'costPerAddToCart': return <td className="p-3" key={id}>{formatMoney(ins.cost_per_add_to_cart, currency)}</td>;
      case 'initiateCheckout': return <td className="p-3" key={id}>{formatNumber(ins.initiate_checkout)}</td>;
      case 'costPerInitiateCheckout': return <td className="p-3" key={id}>{formatMoney(ins.cost_per_initiate_checkout, currency)}</td>;
      case 'addPaymentInfo': return <td className="p-3" key={id}>{formatNumber(ins.add_payment_info)}</td>;
      case 'costPerAddPaymentInfo': return <td className="p-3" key={id}>{formatMoney(ins.cost_per_add_payment_info, currency)}</td>;
      case 'purchases': return <td className="p-3" key={id}>{formatNumber(ins.purchases)}</td>;
      case 'costPerPurchase': return <td className="p-3" key={id}>{formatMoney(ins.cost_per_purchase, currency)}</td>;
      case 'purchaseValue': return <td className="p-3" key={id}>{formatMoney(ins.purchase_value, currency)}</td>;
      case 'roas': return <td className="p-3" key={id}>{formatDec(ins.roas)}</td>;
      case 'leads': return <td className="p-3" key={id}>{formatNumber(ins.leads)}</td>;
      case 'costPerLead': return <td className="p-3" key={id}>{formatMoney(ins.cost_per_lead, currency)}</td>;
    }
  };

  const visibleColumnDefs = COLUMNS.filter((c) => visibleCols.includes(c.id));
  const colCount = visibleColumnDefs.length + 1;

  return (
    <div className="p-6 space-y-4 min-w-0 max-w-full">

      <div className="bg-card border border-border rounded-xl p-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Folder className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Campanhas</h1>
            <p className="text-sm text-muted-foreground">
              {counts.campaign ?? 0} campanhas • {counts.adset ?? 0} conjuntos • {counts.ad ?? 0} anúncios
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isFetching} title="Atualizar">
            <RefreshCw className={cn('w-5 h-5', isFetching && 'animate-spin')} />
          </Button>
          <Button asChild>
            <Link to="/campanhas/criar"><Plus className="w-4 h-4 mr-1" /> Nova Campanha</Link>
          </Button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-3 flex flex-wrap items-center gap-3">
        <div className="min-w-[260px]">
          <AdAccountSelector multiSelect hideCount selectedAccounts={accountIds} onSelectionChange={setAccountIds} />
        </div>
        <div className="h-8 w-px bg-border" />
        <DateRangeFilter preset={datePreset} range={dateRange} onChange={(p, r) => { setDatePreset(p); setDateRange(r); }} />
        <StatusFilter value={statuses} onChange={setStatuses} />
        <div className="ml-auto relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 w-64" />
        </div>
      </div>

      <div className="flex items-center gap-2">
        {(
          [
            { v: 'campaign', label: 'Campanhas', icon: Megaphone },
            { v: 'adset', label: 'Conjuntos', icon: Layers },
            { v: 'ad', label: 'Anúncios', icon: FileText },
          ] as { v: Level; label: string; icon: any }[]
        ).map((t) => (
          <Button key={t.v} variant={level === t.v ? 'default' : 'outline'} size="sm" className="gap-2" onClick={() => setLevel(t.v)}>
            <t.icon className="w-4 h-4" />
            {t.label}
          </Button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden w-full max-w-full min-w-0">
        <div className="flex items-center gap-2 p-3 border-b border-border">
          {selectedIds.size > 0 ? (
            <>
              <span className="text-sm font-medium text-primary px-2">{selectedIds.size} selecionados</span>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>Limpar</Button>
              <div className="h-6 w-px bg-border mx-1" />
              <Button variant="outline" size="sm" className="gap-2" disabled={bulkBusy} onClick={() => runBulk('ACTIVE')}>
                <Play className="w-4 h-4" /> Ativar
              </Button>
              <Button variant="outline" size="sm" className="gap-2" disabled={bulkBusy} onClick={() => runBulk('PAUSED')}>
                <Pause className="w-4 h-4" /> Pausar
              </Button>
              <Button variant="outline" size="sm" className="gap-2 text-destructive hover:text-destructive" disabled={bulkBusy} onClick={() => runBulk('DELETED')}>
                <Trash2 className="w-4 h-4" /> Excluir
              </Button>
              <Button variant="outline" size="sm" className="gap-2" disabled={bulkBusy} onClick={() => setBulkEditOpen(true)}>
                <Pencil className="w-4 h-4" /> Editar em massa
              </Button>
              <Button variant="outline" size="sm" className="gap-2 text-primary" onClick={openInManager}>
                <ExternalLink className="w-4 h-4" /> Abrir no gerenciador
              </Button>
              {bulkBusy && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
              <div className="ml-auto"><ColumnsMenu visible={visibleCols} onChange={setVisibleCols} /></div>
            </>
          ) : (
            <div className="ml-auto"><ColumnsMenu visible={visibleCols} onChange={setVisibleCols} /></div>
          )}
        </div>

        <PaginationBar total={filtered.length} page={page} pageSize={pageSize} setPage={setPage} setPageSize={setPageSize} />

        <div className="w-full max-w-full overflow-x-auto">
          <table className="text-sm" style={{ minWidth: 'max-content' }}>
            <thead className="bg-muted/30 border-y border-border text-muted-foreground">
              <tr>
                <th className="w-10 p-3">
                  <Checkbox
                    checked={visible.length > 0 && visible.every((r) => selectedIds.has(r.id))}
                    onCheckedChange={(c) => toggleAllVisible(!!c)}
                  />
                </th>
                <th className="w-14 p-3 text-left text-xs font-medium"></th>
                {visibleColumnDefs.map((c) => (
                  <Th
                    key={c.id}
                    sortDir={sort?.col === c.id ? sort.dir : null}
                    onClick={() => handleSort(c.id)}
                  >
                    {c.id === 'name'
                      ? level === 'campaign' ? 'Campanha' : level === 'adset' ? 'Conjunto' : 'Anúncio'
                      : c.label}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && accountIds.length > 0 && (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={`sk-${i}`} className="border-b border-border">
                    <td className="p-3"><div className="h-4 w-4 rounded bg-muted animate-pulse" /></td>
                    <td className="p-3"><div className="h-4 w-8 rounded bg-muted animate-pulse" /></td>
                    {visibleColumnDefs.map((c) => (
                      <td className="p-3" key={c.id}>
                        <div className="h-3 rounded bg-muted animate-pulse" style={{ width: c.id === 'name' ? 220 : 80 }} />
                      </td>
                    ))}
                  </tr>
                ))
              )}
              {!isLoading && accountIds.length === 0 && (
                <tr><td colSpan={colCount + 1} className="p-12 text-center text-muted-foreground">
                  Selecione uma ou mais contas de anúncio para carregar campanhas.
                </td></tr>
              )}
              {!isLoading && accountIds.length > 0 && visible.length === 0 && (
                <tr><td colSpan={colCount + 1} className="p-12 text-center text-muted-foreground">Nenhum registro encontrado.</td></tr>
              )}
              {visible.map((r) => {
                const eff = statusOverride[r.id] || r.effective_status;
                const isActive = eff === 'ACTIVE';
                const canToggle = ['ACTIVE', 'PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED'].includes(eff);
                const rowOverride = { ...r, effective_status: eff } as Row;
                return (
                  <tr key={r.id} className="border-b border-border hover:bg-accent/20">
                    <td className="p-3">
                      <Checkbox
                        checked={selectedIds.has(r.id)}
                        onCheckedChange={(c) => toggleOne(r.id, !!c)}
                      />
                    </td>
                    <td className="p-3">
                      <Switch
                        checked={isActive}
                        disabled={!canToggle || togglingIds.has(r.id)}
                        onCheckedChange={(c) => handleToggleStatus(r, c)}
                      />
                    </td>
                    {visibleColumnDefs.map((c) => renderCell(c.id, rowOverride))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>


        <PaginationBar total={filtered.length} page={page} pageSize={pageSize} setPage={setPage} setPageSize={setPageSize} />
      </div>

      {data?.cached && (
        <p className="text-xs text-muted-foreground text-right">
          Dados em cache · atualizado em {format(new Date(data.fetchedAt), 'HH:mm:ss')} (refresh a cada 2 min)
        </p>
      )}

      <ManagerLinksDialog
        open={managerDialogOpen}
        onOpenChange={setManagerDialogOpen}
        links={managerDialogOpen ? buildManagerLinks() : []}
        level={level}
        onCopyAll={copyAllLinks}
        onOpenAll={openAllLinks}
      />

      <BulkEditDialog
        open={bulkEditOpen}
        onOpenChange={setBulkEditOpen}
        level={level}
        items={Array.from(selectedIds).map((id) => {
          const r = rows.find((x) => x.id === id);
          return r ? { accountId: r.account.id, entityId: id, name: r.name } : null;
        }).filter(Boolean) as { accountId: string; entityId: string; name?: string }[]}
        onDone={() => { setSelectedIds(new Set()); refetch(); }}
      />
    </div>
  );
}

function ManagerLinksDialog({
  open, onOpenChange, links, level, onCopyAll, onOpenAll,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  links: { accountName: string; accountId: string; url: string; count: number }[];
  level: Level;
  onCopyAll: (l: { url: string }[]) => void;
  onOpenAll: (l: { url: string }[]) => void;
}) {
  const totalCount = links.reduce((s, l) => s + l.count, 0);
  const noun = level === 'campaign' ? 'campanha(s)' : level === 'adset' ? 'conjunto(s)' : 'anúncio(s)';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Facebook className="w-5 h-5 text-primary" />
            Abrir no Gerenciador de Anúncios
          </DialogTitle>
          <DialogDescription>
            {links.length > 1
              ? `Um link será gerado por conta para abrir no Facebook Ads Manager.`
              : `Um link será gerado para abrir no Facebook Ads Manager.`}
          </DialogDescription>
        </DialogHeader>

        <div className="text-sm text-muted-foreground">
          {totalCount} {noun} selecionada(s){links.length > 1 ? ` em ${links.length} contas` : ''}
        </div>

        <div className="space-y-2 max-h-[320px] overflow-y-auto">
          {links.map((l) => (
            <div key={l.accountId} className="flex items-center gap-3 border border-border rounded-lg p-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{l.accountName}</div>
                <div className="text-xs text-muted-foreground truncate">{l.url}</div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(l.url);
                    toast.success('Link copiado');
                  } catch { toast.error('Falha ao copiar'); }
                }}
                title="Copiar link"
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" className="gap-2" onClick={() => onCopyAll(links)}>
            <Copy className="w-4 h-4" /> Copiar {links.length > 1 ? 'links' : 'link'}
          </Button>
          <Button className="gap-2" onClick={() => onOpenAll(links)}>
            <ExternalLink className="w-4 h-4" /> Abrir no navegador
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function Th({ children, sortDir, onClick }: { children: React.ReactNode; sortDir?: 'asc' | 'desc' | null; onClick?: () => void }) {
  const active = !!sortDir;
  return (
    <th className="p-3 text-left text-xs font-medium whitespace-nowrap">
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${active ? 'text-foreground' : ''}`}
      >
        {children}
        {sortDir === 'asc' ? (
          <ArrowUp className="w-3 h-3 opacity-80" />
        ) : sortDir === 'desc' ? (
          <ArrowDown className="w-3 h-3 opacity-80" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-40" />
        )}
      </button>
    </th>
  );
}
}

function PaginationBar({
  total, page, pageSize, setPage, setPageSize,
}: { total: number; page: number; pageSize: number; setPage: (n: number) => void; setPageSize: (n: number) => void }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between p-3 text-sm text-muted-foreground border-b border-border last:border-b-0">
      <div className="flex items-center gap-3">
        <span>{total} registros</span>
        <span>·</span>
        <span>Por página:</span>
        <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
          <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[25, 50, 100, 200].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={() => setPage(0)} disabled={page === 0}><ChevronsLeft className="w-4 h-4" /></Button>
        <Button variant="ghost" size="icon" onClick={() => setPage(page - 1)} disabled={page === 0}><ChevronLeft className="w-4 h-4" /></Button>
        <span className="px-2">{total === 0 ? '0 / 0' : `${page + 1} / ${pageCount}`}</span>
        <Button variant="ghost" size="icon" onClick={() => setPage(page + 1)} disabled={page >= pageCount - 1}><ChevronRight className="w-4 h-4" /></Button>
        <Button variant="ghost" size="icon" onClick={() => setPage(pageCount - 1)} disabled={page >= pageCount - 1}><ChevronsRight className="w-4 h-4" /></Button>
      </div>
    </div>
  );
}
