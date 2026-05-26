
-- Pools table
CREATE TABLE public.fanpage_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#10b981',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fanpage_pools_user_id ON public.fanpage_pools(user_id);

ALTER TABLE public.fanpage_pools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own pools" ON public.fanpage_pools
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own pools" ON public.fanpage_pools
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own pools" ON public.fanpage_pools
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own pools" ON public.fanpage_pools
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Team view owner pools" ON public.fanpage_pools
  FOR SELECT USING (user_id = effective_user_id());
CREATE POLICY "Team insert owner pools" ON public.fanpage_pools
  FOR INSERT WITH CHECK (user_id = effective_user_id());
CREATE POLICY "Team update owner pools" ON public.fanpage_pools
  FOR UPDATE USING (user_id = effective_user_id());
CREATE POLICY "Team delete owner pools" ON public.fanpage_pools
  FOR DELETE USING (user_id = effective_user_id());

CREATE TRIGGER update_fanpage_pools_updated_at
  BEFORE UPDATE ON public.fanpage_pools
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Pool <-> Pages join
CREATE TABLE public.fanpage_pool_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES public.fanpage_pools(id) ON DELETE CASCADE,
  page_id text NOT NULL,
  profile_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(pool_id, page_id)
);

CREATE INDEX idx_fanpage_pool_pages_pool_id ON public.fanpage_pool_pages(pool_id);
CREATE INDEX idx_fanpage_pool_pages_page_id ON public.fanpage_pool_pages(page_id);

ALTER TABLE public.fanpage_pool_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own pool pages" ON public.fanpage_pool_pages
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.fanpage_pools p
    WHERE p.id = pool_id AND (p.user_id = auth.uid() OR p.user_id = effective_user_id())
  ));
CREATE POLICY "Users insert own pool pages" ON public.fanpage_pool_pages
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM public.fanpage_pools p
    WHERE p.id = pool_id AND (p.user_id = auth.uid() OR p.user_id = effective_user_id())
  ));
CREATE POLICY "Users delete own pool pages" ON public.fanpage_pool_pages
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM public.fanpage_pools p
    WHERE p.id = pool_id AND (p.user_id = auth.uid() OR p.user_id = effective_user_id())
  ));
