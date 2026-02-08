-- Create role enum type
CREATE TYPE public.app_role AS ENUM ('user', 'admin');

-- Create user status enum type  
CREATE TYPE public.user_status AS ENUM ('active', 'inactive', 'suspended', 'banned');

-- Create user_roles table (CRITICAL: roles must be in separate table for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Create user_profiles table for extended user data (admin management)
CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  full_name TEXT,
  phone TEXT,
  status user_status NOT NULL DEFAULT 'active',
  plan TEXT DEFAULT 'starter',
  admin_notes TEXT,
  custom_limits JSONB DEFAULT '{}',
  last_login_at TIMESTAMP WITH TIME ZONE,
  last_login_ip TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Admin audit logs (immutable - never deleted)
CREATE TABLE public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details JSONB DEFAULT '{}',
  ip_address TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for audit logs
CREATE INDEX idx_audit_admin_id ON public.admin_audit_logs(admin_user_id);
CREATE INDEX idx_audit_action ON public.admin_audit_logs(action);
CREATE INDEX idx_audit_target ON public.admin_audit_logs(target_type, target_id);
CREATE INDEX idx_audit_created ON public.admin_audit_logs(created_at DESC);

-- API call logs for Facebook API monitoring
CREATE TABLE public.api_call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  job_id UUID,
  job_item_id UUID,
  http_method TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  request_body JSONB,
  response_status INTEGER NOT NULL,
  response_body JSONB,
  response_time_ms INTEGER,
  retry_count INTEGER DEFAULT 0,
  ad_account_id TEXT,
  facebook_object_type TEXT,
  facebook_object_id TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for API logs
CREATE INDEX idx_api_logs_user ON public.api_call_logs(user_id);
CREATE INDEX idx_api_logs_job ON public.api_call_logs(job_id);
CREATE INDEX idx_api_logs_status ON public.api_call_logs(response_status);
CREATE INDEX idx_api_logs_created ON public.api_call_logs(created_at DESC);
CREATE INDEX idx_api_logs_fb_object ON public.api_call_logs(facebook_object_type, facebook_object_id);

-- Admin notifications for broadcast
CREATE TABLE public.admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  notification_type TEXT NOT NULL DEFAULT 'info',
  delivery_method TEXT NOT NULL DEFAULT 'banner',
  target_audience TEXT NOT NULL DEFAULT 'all',
  target_plans JSONB,
  target_user_ids JSONB,
  scheduled_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- User notification reads
CREATE TABLE public.user_notification_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  notification_id UUID NOT NULL REFERENCES public.admin_notifications(id) ON DELETE CASCADE,
  read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, notification_id)
);

-- Platform settings (global config)
CREATE TABLE public.platform_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_name TEXT UNIQUE NOT NULL,
  value_text TEXT,
  value_json JSONB,
  updated_by UUID,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Security definer function to check if user has a role (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Function to check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
$$;

-- Enable RLS on all tables
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notification_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "Only admins can manage roles"
ON public.user_roles FOR ALL
USING (public.is_admin());

-- RLS Policies for user_profiles
CREATE POLICY "Users can view their own profile"
ON public.user_profiles FOR SELECT
USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "Users can insert their own profile"
ON public.user_profiles FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own profile"
ON public.user_profiles FOR UPDATE
USING (user_id = auth.uid() OR public.is_admin());

-- RLS Policies for admin_audit_logs (only admins can view, no one can delete)
CREATE POLICY "Only admins can view audit logs"
ON public.admin_audit_logs FOR SELECT
USING (public.is_admin());

CREATE POLICY "Only admins can insert audit logs"
ON public.admin_audit_logs FOR INSERT
WITH CHECK (public.is_admin());

-- RLS Policies for api_call_logs
CREATE POLICY "Users can view their own API logs"
ON public.api_call_logs FOR SELECT
USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "Service can insert API logs"
ON public.api_call_logs FOR INSERT
WITH CHECK (true);

-- RLS Policies for admin_notifications
CREATE POLICY "Admins can manage notifications"
ON public.admin_notifications FOR ALL
USING (public.is_admin());

CREATE POLICY "Users can view active notifications"
ON public.admin_notifications FOR SELECT
USING (
  target_audience = 'all' 
  OR (target_audience = 'specific_users' AND target_user_ids ? auth.uid()::text)
);

-- RLS Policies for user_notification_reads
CREATE POLICY "Users can manage their notification reads"
ON public.user_notification_reads FOR ALL
USING (user_id = auth.uid());

-- RLS Policies for platform_settings
CREATE POLICY "Anyone can view public settings"
ON public.platform_settings FOR SELECT
USING (true);

CREATE POLICY "Only admins can modify settings"
ON public.platform_settings FOR ALL
USING (public.is_admin());

-- Trigger to update updated_at
CREATE TRIGGER update_user_roles_updated_at
BEFORE UPDATE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_profiles_updated_at
BEFORE UPDATE ON public.user_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default platform settings
INSERT INTO public.platform_settings (key_name, value_text, value_json) VALUES
('platform_name', 'AdsPulse', null),
('maintenance_mode', 'false', null),
('maintenance_message', 'Sistema em manutenção. Voltaremos em breve.', null),
('facebook_api_version', 'v21.0', null),
('rate_limit_delay_ms', '100', null),
('max_retries', '3', null),
('plan_limits', null, '{"starter": {"max_fb_accounts": 2, "max_ad_accounts": 5, "max_campaigns_month": 50, "max_creatives": 100, "max_concurrent_jobs": 2}, "pro": {"max_fb_accounts": 5, "max_ad_accounts": 20, "max_campaigns_month": 500, "max_creatives": 1000, "max_concurrent_jobs": 5}, "enterprise": {"max_fb_accounts": -1, "max_ad_accounts": -1, "max_campaigns_month": -1, "max_creatives": -1, "max_concurrent_jobs": 10}}');