-- Create campaign_jobs table for tracking processing queue
CREATE TABLE public.campaign_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  hash VARCHAR(10) NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  
  -- Structure counts
  total_campaigns INTEGER NOT NULL DEFAULT 0,
  total_adsets INTEGER NOT NULL DEFAULT 0,
  total_ads INTEGER NOT NULL DEFAULT 0,
  accounts_count INTEGER NOT NULL DEFAULT 1,
  
  -- Configuration snapshot (to recreate if needed)
  config JSONB NOT NULL DEFAULT '{}',
  
  -- Error tracking
  error_message TEXT,
  
  -- Timestamps
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.campaign_jobs ENABLE ROW LEVEL SECURITY;

-- Users can only see their own jobs
CREATE POLICY "Users can view their own jobs"
  ON public.campaign_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own jobs"
  ON public.campaign_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own jobs"
  ON public.campaign_jobs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own jobs"
  ON public.campaign_jobs FOR DELETE
  USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_campaign_jobs_updated_at
  BEFORE UPDATE ON public.campaign_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster queries
CREATE INDEX idx_campaign_jobs_user_status ON public.campaign_jobs(user_id, status);
CREATE INDEX idx_campaign_jobs_created_at ON public.campaign_jobs(created_at DESC);

-- Create campaign_job_items table for individual items (campaigns, adsets, ads)
CREATE TABLE public.campaign_job_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.campaign_jobs(id) ON DELETE CASCADE,
  
  -- Item type and hierarchy
  item_type TEXT NOT NULL CHECK (item_type IN ('campaign', 'adset', 'ad')),
  parent_id UUID REFERENCES public.campaign_job_items(id) ON DELETE CASCADE,
  
  -- Item details
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  
  -- Facebook IDs (populated after creation)
  facebook_id TEXT,
  
  -- Error tracking
  error_message TEXT,
  
  -- Additional data
  config JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.campaign_job_items ENABLE ROW LEVEL SECURITY;

-- Users can only see items from their own jobs
CREATE POLICY "Users can view items from their jobs"
  ON public.campaign_job_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.campaign_jobs
    WHERE campaign_jobs.id = campaign_job_items.job_id
    AND campaign_jobs.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert items to their jobs"
  ON public.campaign_job_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.campaign_jobs
    WHERE campaign_jobs.id = campaign_job_items.job_id
    AND campaign_jobs.user_id = auth.uid()
  ));

-- Create indexes
CREATE INDEX idx_campaign_job_items_job_id ON public.campaign_job_items(job_id);
CREATE INDEX idx_campaign_job_items_type ON public.campaign_job_items(job_id, item_type);