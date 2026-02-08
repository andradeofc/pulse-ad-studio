-- Remove the overly permissive policy
DROP POLICY IF EXISTS "Service role can manage rate limit data" ON public.rate_limit_tracking;

-- Add delete policy for users (they should be able to clean their own data)
CREATE POLICY "Users can delete their own rate limit data"
ON public.rate_limit_tracking
FOR DELETE
USING (auth.uid() = user_id);