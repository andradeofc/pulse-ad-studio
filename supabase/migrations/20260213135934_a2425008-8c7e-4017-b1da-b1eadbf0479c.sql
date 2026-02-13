
-- Table: catalog_media_monitors
CREATE TABLE public.catalog_media_monitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  profile_id uuid NOT NULL REFERENCES public.facebook_profiles(id) ON DELETE CASCADE,
  catalog_id uuid NOT NULL REFERENCES public.facebook_catalogs(id) ON DELETE CASCADE,
  product_set_id uuid NOT NULL REFERENCES public.facebook_product_sets(id) ON DELETE CASCADE,
  product_set_name text NOT NULL,
  creative_id uuid REFERENCES public.creatives(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  auto_repair boolean NOT NULL DEFAULT false,
  webhook_url text,
  source text NOT NULL DEFAULT 'manual',
  last_checked_at timestamp with time zone,
  last_issue_at timestamp with time zone,
  issues_found integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, product_set_id)
);

ALTER TABLE public.catalog_media_monitors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own monitors" ON public.catalog_media_monitors FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own monitors" ON public.catalog_media_monitors FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own monitors" ON public.catalog_media_monitors FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own monitors" ON public.catalog_media_monitors FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_catalog_media_monitors_updated_at
  BEFORE UPDATE ON public.catalog_media_monitors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Table: catalog_media_alerts
CREATE TABLE public.catalog_media_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id uuid NOT NULL REFERENCES public.catalog_media_monitors(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  retailer_id text NOT NULL,
  product_name text,
  product_set_name text NOT NULL,
  catalog_name text NOT NULL,
  alert_type text NOT NULL DEFAULT 'video_missing',
  status text NOT NULL DEFAULT 'detected',
  repaired_at timestamp with time zone,
  webhook_sent boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.catalog_media_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own alerts" ON public.catalog_media_alerts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own alerts" ON public.catalog_media_alerts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own alerts" ON public.catalog_media_alerts FOR UPDATE USING (auth.uid() = user_id);
