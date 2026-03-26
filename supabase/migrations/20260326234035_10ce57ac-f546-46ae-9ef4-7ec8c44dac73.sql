-- Table for storing scheduled campaign activations
CREATE TABLE public.campaign_activation_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  profile_id uuid NOT NULL REFERENCES public.facebook_profiles(id),
  ad_account_id text NOT NULL,
  campaign_id text NOT NULL,
  campaign_name text,
  scheduled_at timestamp with time zone NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  processed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.campaign_activation_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own schedules" ON public.campaign_activation_schedules
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own schedules" ON public.campaign_activation_schedules
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own schedules" ON public.campaign_activation_schedules
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own schedules" ON public.campaign_activation_schedules
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Team member policies
CREATE POLICY "Team members can view owner schedules" ON public.campaign_activation_schedules
  FOR SELECT TO authenticated USING (user_id = effective_user_id());

CREATE POLICY "Team members can insert owner schedules" ON public.campaign_activation_schedules
  FOR INSERT TO authenticated WITH CHECK (user_id = effective_user_id());

CREATE POLICY "Team members can update owner schedules" ON public.campaign_activation_schedules
  FOR UPDATE TO authenticated USING (user_id = effective_user_id());

CREATE POLICY "Team members can delete owner schedules" ON public.campaign_activation_schedules
  FOR DELETE TO authenticated USING (user_id = effective_user_id());

-- Index for cron processor
CREATE INDEX idx_campaign_activation_pending ON public.campaign_activation_schedules (status, scheduled_at) WHERE status = 'pending';