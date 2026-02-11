
-- Function to get admin user stats bypassing RLS
CREATE OR REPLACE FUNCTION public.get_admin_user_stats(target_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result json;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  
  SELECT json_build_object(
    'fb_accounts_count', (SELECT count(*) FROM facebook_profiles WHERE user_id = target_user_id),
    'ad_accounts_count', (SELECT count(*) FROM facebook_ad_accounts a JOIN facebook_profiles p ON p.id = a.profile_id WHERE p.user_id = target_user_id),
    'campaigns_count', (SELECT count(*) FROM campaign_jobs WHERE user_id = target_user_id),
    'total_spend', COALESCE((SELECT sum(a.amount_spent) FROM facebook_ad_accounts a JOIN facebook_profiles p ON p.id = a.profile_id WHERE p.user_id = target_user_id), 0)
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Function to get all users stats in bulk (more efficient)
CREATE OR REPLACE FUNCTION public.get_admin_all_user_stats()
RETURNS TABLE(
  user_id uuid,
  fb_accounts_count bigint,
  ad_accounts_count bigint,
  campaigns_count bigint,
  total_spend numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  
  RETURN QUERY
  SELECT 
    up.user_id,
    COALESCE((SELECT count(*) FROM facebook_profiles fp WHERE fp.user_id = up.user_id), 0) as fb_accounts_count,
    COALESCE((SELECT count(*) FROM facebook_ad_accounts a JOIN facebook_profiles p ON p.id = a.profile_id WHERE p.user_id = up.user_id), 0) as ad_accounts_count,
    COALESCE((SELECT count(*) FROM campaign_jobs cj WHERE cj.user_id = up.user_id), 0) as campaigns_count,
    COALESCE((SELECT sum(a.amount_spent) FROM facebook_ad_accounts a JOIN facebook_profiles p ON p.id = a.profile_id WHERE p.user_id = up.user_id), 0) as total_spend
  FROM user_profiles up;
END;
$$;

-- Function to get admin users summary metrics
CREATE OR REPLACE FUNCTION public.get_admin_users_summary()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result json;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  
  SELECT json_build_object(
    'total_users', (SELECT count(*) FROM user_profiles),
    'active_users', (SELECT count(*) FROM user_profiles WHERE status = 'active'),
    'suspended_users', (SELECT count(*) FROM user_profiles WHERE status = 'suspended' OR status = 'banned'),
    'new_this_month', (SELECT count(*) FROM user_profiles WHERE created_at >= date_trunc('month', now())),
    'starter_count', (SELECT count(*) FROM user_profiles WHERE plan = 'starter'),
    'pro_count', (SELECT count(*) FROM user_profiles WHERE plan = 'pro'),
    'enterprise_count', (SELECT count(*) FROM user_profiles WHERE plan = 'enterprise')
  ) INTO result;
  
  RETURN result;
END;
$$;
