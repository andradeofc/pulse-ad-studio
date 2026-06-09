ALTER TABLE public.catalog_media_monitors
  ADD COLUMN IF NOT EXISTS last_repair_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_repair_success_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_repair_error text;

ALTER TABLE public.catalog_media_alerts
  ADD COLUMN IF NOT EXISTS repair_error text,
  ADD COLUMN IF NOT EXISTS repair_attempted_at timestamptz;