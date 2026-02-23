CREATE OR REPLACE FUNCTION public.get_admin_campaign_details(p_job_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  
  RETURN (
    SELECT json_build_object(
      'job', row_to_json(cj),
      'items', (SELECT json_agg(row_to_json(ci)) FROM campaign_job_items ci WHERE ci.job_id = cj.id),
      'user', (SELECT json_build_object(
        'user_id', up.user_id, 'full_name', up.full_name, 'plan', up.plan, 'status', up.status,
        'email', (SELECT email FROM auth.users WHERE id = up.user_id)
      ) FROM user_profiles up WHERE up.user_id = cj.user_id)
    )
    FROM campaign_jobs cj WHERE cj.id = p_job_id
  );
END;
$$;