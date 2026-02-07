-- Enable realtime for campaign jobs tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_job_items;