
-- ============================================================
-- Etapa 1: Campos novos em facebook_profiles (aditivos, NULLABLE)
-- ============================================================
ALTER TABLE public.facebook_profiles
  ADD COLUMN IF NOT EXISTS app_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS app_secret TEXT NULL,
  ADD COLUMN IF NOT EXISTS app_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS auth_method TEXT NOT NULL DEFAULT 'token_only',
  ADD COLUMN IF NOT EXISTS token_status TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS token_check_error TEXT NULL,
  ADD COLUMN IF NOT EXISTS token_check_error_code TEXT NULL,
  ADD COLUMN IF NOT EXISTS last_token_check_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS is_long_lived BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rate_limited_until TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS rate_limit_count INTEGER NOT NULL DEFAULT 0;

-- ============================================================
-- Etapa 1: Tabela facebook_profile_tasks
-- ============================================================
CREATE TABLE IF NOT EXISTS public.facebook_profile_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  profile_id UUID NULL,
  task_type TEXT NOT NULL DEFAULT 'add_profile',
  status TEXT NOT NULL DEFAULT 'pending',
  current_step INTEGER NOT NULL DEFAULT 0,
  total_steps INTEGER NOT NULL DEFAULT 8,
  current_step_key TEXT NULL,
  progress JSONB NOT NULL DEFAULT '[]'::jsonb,
  result JSONB NULL,
  error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.facebook_profile_tasks TO authenticated;
GRANT ALL ON public.facebook_profile_tasks TO service_role;

ALTER TABLE public.facebook_profile_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own profile tasks"
ON public.facebook_profile_tasks
FOR SELECT TO authenticated
USING (user_id = public.effective_user_id());

CREATE POLICY "Users insert own profile tasks"
ON public.facebook_profile_tasks
FOR INSERT TO authenticated
WITH CHECK (user_id = public.effective_user_id());

CREATE POLICY "Users update own profile tasks"
ON public.facebook_profile_tasks
FOR UPDATE TO authenticated
USING (user_id = public.effective_user_id());

CREATE POLICY "Users delete own profile tasks"
ON public.facebook_profile_tasks
FOR DELETE TO authenticated
USING (user_id = public.effective_user_id());

CREATE INDEX IF NOT EXISTS idx_fb_profile_tasks_user_status
  ON public.facebook_profile_tasks (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fb_profile_tasks_profile
  ON public.facebook_profile_tasks (profile_id);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_fb_profile_tasks_updated_at ON public.facebook_profile_tasks;
CREATE TRIGGER trg_fb_profile_tasks_updated_at
BEFORE UPDATE ON public.facebook_profile_tasks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Habilita Realtime
ALTER TABLE public.facebook_profile_tasks REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.facebook_profile_tasks;
