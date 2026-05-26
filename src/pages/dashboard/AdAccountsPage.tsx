import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Search,
  Facebook,
  RefreshCw,
  Building2,
  User,
  DollarSign,
  TrendingUp,
  Pencil,
  Check,
  X,
  Store,
  Filter,
  Clock,
  Columns3,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { fetchFacebookProfiles, fetchAdAccounts, syncFacebookAdAccounts, type FacebookAdAccount, type FacebookProfile } from '@/services/facebookService';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const statusConfig: Record<string, { label: string; className: string; icon?: typeof AlertTriangle }> = {
  active: { label: 'Ativa', className: 'badge-active' },
  blocked: { label: 'Bloqueada', className: 'badge-danger', icon: X },
  disabled: { label: 'Desativada', className: 'bg-muted text-muted-foreground' },
  unsettled: { label: 'Pendente', className: 'badge-warning', icon: AlertTriangle },
  unknown: { label: 'Desconhecido', className: 'bg-muted text-muted-foreground' },
};

// Approximate FX rates to BRL (used to consolidate multi-currency totals)
const FX_TO_BRL: Record<string, number> = {
  BRL: 1, USD: 5.20, EUR: 5.65, GBP: 6.60,
  ARS: 0.0055, MXN: 0.28, CLP: 0.0055, COP: 0.0013, PEN: 1.38,
};

// Convert a Facebook timezone name to UTC offset label
function tzToOffset(tz: string | null): string {
  if (!tz) return '—';
  try {
    const dt = new Date();
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' });
    const parts = fmt.formatToParts(dt);
    const offset = parts.find(p => p.type === 'timeZoneName')?.value || '';
    return offset.replace('GMT', 'UTC') || tz;
  } catch {
    return tz;
  }
}

function formatRelativeDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    }).format(d);
  } catch {
    return '—';
  }
}

