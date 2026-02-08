
-- Atualizar constraint para incluir status 'paused'
ALTER TABLE campaign_jobs DROP CONSTRAINT campaign_jobs_status_check;

ALTER TABLE campaign_jobs ADD CONSTRAINT campaign_jobs_status_check 
CHECK (status = ANY (ARRAY['queued'::text, 'processing'::text, 'paused'::text, 'completed'::text, 'failed'::text]));
