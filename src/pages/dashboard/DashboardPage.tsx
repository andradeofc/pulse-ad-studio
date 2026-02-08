import { motion } from 'framer-motion';
import {
  CreditCard,
  Megaphone,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { useDashboardData } from '@/hooks/useDashboardData';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const statusBadge = (status: string) => {
  switch (status) {
    case 'completed':
      return <Badge className="badge-active">Concluído</Badge>;
    case 'processing':
      return <Badge className="badge-info">Processando</Badge>;
    case 'queued':
      return <Badge className="badge-warning">Na Fila</Badge>;
    case 'failed':
      return <Badge className="badge-danger">Falhou</Badge>;
    case 'paused':
      return <Badge variant="secondary">Pausado</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
};

export default function DashboardPage() {
  const { metrics, recentCampaigns, alerts, isLoading } = useDashboardData();

  const metricCards = [
    {
      title: 'Contas Ativas',
      value: metrics.activeAccounts.toLocaleString('pt-BR'),
      icon: CreditCard,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      title: 'Total Campanhas',
      value: metrics.totalCampaigns.toLocaleString('pt-BR'),
      icon: Megaphone,
      color: 'text-ads-info',
      bgColor: 'bg-ads-info/10',
    },
    {
      title: 'Na Fila',
      value: metrics.processingQueue.toLocaleString('pt-BR'),
      icon: Clock,
      color: 'text-ads-warning',
      bgColor: 'bg-ads-warning/10',
    },
    {
      title: 'Concluídos Hoje',
      value: metrics.completedToday.toLocaleString('pt-BR'),
      icon: CheckCircle2,
      color: 'text-ads-success',
      bgColor: 'bg-ads-success/10',
    },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">Visão geral das suas campanhas e métricas</p>
        </div>
        <Button asChild className="glow-primary">
          <Link to="/campanhas/criar">
            <Megaphone className="w-4 h-4 mr-2" />
            Nova Campanha
          </Link>
        </Button>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metricCards.map((metric, index) => (
          <motion.div
            key={metric.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="h-full"
          >
            <Card className="metric-card h-full">
              <CardContent className="p-6 h-full">
                <div className="flex items-start justify-between h-full min-h-[100px]">
                  <div className="flex flex-col justify-between h-full">
                    <p className="text-sm text-muted-foreground">{metric.title}</p>
                    <p className="text-3xl font-bold text-foreground mt-2">{metric.value}</p>
                  </div>
                  <div className={`w-12 h-12 rounded-xl ${metric.bgColor} flex items-center justify-center flex-shrink-0`}>
                    <metric.icon className={`w-6 h-6 ${metric.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart Placeholder */}
        <Card className="lg:col-span-2 glass-card">
          <CardHeader>
            <CardTitle className="text-foreground">Performance</CardTitle>
            <CardDescription>Métricas de campanhas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <BarChart3 className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p>Gráfico de performance</p>
                <p className="text-sm">Em breve: métricas de campanhas do Facebook</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Alerts */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-ads-warning" />
              Alertas
            </CardTitle>
            <CardDescription>Notificações importantes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {alerts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhum alerta no momento</p>
              </div>
            ) : (
              alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-4 rounded-lg border ${
                    alert.type === 'error' 
                      ? 'bg-destructive/10 border-destructive/20' 
                      : alert.type === 'warning'
                      ? 'bg-ads-warning/10 border-ads-warning/20'
                      : 'bg-ads-info/10 border-ads-info/20'
                  }`}
                >
                  <p className="text-sm text-foreground">{alert.message}</p>
                  <Button
                    variant="link"
                    size="sm"
                    asChild
                    className="px-0 h-auto mt-2 text-primary"
                  >
                    <Link to={alert.href}>{alert.action} →</Link>
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Campaigns */}
      <Card className="glass-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-foreground">Jobs Recentes</CardTitle>
              <CardDescription>Últimos jobs de criação de campanhas</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/fila-processamento">Ver todos</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {recentCampaigns.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Megaphone className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>Nenhum job de campanha ainda</p>
              <Button asChild variant="outline" className="mt-4">
                <Link to="/campanhas/criar">
                  <ArrowUpRight className="w-4 h-4 mr-2" />
                  Criar primeira campanha
                </Link>
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                      Nome do Job
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                      Contas
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                      Anúncios
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                      Progresso
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                      Criado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recentCampaigns.map((campaign) => (
                    <tr key={campaign.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                      <td className="py-3 px-4">
                        <span className="text-sm font-medium text-foreground">{campaign.name}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-muted-foreground">{campaign.accountName}</span>
                      </td>
                      <td className="py-3 px-4">{statusBadge(campaign.status)}</td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-foreground">{campaign.totalAds}</span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-secondary rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${campaign.progress}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">{campaign.progress}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(campaign.createdAt), { 
                            addSuffix: true, 
                            locale: ptBR 
                          })}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
