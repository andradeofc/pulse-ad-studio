-- Create table to store all Business Managers the profile has access to
CREATE TABLE public.facebook_business_managers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.facebook_profiles(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL,
  name TEXT NOT NULL,
  primary_page_id TEXT,
  timezone TEXT,
  verification_status TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(profile_id, business_id)
);

-- Enable RLS
ALTER TABLE public.facebook_business_managers ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view BMs from their profiles"
ON public.facebook_business_managers
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM facebook_profiles
  WHERE facebook_profiles.id = facebook_business_managers.profile_id
  AND facebook_profiles.user_id = auth.uid()
));

CREATE POLICY "Users can insert BMs from their profiles"
ON public.facebook_business_managers
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM facebook_profiles
  WHERE facebook_profiles.id = facebook_business_managers.profile_id
  AND facebook_profiles.user_id = auth.uid()
));

CREATE POLICY "Users can update BMs from their profiles"
ON public.facebook_business_managers
FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM facebook_profiles
  WHERE facebook_profiles.id = facebook_business_managers.profile_id
  AND facebook_profiles.user_id = auth.uid()
));

CREATE POLICY "Users can delete BMs from their profiles"
ON public.facebook_business_managers
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM facebook_profiles
  WHERE facebook_profiles.id = facebook_business_managers.profile_id
  AND facebook_profiles.user_id = auth.uid()
));

-- Add trigger for updated_at
CREATE TRIGGER update_facebook_business_managers_updated_at
BEFORE UPDATE ON public.facebook_business_managers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();