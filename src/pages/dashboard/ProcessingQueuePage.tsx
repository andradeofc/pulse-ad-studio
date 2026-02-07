import { motion } from 'framer-motion';
import { RefreshCw, Clock, CheckCircle, XCircle, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const mockJobs = [
  {
    id: '1',
    hash: 'abc123',
    name: '[CP08][CAT|ABO][1-10-1][{{conta_apelido}}][26_01_22][17_47]',
    status: 'processing',
    totalCampaigns: 4,
    totalAdsets: 40,
    totalAds: 40,
    progress: 65,
    startedAt: '2024-01-26 17:47',
    accounts: 1,
  },
  {
    id: '2',
    hash: 'def456',
    name: '[CP07][CBO][1-5-1][{{conta_apelido}}][26_01_22][15_30]',
    status: 'completed',
    totalCampaigns: 2,
    totalAdsets: 10,
    totalAds: 10,
    progress: 100,
    startedAt: '2024-01-26 15:30',
    accounts: 1,
  },
  {
    id: '3',
    hash: 'ghi789',
    name: '[CP06][CAT|ABO][1-10-1][{{conta_apelido}}][25_01_22][10_00]',
    status: 'failed',
    totalCampaigns: 3,
    totalAdsets: 30,
    totalAds: 30,
    progress: 45,
    startedAt: '2024-01-25 10:00',
    accounts: 1,
    error: 'Rate limit exceeded',
  },
];

const statusIcons = {
  queued: Clock,
  processing: Loader2,
  completed: CheckCircle,
  failed: XCircle,
};

export default function ProcessingQueuePage() {
  const [expandedJob, setExpandedJob] = useState<string | null>(null);

  const stats = {
    queued: mockJobs.filter(j => j.status === 'queued').length,
    processing: mockJobs.filter(j => j.status === 'processing').length,
    completed: mockJobs.filter(j => j.status === 'completed').length,
    failed: mockJobs.filter(j => j.status === 'failed').length,
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
            Fila de Processamento
            {stats.processing > 0 && (
              <Badge className="badge-info">{stats.processing} ativo(s)</Badge>
            )}
          </h1>
          <p className="text-muted-foreground">Acompanhe o status das suas campanhas</p>
        </div>
        <Button variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Na Fila', value: stats.queued, icon: Clock, color: 'text-muted-foreground' },
          { label: 'Processando', value: stats.processing, icon: Loader2, color: 'text-ads-info', animate: true },
          { label: 'Concluídos', value: stats.completed, icon: CheckCircle, color: 'text-ads-success' },
          { label: 'Com Falha', value: stats.failed, icon: XCircle, color: 'text-ads-danger' },
        ].map((stat) => (
          <Card key={stat.label} className="glass-card">
            <CardContent className="p-4 flex items-center gap-4">
              <stat.icon className={cn("w-8 h-8", stat.color, stat.animate && "animate-spin")} />
              <div>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Jobs List */}
      <Tabs defaultValue="all">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="processing">Processando</TabsTrigger>
          <TabsTrigger value="completed">Concluídos</TabsTrigger>
          <TabsTrigger value="failed">Com Falha</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4 mt-4">
          {mockJobs.map((job) => {
            const StatusIcon = statusIcons[job.status as keyof typeof statusIcons];
            const isExpanded = expandedJob === job.id;

            return (
              <Card key={job.id} className="glass-card overflow-hidden">
                <CardContent className="p-0">
                  <button
                    onClick={() => setExpandedJob(isExpanded ? null : job.id)}
                    className="w-full p-4 flex items-center gap-4 hover:bg-secondary/30 transition-colors text-left"
                  >
                    <StatusIcon className={cn(
                      "w-5 h-5",
                      job.status === 'processing' && "animate-spin text-ads-info",
                      job.status === 'completed' && "text-ads-success",
                      job.status === 'failed' && "text-ads-danger"
                    )} />
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={
                          job.status === 'completed' ? 'default' :
                          job.status === 'failed' ? 'destructive' : 'secondary'
                        }>
                          {job.status === 'processing' ? 'Processando' :
                           job.status === 'completed' ? 'Concluído' :
                           job.status === 'failed' ? 'Falha' : 'Na Fila'}
                        </Badge>
                        <span className="text-sm font-medium text-foreground truncate">{job.name}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>🏠 {job.accounts} conta</span>
                        <span>📁 {job.totalCampaigns} campanhas</span>
                        <span>📦 {job.totalAdsets} conjuntos</span>
                        <span>📄 {job.totalAds} anúncios</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {job.status === 'processing' && (
                        <div className="w-32">
                          <Progress value={job.progress} className="h-2" />
                          <p className="text-xs text-muted-foreground mt-1 text-right">{job.progress}%</p>
                        </div>
                      )}
                      <span className="text-xs text-muted-foreground">#{job.hash}</span>
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="p-4 border-t border-border bg-secondary/20">
                      <p className="text-sm text-muted-foreground">
                        Detalhes do processamento aparecerão aqui...
                      </p>
                      {job.error && (
                        <p className="text-sm text-ads-danger mt-2">Erro: {job.error}</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}
