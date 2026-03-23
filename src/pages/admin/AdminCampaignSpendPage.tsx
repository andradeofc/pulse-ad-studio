import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, CalendarIcon, Megaphone, Search, RefreshCw, ShoppingCart, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

interface CampaignSpendRow {
  id: string;
  user_id: string;
  ad_account_id: string;
  account_name: string;
  campaign_id: string;
  campaign_name: string;
  currency: string;
  date: string;
  spend: number;
  purchases: number;
  fetched_at: string;
}

interface CampaignSpendResponse {
  data: CampaignSpendRow[];
  accounts_count: number;
  fetched_from_api: number;
  cached: number;
}

function useAdminUsers() {
  return useQuery({
    queryKey: ['admin-users-for-campaign-spend'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('user_id, full_name, plan, status')
        .eq('status', 'active')
        .order('full_name');
      if (error) throw error;
      return data || [];
    },
  });
}

export default function AdminCampaignSpendPage() {
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [spendData, setSpendData] = useState<CampaignSpendResponse | null>(null);

  const { data: users = [], isLoading: usersLoading } = useAdminUsers();

  const canSearch = selectedUserId && dateFrom && dateTo;

  const fetchCampaignSpend = async (forceRefresh = false) => {
    if (!canSearch) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-fetch-campaign-spend', {
        body: {
          target_user_id: selectedUserId,
          date_from: format(dateFrom!, 'yyyy-MM-dd'),
          date_to: format(dateTo!, 'yyyy-MM-dd'),
          force_refresh: forceRefresh,
        },
      });

      if (error) throw error;
      setSpendData(data as CampaignSpendResponse);

      if (data.fetched_from_api > 0) {
        toast.success(`Dados atualizados de ${data.fetched_from_api} contas via Facebook`);
      } else {
        toast.info('Todos os dados vieram do cache');
      }
    } catch (err: any) {
      console.error('Error fetching campaign spend:', err);
      toast.error(err.message || 'Erro ao buscar gastos por campanha');
    } finally {
      setIsLoading(false);
    }
  };

  // Aggregate by campaign
  const campaignSummary = (() => {
    if (!spendData?.data) return [];
    const map = new Map<string, {
      campaign_id: string;
      campaign_name: string;
      account_name: string;
      ad_account_id: string;
      currency: string;
      total_spend: number;
      total_purchases: number;
      days: number;
    }>();
    for (const row of spendData.data) {
      const key = `${row.ad_account_id}__${row.campaign_id}`;
      const existing = map.get(key);
      if (existing) {
        existing.total_spend += row.spend;
        existing.total_purchases += (row.purchases || 0);
        existing.days += 1;
      } else {
        map.set(key, {
          campaign_id: row.campaign_id,
          campaign_name: row.campaign_name || 'Sem nome',
          account_name: row.account_name || row.ad_account_id,
          ad_account_id: row.ad_account_id,
          currency: row.currency || 'BRL',
          total_spend: row.spend,
          total_purchases: row.purchases || 0,
          days: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.total_spend - a.total_spend);
  })();

  // Filter by search
  const filteredCampaigns = campaignSummary.filter(c => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return c.campaign_name.toLowerCase().includes(term) ||
           c.campaign_id.includes(term) ||
           c.account_name.toLowerCase().includes(term);
  });

  const totalSpend = filteredCampaigns.reduce((sum, c) => sum + c.total_spend, 0);
  const totalPurchases = filteredCampaigns.reduce((sum, c) => sum + c.total_purchases, 0);
  const mainCurrency = campaignSummary[0]?.currency || 'BRL';

  // Chart: top 10 campaigns by spend
  const chartData = filteredCampaigns.slice(0, 10).map(c => ({
    name: c.campaign_name.length > 25 ? c.campaign_name.slice(0, 25) + '…' : c.campaign_name,
    spend: Number(c.total_spend.toFixed(2)),
    purchases: c.total_purchases,
  }));

  const chartConfig = {
    spend: { label: 'Gasto', color: 'hsl(var(--primary))' },
    purchases: { label: 'Vendas', color: 'hsl(var(--chart-2))' },
  };

  const formatCurrency = (value: number, currency: string) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value);
  };

  const selectedUser = users.find(u => u.user_id === selectedUserId);

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Campanhas por Conta</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Consulte os gastos diários por campanha de qualquer usuário
          </p>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-end gap-4">
              {/* User selector */}
              <div className="flex-1 min-w-[250px]">
                <label className="text-sm font-medium mb-2 block">Usuário</label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder={usersLoading ? 'Carregando...' : 'Selecione um usuário'} />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map(user => (
                      <SelectItem key={user.user_id} value={user.user_id}>
                        {user.full_name || 'Sem nome'} — {user.plan}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date From */}
              <div>
                <label className="text-sm font-medium mb-2 block">Data Início</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn('w-[160px] justify-start text-left font-normal', !dateFrom && 'text-muted-foreground')}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateFrom ? format(dateFrom, 'dd/MM/yyyy') : 'Início'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dateFrom}
                      onSelect={setDateFrom}
                      disabled={(date) => date > new Date()}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Date To */}
              <div>
                <label className="text-sm font-medium mb-2 block">Data Fim</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn('w-[160px] justify-start text-left font-normal', !dateTo && 'text-muted-foreground')}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateTo ? format(dateTo, 'dd/MM/yyyy') : 'Fim'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dateTo}
                      onSelect={setDateTo}
                      disabled={(date) => date > new Date() || (dateFrom ? date < dateFrom : false)}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Search button */}
              <Button onClick={() => fetchCampaignSpend()} disabled={!canSearch || isLoading}>
                {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                Buscar Campanhas
              </Button>

              {spendData && (
                <Button variant="outline" onClick={() => fetchCampaignSpend(true)} disabled={!canSearch || isLoading}>
                  {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  Force Refresh
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {spendData && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Gasto Total</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(totalSpend, mainCurrency)}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedUser?.full_name || 'Usuário'}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total de Vendas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5 text-muted-foreground" />
                    {totalPurchases}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">no período selecionado</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Campanhas Ativas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{campaignSummary.length}</div>
                  <p className="text-xs text-muted-foreground mt-1">com gasto no período</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Fonte dos Dados</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Badge variant="outline">{spendData.cached} cache</Badge>
                    <Badge variant="secondary">{spendData.fetched_from_api} API</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    de {spendData.accounts_count} contas
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Chart: Top 10 campaigns */}
            {chartData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Top 10 Campanhas por Gasto</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={chartConfig} className="h-[300px] w-full">
                    <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} tickFormatter={(v) => `R$${v}`} />
                      <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} fontSize={11} width={180} />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            formatter={(value, name) => {
                              if (name === 'purchases') return `${value} vendas`;
                              return formatCurrency(Number(value), mainCurrency);
                            }}
                          />
                        }
                      />
                      <Bar dataKey="spend" fill="var(--color-spend)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            )}

            {/* Search filter */}
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Filtrar por nome da campanha, ID ou conta..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-md"
              />
              {searchTerm && (
                <span className="text-sm text-muted-foreground">
                  {filteredCampaigns.length} de {campaignSummary.length} campanhas
                </span>
              )}
            </div>

            {/* Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Detalhamento por Campanha</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campanha</TableHead>
                      <TableHead>Conta</TableHead>
                      <TableHead>Moeda</TableHead>
                      <TableHead className="text-right">Vendas</TableHead>
                      <TableHead className="text-right">Gasto no Período</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCampaigns.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          {searchTerm ? 'Nenhuma campanha encontrada com esse filtro' : 'Nenhum dado encontrado para o período selecionado'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredCampaigns.map(campaign => (
                        <TableRow key={`${campaign.ad_account_id}__${campaign.campaign_id}`}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{campaign.campaign_name}</p>
                              <p className="text-xs text-muted-foreground font-mono">{campaign.campaign_id}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{campaign.account_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{campaign.currency}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {campaign.total_purchases > 0 ? (
                              <Badge variant="secondary">{campaign.total_purchases}</Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrency(campaign.total_spend, campaign.currency)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                    {filteredCampaigns.length > 0 && (
                      <TableRow className="border-t-2">
                        <TableCell colSpan={3} className="font-bold">Total</TableCell>
                        <TableCell className="text-right font-bold">{totalPurchases}</TableCell>
                        <TableCell className="text-right font-bold text-lg">
                          {formatCurrency(totalSpend, mainCurrency)}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}

        {/* Empty state */}
        {!spendData && !isLoading && (
          <Card>
            <CardContent className="py-16 text-center">
              <Megaphone className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground">Selecione um usuário e período</h3>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Escolha o usuário e as datas para consultar os gastos por campanha
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
