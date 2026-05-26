ALTER TABLE public.facebook_pages
ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'api';

CREATE INDEX IF NOT EXISTS idx_facebook_pages_source ON public.facebook_pages(source);