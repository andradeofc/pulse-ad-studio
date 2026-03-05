
-- Create table for caching daily spend data per ad account
CREATE TABLE public.ad_account_daily_spend (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  ad_account_id TEXT NOT NULL,
  account_name TEXT,
  currency TEXT,
  date DATE NOT NULL,
  spend NUMERIC NOT NULL DEFAULT 0,
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Unique constraint for upsert
ALTER TABLE public.ad_account_daily_spend ADD CONSTRAINT uq_ad_account_daily_spend UNIQUE (ad_account_id, date);

-- Enable RLS
ALTER TABLE public.ad_account_daily_spend ENABLE ROW LEVEL SECURITY;

-- Admin-only policies
CREATE POLICY "Only admins can view spend data"
  ON public.ad_account_daily_spend
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Only admins can insert spend data"
  ON public.ad_account_daily_spend
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Only admins can update spend data"
  ON public.ad_account_daily_spend
  FOR UPDATE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Only admins can delete spend data"
  ON public.ad_account_daily_spend
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- Index for fast lookups
CREATE INDEX idx_ad_account_daily_spend_user_date ON public.ad_account_daily_spend (user_id, date);
CREATE INDEX idx_ad_account_daily_spend_account_date ON public.ad_account_daily_spend (ad_account_id, date);
