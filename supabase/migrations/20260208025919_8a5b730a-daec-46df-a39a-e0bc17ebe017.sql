-- Create secure credentials table (NO RLS - only accessible via service role)
CREATE TABLE public.facebook_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- NO RLS enabled - this table is ONLY accessible via service_role key in Edge Functions
-- Regular clients with anon key will get "permission denied"

-- Add index for fast lookup by profile_id
CREATE INDEX idx_facebook_credentials_profile_id ON public.facebook_credentials(profile_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_facebook_credentials_updated_at
BEFORE UPDATE ON public.facebook_credentials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Migrate existing tokens from facebook_profiles to facebook_credentials
INSERT INTO public.facebook_credentials (profile_id, access_token, created_at, updated_at)
SELECT id, access_token, now(), now()
FROM public.facebook_profiles
WHERE access_token IS NOT NULL AND access_token != ''
ON CONFLICT (profile_id) DO NOTHING;

-- Add comment explaining the security model
COMMENT ON TABLE public.facebook_credentials IS 'Secure storage for Facebook access tokens. NO RLS - only accessible via service_role in Edge Functions. Regular client access is denied by default.';