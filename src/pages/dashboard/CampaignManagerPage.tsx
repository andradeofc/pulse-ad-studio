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
  Loader2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => onChange(STATUS_OPTIONS.map((s) => s.value))}
            >
              Selecionar todos
            </button>
            <span className="text-muted-foreground">·</span>
            <button type="button" className="text-primary hover:underline" onClick={() => onChange([])}>
              Limpar
            </button>
          </div>
        </div>
        <div className="space-y-1.5">
          {STATUS_OPTIONS.map((s) => (
            <label
              key={s.value}
              className="flex items-center gap-2.5 text-sm py-1.5 cursor-pointer hover:bg-accent/40 rounded px-1"
            >
              <Checkbox
                checked={value.length === 0 ? true : value.includes(s.value)}
                onCheckedChange={() => toggle(s.value)}
              />
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
  preset,
  range,
  onChange,
}: {
  preset: string;
  range: { from: Date; to: Date };
  onChange: (preset: string, range: { from: Date; to: Date }) => void;
}) {
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
                onClick={() => {
                  onChange(p.id, p.range());
                  setOpen(false);
                }}
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
            onSelect={(r: any) => {
              if (r?.from && r?.to) {
                onChange('custom', { from: r.from, to: r.to });
              }
            }}
            numberOfMonths={1}
            locale={ptBR}
            className={cn('p-0 pointer-events-auto')}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface Row {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  objective?: string | null;
  campaign_id?: string | null;
  adset_id?: string | null;
  daily_budget?: number | null;
  lifetime_budget?: number | null;
  account: { id: string; account_id: string; name: string; currency?: string | null };
  insights: {
    spend?: number;
    reach?: number;
    impressions?: number;
    clicks?: number;
    link_clicks?: number;
    ctr?: number;
    cpc?: number;
    frequency?: number;
    purchases?: number;
  };
}

function formatMoney(v: number | undefined, currency = 'BRL') {
  if (v == null) return '—';
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(v);
  } catch {
    return v.toFixed(2);
  }
}
function formatNumber(v: number | undefined) {
  if (v == null) return '—';
  return new Intl.NumberFormat('pt-BR').format(v);
}

export default function CampaignManagerPage() {
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [datePreset, setDatePreset] = useState<string>('today');
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>(() => DATE_PRESETS[0].range());
  const [statuses, setStatuses] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState<Level>('campaign');
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(0);

  const filterKey = useMemo(
    () => ({
      accountIds,
      level,
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
      const { data, error } = await supabase.functions.invoke('fetch-fb-campaign-manager', {
        body: filterKey,
      });
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

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = useMemo(
    () => filtered.slice(page * pageSize, page * pageSize + pageSize),
    [filtered, page, pageSize]
  );

  useEffect(() => {
    setPage(0);
  }, [filtered.length, level, accountIds, datePreset, statuses]);

  const [counts, setCounts] = useState<{ campaign?: number; adset?: number; ad?: number }>({});

  useEffect(() => {
    if (data?.rows) {
      setCounts((prev) => ({ ...prev, [level]: data.rows.length }));
    }
  }, [data, level]);

  // Reset counts when filters that affect data change
  useEffect(() => {
    setCounts({});
  }, [accountIds, datePreset, dateRange.from, dateRange.to, statuses]);

  return (
    <div className="p-6 space-y-4">
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
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Atualizar"
          >
            <RefreshCw className={cn('w-5 h-5', isFetching && 'animate-spin')} />
          </Button>
          <Button asChild>
            <Link to="/campanhas/criar">
              <Plus className="w-4 h-4 mr-1" /> Nova Campanha
            </Link>
          </Button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-3 flex flex-wrap items-center gap-3">
        <div className="min-w-[260px]">
          <AdAccountSelector
            multiSelect
            hideCount
            selectedAccounts={accountIds}
            onSelectionChange={setAccountIds}
          />
        </div>
        <div className="h-8 w-px bg-border" />
        <DateRangeFilter
          preset={datePreset}
          range={dateRange}
          onChange={(p, r) => {
            setDatePreset(p);
            setDateRange(r);
          }}
        />
        <StatusFilter value={statuses} onChange={setStatuses} />
        <div className="ml-auto relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 w-64"
          />
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
          <Button
            key={t.v}
            variant={level === t.v ? 'default' : 'outline'}
            size="sm"
            className="gap-2"
            onClick={() => setLevel(t.v)}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </Button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex justify-end p-3 border-b border-border">
          <Button variant="ghost" size="sm" className="gap-2" disabled>
            <Columns3 className="w-4 h-4" /> Colunas
          </Button>
        </div>

        <PaginationBar
          total={filtered.length}
          page={page}
          pageSize={pageSize}
          setPage={setPage}
          setPageSize={setPageSize}
        />

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-y border-border text-muted-foreground">
              <tr>
                <th className="w-10 p-3"><Checkbox /></th>
                <Th>{level === 'campaign' ? 'Campanha' : level === 'adset' ? 'Conjunto' : 'Anúncio'}</Th>
                <Th>Veiculação</Th>
                <Th>Objetivo</Th>
                <Th>Orçamento</Th>
                <Th>Gasto</Th>
                <Th>Alcance</Th>
                <Th>Impressões</Th>
                <Th>CTR</Th>
                <Th>Cliques no Link</Th>
                <Th>CPC do Link</Th>
                <Th>Frequência</Th>
              </tr>
            </thead>
            <tbody>
              {isLoading && accountIds.length > 0 && (
                <tr>
                  <td colSpan={12} className="p-10 text-center text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Carregando...
                  </td>
                </tr>
              )}
              {!isLoading && accountIds.length === 0 && (
                <tr>
                  <td colSpan={12} className="p-12 text-center text-muted-foreground">
                    Selecione uma ou mais contas de anúncio para carregar campanhas.
                  </td>
                </tr>
              )}
              {!isLoading && accountIds.length > 0 && visible.length === 0 && (
                <tr>
                  <td colSpan={12} className="p-12 text-center text-muted-foreground">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              )}
              {visible.map((r) => {
                const currency = r.account.currency || 'BRL';
                const budget = r.daily_budget || r.lifetime_budget;
                return (
                  <tr key={r.id} className="border-b border-border hover:bg-accent/20">
                    <td className="p-3"><Checkbox /></td>
                    <td className="p-3">
                      <div className="font-medium truncate max-w-[260px]">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{r.account.name}</div>
                    </td>
                    <td className="p-3">
                      <Badge variant={r.effective_status === 'ACTIVE' ? 'default' : 'secondary'}>
                        {r.effective_status}
                      </Badge>
                    </td>
                    <td className="p-3">{r.objective || '—'}</td>
                    <td className="p-3">
                      {budget != null ? (
                        <>
                          {formatMoney(budget, currency)}
                          <span className="text-xs text-muted-foreground ml-1">
                            /{r.daily_budget ? 'dia' : 'vida'}
                          </span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="p-3">{formatMoney(r.insights.spend, currency)}</td>
                    <td className="p-3">{formatNumber(r.insights.reach)}</td>
                    <td className="p-3">{formatNumber(r.insights.impressions)}</td>
                    <td className="p-3">
                      {r.insights.ctr != null ? `${r.insights.ctr.toFixed(2)}%` : '—'}
                    </td>
                    <td className="p-3">{formatNumber(r.insights.link_clicks)}</td>
                    <td className="p-3">
                      {r.insights.link_clicks
                        ? formatMoney((r.insights.spend || 0) / r.insights.link_clicks, currency)
                        : '—'}
                    </td>
                    <td className="p-3">
                      {r.insights.frequency != null ? r.insights.frequency.toFixed(2) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <PaginationBar
          total={filtered.length}
          page={page}
          pageSize={pageSize}
          setPage={setPage}
          setPageSize={setPageSize}
        />
      </div>

      {data?.cached && (
        <p className="text-xs text-muted-foreground text-right">
          Dados em cache · atualizado em {format(new Date(data.fetchedAt), 'HH:mm:ss')} (refresh a cada 2 min)
        </p>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="p-3 text-left text-xs font-medium whitespace-nowrap">
      <span className="inline-flex items-center gap-1">
        {children}
        <ArrowUpDown className="w-3 h-3 opacity-40" />
      </span>
    </th>
  );
}

function PaginationBar({
  total,
  page,
  pageSize,
  setPage,
  setPageSize,
}: {
  total: number;
  page: number;
  pageSize: number;
  setPage: (n: number) => void;
  setPageSize: (n: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between p-3 text-sm text-muted-foreground border-b border-border last:border-b-0">
      <div className="flex items-center gap-3">
        <span>{total} registros</span>
        <span>·</span>
        <span>Por página:</span>
        <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
          <SelectTrigger className="h-8 w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[25, 50, 100, 200].map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={() => setPage(0)} disabled={page === 0}>
          <ChevronsLeft className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setPage(page - 1)} disabled={page === 0}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="px-2">
          {total === 0 ? '0 / 0' : `${page + 1} / ${pageCount}`}
        </span>
        <Button variant="ghost" size="icon" onClick={() => setPage(page + 1)} disabled={page >= pageCount - 1}>
          <ChevronRight className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setPage(pageCount - 1)} disabled={page >= pageCount - 1}>
          <ChevronsRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
