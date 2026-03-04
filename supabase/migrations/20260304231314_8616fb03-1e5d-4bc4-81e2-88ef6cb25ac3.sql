
-- Reset failed ads for job #ba0tmz
UPDATE campaign_job_items 
SET status = 'pending', error_message = NULL, facebook_id = NULL
WHERE job_id = 'd465f228-30cb-44a9-83a6-6de81586af38' 
  AND item_type = 'ad' 
  AND status = 'failed';

-- Reset job status to queued for reprocessing
UPDATE campaign_jobs 
SET status = 'queued', error_message = NULL, progress = 0,
    started_at = NULL, completed_at = NULL, paused_at = NULL,
    resume_after = NULL, processed_items = 0
WHERE id = 'd465f228-30cb-44a9-83a6-6de81586af38';
