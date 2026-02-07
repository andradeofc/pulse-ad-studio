import { motion } from 'framer-motion';
import {
  CreditCard,
  Megaphone,
  Clock,
  TrendingUp,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

const metrics = [
  {
    title: 'Contas Ativas',
    value: '127',
    change: '+12%',
    trend: 'up',
    icon: CreditCard,
  },
  {
    title: 'Campanhas Ativas',
    value: '1,847',
    change: '+8%',
    trend: 'up',
    icon: Megaphone,
  },
  {
    title: 'Gasto Total (Mês)',
    value: 'R$ 45.2k',
    change: '+23%',
    trend: 'up',
    icon: TrendingUp,
  },
  {
    title: 'Na Fila',
    value: '24',
    change: 'Processando',
    trend: 'neutral',
    icon: Clock,
  },
];

const recentCampaigns = [
  {
    id: '1',
    name: '[CP08][CAT|ABO][1-10-1][#1164][26_01]',
    account: 'Conta Principal - BRL',
    status: 'active',
    spent: 'R$ 1,234.56',
    results: '156 leads',
    createdAt: 'Há 2 horas',
  },
  {
    id: '2',
    name: '[CP07][CBO][1-5-1][#1165][26_01]',
    account: 'Conta Secundária - USD',
    status: 'processing',
    spent: 'R$ 0.00',
    results: '-',
    createdAt: 'Há 5 horas',
  },
  {
    id: '3',
    name: '[CP06][CAT|ABO][1-10-1][#1166][25_01]',
    account: 'Conta Internacional',
    status: 'paused',
    spent: 'R$ 856.32',
    results: '89 leads',
    createdAt: 'Há 1 dia',
  },
  {
    id: '4',
    name: '[CP05][CBO][1-3-1][#1167][25_01]',
    account: 'Conta Principal - BRL',
    status: 'rejected',
    spent: 'R$ 0.00',
    results: '-',
    createdAt: 'Há 1 dia',
  },
];

const alerts = [
  {
    id: '1',
    type: 'warning',
    message: 'Token do perfil "Marketing Pro" expira em 3 dias',
    action: 'Renovar',
    href: '/perfis-facebook',
  },
  {
    id: '2',
    type: 'error',
    message: 'Conta #1168 foi bloqueada pelo Facebook',
    action: 'Ver detalhes',
    href: '/contas-anuncio',
  },
  {
    id: '3',
    type: 'info',
    message: '15 campanhas concluídas com sucesso',
    action: 'Ver fila',
    href: '/fila-processamento',
  },
];

const statusBadge = (status: string) => {
  switch (status) {
    case 'active':
      return <Badge className="badge-active">Ativa</Badge>;
    case 'processing':
      return <Badge className="badge-info">Processando</Badge>;
    case 'paused':
      return <Badge className="badge-warning">Pausada</Badge>;
    case 'rejected':
      return <Badge className="badge-danger">Rejeitada</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
};

export default function DashboardPage() {
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
        {metrics.map((metric, index) => (
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
                    <div className="flex items-center gap-1 mt-2">
                      {metric.trend === 'up' && (
                        <ArrowUpRight className="w-4 h-4 text-ads-success" />
                      )}
                      {metric.trend === 'down' && (
                        <ArrowDownRight className="w-4 h-4 text-ads-danger" />
                      )}
                      <span className={
                        metric.trend === 'up' 
                          ? 'text-sm text-ads-success' 
                          : metric.trend === 'down'
                          ? 'text-sm text-ads-danger'
                          : 'text-sm text-ads-info'
                      }>
                        {metric.change}
                      </span>
                    </div>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <metric.icon className="w-6 h-6 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <Card className="lg:col-span-2 glass-card">
          <CardHeader>
            <CardTitle className="text-foreground">Gastos nos Últimos 7 Dias</CardTitle>
            <CardDescription>Performance diária de investimento</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <BarChart3 className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p>Gráfico de gastos</p>
                <p className="text-sm">Integre com backend para dados reais</p>
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
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="p-4 rounded-lg bg-secondary/50 border border-border"
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
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Recent Campaigns */}
      <Card className="glass-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-foreground">Campanhas Recentes</CardTitle>
              <CardDescription>Últimas campanhas criadas</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/campanhas">Ver todas</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                    Campanha
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                    Conta
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                    Gasto
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                    Resultados
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                    Criada
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
                      <span className="text-sm text-muted-foreground">{campaign.account}</span>
                    </td>
                    <td className="py-3 px-4">{statusBadge(campaign.status)}</td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-foreground">{campaign.spent}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-muted-foreground">{campaign.results}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-muted-foreground">{campaign.createdAt}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
