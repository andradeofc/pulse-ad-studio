ALTER TABLE public.fanpage_pools
ADD COLUMN IF NOT EXISTS creator_profile_id uuid REFERENCES public.facebook_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fanpage_pools_creator_profile ON public.fanpage_pools(creator_profile_id);