export default function AdAccountsPage() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<FacebookAdAccount[]>([]);
  const [profiles, setProfiles] = useState<FacebookProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currencyFilter, setCurrencyFilter] = useState('all');
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Nickname editing state
  const [editingNicknameId, setEditingNicknameId] = useState<string | null>(null);
  const [nicknameValue, setNicknameValue] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const profilesData = await fetchFacebookProfiles();
      setProfiles(profilesData);
      const allAccounts: FacebookAdAccount[] = [];
      for (const profile of profilesData) {
        const accs = await fetchAdAccounts(profile.id);
        allAccounts.push(...accs);
      }
      setAccounts(allAccounts);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Erro ao carregar contas');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncAll = async () => {
    if (profiles.length === 0) { toast.error('Nenhum perfil conectado'); return; }
    try {
      setSyncing(true);
      for (const profile of profiles) {
        await syncFacebookAdAccounts(profile.id);
      }
      await loadData();
      toast.success('Contas sincronizadas com sucesso!');
    } catch (error) {
      console.error('Error syncing:', error);
      toast.error('Erro ao sincronizar contas');
    } finally {
      setSyncing(false);
    }
  };

  const startEditNickname = (account: FacebookAdAccount) => {
    setEditingNicknameId(account.id);
    setNicknameValue(account.nickname || '');
  };
  const cancelEditNickname = () => { setEditingNicknameId(null); setNicknameValue(''); };
  const saveNickname = async (accountId: string) => {
    const trimmed = nicknameValue.trim();
    const newNickname = trimmed || null;
    const { error } = await supabase
      .from('facebook_ad_accounts')
      .update({ nickname: newNickname } as any)
      .eq('id', accountId);
    if (error) { toast.error('Erro ao salvar apelido'); console.error(error); return; }
    setAccounts(prev => prev.map(a => a.id === accountId ? { ...a, nickname: newNickname } : a));
    setEditingNicknameId(null);
    setNicknameValue('');
    toast.success('Apelido salvo!');
  };

  const uniqueBMs = [...new Set(accounts.map(a => a.business_name || 'Pessoal'))];

  const filteredAccounts = useMemo(() => accounts.filter((account) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      account.name.toLowerCase().includes(q) ||
      account.account_id.toLowerCase().includes(q) ||
      (account.nickname || '').toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'all' || account.status === statusFilter;
    const matchesCurrency = currencyFilter === 'all' || account.currency === currencyFilter;
    return matchesSearch && matchesStatus && matchesCurrency;
  }), [accounts, searchQuery, statusFilter, currencyFilter]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [searchQuery, statusFilter, currencyFilter, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredAccounts.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIdx = (currentPage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, filteredAccounts.length);
  const pagedAccounts = filteredAccounts.slice(startIdx, endIdx);

  const activeCount = accounts.filter((a) => a.status === 'active').length;

  // Aggregate spend by currency + total in BRL
  const { spendByCurrency, totalSpendBRL } = useMemo(() => {
    const byCurr: Record<string, number> = {};
    for (const acc of accounts) {
      const v = acc.amount_spent || 0;
      if (!v) continue;
      const curr = acc.currency || 'BRL';
      byCurr[curr] = (byCurr[curr] || 0) + v;
    }
    const totalBRL = Object.entries(byCurr).reduce(
      (sum, [curr, val]) => sum + val * (FX_TO_BRL[curr] ?? 1), 0
    );
    return { spendByCurrency: byCurr, totalSpendBRL: totalBRL };
  }, [accounts]);

  const spendBreakdown = useMemo(() => {
    const entries = Object.entries(spendByCurrency).filter(([, v]) => v > 0);
    entries.sort(([a], [b]) => (a === 'BRL' ? -1 : b === 'BRL' ? 1 : a.localeCompare(b)));
    return entries;
  }, [spendByCurrency]);

  const formatCurrency = (value: number | null, currency: string | null) => {
    if (value === null || value === 0) return '—';
    const curr = currency || 'BRL';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency', currency: curr, minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(value);
  };

  const formatCurrencyCompact = (value: number, currency: string) => {
    try {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0,
      }).format(value);
    } catch {
      return `${currency} ${Math.round(value).toLocaleString('pt-BR')}`;
    }
  };

  const toggleAll = (checked: boolean) => {
    setSelectedAccounts(checked ? pagedAccounts.map(a => a.id) : []);
  };
  const toggleOne = (id: string, checked: boolean) => {
    setSelectedAccounts(prev => checked ? [...prev, id] : prev.filter(x => x !== id));
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Store className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground leading-tight">Contas de Anúncio</h1>
            <p className="text-sm text-muted-foreground">
              {accounts.length} contas <span className="mx-1.5 text-muted-foreground/60">•</span> {activeCount} ativas
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handleSyncAll}
            disabled={syncing || profiles.length === 0}
            title="Sincronizar todas"
          >
            <RefreshCw className={cn('w-4 h-4', syncing && 'animate-spin')} />
          </Button>
          <Button onClick={() => navigate('/perfis-facebook')}>
            <Facebook className="w-4 h-4 mr-2" />
            Conectar Facebook
          </Button>
        </div>
      </div>

      {/* Summary Cards (kept 4 as requested) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="glass-card">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Store className="w-6 h-6 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">Total de Contas</p>
                <p className="text-3xl font-bold text-foreground mt-0.5">{accounts.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-ads-success/10 flex items-center justify-center shrink-0">
                <Check className="w-6 h-6 text-ads-success" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">Contas Ativas</p>
                <p className="text-3xl font-bold text-foreground mt-0.5">{activeCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-ads-info/10 flex items-center justify-center shrink-0">
                <Building2 className="w-6 h-6 text-ads-info" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">Business Managers</p>
                <p className="text-3xl font-bold text-foreground mt-0.5">{uniqueBMs.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-ads-success/10 flex items-center justify-center shrink-0">
                <DollarSign className="w-6 h-6 text-ads-success" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-muted-foreground">Total Investido</p>
                <p className="text-2xl font-bold text-ads-success mt-0.5 truncate">
                  {formatCurrencyCompact(totalSpendBRL, 'BRL')}
                </p>
                {spendBreakdown.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    {spendBreakdown.map(([curr, val]) => formatCurrencyCompact(val, curr)).join(' • ')}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, ID ou apelido..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-11 bg-card"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full md:w-48 h-11 bg-card">
            <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Todos os status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="active">Ativa</SelectItem>
            <SelectItem value="blocked">Bloqueada</SelectItem>
            <SelectItem value="disabled">Desativada</SelectItem>
            <SelectItem value="unsettled">Pendente</SelectItem>
          </SelectContent>
        </Select>
        <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
          <SelectTrigger className="w-full md:w-44 h-11 bg-card">
            <DollarSign className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Todas moedas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas moedas</SelectItem>
            <SelectItem value="BRL">BRL</SelectItem>
            <SelectItem value="USD">USD</SelectItem>
            <SelectItem value="EUR">EUR</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Loading / Empty */}
      {loading ? (
        <Card className="glass-card">
          <CardContent className="p-8 text-center">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
            <p className="text-muted-foreground mt-4">Carregando contas...</p>
          </CardContent>
        </Card>
      ) : accounts.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="p-8 text-center">
            <Facebook className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">Nenhuma conta encontrada</h3>
            <p className="text-muted-foreground mb-4">
              Conecte um perfil do Facebook e sincronize suas contas de anúncio.
            </p>
            <Button onClick={() => navigate('/perfis-facebook')}>
              <Facebook className="w-4 h-4 mr-2" />
              Conectar Facebook
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Columns toolbar */}
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              <Columns3 className="w-4 h-4 mr-2" />
              Colunas
            </Button>
          </div>

          {/* Pagination header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-1">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">
                {startIdx + 1}–{endIdx} de {filteredAccounts.length}
              </span>
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Por página:</span>
                <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                  <SelectTrigger className="h-8 w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                    <SelectItem value="200">200</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage === 1} onClick={() => setPage(1)}>
                <ChevronsLeft className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-muted-foreground px-3">
                {currentPage} / {totalPages}
              </span>
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage === totalPages} onClick={() => setPage(totalPages)}>
                <ChevronsRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Table */}
          <Card className="glass-card">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="w-10 py-3 px-4">
                        <Checkbox
                          checked={pagedAccounts.length > 0 && selectedAccounts.length === pagedAccounts.length}
                          onCheckedChange={(c) => toggleAll(Boolean(c))}
                        />
                      </th>
                      {[
                        { label: 'Conta' },
                        { label: 'ID da Conta' },
                        { label: 'Apelido' },
                        { label: 'Status' },
                        { label: 'Moeda' },
                        { label: 'Fuso' },
                        { label: 'Gasto Total', align: 'right' as const },
                        { label: 'Última atividade' },
                      ].map((col) => (
                        <th
                          key={col.label}
                          className={cn(
                            'py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap',
                            col.align === 'right' ? 'text-right' : 'text-left'
                          )}
                        >
                          <div className={cn('flex items-center gap-1.5', col.align === 'right' && 'justify-end')}>
                            {col.label}
                            <ArrowUpDown className="w-3 h-3 opacity-50" />
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedAccounts.map((account) => {
                      const status = statusConfig[account.status] || statusConfig.unknown;
                      const StatusIcon = status.icon;
                      const isEditing = editingNicknameId === account.id;
                      const isSelected = selectedAccounts.includes(account.id);
                      return (
                        <motion.tr
                          key={account.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="border-b border-border/40 hover:bg-secondary/30 transition-colors"
                        >
                          <td className="py-3 px-4">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(c) => toggleOne(account.id, Boolean(c))}
                            />
                          </td>
                          {/* Conta */}
                          <td className="py-3 px-4 min-w-[180px]">
                            <div className="flex flex-col">
                              <span className="text-sm font-semibold text-foreground">{account.name}</span>
                              {account.business_name ? (
                                <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                  <Building2 className="w-3 h-3" />
                                  {account.business_name}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                  <User className="w-3 h-3" />
                                  Pessoal
                                </span>
                              )}
                            </div>
                          </td>
                          {/* ID */}
                          <td className="py-3 px-4">
                            <code className="text-xs bg-secondary/60 px-2 py-1 rounded text-foreground font-mono">
                              {account.account_id}
                            </code>
                          </td>
                          {/* Apelido */}
                          <td className="py-3 px-4 min-w-[160px]">
                            {isEditing ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  value={nicknameValue}
                                  onChange={(e) => setNicknameValue(e.target.value)}
                                  placeholder="Ex: PP, Conta Principal..."
                                  className="h-7 text-xs w-36 bg-secondary/50 px-2"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveNickname(account.id);
                                    if (e.key === 'Escape') cancelEditNickname();
                                  }}
                                />
                                <button onClick={() => saveNickname(account.id)} className="p-1 rounded hover:bg-ads-success/20 text-ads-success transition-colors">
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={cancelEditNickname} className="p-1 rounded hover:bg-destructive/20 text-destructive transition-colors">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : account.nickname ? (
                              <button
                                onClick={() => startEditNickname(account)}
                                className="group inline-flex items-center gap-1.5"
                              >
                                <Badge variant="outline" className="text-xs font-normal gap-1">
                                  {account.nickname}
                                  <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </Badge>
                              </button>
                            ) : (
                              <button
                                onClick={() => startEditNickname(account)}
                                className="text-xs text-muted-foreground/60 italic hover:text-primary transition-colors"
                              >
                                Sem apelido
                              </button>
                            )}
                          </td>
                          {/* Status */}
                          <td className="py-3 px-4">
                            <Badge className={cn(status.className, 'gap-1 font-medium')}>
                              {StatusIcon && <StatusIcon className="w-3 h-3" />}
                              {status.label}
                            </Badge>
                          </td>
                          {/* Moeda */}
                          <td className="py-3 px-4">
                            <Badge variant="outline" className="text-xs font-mono">
                              {account.currency || '—'}
                            </Badge>
                          </td>
                          {/* Fuso */}
                          <td className="py-3 px-4">
                            <span className="text-xs text-muted-foreground flex items-center gap-1.5 whitespace-nowrap">
                              <Clock className="w-3 h-3" />
                              {tzToOffset(account.timezone)}
                            </span>
                          </td>
                          {/* Gasto Total */}
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <span className={cn(
                              'text-sm font-semibold',
                              account.amount_spent && account.amount_spent > 0 ? 'text-foreground' : 'text-muted-foreground'
                            )}>
                              {formatCurrency(account.amount_spent, account.currency)}
                            </span>
                          </td>
                          {/* Última atividade */}
                          <td className="py-3 px-4">
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {formatRelativeDate(account.spend_updated_at)}
                            </span>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
