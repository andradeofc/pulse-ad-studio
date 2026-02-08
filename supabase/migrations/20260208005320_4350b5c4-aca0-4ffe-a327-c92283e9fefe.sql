-- Add new columns to campaign_jobs for queue management
ALTER TABLE public.campaign_jobs 
ADD COLUMN IF NOT EXISTS paused_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS resume_after TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS last_rate_limit_percent NUMERIC(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS processed_items INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS batch_size INTEGER DEFAULT 50;

-- Create rate_limit_tracking table for per-account usage tracking
CREATE TABLE IF NOT EXISTS public.rate_limit_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  account_id TEXT NOT NULL,
  usage_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  last_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  window_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  request_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, account_id)
);

-- Enable RLS
ALTER TABLE public.rate_limit_tracking ENABLE ROW LEVEL SECURITY;

-- RLS policies for rate_limit_tracking
CREATE POLICY "Users can view their own rate limit data"
ON public.rate_limit_tracking
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own rate limit data"
ON public.rate_limit_tracking
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own rate limit data"
ON public.rate_limit_tracking
FOR UPDATE
USING (auth.uid() = user_id);

-- Service role needs to update rate limit tracking
CREATE POLICY "Service role can manage rate limit data"
ON public.rate_limit_tracking
FOR ALL
USING (true)
WITH CHECK (true);

-- Add index for efficient querying of queued/paused jobs
CREATE INDEX IF NOT EXISTS idx_campaign_jobs_status_resume 
ON public.campaign_jobs(status, resume_after) 
WHERE status IN ('queued', 'processing', 'paused');

-- Update status check constraint to include 'paused' status
-- First drop existing constraint if exists
DO $$
BEGIN
  -- Try to add paused as valid status (no constraint exists currently, status is just text)
  -- Jobs can now be: queued, processing, paused, completed, failed
  NULL;
END $$;