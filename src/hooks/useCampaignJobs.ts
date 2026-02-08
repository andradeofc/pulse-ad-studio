import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface CampaignJob {
  id: string;
  user_id: string;
  hash: string;
  name: string;
  status: 'queued' | 'processing' | 'paused' | 'completed' | 'failed';
  progress: number;
  total_campaigns: number;
  total_adsets: number;
  total_ads: number;
  accounts_count: number;
  config: Record<string, any>;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignJobItem {
  id: string;
  job_id: string;
  item_type: 'campaign' | 'adset' | 'ad';
  parent_id: string | null;
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  facebook_id: string | null;
  error_message: string | null;
  config: Record<string, any>;
  created_at: string;
}

function generateHash(): string {
  return Math.random().toString(36).substring(2, 8);
}

export function useCampaignJobs(statusFilter?: string) {
  return useQuery({
    queryKey: ['campaign-jobs', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('campaign_jobs')
        .select('*')
        .order('created_at', { ascending: false });

      if (statusFilter && statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as CampaignJob[];
    },
  });
}

export function useCampaignJobItems(jobId: string | null) {
  return useQuery({
    queryKey: ['campaign-job-items', jobId],
    queryFn: async () => {
      if (!jobId) return [];

      const { data, error } = await supabase
        .from('campaign_job_items')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as CampaignJobItem[];
    },
    enabled: !!jobId,
  });
}

export function useCreateCampaignJob() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      name: string;
      config: Record<string, any>;
      totalCampaigns: number;
      totalAdsets: number;
      totalAds: number;
      accountsCount: number;
      items: Array<{
        item_type: 'campaign' | 'adset' | 'ad';
        name: string;
        parent_index?: number; // Index in items array for parent reference
        config?: Record<string, any>;
      }>;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const hash = generateHash();

      // Create the job first
      const { data: job, error: jobError } = await supabase
        .from('campaign_jobs')
        .insert({
          user_id: user.id,
          hash,
          name: params.name,
          status: 'queued',
          progress: 0,
          total_campaigns: params.totalCampaigns,
          total_adsets: params.totalAdsets,
          total_ads: params.totalAds,
          accounts_count: params.accountsCount,
          config: params.config,
        })
        .select()
        .single();

      if (jobError) throw jobError;

      // Create job items using batch insert for performance
      // First pass: create all items and track their temp IDs
      if (params.items.length > 0) {
        // Generate UUIDs for all items upfront
        const itemsWithIds = params.items.map((item, index) => ({
          ...item,
          tempId: crypto.randomUUID(),
          originalIndex: index,
        }));

        // Build the insert array with proper parent references
        const itemsToInsert = itemsWithIds.map((item) => {
          // Find parent temp ID if parent_index is specified
          let parentId: string | null = null;
          if (item.parent_index !== undefined && item.parent_index >= 0) {
            const parentItem = itemsWithIds[item.parent_index];
            parentId = parentItem?.tempId || null;
          }

          return {
            id: item.tempId,
            job_id: job.id,
            item_type: item.item_type,
            parent_id: parentId,
            name: item.name,
            status: 'pending' as const,
            config: item.config || {},
          };
        });

        // Batch insert in chunks of 500 to avoid payload limits
        const BATCH_SIZE = 500;
        const batches = [];
        for (let i = 0; i < itemsToInsert.length; i += BATCH_SIZE) {
          batches.push(itemsToInsert.slice(i, i + BATCH_SIZE));
        }

        console.log(`[useCampaignJobs] Inserting ${itemsToInsert.length} items in ${batches.length} batch(es)`);

        // Execute batch inserts in parallel for speed
        const insertPromises = batches.map(async (batch, batchIndex) => {
          const { error: batchError } = await supabase
            .from('campaign_job_items')
            .insert(batch);

          if (batchError) {
            console.error(`[useCampaignJobs] Batch ${batchIndex + 1} failed:`, batchError);
            throw batchError;
          }
          
          console.log(`[useCampaignJobs] Batch ${batchIndex + 1}/${batches.length} inserted (${batch.length} items)`);
        });

        await Promise.all(insertPromises);
        console.log(`[useCampaignJobs] All ${itemsToInsert.length} items inserted successfully`);
      }

      return job as CampaignJob;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-jobs'] });
      toast({
        title: 'Campanhas enviadas para a fila!',
        description: 'Acompanhe o progresso na fila de processamento.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao criar job',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useProcessCampaignJob() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (jobId: string) => {
      const { data, error } = await supabase.functions.invoke('process-campaign-jobs', {
        body: { job_id: jobId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['campaign-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['campaign-job-items'] });

      if (data?.success) {
        toast({
          title: 'Processamento concluído!',
          description: `${data.processed} item(s) processado(s) com sucesso.`,
        });
      } else {
        toast({
          title: 'Processamento finalizado com erros',
          description: data?.error || 'Alguns itens falharam. Verifique os detalhes.',
          variant: 'destructive',
        });
      }
    },
    onError: (error: any) => {
      queryClient.invalidateQueries({ queryKey: ['campaign-jobs'] });
      toast({
        title: 'Erro no processamento',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
