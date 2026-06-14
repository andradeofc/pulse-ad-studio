-- Add role column to facebook_profiles
ALTER TABLE public.facebook_profiles
ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'both';

ALTER TABLE public.facebook_profiles
DROP CONSTRAINT IF EXISTS facebook_profiles_role_check;

ALTER TABLE public.facebook_profiles
ADD CONSTRAINT facebook_profiles_role_check
CHECK (role IN ('monitor','campaigns','both'));

-- Only one 'monitor' profile per user (partial unique index)
DROP INDEX IF EXISTS public.idx_one_monitor_per_user;
CREATE UNIQUE INDEX idx_one_monitor_per_user
ON public.facebook_profiles (user_id)
WHERE role = 'monitor' AND status != 'disconnected';

COMMENT ON COLUMN public.facebook_profiles.role IS
'Define para que este perfil é usado: monitor (só monitoramento de catálogo), campaigns (só campanhas/pages/pixels), both (tudo, padrão).';