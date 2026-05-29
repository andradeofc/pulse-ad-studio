
-- Add admin manual pause fields to campaign_jobs
ALTER TABLE public.campaign_jobs
  ADD COLUMN IF NOT EXISTS admin_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_pause_message text,
  ADD COLUMN IF NOT EXISTS admin_paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_paused_by uuid;

CREATE INDEX IF NOT EXISTS idx_campaign_jobs_admin_paused
  ON public.campaign_jobs (admin_paused)
  WHERE admin_paused = true;

-- Admin RPC: pause a job manually
CREATE OR REPLACE FUNCTION public.admin_pause_job(p_job_id uuid, p_message text DEFAULT 'Pausado Manualmente')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.campaign_jobs
  SET admin_paused = true,
      admin_pause_message = COALESCE(NULLIF(trim(p_message), ''), 'Pausado Manualmente'),
      admin_paused_at = now(),
      admin_paused_by = auth.uid(),
      status = CASE WHEN status IN ('queued','processing') THEN 'paused' ELSE status END,
      paused_at = now()
  WHERE id = p_job_id;
END;
$$;

-- Admin RPC: resume a manually paused job
CREATE OR REPLACE FUNCTION public.admin_resume_job(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.campaign_jobs
  SET admin_paused = false,
      admin_pause_message = NULL,
      admin_paused_at = NULL,
      admin_paused_by = NULL,
      status = CASE WHEN status = 'paused' THEN 'queued' ELSE status END,
      resume_after = NULL,
      paused_at = NULL
  WHERE id = p_job_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_pause_job(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resume_job(uuid) TO authenticated;
