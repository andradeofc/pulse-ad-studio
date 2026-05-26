
ALTER TABLE public.facebook_pages
  ADD COLUMN IF NOT EXISTS is_blacklisted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blacklist_reason text,
  ADD COLUMN IF NOT EXISTS blacklisted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_facebook_pages_blacklisted
  ON public.facebook_pages(is_blacklisted) WHERE is_blacklisted = true;
