-- Create facebook_pages table to store synced Facebook pages
CREATE TABLE public.facebook_pages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.facebook_profiles(id) ON DELETE CASCADE,
  page_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  access_token TEXT, -- Page access token for publishing
  picture_url TEXT,
  followers_count INTEGER DEFAULT 0,
  is_published BOOLEAN DEFAULT true,
  -- Business Manager info (if page is managed by a BM)
  business_id TEXT,
  business_name TEXT,
  -- Ad limits tracking
  ads_running INTEGER DEFAULT 0,
  ads_limit INTEGER DEFAULT 250,
  -- Metadata
  tasks TEXT[], -- Permissions/tasks available
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  -- Ensure unique page per profile
  UNIQUE(profile_id, page_id)
);

-- Enable RLS
ALTER TABLE public.facebook_pages ENABLE ROW LEVEL SECURITY;

-- RLS Policies using direct EXISTS check (proven pattern)
CREATE POLICY "Users can view pages from their profiles"
ON public.facebook_pages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.facebook_profiles
    WHERE facebook_profiles.id = facebook_pages.profile_id
    AND facebook_profiles.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert pages from their profiles"
ON public.facebook_pages FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.facebook_profiles
    WHERE facebook_profiles.id = facebook_pages.profile_id
    AND facebook_profiles.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update pages from their profiles"
ON public.facebook_pages FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.facebook_profiles
    WHERE facebook_profiles.id = facebook_pages.profile_id
    AND facebook_profiles.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete pages from their profiles"
ON public.facebook_pages FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.facebook_profiles
    WHERE facebook_profiles.id = facebook_pages.profile_id
    AND facebook_profiles.user_id = auth.uid()
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_facebook_pages_updated_at
BEFORE UPDATE ON public.facebook_pages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for faster queries
CREATE INDEX idx_facebook_pages_profile_id ON public.facebook_pages(profile_id);
CREATE INDEX idx_facebook_pages_page_id ON public.facebook_pages(page_id);