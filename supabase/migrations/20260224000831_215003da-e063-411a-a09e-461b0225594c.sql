
-- Allow admins to view all campaign jobs
CREATE POLICY "Admins can view all jobs"
ON public.campaign_jobs
FOR SELECT
USING (is_admin());
