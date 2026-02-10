import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface DailyData {
  date: string;
  label: string;
  ads: number;
}

export function DailyAdsChart() {
  const { data: chartData = [], isLoading } = useQuery({
    queryKey: ['dashboard-daily-ads-chart'],
    queryFn: async () => {
      const days = 7;
      const now = new Date();
      const startDate = startOfDay(subDays(now, days - 1));

      // Count completed ads per day using count queries (avoids 1000 row limit)
      const dailyPromises = [];
      const dayKeys: string[] = [];
      
      for (let i = 0; i < days; i++) {
        const day = subDays(now, days - 1 - i);
        const dayStart = startOfDay(day);
        const dayEnd = endOfDay(day);
        const key = format(day, 'yyyy-MM-dd');
        dayKeys.push(key);
        
        dailyPromises.push(
          supabase
            .from('campaign_job_items')
            .select('*', { count: 'exact', head: true })
            .eq('item_type', 'ad')
            .eq('status', 'completed')
            .gte('created_at', dayStart.toISOString())
            .lte('created_at', dayEnd.toISOString())
        );
      }

      const results = await Promise.all(dailyPromises);

      // Build daily buckets from count results
      const dailyMap = new Map<string, number>();
      for (let i = 0; i < dayKeys.length; i++) {
        const { count, error: dayError } = results[i];
        if (dayError) throw dayError;
        dailyMap.set(dayKeys[i], count || 0);
      }

      const result: DailyData[] = [];
      for (const [dateKey, ads] of dailyMap) {
        result.push({
          date: dateKey,
          label: format(new Date(dateKey + 'T12:00:00'), 'EEE dd', { locale: ptBR }),
          ads,
        });
      }

      return result;
    },
  });

  const totalAds = chartData.reduce((sum, d) => sum + d.ads, 0);
  const maxAds = Math.max(...chartData.map(d => d.ads), 1);

  if (isLoading) {
    return (
      <Card className="lg:col-span-2 glass-card">
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-56 mt-1" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="lg:col-span-2"
    >
      <Card className="glass-card h-full">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-foreground flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary" />
                Anúncios Criados
              </CardTitle>
              <CardDescription>Últimos 7 dias</CardDescription>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-foreground">{totalAds.toLocaleString('pt-BR')}</p>
              <p className="text-xs text-muted-foreground">total no período</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {totalAds === 0 ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nenhum anúncio criado nos últimos 7 dias</p>
              </div>
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      color: 'hsl(var(--foreground))',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}
                    formatter={(value: number) => [value.toLocaleString('pt-BR'), 'Anúncios']}
                    cursor={{ fill: 'hsl(var(--muted) / 0.3)' }}
                  />
                  <Bar
                    dataKey="ads"
                    fill="hsl(var(--primary))"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={48}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
