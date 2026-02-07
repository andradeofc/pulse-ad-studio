import { RefreshCw, Clock, CheckCircle, XCircle, Loader2, ChevronDown, ChevronRight, Inbox, Play, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useCampaignJobs, useCampaignJobItems, useProcessCampaignJob } from '@/hooks/useCampaignJobs';
import { JobItemsTree } from '@/components/campaign/JobItemsTree';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const statusIcons = {
  queued: Clock,
  processing: Loader2,
  completed: CheckCircle,
  failed: XCircle,
};

const statusLabels = {
  queued: 'Na Fila',
  processing: 'Processando',
  completed: 'Concluído',
  failed: 'Falha',
};

export default function ProcessingQueuePage() {
  const [activeTab, setActiveTab] = useState('all');
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const processJobMutation = useProcessCampaignJob();

  const statusFilter = activeTab === 'all' ? undefined : activeTab;
  const { data: jobs = [], isLoading, refetch } = useCampaignJobs(statusFilter);
  const { data: expandedJobItems = [], isLoading: isLoadingItems } = useCampaignJobItems(expandedJob);

  // Realtime subscription for job updates
  useEffect(() => {
    const channel = supabase
      .channel('campaign-jobs-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'campaign_jobs',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['campaign-jobs'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'campaign_job_items',
        },
        () => {
          if (expandedJob) {
            queryClient.invalidateQueries({ queryKey: ['campaign-job-items', expandedJob] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, expandedJob]);

  const stats = {
    queued: jobs.filter(j => j.status === 'queued').length,
    processing: jobs.filter(j => j.status === 'processing').length,
    completed: jobs.filter(j => j.status === 'completed').length,
    failed: jobs.filter(j => j.status === 'failed').length,
  };

  const handleRefresh = () => {
    refetch();
    if (expandedJob) {
      queryClient.invalidateQueries({ queryKey: ['campaign-job-items', expandedJob] });
    }
  };

  const handleProcessJob = (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    processJobMutation.mutate(jobId);
  };

  const filteredJobs = activeTab === 'all' 
    ? jobs 
    : jobs.filter(j => j.status === activeTab);

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
        <Button variant="outline" onClick={handleRefresh} disabled={isLoading}>
          <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
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
              <stat.icon className={cn("w-8 h-8", stat.color, stat.animate && stats.processing > 0 && "animate-spin")} />
              <div>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Jobs List */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="processing">Processando</TabsTrigger>
          <TabsTrigger value="completed">Concluídos</TabsTrigger>
          <TabsTrigger value="failed">Com Falha</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-4 mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              Carregando jobs...
            </div>
          ) : filteredJobs.length === 0 ? (
            <Card className="glass-card">
              <CardContent className="py-12 text-center">
                <Inbox className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {activeTab === 'all' 
                    ? 'Nenhum job na fila. Crie uma nova campanha para começar.'
                    : `Nenhum job com status "${statusLabels[activeTab as keyof typeof statusLabels]}".`
                  }
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredJobs.map((job) => {
              const StatusIcon = statusIcons[job.status];
              const isExpanded = expandedJob === job.id;

              return (
                <Card key={job.id} className="glass-card overflow-hidden">
                  <CardContent className="p-0">
                    <button
                      onClick={() => setExpandedJob(isExpanded ? null : job.id)}
                      className="w-full p-4 flex items-center gap-4 hover:bg-secondary/30 transition-colors text-left"
                    >
                      <StatusIcon className={cn(
                        "w-5 h-5 flex-shrink-0",
                        job.status === 'queued' && "text-muted-foreground",
                        job.status === 'processing' && "animate-spin text-ads-info",
                        job.status === 'completed' && "text-ads-success",
                        job.status === 'failed' && "text-ads-danger"
                      )} />
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge variant={
                            job.status === 'completed' ? 'default' :
                            job.status === 'failed' ? 'destructive' : 'secondary'
                          }>
                            {statusLabels[job.status]}
                          </Badge>
                          <span className="text-sm font-medium text-foreground truncate">{job.name}</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                          <span>🏠 {job.accounts_count} conta{job.accounts_count > 1 ? 's' : ''}</span>
                          <span>📁 {job.total_campaigns} campanhas</span>
                          <span>📦 {job.total_adsets} conjuntos</span>
                          <span>📄 {job.total_ads} anúncios</span>
                          <span className="ml-auto">
                            {formatDistanceToNow(new Date(job.created_at), { addSuffix: true, locale: ptBR })}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Process button for queued/failed jobs */}
                        {(job.status === 'queued' || job.status === 'failed') && (
                          <Button
                            size="sm"
                            variant={job.status === 'failed' ? 'outline' : 'default'}
                            onClick={(e) => handleProcessJob(job.id, e)}
                            disabled={processJobMutation.isPending}
                            className={cn(
                              "h-7 px-3 text-xs",
                              job.status === 'queued' && "bg-ads-success hover:bg-ads-success/90"
                            )}
                          >
                            {processJobMutation.isPending ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : job.status === 'failed' ? (
                              <>
                                <RotateCcw className="w-3 h-3 mr-1" />
                                Reprocessar
                              </>
                            ) : (
                              <>
                                <Play className="w-3 h-3 mr-1" />
                                Processar
                              </>
                            )}
                          </Button>
                        )}

                        {(job.status === 'processing' || job.status === 'queued') && (
                          <div className="w-24">
                            <Progress value={job.progress} className="h-2" />
                            <p className="text-xs text-muted-foreground mt-1 text-right">{job.progress}%</p>
                          </div>
                        )}
                        <span className="text-xs text-muted-foreground font-mono">#{job.hash}</span>
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="p-4 border-t border-border bg-secondary/20">
                        {job.error_message && (
                          <div className="mb-3 p-3 bg-ads-danger/10 border border-ads-danger/30 rounded-md">
                            <p className="text-sm text-ads-danger font-medium">Erro:</p>
                            <p className="text-sm text-ads-danger/80">{job.error_message}</p>
                          </div>
                        )}

                        <JobItemsTree items={expandedJobItems} isLoading={isLoadingItems} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
