
CREATE TABLE public.creative_cleanup_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  ad_account_id text NOT NULL,
  ad_id text NOT NULL,
  operation text NOT NULL,
  strategy text NOT NULL,
  attempt int NOT NULL DEFAULT 1,
  http_code int,
  success boolean NOT NULL DEFAULT false,
  request_body jsonb,
  response_body jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cleanup_logs_user_created ON public.creative_cleanup_logs (user_id, created_at DESC);
CREATE INDEX idx_cleanup_logs_ad ON public.creative_cleanup_logs (ad_id);

ALTER TABLE public.creative_cleanup_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own cleanup logs"
ON public.creative_cleanup_logs FOR SELECT
TO authenticated
USING (user_id = public.effective_user_id() OR public.is_admin());
