
-- =============================================
-- SISTEMA DE COLABORADORES - PLANO ENTERPRISE
-- =============================================

-- 1. Tabela team_members
CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  member_id uuid NOT NULL,
  email text NOT NULL,
  invited_at timestamptz DEFAULT now(),
  accepted_at timestamptz,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id, email),
  UNIQUE(member_id)
);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- RLS para team_members
CREATE POLICY "Owners can view their team members"
  ON public.team_members FOR SELECT
  USING (owner_id = auth.uid() OR member_id = auth.uid());

CREATE POLICY "Owners can insert team members"
  ON public.team_members FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can update their team members"
  ON public.team_members FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "Owners can delete their team members"
  ON public.team_members FOR DELETE
  USING (owner_id = auth.uid());

-- 2. Função effective_user_id()
CREATE OR REPLACE FUNCTION public.effective_user_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT owner_id FROM public.team_members 
     WHERE member_id = auth.uid() AND status = 'active'
     LIMIT 1),
    auth.uid()
  )
$$;

-- 3. Função is_team_member_of(owner_uuid)
CREATE OR REPLACE FUNCTION public.is_team_member_of(owner_uuid uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE member_id = auth.uid()
      AND owner_id = owner_uuid
      AND status = 'active'
  )
$$;

-- 4. Função para verificar se é colaborador
CREATE OR REPLACE FUNCTION public.is_collaborator()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE member_id = auth.uid() AND status = 'active'
  )
$$;

-- 5. Atualizar user_owns_facebook_profile para considerar colaboradores
CREATE OR REPLACE FUNCTION public.user_owns_facebook_profile(profile_id uuid)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.facebook_profiles
    WHERE id = profile_id AND user_id = public.effective_user_id()
  );
END;
$$;

-- =============================================
-- NOVAS POLÍTICAS RLS PARA COLABORADORES
-- Tabelas com user_id direto: SELECT + INSERT/UPDATE/DELETE
-- =============================================

-- facebook_profiles: SELECT + INSERT para colaboradores
CREATE POLICY "Team members can view owner facebook profiles"
  ON public.facebook_profiles FOR SELECT
  USING (user_id = public.effective_user_id());

CREATE POLICY "Team members can update owner facebook profiles"
  ON public.facebook_profiles FOR UPDATE
  USING (user_id = public.effective_user_id());

-- campaign_jobs: SELECT + INSERT + UPDATE + DELETE
CREATE POLICY "Team members can view owner campaign jobs"
  ON public.campaign_jobs FOR SELECT
  USING (user_id = public.effective_user_id());

CREATE POLICY "Team members can insert owner campaign jobs"
  ON public.campaign_jobs FOR INSERT
  WITH CHECK (user_id = public.effective_user_id());

CREATE POLICY "Team members can update owner campaign jobs"
  ON public.campaign_jobs FOR UPDATE
  USING (user_id = public.effective_user_id());

CREATE POLICY "Team members can delete owner campaign jobs"
  ON public.campaign_jobs FOR DELETE
  USING (user_id = public.effective_user_id());

-- campaign_templates: FULL
CREATE POLICY "Team members can view owner templates"
  ON public.campaign_templates FOR SELECT
  USING (user_id = public.effective_user_id());

CREATE POLICY "Team members can insert owner templates"
  ON public.campaign_templates FOR INSERT
  WITH CHECK (user_id = public.effective_user_id());

CREATE POLICY "Team members can update owner templates"
  ON public.campaign_templates FOR UPDATE
  USING (user_id = public.effective_user_id());

CREATE POLICY "Team members can delete owner templates"
  ON public.campaign_templates FOR DELETE
  USING (user_id = public.effective_user_id());

-- creatives: FULL
CREATE POLICY "Team members can view owner creatives"
  ON public.creatives FOR SELECT
  USING (user_id = public.effective_user_id());

CREATE POLICY "Team members can insert owner creatives"
  ON public.creatives FOR INSERT
  WITH CHECK (user_id = public.effective_user_id());

CREATE POLICY "Team members can update owner creatives"
  ON public.creatives FOR UPDATE
  USING (user_id = public.effective_user_id());

CREATE POLICY "Team members can delete owner creatives"
  ON public.creatives FOR DELETE
  USING (user_id = public.effective_user_id());

-- creative_folders: FULL
CREATE POLICY "Team members can view owner folders"
  ON public.creative_folders FOR SELECT
  USING (user_id = public.effective_user_id());

CREATE POLICY "Team members can insert owner folders"
  ON public.creative_folders FOR INSERT
  WITH CHECK (user_id = public.effective_user_id());

CREATE POLICY "Team members can update owner folders"
  ON public.creative_folders FOR UPDATE
  USING (user_id = public.effective_user_id());

CREATE POLICY "Team members can delete owner folders"
  ON public.creative_folders FOR DELETE
  USING (user_id = public.effective_user_id());

-- naming_presets: FULL
CREATE POLICY "Team members can view owner presets"
  ON public.naming_presets FOR SELECT
  USING (user_id = public.effective_user_id());

CREATE POLICY "Team members can insert owner presets"
  ON public.naming_presets FOR INSERT
  WITH CHECK (user_id = public.effective_user_id());

CREATE POLICY "Team members can update owner presets"
  ON public.naming_presets FOR UPDATE
  USING (user_id = public.effective_user_id());

CREATE POLICY "Team members can delete owner presets"
  ON public.naming_presets FOR DELETE
  USING (user_id = public.effective_user_id());

-- naming_variables: FULL
CREATE POLICY "Team members can view owner variables"
  ON public.naming_variables FOR SELECT
  USING (user_id = public.effective_user_id());

