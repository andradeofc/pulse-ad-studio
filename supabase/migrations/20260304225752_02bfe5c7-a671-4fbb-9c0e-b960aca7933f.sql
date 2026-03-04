
UPDATE campaign_jobs 
SET status = 'queued', error_message = NULL, progress = 0, 
    started_at = NULL, completed_at = NULL, paused_at = NULL, 
    resume_after = NULL, processed_items = 0
WHERE id = 'e7527fff-7072-4cdd-bba3-9c0b3134d619';

UPDATE campaign_job_items 
SET status = 'pending', error_message = NULL, facebook_id = NULL
WHERE job_id = 'e7527fff-7072-4cdd-bba3-9c0b3134d619';
