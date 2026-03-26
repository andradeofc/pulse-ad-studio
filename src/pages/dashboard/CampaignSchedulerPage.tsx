import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { format, subDays, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  CalendarClock, Search, Loader2, RefreshCw, Power, Clock, CheckCircle2,
  XCircle, AlertTriangle, Trash2, PlayCircle
} from 'lucide-react';
import { LoadingState } from '@/components/ui/loading-state';

interface Campaign {
  campaign_id: string;
  name: string;
  status: string;
  objective: string;
  spend: number;
  purchases: number;
  daily_budget: number | null;
  lifetime_budget: number | null;
  ad_account_id?: string;
}

interface ScheduledActivation {
  id: string;
  campaign_id: string;
  campaign_name: string;
  ad_account_id: string;
  scheduled_at: string;
  status: string;
  error_message: string | null;
  processed_at: string | null;
  created_at: string;
}

const dateRangeOptions = [
  { value: 'today', label: 'Hoje' },
  { value: '7days', label: 'Últimos 7 dias' },
  { value: '15days', label: 'Últimos 15 dias' },
  { value: 'custom', label: 'Personalizado' },
];

function getDateRange(rangeKey: string, customFrom?: string, customTo?: string) {
  const today = format(new Date(), 'yyyy-MM-dd');
  switch (rangeKey) {
    case 'today':
      return { from: today, to: today };
    case '7days':
      return { from: format(subDays(new Date(), 7), 'yyyy-MM-dd'), to: today };
    case '15days':
      return { from: format(subDays(new Date(), 15), 'yyyy-MM-dd'), to: today };
    case 'custom':
      return { from: customFrom || today, to: customTo || today };
    default:
      return { from: today, to: today };
  }
}