CREATE POLICY "Team members can insert owner variables"
  ON public.naming_variables FOR INSERT
  WITH CHECK (user_id = public.effective_user_id());

CREATE POLICY "Team members can update owner variables"
  ON public.naming_variables FOR UPDATE
  USING (user_id = public.effective_user_id());

CREATE POLICY "Team members can delete owner variables"
  ON public.naming_variables FOR DELETE
  USING (user_id = public.effective_user_id());

-- user_zapi_settings: SELECT only
CREATE POLICY "Team members can view owner zapi settings"
  ON public.user_zapi_settings FOR SELECT
  USING (user_id = public.effective_user_id());

-- user_ad_usage: SELECT only
CREATE POLICY "Team members can view owner ad usage"
  ON public.user_ad_usage FOR SELECT
  USING (user_id = public.effective_user_id());

-- catalog_schedules: FULL
CREATE POLICY "Team members can view owner schedules"
  ON public.catalog_schedules FOR SELECT
  USING (user_id = public.effective_user_id());

CREATE POLICY "Team members can insert owner schedules"
  ON public.catalog_schedules FOR INSERT
  WITH CHECK (user_id = public.effective_user_id());

CREATE POLICY "Team members can update owner schedules"
  ON public.catalog_schedules FOR UPDATE
  USING (user_id = public.effective_user_id());

CREATE POLICY "Team members can delete owner schedules"
  ON public.catalog_schedules FOR DELETE
  USING (user_id = public.effective_user_id());

-- catalog_media_monitors: FULL
CREATE POLICY "Team members can view owner monitors"
  ON public.catalog_media_monitors FOR SELECT
  USING (user_id = public.effective_user_id());

CREATE POLICY "Team members can insert owner monitors"
  ON public.catalog_media_monitors FOR INSERT
  WITH CHECK (user_id = public.effective_user_id());

CREATE POLICY "Team members can update owner monitors"
  ON public.catalog_media_monitors FOR UPDATE
  USING (user_id = public.effective_user_id());

CREATE POLICY "Team members can delete owner monitors"
  ON public.catalog_media_monitors FOR DELETE
  USING (user_id = public.effective_user_id());

-- catalog_media_alerts: SELECT + INSERT + UPDATE
CREATE POLICY "Team members can view owner alerts"
  ON public.catalog_media_alerts FOR SELECT
  USING (user_id = public.effective_user_id());

CREATE POLICY "Team members can insert owner alerts"
  ON public.catalog_media_alerts FOR INSERT
  WITH CHECK (user_id = public.effective_user_id());

CREATE POLICY "Team members can update owner alerts"
  ON public.catalog_media_alerts FOR UPDATE
  USING (user_id = public.effective_user_id());

-- rate_limit_tracking: FULL
CREATE POLICY "Team members can view owner rate limits"
  ON public.rate_limit_tracking FOR SELECT
  USING (user_id = public.effective_user_id());

CREATE POLICY "Team members can insert owner rate limits"
  ON public.rate_limit_tracking FOR INSERT
  WITH CHECK (user_id = public.effective_user_id());

CREATE POLICY "Team members can update owner rate limits"
  ON public.rate_limit_tracking FOR UPDATE
  USING (user_id = public.effective_user_id());

CREATE POLICY "Team members can delete owner rate limits"
  ON public.rate_limit_tracking FOR DELETE
  USING (user_id = public.effective_user_id());

-- =============================================
-- Tabelas com profile_id via join: já cobertas pela atualização
-- de user_owns_facebook_profile() que agora usa effective_user_id()
-- facebook_ad_accounts, facebook_pages, facebook_pixels,
-- facebook_catalogs, facebook_product_sets, facebook_business_managers
-- já funcionam automaticamente!
-- =============================================

-- campaign_job_items: via join com campaign_jobs (já coberto pelas novas policies de campaign_jobs)
CREATE POLICY "Team members can view owner job items"
  ON public.campaign_job_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM campaign_jobs
    WHERE campaign_jobs.id = campaign_job_items.job_id
      AND campaign_jobs.user_id = public.effective_user_id()
  ));

CREATE POLICY "Team members can insert owner job items"
  ON public.campaign_job_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM campaign_jobs
    WHERE campaign_jobs.id = campaign_job_items.job_id
      AND campaign_jobs.user_id = public.effective_user_id()
  ));

-- catalog_schedule_products: via join com catalog_schedules
CREATE POLICY "Team members can view owner schedule products"
  ON public.catalog_schedule_products FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM catalog_schedules
    WHERE catalog_schedules.id = catalog_schedule_products.schedule_id
      AND catalog_schedules.user_id = public.effective_user_id()
  ));

CREATE POLICY "Team members can insert owner schedule products"
  ON public.catalog_schedule_products FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM catalog_schedules
    WHERE catalog_schedules.id = catalog_schedule_products.schedule_id
      AND catalog_schedules.user_id = public.effective_user_id()
  ));

-- api_call_logs: SELECT para colaboradores
CREATE POLICY "Team members can view owner api logs"
  ON public.api_call_logs FOR SELECT
  USING (user_id = public.effective_user_id());

CREATE POLICY "Team members can insert owner api logs"
  ON public.api_call_logs FOR INSERT
  WITH CHECK (user_id = public.effective_user_id());

-- Índices para performance
CREATE INDEX idx_team_members_member_id ON public.team_members(member_id) WHERE status = 'active';
CREATE INDEX idx_team_members_owner_id ON public.team_members(owner_id) WHERE status = 'active';
