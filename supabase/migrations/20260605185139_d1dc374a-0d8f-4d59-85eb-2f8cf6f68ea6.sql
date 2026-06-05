ALTER TABLE public.facebook_pages
  ADD COLUMN IF NOT EXISTS instagram_actor_id text,
  ADD COLUMN IF NOT EXISTS instagram_actor_type text,
  ADD COLUMN IF NOT EXISTS instagram_resolved_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_facebook_pages_page_id_resolved
  ON public.facebook_pages (page_id, instagram_resolved_at);