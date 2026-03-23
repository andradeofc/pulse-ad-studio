
CREATE TABLE public.campaign_daily_spend (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  ad_account_id TEXT NOT NULL,
  account_name TEXT,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT,
  currency TEXT,
  date DATE NOT NULL,
  spend NUMERIC NOT NULL DEFAULT 0,
  purchases INTEGER NOT NULL DEFAULT 0,
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(ad_account_id, campaign_id, date)
);

ALTER TABLE public.campaign_daily_spend ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view campaign spend data" ON public.campaign_daily_spend
  FOR SELECT TO authenticated USING (is_admin());

CREATE POLICY "Only admins can insert campaign spend data" ON public.campaign_daily_spend
  FOR INSERT TO authenticated WITH CHECK (is_admin());

CREATE POLICY "Only admins can update campaign spend data" ON public.campaign_daily_spend
  FOR UPDATE TO authenticated USING (is_admin());

CREATE POLICY "Only admins can delete campaign spend data" ON public.campaign_daily_spend
  FOR DELETE TO authenticated USING (is_admin());