export default function CampaignSchedulerPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [dateRange, setDateRange] = useState('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(false);

  // Manual validation
  const [manualCampaignId, setManualCampaignId] = useState('');
  const [manualCampaign, setManualCampaign] = useState<Campaign | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [manualScheduleDate, setManualScheduleDate] = useState('');
  const [manualScheduleTime, setManualScheduleTime] = useState('');

  // Check feature access
  const { data: hasAccess, isLoading: isCheckingAccess } = useQuery({
    queryKey: ['campaign-scheduler-access', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_profiles')
        .select('custom_limits')
        .eq('user_id', user!.id)
        .single();
      return !!(data?.custom_limits as any)?.campaign_scheduler;
    },
    enabled: !!user?.id,
  });

  // Fetch active profiles
  const { data: profiles = [] } = useQuery({
    queryKey: ['active-profiles-scheduler'],
    queryFn: async () => {
      const { data } = await supabase
        .from('facebook_profiles')
        .select('id, name')
        .eq('status', 'active')
        .order('name');
      return data || [];
    },
    enabled: hasAccess === true,
  });

  // Fetch ad accounts for selected profile
  const { data: adAccounts = [] } = useQuery({
    queryKey: ['ad-accounts-scheduler', selectedProfileId],
    queryFn: async () => {
      const { data } = await supabase
        .from('facebook_ad_accounts')
        .select('account_id, name, business_name, currency')
        .eq('profile_id', selectedProfileId)
        .order('name');
      return data || [];
    },
    enabled: !!selectedProfileId,
  });

  // Fetch scheduled activations
  const { data: scheduledActivations = [], isLoading: isLoadingSchedules } = useQuery({
    queryKey: ['scheduled-activations'],
    queryFn: async () => {
      const { data } = await supabase
        .from('campaign_activation_schedules')
        .select('*')
        .order('scheduled_at', { ascending: true });
      return (data || []) as ScheduledActivation[];
    },
    enabled: hasAccess === true,
  });

  // Auto-select first profile
  useEffect(() => {
    if (profiles.length > 0 && !selectedProfileId) {
      setSelectedProfileId(profiles[0].id);
    }
  }, [profiles, selectedProfileId]);

  const fetchCampaigns = async () => {
    if (!selectedAccountId || !selectedProfileId) {
      toast.error('Selecione um perfil e conta de anúncio');
      return;
    }

    setIsLoadingCampaigns(true);
    setCampaigns([]);
    setSelectedCampaigns([]);

    try {
      const range = getDateRange(dateRange, customFrom, customTo);
      const { data, error } = await supabase.functions.invoke('fetch-account-campaigns', {
        body: {
          ad_account_id: selectedAccountId,
          profile_id: selectedProfileId,
          date_from: range.from,
          date_to: range.to,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setCampaigns(data.campaigns || []);
      if (data.campaigns?.length === 0) {
        toast.info('Nenhuma campanha com gasto encontrada neste período');
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao buscar campanhas');
    } finally {
      setIsLoadingCampaigns(false);
    }
  };

  const validateManualCampaign = async () => {
    if (!manualCampaignId.trim() || !selectedProfileId) {
      toast.error('Digite o ID da campanha e selecione um perfil');
      return;
    }

    setIsValidating(true);
    setManualCampaign(null);

    try {
      const { data, error } = await supabase.functions.invoke('validate-campaign-id', {
        body: {
          campaign_id: manualCampaignId.trim(),
          profile_id: selectedProfileId,
        },
      });

      if (error) throw error;
      if (!data.found) {
        toast.error(data.error || 'Campanha não encontrada');
        return;
      }

      setManualCampaign(data.campaign);
      toast.success('Campanha encontrada!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao validar campanha');
    } finally {
      setIsValidating(false);
    }
  };

  const scheduleActivation = useMutation({
    mutationFn: async (items: { campaign_id: string; name: string; account_id: string; date: string; time: string }[]) => {
      const records = items.map(item => ({
        user_id: user!.id,
        profile_id: selectedProfileId,
        ad_account_id: item.account_id,
        campaign_id: item.campaign_id,
        campaign_name: item.name,
        scheduled_at: new Date(`${item.date}T${item.time}`).toISOString(),
        status: 'pending',
      }));

      const { error } = await supabase
        .from('campaign_activation_schedules')
        .insert(records);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Ativação agendada com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['scheduled-activations'] });
      setShowScheduleModal(false);
      setSelectedCampaigns([]);
      setScheduleDate('');
      setScheduleTime('');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Erro ao agendar ativação');
    },
  });

  const cancelSchedule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('campaign_activation_schedules')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Agendamento cancelado');
      queryClient.invalidateQueries({ queryKey: ['scheduled-activations'] });
    },
  });

  const handleScheduleSelected = () => {
    const pausedSelected = campaigns
      .filter(c => selectedCampaigns.includes(c.campaign_id) && c.status === 'PAUSED');
    
    if (pausedSelected.length === 0) {
      toast.error('Selecione pelo menos uma campanha pausada');
      return;
    }
    setShowScheduleModal(true);
  };

  const handleConfirmSchedule = () => {
    if (!scheduleDate || !scheduleTime) {
      toast.error('Defina a data e horário');
      return;
    }

    const scheduledTime = new Date(`${scheduleDate}T${scheduleTime}`);
    if (scheduledTime <= new Date()) {
      toast.error('A data/hora deve ser no futuro');
      return;
    }

    const items = campaigns
      .filter(c => selectedCampaigns.includes(c.campaign_id) && c.status === 'PAUSED')
      .map(c => ({
        campaign_id: c.campaign_id,
        name: c.name,
        account_id: selectedAccountId,
        date: scheduleDate,
        time: scheduleTime,
      }));

    scheduleActivation.mutate(items);
  };

  const handleScheduleManual = () => {
    if (!manualCampaign || !manualScheduleDate || !manualScheduleTime) {
      toast.error('Defina a data e horário');
      return;
    }

    const scheduledTime = new Date(`${manualScheduleDate}T${manualScheduleTime}`);
    if (scheduledTime <= new Date()) {
      toast.error('A data/hora deve ser no futuro');
      return;
    }

    scheduleActivation.mutate([{
      campaign_id: manualCampaign.campaign_id,
      name: manualCampaign.name,
      account_id: manualCampaign.ad_account_id || selectedAccountId,
      date: manualScheduleDate,
      time: manualScheduleTime,
    }]);
    setManualCampaign(null);
    setManualCampaignId('');
    setManualScheduleDate('');
    setManualScheduleTime('');
  };

  const toggleCampaign = (id: string) => {
    setSelectedCampaigns(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30"><Power className="w-3 h-3 mr-1" />Ativa</Badge>;
      case 'PAUSED':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Pausada</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const scheduleBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30"><Clock className="w-3 h-3 mr-1" />Pendente</Badge>;
      case 'processing':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Processando</Badge>;
      case 'completed':
        return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30"><CheckCircle2 className="w-3 h-3 mr-1" />Concluído</Badge>;
      case 'failed':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><XCircle className="w-3 h-3 mr-1" />Falhou</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isCheckingAccess) {
    return <LoadingState message="Verificando acesso..." />;
  }

  if (!hasAccess) {
    return (
      <div className="p-8 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-foreground mb-2">Acesso Restrito</h2>
        <p className="text-muted-foreground">
          Esta funcionalidade não está habilitada para sua conta. Entre em contato com o suporte para ativar.
        </p>
      </div>
    );
  }

  const pausedSelectedCount = campaigns
    .filter(c => selectedCampaigns.includes(c.campaign_id) && c.status === 'PAUSED').length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <CalendarClock className="w-7 h-7 text-primary" />
            Agendamento de Campanhas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Agende a ativação automática de campanhas pausadas
          </p>
        </div>
      </div>

      <Tabs defaultValue="search" className="space-y-4">
        <TabsList>
          <TabsTrigger value="search">Buscar Campanhas</TabsTrigger>
          <TabsTrigger value="manual">Ativação Manual (ID)</TabsTrigger>
          <TabsTrigger value="scheduled">
            Agendamentos
            {scheduledActivations.filter(s => s.status === 'pending').length > 0 && (
              <Badge className="ml-2 bg-primary/20 text-primary text-xs">
                {scheduledActivations.filter(s => s.status === 'pending').length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Tab: Search Campaigns */}
        <TabsContent value="search" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Filtros</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Perfil</Label>
                  <Select value={selectedProfileId} onValueChange={(v) => { setSelectedProfileId(v); setSelectedAccountId(''); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o perfil" />
                    </SelectTrigger>
                    <SelectContent>
                      {profiles.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Conta de Anúncio</Label>
                  <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a conta" />
                    </SelectTrigger>
                    <SelectContent>
                      {adAccounts.map(a => (
                        <SelectItem key={a.account_id} value={a.account_id}>
                          {a.name} {a.business_name ? `(${a.business_name})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Período</Label>
                  <Select value={dateRange} onValueChange={setDateRange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {dateRangeOptions.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-end">
                  <Button
                    onClick={fetchCampaigns}
                    disabled={isLoadingCampaigns || !selectedAccountId}
                    className="w-full"
                  >
                    {isLoadingCampaigns ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
                    Buscar
                  </Button>
                </div>
              </div>

              {dateRange === 'custom' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>De</Label>
                    <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Até</Label>
                    <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Campaigns Table */}
          {campaigns.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">
                  {campaigns.length} campanha{campaigns.length !== 1 ? 's' : ''} encontrada{campaigns.length !== 1 ? 's' : ''}
                </CardTitle>
                {pausedSelectedCount > 0 && (
                  <Button onClick={handleScheduleSelected} size="sm">
                    <PlayCircle className="w-4 h-4 mr-2" />
                    Agendar Ativação ({pausedSelectedCount})
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Campanha</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Gasto</TableHead>
                      <TableHead className="text-right">Vendas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaigns.map(c => (
                      <TableRow key={c.campaign_id} className={c.status !== 'PAUSED' ? 'opacity-60' : ''}>
                        <TableCell>
                          {c.status === 'PAUSED' && (
                            <Checkbox
                              checked={selectedCampaigns.includes(c.campaign_id)}
                              onCheckedChange={() => toggleCampaign(c.campaign_id)}
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{c.name}</p>
                            <p className="text-xs text-muted-foreground">ID: {c.campaign_id}</p>
                          </div>
                        </TableCell>
                        <TableCell>{statusBadge(c.status)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          R$ {c.spend.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {c.purchases}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {isLoadingCampaigns && (
            <Card>
              <CardContent className="py-12">
                <LoadingState message="Buscando campanhas na API..." />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tab: Manual */}
        <TabsContent value="manual" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Validar Campanha por ID</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Perfil</Label>
                <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Input
                  placeholder="ID da campanha (ex: 120215384561850608)"
                  value={manualCampaignId}
                  onChange={e => setManualCampaignId(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={validateManualCampaign} disabled={isValidating || !manualCampaignId.trim()}>
                  {isValidating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
                  Validar
                </Button>
              </div>

              {manualCampaign && (
                <div className="border border-border rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{manualCampaign.name}</p>
                      <p className="text-xs text-muted-foreground">ID: {manualCampaign.campaign_id}</p>
                    </div>
                    {statusBadge(manualCampaign.status)}
                  </div>

                  {manualCampaign.status === 'PAUSED' ? (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">Agendar ativação:</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Data</Label>
                          <Input
                            type="date"
                            value={manualScheduleDate}
                            onChange={e => setManualScheduleDate(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Horário</Label>
                          <Input
                            type="time"
                            value={manualScheduleTime}
                            onChange={e => setManualScheduleTime(e.target.value)}
                          />
                        </div>
                      </div>
                      <Button
                        onClick={handleScheduleManual}
                        disabled={!manualScheduleDate || !manualScheduleTime || scheduleActivation.isPending}
                        className="w-full"
                      >
                        <CalendarClock className="w-4 h-4 mr-2" />
                        Agendar Ativação
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-amber-400">
                      <AlertTriangle className="w-4 h-4 inline mr-1" />
                      Esta campanha já está {manualCampaign.status === 'ACTIVE' ? 'ativa' : 'com status ' + manualCampaign.status}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Scheduled */}
        <TabsContent value="scheduled" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Agendamentos</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => queryClient.invalidateQueries({ queryKey: ['scheduled-activations'] })}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Atualizar
              </Button>
            </CardHeader>
            <CardContent>
              {isLoadingSchedules ? (
                <LoadingState message="Carregando agendamentos..." />
              ) : scheduledActivations.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Nenhum agendamento encontrado
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campanha</TableHead>
                      <TableHead>Agendado para</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Erro</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scheduledActivations.map(s => (
                      <TableRow key={s.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{s.campaign_name || s.campaign_id}</p>
                            <p className="text-xs text-muted-foreground">ID: {s.campaign_id}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {format(new Date(s.scheduled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell>{scheduleBadge(s.status)}</TableCell>
                        <TableCell className="max-w-[200px]">
                          {s.error_message && (
                            <p className="text-xs text-red-400 truncate" title={s.error_message}>
                              {s.error_message}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          {s.status === 'pending' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => cancelSchedule.mutate(s.id)}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
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

      {/* Schedule Modal */}
      <Dialog open={showScheduleModal} onOpenChange={setShowScheduleModal}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                <CalendarClock className="w-5 h-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-lg">Agendar Ativação</DialogTitle>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Defina quando suas campanhas serão ativadas
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-5 pt-2">
            {/* Campaign count indicator */}
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-primary/5 border border-primary/10">
              <PlayCircle className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm font-medium text-foreground">
                {pausedSelectedCount} campanha{pausedSelectedCount !== 1 ? 's' : ''} pausada{pausedSelectedCount !== 1 ? 's' : ''} será{pausedSelectedCount !== 1 ? 'ão' : ''} ativada{pausedSelectedCount !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Date & Time inputs */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Data</Label>
                <div className="relative">
                  <Input
                    type="date"
                    value={scheduleDate}
                    onChange={e => setScheduleDate(e.target.value)}
                    min={format(new Date(), 'yyyy-MM-dd')}
                    className="h-11 bg-background [color-scheme:dark]"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Horário</Label>
                <div className="relative">
                  <Input
                    type="time"
                    value={scheduleTime}
                    onChange={e => setScheduleTime(e.target.value)}
                    className="h-11 bg-background [color-scheme:dark]"
                  />
                </div>
              </div>
            </div>

            {/* Selected campaigns list */}
            <div className="space-y-2">
              <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Campanhas selecionadas
              </Label>
              <div className="max-h-44 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                {campaigns.filter(c => selectedCampaigns.includes(c.campaign_id) && c.status === 'PAUSED').map((c, i) => (
                  <div key={c.campaign_id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">ID: {c.campaign_id}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Scheduling preview */}
            {scheduleDate && scheduleTime && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-muted/50 border border-border">
                <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm text-muted-foreground">
                  Ativação programada para{' '}
                  <span className="font-semibold text-foreground">
                    {format(new Date(`${scheduleDate}T${scheduleTime}`), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </span>
                </span>
              </div>
            )}
          </div>

          <DialogFooter className="pt-2 gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowScheduleModal(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmSchedule}
              disabled={scheduleActivation.isPending || !scheduleDate || !scheduleTime}
              className="min-w-[180px]"
            >
              {scheduleActivation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <CalendarClock className="w-4 h-4 mr-2" />
              )}
              Confirmar Agendamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
