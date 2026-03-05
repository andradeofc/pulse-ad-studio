import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, CalendarIcon, DollarSign, TrendingUp, Search, RefreshCw, ShoppingCart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, subDays, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';

interface SpendRow {
  id: string;
  user_id: string;
  ad_account_id: string;
  account_name: string;
  currency: string;
  date: string;
  spend: number;
  purchases: number;
  fetched_at: string;
}

interface SpendResponse {
  data: SpendRow[];
  accounts_count: number;
  fetched_from_api: number;
  cached: number;
}

// Fetch users for selector
function useAdminUsers() {
  return useQuery({
    queryKey: ['admin-users-for-spend'],
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

export default function AdminSpendPage() {
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [chartRange, setChartRange] = useState<'7' | '15' | '30'>('7');
  const [isLoading, setIsLoading] = useState(false);
  const [spendData, setSpendData] = useState<SpendResponse | null>(null);

  const { data: users = [], isLoading: usersLoading } = useAdminUsers();

  const canSearch = selectedUserId && dateFrom && dateTo;

  const fetchSpend = async (forceRefresh = false) => {
    if (!canSearch) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-fetch-account-spend', {
        body: {
          target_user_id: selectedUserId,
          date_from: format(dateFrom!, 'yyyy-MM-dd'),
          date_to: format(dateTo!, 'yyyy-MM-dd'),
          force_refresh: forceRefresh,
        },
      });

      if (error) throw error;
      setSpendData(data as SpendResponse);

      if (data.fetched_from_api > 0) {
        toast.success(`Dados atualizados de ${data.fetched_from_api} contas via Facebook`);
      } else {
        toast.info('Todos os dados vieram do cache');
      }
    } catch (err: any) {
      console.error('Error fetching spend:', err);
      toast.error(err.message || 'Erro ao buscar gastos');
    } finally {
      setIsLoading(false);
    }
  };

  // Aggregate spend per account
  const accountSummary = (() => {
    if (!spendData?.data) return [];
    const map = new Map<string, { account_id: string; name: string; currency: string; total: number; purchases: number }>();
    for (const row of spendData.data) {
      const existing = map.get(row.ad_account_id);
      if (existing) {
        existing.total += row.spend;
        existing.purchases += (row.purchases || 0);
      } else {
        map.set(row.ad_account_id, {
          account_id: row.ad_account_id,
          name: row.account_name || row.ad_account_id,
          currency: row.currency || 'BRL',
          total: row.spend,
          purchases: row.purchases || 0,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  })();

  const totalSpend = accountSummary.reduce((sum, a) => sum + a.total, 0);
  const totalPurchases = accountSummary.reduce((sum, a) => sum + a.purchases, 0);
  const mainCurrency = accountSummary[0]?.currency || 'BRL';

  // Chart data: daily aggregated spend + purchases
  const chartData = (() => {
    if (!spendData?.data) return [];
    const daysToShow = parseInt(chartRange);
    const cutoffDate = format(subDays(dateTo || new Date(), daysToShow - 1), 'yyyy-MM-dd');

    const dailyMap = new Map<string, { spend: number; purchases: number }>();
    for (const row of spendData.data) {
      if (row.date >= cutoffDate) {
        const existing = dailyMap.get(row.date) || { spend: 0, purchases: 0 };
        existing.spend += row.spend;
        existing.purchases += (row.purchases || 0);
        dailyMap.set(row.date, existing);
      }
    }
    return Array.from(dailyMap.entries())
      .map(([date, vals]) => ({
        date,
        label: format(new Date(date + 'T12:00:00'), 'dd/MM', { locale: ptBR }),
        spend: Number(vals.spend.toFixed(2)),
        purchases: vals.purchases,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  })();

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
          <h1 className="text-2xl font-bold text-foreground">Gastos por Conta</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Consulte os gastos diários das contas de anúncio de qualquer usuário
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
              <Button onClick={() => fetchSpend()} disabled={!canSearch || isLoading}>
                {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                Buscar Gastos
              </Button>

              {spendData && (
                <Button variant="outline" onClick={() => fetchSpend(true)} disabled={!canSearch || isLoading}>
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
                  <p className="text-xs text-muted-foreground mt-1">
                    no período selecionado
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Contas Ativas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{accountSummary.length}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    com dados no período
                  </p>
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

            {/* Chart */}
            {chartData.length > 0 && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Gasto Diário & Vendas</CardTitle>
                    <div className="flex gap-1">
                      {(['7', '15', '30'] as const).map(range => (
                        <Button
                          key={range}
                          variant={chartRange === range ? 'default' : 'ghost'}
                          size="sm"
                          onClick={() => setChartRange(range)}
                        >
                          {range}d
                        </Button>
                      ))}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={chartConfig} className="h-[300px] w-full">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis yAxisId="spend" tickLine={false} axisLine={false} fontSize={12} tickFormatter={(v) => `R$${v}`} />
                      <YAxis yAxisId="purchases" orientation="right" tickLine={false} axisLine={false} fontSize={12} />
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
                      <Bar yAxisId="spend" dataKey="spend" fill="var(--color-spend)" radius={[4, 4, 0, 0]} />
                      <Bar yAxisId="purchases" dataKey="purchases" fill="var(--color-purchases)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            )}

            {/* Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Detalhamento por Conta</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Conta</TableHead>
                      <TableHead>ID da Conta</TableHead>
                      <TableHead>Moeda</TableHead>
                      <TableHead className="text-right">Vendas</TableHead>
                      <TableHead className="text-right">Gasto no Período</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accountSummary.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          Nenhum dado encontrado para o período selecionado
                        </TableCell>
                      </TableRow>
                    ) : (
                      accountSummary.map(account => (
                        <TableRow key={account.account_id}>
                          <TableCell className="font-medium">{account.name}</TableCell>
                          <TableCell className="text-muted-foreground font-mono text-xs">
                            {account.account_id}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{account.currency}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {account.purchases > 0 ? (
                              <Badge variant="secondary">{account.purchases}</Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrency(account.total, account.currency)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                    {accountSummary.length > 0 && (
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
              <DollarSign className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground">Selecione um usuário e período</h3>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Escolha o usuário e as datas para consultar os gastos das contas de anúncio
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
