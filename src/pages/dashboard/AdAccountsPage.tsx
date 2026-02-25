import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Search,
  Filter,
  Facebook,
  RefreshCw,
  Building2,
  User,
  DollarSign,
  TrendingUp,
  Pencil,
  Check,
  X,
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

const statusConfig: Record<string, { label: string; className: string }> = {
  active: { label: 'Ativa', className: 'badge-active' },
  blocked: { label: 'Bloqueada', className: 'badge-danger' },
  disabled: { label: 'Desativada', className: 'bg-muted text-muted-foreground' },
  unsettled: { label: 'Pendente', className: 'badge-warning' },
  unknown: { label: 'Desconhecido', className: 'bg-muted text-muted-foreground' },
};

export default function AdAccountsPage() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<FacebookAdAccount[]>([]);
  const [profiles, setProfiles] = useState<FacebookProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currencyFilter, setCurrencyFilter] = useState('all');
  const [bmFilter, setBmFilter] = useState('all');
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  
  // Nickname editing state
  const [editingNicknameId, setEditingNicknameId] = useState<string | null>(null);
  const [nicknameValue, setNicknameValue] = useState('');

  // Load profiles and their ad accounts
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const profilesData = await fetchFacebookProfiles();
      setProfiles(profilesData);

      // Fetch ad accounts for all profiles
      const allAccounts: FacebookAdAccount[] = [];
      for (const profile of profilesData) {
        const accounts = await fetchAdAccounts(profile.id);
        allAccounts.push(...accounts);
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
    if (profiles.length === 0) {
      toast.error('Nenhum perfil conectado');
      return;
    }

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

  const cancelEditNickname = () => {
    setEditingNicknameId(null);
    setNicknameValue('');
  };

  const saveNickname = async (accountId: string) => {
    const trimmed = nicknameValue.trim();
    const newNickname = trimmed || null;
    
    const { error } = await supabase
      .from('facebook_ad_accounts')
      .update({ nickname: newNickname } as any)
      .eq('id', accountId);

    if (error) {
      toast.error('Erro ao salvar apelido');
      console.error(error);
      return;
    }

    setAccounts(prev => prev.map(a => a.id === accountId ? { ...a, nickname: newNickname } : a));
    setEditingNicknameId(null);
    setNicknameValue('');
    toast.success('Apelido salvo!');
  };

  // Get unique BM names for filter
  const uniqueBMs = [...new Set(accounts.map(a => a.business_name || 'Pessoal'))];

  const filteredAccounts = accounts.filter((account) => {
    const matchesSearch =
      account.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      account.account_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (account.nickname || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || account.status === statusFilter;
    const matchesCurrency = currencyFilter === 'all' || account.currency === currencyFilter;
    const matchesBM = bmFilter === 'all' || (account.business_name || 'Pessoal') === bmFilter;
    return matchesSearch && matchesStatus && matchesCurrency && matchesBM;
  });

  const activeCount = accounts.filter((a) => a.status === 'active').length;

  // Calculate total spend (memoized for performance)
  const totalSpend = useMemo(() => {
    return accounts.reduce((sum, acc) => sum + (acc.amount_spent || 0), 0);
  }, [accounts]);

  // Format currency
  const formatCurrency = (value: number | null, currency: string | null) => {
    if (value === null || value === 0) return '-';
    const curr = currency || 'BRL';
    return new Intl.NumberFormat('pt-BR', { 
      style: 'currency', 
      currency: curr,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contas de Anúncio</h1>
          <p className="text-muted-foreground">
            {accounts.length} contas · {activeCount} ativas
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => navigate('/perfis-facebook')}>
            <Facebook className="w-4 h-4 mr-2" />
            Gerenciar Perfis
          </Button>
          <Button onClick={handleSyncAll} disabled={syncing || profiles.length === 0}>
            <RefreshCw className={cn("w-4 h-4 mr-2", syncing && "animate-spin")} />
            {syncing ? 'Sincronizando...' : 'Sincronizar Todas'}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="glass-card">
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Total de Contas</p>
            <p className="text-3xl font-bold text-foreground mt-1">{accounts.length}</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Contas Ativas</p>
            <p className="text-3xl font-bold text-foreground mt-1">{activeCount}</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Business Managers</p>
            <p className="text-3xl font-bold text-foreground mt-1">{uniqueBMs.length}</p>
          </CardContent>
        </Card>
        <Card className="glass-card overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-ads-success to-ads-success/50" />
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5" />
                  Gasto Total (Lifetime)
                </p>
                <p className="text-3xl font-bold text-ads-success mt-1">
                  {formatCurrency(totalSpend, 'BRL')}
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-ads-success/20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, apelido ou ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-secondary/50"
              />
            </div>
            <Select value={bmFilter} onValueChange={setBmFilter}>
              <SelectTrigger className="w-full md:w-48 bg-secondary/50">
                <SelectValue placeholder="Business Manager" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as BMs</SelectItem>
                {uniqueBMs.map((bm) => (
                  <SelectItem key={bm} value={bm}>{bm}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-40 bg-secondary/50">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativa</SelectItem>
                <SelectItem value="disabled">Desativada</SelectItem>
                <SelectItem value="unsettled">Pendente</SelectItem>
              </SelectContent>
            </Select>
            <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
              <SelectTrigger className="w-full md:w-32 bg-secondary/50">
                <SelectValue placeholder="Moeda" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="BRL">BRL</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Loading State */}
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
              Gerenciar Perfis
            </Button>
          </CardContent>
        </Card>
      ) : (
        /* Table */
        <Card className="glass-card">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-4 px-4 text-sm font-medium text-muted-foreground">
                      Conta
                    </th>
                    <th className="text-left py-4 px-4 text-sm font-medium text-muted-foreground">
                      ID da Conta
                    </th>
                    <th className="text-left py-4 px-4 text-sm font-medium text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4" />
                        Business Manager
                      </div>
                    </th>
                    <th className="text-left py-4 px-4 text-sm font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="text-right py-4 px-4 text-sm font-medium text-muted-foreground">
                      <div className="flex items-center justify-end gap-2">
                        <DollarSign className="w-4 h-4" />
                        Gasto Total
                      </div>
                    </th>
                    <th className="text-left py-4 px-4 text-sm font-medium text-muted-foreground">
                      Moeda
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAccounts.map((account) => {
                    const status = statusConfig[account.status] || statusConfig.unknown;
                    const isEditing = editingNicknameId === account.id;
                    return (
                      <motion.tr
                        key={account.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="border-b border-border/50 hover:bg-secondary/30 transition-colors"
                      >
                        <td className="py-4 px-4">
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-medium text-foreground">
                              {account.name}
                            </span>
                            {/* Nickname row */}
                            <div className="flex items-center gap-1.5 min-h-[24px]">
                              {isEditing ? (
                                <div className="flex items-center gap-1">
                                  <Input
                                    value={nicknameValue}
                                    onChange={(e) => setNicknameValue(e.target.value)}
                                    placeholder="Ex: PP, Conta Principal..."
                                    className="h-6 text-xs w-40 bg-secondary/50 px-2 py-0"
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') saveNickname(account.id);
                                      if (e.key === 'Escape') cancelEditNickname();
                                    }}
                                  />
                                  <button
                                    onClick={() => saveNickname(account.id)}
                                    className="p-0.5 rounded hover:bg-ads-success/20 text-ads-success transition-colors"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={cancelEditNickname}
                                    className="p-0.5 rounded hover:bg-destructive/20 text-destructive transition-colors"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => startEditNickname(account)}
                                  className="flex items-center gap-1 group text-xs text-muted-foreground hover:text-primary transition-colors"
                                >
                                  {account.nickname ? (
                                    <Badge variant="outline" className="text-xs px-1.5 py-0 h-5 font-normal gap-1">
                                      {account.nickname}
                                      <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </Badge>
                                  ) : (
                                    <span className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <Pencil className="w-2.5 h-2.5" />
                                      Adicionar apelido
                                    </span>
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <code className="text-xs bg-secondary/50 px-2 py-1 rounded text-muted-foreground">
                            act_{account.account_id}
                          </code>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2">
                            {account.business_name ? (
                              <>
                                <Building2 className="w-4 h-4 text-primary" />
                                <span className="text-sm text-foreground">{account.business_name}</span>
                              </>
                            ) : (
                              <>
                                <User className="w-4 h-4 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">Pessoal</span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <Badge className={status.className}>
                            {status.label}
                          </Badge>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <span className={`text-sm font-medium ${account.amount_spent && account.amount_spent > 0 ? 'text-ads-success' : 'text-muted-foreground'}`}>
                            {formatCurrency(account.amount_spent, account.currency)}
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          <span className="text-sm text-foreground">{account.currency || '-'}</span>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between p-4 border-t border-border">
              <p className="text-sm text-muted-foreground">
                Mostrando {filteredAccounts.length} de {accounts.length} contas
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
