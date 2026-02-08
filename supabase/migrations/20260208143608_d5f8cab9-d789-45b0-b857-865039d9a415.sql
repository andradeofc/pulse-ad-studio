-- Add subscription_starts_at to track when user's billing period started
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS subscription_starts_at timestamp with time zone DEFAULT now();

-- Create table to track ad usage per billing period
CREATE TABLE public.user_ad_usage (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  period_start timestamp with time zone NOT NULL,
  period_end timestamp with time zone NOT NULL,
  ads_created integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, period_start)
);

-- Enable RLS
ALTER TABLE public.user_ad_usage ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own ad usage"
ON public.user_ad_usage
FOR SELECT
USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "System can insert ad usage"
ON public.user_ad_usage
FOR INSERT
WITH CHECK (user_id = auth.uid() OR is_admin());

CREATE POLICY "System can update ad usage"
ON public.user_ad_usage
FOR UPDATE
USING (user_id = auth.uid() OR is_admin());

-- Create function to get plan limits
CREATE OR REPLACE FUNCTION public.get_plan_ad_limit(plan_name text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  CASE plan_name
    WHEN 'starter' THEN RETURN 10000;
    WHEN 'pro' THEN RETURN 25000;
    WHEN 'enterprise' THEN RETURN 150000;
    ELSE RETURN 10000; -- Default to starter
  END CASE;
END;
$$;

-- Create function to check if user is admin (has unlimited ads)
CREATE OR REPLACE FUNCTION public.user_is_admin(check_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = check_user_id AND role = 'admin'
  );
$$;

-- Create function to get current period ad usage
CREATE OR REPLACE FUNCTION public.get_current_ad_usage(check_user_id uuid)
RETURNS TABLE(
  ads_used integer,
  ads_limit integer,
  period_start timestamp with time zone,
  period_end timestamp with time zone,
  is_unlimited boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan text;
  v_subscription_start timestamp with time zone;
  v_period_start timestamp with time zone;
  v_period_end timestamp with time zone;
  v_ads_used integer;
  v_is_admin boolean;
BEGIN
  -- Check if user is admin (unlimited)
  SELECT public.user_is_admin(check_user_id) INTO v_is_admin;
  
  -- Get user plan and subscription start
  SELECT 
    COALESCE(up.plan, 'starter'),
    COALESCE(up.subscription_starts_at, up.created_at)
  INTO v_plan, v_subscription_start
  FROM public.user_profiles up
  WHERE up.user_id = check_user_id;
  
  -- Calculate current billing period (30-day rolling)
  -- Find how many complete 30-day periods have passed
  v_period_start := v_subscription_start + 
    (FLOOR(EXTRACT(EPOCH FROM (now() - v_subscription_start)) / (30 * 24 * 60 * 60)) * INTERVAL '30 days');
  v_period_end := v_period_start + INTERVAL '30 days';
  
  -- Get or create usage record for current period
  SELECT COALESCE(uau.ads_created, 0) INTO v_ads_used
  FROM public.user_ad_usage uau
  WHERE uau.user_id = check_user_id 
    AND uau.period_start = v_period_start;
  
  -- If no record exists, count from campaign_job_items
  IF v_ads_used IS NULL THEN
    SELECT COALESCE(COUNT(*), 0)::integer INTO v_ads_used
    FROM public.campaign_job_items cji
    JOIN public.campaign_jobs cj ON cj.id = cji.job_id
    WHERE cj.user_id = check_user_id
      AND cji.item_type = 'ad'
      AND cji.status = 'completed'
      AND cji.created_at >= v_period_start
      AND cji.created_at < v_period_end;
  END IF;
  
  RETURN QUERY SELECT 
    COALESCE(v_ads_used, 0),
    public.get_plan_ad_limit(v_plan),
    v_period_start,
    v_period_end,
    v_is_admin;
END;
$$;

-- Create function to check if user can create ads
CREATE OR REPLACE FUNCTION public.can_create_ads(check_user_id uuid, ads_to_create integer)
RETURNS TABLE(
  allowed boolean,
  current_usage integer,
  limit_value integer,
  remaining integer,
  is_unlimited boolean,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usage record;
BEGIN
  SELECT * INTO v_usage FROM public.get_current_ad_usage(check_user_id);
  
  -- Admins are unlimited
  IF v_usage.is_unlimited THEN
    RETURN QUERY SELECT 
      true,
      v_usage.ads_used,
      v_usage.ads_limit,
      999999,
      true,
      'Plano ilimitado'::text;
    RETURN;
  END IF;
  
  -- Check if user would exceed limit
  IF (v_usage.ads_used + ads_to_create) > v_usage.ads_limit THEN
    RETURN QUERY SELECT 
      false,
      v_usage.ads_used,
      v_usage.ads_limit,
      GREATEST(0, v_usage.ads_limit - v_usage.ads_used),
      false,
      format('Limite de anúncios atingido. Você usou %s de %s anúncios neste período.', 
        v_usage.ads_used, v_usage.ads_limit)::text;
    RETURN;
  END IF;
  
  RETURN QUERY SELECT 
    true,
    v_usage.ads_used,
    v_usage.ads_limit,
    v_usage.ads_limit - v_usage.ads_used - ads_to_create,
    false,
    'OK'::text;
END;
$$;

-- Create function to increment ad usage (called after successful ad creation)
CREATE OR REPLACE FUNCTION public.increment_ad_usage(
  p_user_id uuid, 
  p_ads_count integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscription_start timestamp with time zone;
  v_period_start timestamp with time zone;
  v_period_end timestamp with time zone;
BEGIN
  -- Get subscription start
  SELECT COALESCE(up.subscription_starts_at, up.created_at)
  INTO v_subscription_start
  FROM public.user_profiles up
  WHERE up.user_id = p_user_id;
  
  -- Calculate current billing period
  v_period_start := v_subscription_start + 
    (FLOOR(EXTRACT(EPOCH FROM (now() - v_subscription_start)) / (30 * 24 * 60 * 60)) * INTERVAL '30 days');
  v_period_end := v_period_start + INTERVAL '30 days';
  
  -- Upsert usage record
  INSERT INTO public.user_ad_usage (user_id, period_start, period_end, ads_created)
  VALUES (p_user_id, v_period_start, v_period_end, p_ads_count)
  ON CONFLICT (user_id, period_start) 
  DO UPDATE SET 
    ads_created = user_ad_usage.ads_created + p_ads_count,
    updated_at = now();
END;
$$;

-- Create trigger for updated_at
CREATE TRIGGER update_user_ad_usage_updated_at
BEFORE UPDATE ON public.user_ad_usage
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Update existing users to have subscription_starts_at
UPDATE public.user_profiles 
SET subscription_starts_at = created_at 
WHERE subscription_starts_at IS NULL;