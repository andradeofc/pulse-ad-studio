-- Create table for Facebook Pixels
CREATE TABLE public.facebook_pixels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.facebook_profiles(id) ON DELETE CASCADE,
  pixel_id TEXT NOT NULL,
  name TEXT NOT NULL,
  account_id TEXT, -- The ad account this pixel belongs to
  account_name TEXT,
  business_id TEXT,
  business_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(profile_id, pixel_id)
);

-- Enable RLS
ALTER TABLE public.facebook_pixels ENABLE ROW LEVEL SECURITY;

-- Create RLS policies using the existing function
CREATE POLICY "Users can view pixels from their profiles"
ON public.facebook_pixels
FOR SELECT
USING (user_owns_facebook_profile(profile_id));

CREATE POLICY "Users can insert pixels from their profiles"
ON public.facebook_pixels
FOR INSERT
WITH CHECK (user_owns_facebook_profile(profile_id));

CREATE POLICY "Users can update pixels from their profiles"
ON public.facebook_pixels
FOR UPDATE
USING (user_owns_facebook_profile(profile_id));

CREATE POLICY "Users can delete pixels from their profiles"
ON public.facebook_pixels
FOR DELETE
USING (user_owns_facebook_profile(profile_id));