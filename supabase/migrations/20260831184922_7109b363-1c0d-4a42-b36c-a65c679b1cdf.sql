-- 1. api_call_logs: remove spoofable insert policy
DROP POLICY IF EXISTS "Authenticated can insert API logs" ON public.api_call_logs;

-- 2. platform_settings: admin-only reads
DROP POLICY IF EXISTS "Anyone can view public settings" ON public.platform_settings;
CREATE POLICY "Admins can view settings"
ON public.platform_settings FOR SELECT TO authenticated
USING (public.is_admin());
REVOKE ALL ON public.platform_settings FROM anon;

-- 3. admin_notifications: no direct reads for non-admins
DROP POLICY IF EXISTS "Users can view active notifications" ON public.admin_notifications;
REVOKE ALL ON public.admin_notifications FROM anon;

CREATE OR REPLACE FUNCTION public.get_my_notifications()
RETURNS TABLE (
  id uuid,
  title text,
  message text,
  notification_type text,
  delivery_method text,
  sent_at timestamptz,
  created_at timestamptz,
  expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT n.id, n.title, n.message, n.notification_type, n.delivery_method,
         n.sent_at, n.created_at, n.expires_at
  FROM public.admin_notifications n
  WHERE auth.uid() IS NOT NULL
    AND n.sent_at IS NOT NULL
    AND (n.expires_at IS NULL OR n.expires_at > now())
    AND (
      n.target_audience = 'all'
      OR (n.target_audience = 'specific_users' AND n.target_user_ids ? (auth.uid())::text)
      OR (n.target_audience = 'by_plan' AND EXISTS (
            SELECT 1 FROM public.user_profiles up
            WHERE up.user_id = auth.uid()
              AND n.target_plans ? up.plan
         ))
    )
  ORDER BY n.sent_at DESC
  LIMIT 20
$$;
REVOKE ALL ON FUNCTION public.get_my_notifications() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_notifications() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_notifications() TO authenticated;

-- 4. team_members: scope policy to authenticated role only
DROP POLICY IF EXISTS "Owners can view their team members" ON public.team_members;
CREATE POLICY "Owners and members can view their team rows"
ON public.team_members FOR SELECT TO authenticated
USING (owner_id = auth.uid() OR member_id = auth.uid());
REVOKE ALL ON public.team_members FROM anon;

-- 5. user_profiles: block self-service escalation of sensitive fields
CREATE OR REPLACE FUNCTION public.prevent_user_profile_privilege_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;
  NEW.plan := OLD.plan;
  NEW.status := OLD.status;
  NEW.custom_limits := OLD.custom_limits;
  NEW.admin_notes := OLD.admin_notes;
  NEW.subscription_starts_at := OLD.subscription_starts_at;
  NEW.user_id := OLD.user_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_prevent_user_profile_privilege_change ON public.user_profiles;
CREATE TRIGGER trg_prevent_user_profile_privilege_change
BEFORE UPDATE ON public.user_profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_user_profile_privilege_change();
REVOKE ALL ON public.user_profiles FROM anon;

-- 6. facebook_profiles / facebook_pages: hide secret columns from client roles
REVOKE ALL ON public.facebook_profiles FROM anon;
REVOKE ALL ON public.facebook_profiles FROM authenticated;
GRANT SELECT (id, user_id, facebook_id, name, email, avatar_url, status, permissions,
  token_expires_at, page_token_valid, proxy_host, proxy_port, proxy_username,
  last_synced_at, created_at, updated_at, sync_status, proxy_protocol, is_primary,
  app_id, app_name, auth_method, token_status, token_check_error, token_check_error_code,
  last_token_check_at, is_long_lived, rate_limited_until, rate_limit_count, role)
ON public.facebook_profiles TO authenticated;
GRANT UPDATE (name, status, proxy_host, proxy_port, proxy_username, proxy_protocol,
  is_primary, role, sync_status, last_synced_at, updated_at)
ON public.facebook_profiles TO authenticated;
GRANT INSERT, DELETE ON public.facebook_profiles TO authenticated;
GRANT ALL ON public.facebook_profiles TO service_role;

REVOKE ALL ON public.facebook_pages FROM anon;
REVOKE ALL ON public.facebook_pages FROM authenticated;
GRANT SELECT (id, profile_id, page_id, name, category, picture_url, followers_count,
  is_published, business_id, business_name, ads_running, ads_limit, tasks, created_at,
  updated_at, source, is_blacklisted, blacklist_reason, blacklisted_at,
  instagram_actor_id, instagram_actor_type, instagram_resolved_at)
ON public.facebook_pages TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.facebook_pages TO authenticated;
GRANT ALL ON public.facebook_pages TO service_role;

-- 7. facebook_credentials stays deny-all for client roles (service_role only)
REVOKE ALL ON public.facebook_credentials FROM anon;
REVOKE ALL ON public.facebook_credentials FROM authenticated;
GRANT ALL ON public.facebook_credentials TO service_role;

-- 8. SECURITY DEFINER functions: drop anon execution, keep only what clients need
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.effective_user_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_collaborator() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_team_member_of(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_owns_facebook_profile(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_create_ads(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_current_ad_usage(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.migrate_catalog_monitors_to_profile(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_pause_job(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_resume_job(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_all_user_stats() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_campaign_details(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_user_stats(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_users_summary() FROM anon;

REVOKE EXECUTE ON FUNCTION public.user_is_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_is_admin(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_plan_ad_limit(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_plan_ad_limit(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_ad_usage(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_ad_usage(uuid, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_facebook_page_blacklist() FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_facebook_page_blacklist() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_single_primary_profile() FROM anon;
REVOKE EXECUTE ON FUNCTION public.ensure_single_primary_profile() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM authenticated;