import { useState, useEffect, useMemo } from 'react';
import { Trash2, Archive, RefreshCw, Loader2, AlertTriangle, Search, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AdAccount {
  id: string;
  account_id: string;
  name: string;
  profile_id: string;
  currency: string | null;
}

interface RejectedAd {
  id: string;
  name: string;
  effective_status: string;
  status: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  updated_time?: string;
  _account_id?: string;
  _account_name?: string;
  _profile_id?: string;
}

const STATUS_OPTIONS = [
  { value: 'DISAPPROVED', label: 'Rejeitados', description: 'Reprovados pela política' },
  { value: 'WITH_ISSUES', label: 'Com problemas', description: 'Ativos com restrições' },
  { value: 'PENDING_REVIEW', label: 'Em revisão', description: 'Aguardando análise' },
];

const statusColor: Record<string, string> = {
  DISAPPROVED: 'bg-ads-danger/15 text-ads-danger border-ads-danger/30',
  WITH_ISSUES: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
  PENDING_REVIEW: 'bg-ads-info/15 text-ads-info border-ads-info/30',
};

export default function AdCleanupPage() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [accountFilter, setAccountFilter] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<AdAccount | null>(null);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(['DISAPPROVED', 'WITH_ISSUES']);
  const [ads, setAds] = useState<RejectedAd[]>([]);
  const [selectedAds, setSelectedAds] = useState<Set<string>>(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [search, setSearch] = useState('');
  const [lastResult, setLastResult] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('facebook_ad_accounts')
        .select('id, account_id, name, profile_id, currency, facebook_profiles!inner(status)')
        .eq('status', 'active')
        .neq('facebook_profiles.status', 'disconnected')
        .order('name');
      setAccounts((data as any) || []);
    })();
  }, []);

  const filteredAccounts = useMemo(() => {
    const q = accountFilter.toLowerCase();
    return accounts.filter(a => !q || a.name.toLowerCase().includes(q) || a.account_id.includes(q));
  }, [accounts, accountFilter]);

  const filteredAds = useMemo(() => {
    const q = search.toLowerCase();
    return ads.filter(a => !q || a.name.toLowerCase().includes(q) || a.campaign_name?.toLowerCase().includes(q));
  }, [ads, search]);

  const toggleStatus = (s: string) => {
    setSelectedStatuses(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const handleScan = async () => {
    if (!selectedAccount) {
      toast({ title: 'Selecione uma conta', variant: 'destructive' });
      return;
    }
    if (selectedStatuses.length === 0) {
      toast({ title: 'Selecione ao menos um status', variant: 'destructive' });
      return;
    }
    setIsScanning(true);
    setAds([]);
    setSelectedAds(new Set());
    setLastResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('creative-cleanup', {
        body: {
          action: 'scan',
          ad_account_id: selectedAccount.account_id,
          profile_id: selectedAccount.profile_id,
          statuses: selectedStatuses,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setAds(data.ads || []);
      toast({
        title: `${data.total} anúncio(s) encontrado(s)`,
        description: data.total === 0 ? 'Nenhum anúncio corresponde aos filtros.' : undefined,
      });
    } catch (e: any) {
      toast({ title: 'Erro na busca', description: e.message, variant: 'destructive' });
    } finally {
      setIsScanning(false);
    }
  };

  const handleExecute = async (operation: 'archive' | 'delete') => {
    if (!selectedAccount || selectedAds.size === 0) return;
    setIsExecuting(true);
    try {
      const ids = Array.from(selectedAds);
      const { data, error } = await supabase.functions.invoke('creative-cleanup', {
        body: {
          action: 'execute',
          ad_account_id: selectedAccount.account_id,
          profile_id: selectedAccount.profile_id,
          ad_ids: ids,
          operation,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setLastResult(data);

      const firstErr = (data.errors || [])[0];
      toast({
        title: operation === 'delete' ? 'Exclusão concluída' : 'Arquivamento concluído',
        description: `Sucesso: ${data.success} • Falhas: ${data.failed}${firstErr ? ` — ${firstErr.error || firstErr.batch_error || ''}` : ''}`,
        variant: data.failed > 0 ? 'destructive' : 'default',
      });

      // Remove successful ones from list
      if (data.success > 0) {
        const failedIds = new Set((data.errors || []).map((e: any) => e.ad_id));
        const verifiedIds = new Set((data.verification || []).filter((v: any) => v.verified).map((v: any) => v.ad_id));
        setAds(prev => prev.filter(a => !verifiedIds.has(a.id) || failedIds.has(a.id)));
        setSelectedAds(new Set());
      }
    } catch (e: any) {
      toast({ title: 'Erro na operação', description: e.message, variant: 'destructive' });
    } finally {
      setIsExecuting(false);
    }
  };

  const toggleAll = () => {
    if (selectedAds.size === filteredAds.length) {
      setSelectedAds(new Set());
    } else {
      setSelectedAds(new Set(filteredAds.map(a => a.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedAds(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
          <ShieldAlert className="w-7 h-7 text-primary" />
          Limpeza de Anúncios
        </h1>
        <p className="text-muted-foreground">
          Identifique e remova anúncios rejeitados ou com problemas em massa via Facebook API.
        </p>
      </div>

      {/* Filters */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base">1. Selecione a conta e os filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Conta de Anúncio</label>
            <Input
              placeholder="Buscar conta por nome ou ID..."
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              className="mb-2"
            />
            <div className="max-h-60 overflow-y-auto border rounded-lg divide-y divide-border">
              {filteredAccounts.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground text-center">Nenhuma conta encontrada</p>
              ) : filteredAccounts.map(acc => (
                <button
                  key={acc.id}
                  onClick={() => setSelectedAccount(acc)}
                  className={`w-full text-left p-3 hover:bg-secondary/40 transition-colors flex items-center justify-between ${
                    selectedAccount?.id === acc.id ? 'bg-primary/10 border-l-2 border-primary' : ''
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium">{acc.name}</p>
                    <p className="text-xs text-muted-foreground">act_{acc.account_id} {acc.currency ? `• ${acc.currency}` : ''}</p>
                  </div>
                  {selectedAccount?.id === acc.id && <Badge>Selecionada</Badge>}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Status a buscar</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {STATUS_OPTIONS.map(s => (
                <label key={s.value} className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-secondary/30">
                  <Checkbox checked={selectedStatuses.includes(s.value)} onCheckedChange={() => toggleStatus(s.value)} />
                  <div>
                    <p className="text-sm font-medium">{s.label}</p>
                    <p className="text-xs text-muted-foreground">{s.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <Button onClick={handleScan} disabled={isScanning || !selectedAccount} className="w-full">
            {isScanning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
            Buscar anúncios
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {ads.length > 0 && (
        <Card className="glass-card">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CardTitle className="text-base">
                2. {filteredAds.length} anúncio(s) — {selectedAds.size} selecionado(s)
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={toggleAll}>
                  {selectedAds.size === filteredAds.length ? 'Desmarcar todos' : 'Marcar todos'}
                </Button>
                <Button variant="outline" size="sm" onClick={handleScan} disabled={isScanning}>
                  <RefreshCw className={`w-3 h-3 mr-1 ${isScanning ? 'animate-spin' : ''}`} />
                  Recarregar
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Filtrar lista por nome ou campanha..." value={search} onChange={(e) => setSearch(e.target.value)} />

            <div className="border rounded-lg divide-y divide-border max-h-[500px] overflow-y-auto">
              {filteredAds.map(ad => (
                <label key={ad.id} className="flex items-center gap-3 p-3 hover:bg-secondary/30 cursor-pointer">
                  <Checkbox checked={selectedAds.has(ad.id)} onCheckedChange={() => toggleOne(ad.id)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge variant="outline" className={statusColor[ad.effective_status] || ''}>
                        {ad.effective_status}
                      </Badge>
                      <span className="text-sm font-medium truncate">{ad.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      📁 {ad.campaign_name || '—'} → 📦 {ad.adset_name || '—'} • ID: {ad.id}
                    </p>
                  </div>
                </label>
              ))}
            </div>

            {selectedAds.size > 0 && (
              <div className="flex items-center gap-3 pt-3 border-t">
                <p className="text-sm text-muted-foreground flex-1">
                  Operação será aplicada em <strong>{selectedAds.size}</strong> anúncio(s).
                </p>

                {/* Archive */}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" disabled={isExecuting}>
                      <Archive className="w-4 h-4 mr-2" />
                      Arquivar
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Arquivar {selectedAds.size} anúncio(s)?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Os anúncios ficarão com status <strong>ARCHIVED</strong> no Facebook. Reversível.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleExecute('archive')}>
                        Confirmar arquivamento
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                {/* Delete */}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" disabled={isExecuting}>
                      {isExecuting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                      Excluir
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-ads-danger" />
                        Excluir {selectedAds.size} anúncio(s) permanentemente?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta ação é <strong>irreversível</strong>. Os anúncios serão removidos definitivamente do Facebook.
                        Se quiser manter histórico, use "Arquivar".
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleExecute('delete')}
                        className="bg-destructive hover:bg-destructive/90"
                      >
                        Excluir permanentemente
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {lastResult?.facebook_responses?.length > 0 && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base">Resposta técnica do Facebook</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 md:grid-cols-2">
              {(lastResult.verification || []).slice(0, 8).map((item: any) => (
                <div key={item.ad_id} className="rounded-lg border border-border p-3 text-xs">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="font-mono truncate">{item.ad_id}</span>
                    <Badge variant={item.verified ? 'default' : 'destructive'}>
                      {item.verified ? 'Verificado' : 'Não excluiu'}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground">Esperado: {item.expected_status} • Atual: {item.status || 'sem retorno'}</p>
                  {item.note && (
                    <p className="mt-1 text-amber-600 dark:text-amber-400">{item.note}</p>
                  )}
                </div>
              ))}
            </div>
            <pre className="max-h-80 overflow-auto rounded-lg bg-secondary/40 p-3 text-xs text-foreground">
              {JSON.stringify({
                facebook_responses: lastResult.facebook_responses,
                verification: lastResult.verification,
              }, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
