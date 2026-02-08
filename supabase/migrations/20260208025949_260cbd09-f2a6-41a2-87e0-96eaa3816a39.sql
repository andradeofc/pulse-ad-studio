-- Remove public API access to facebook_credentials table
-- This ensures the table is ONLY accessible via service_role (Edge Functions)
-- Regular authenticated users and anon will get "permission denied"

REVOKE ALL ON public.facebook_credentials FROM anon;
REVOKE ALL ON public.facebook_credentials FROM authenticated;

-- Grant access ONLY to service_role (used by Edge Functions)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.facebook_credentials TO service_role;

-- Add RLS but with no policies - this blocks all client access
ALTER TABLE public.facebook_credentials ENABLE ROW LEVEL SECURITY;

-- The service_role bypasses RLS, so Edge Functions can still access the table
-- But any client-side access (anon, authenticated) will be blocked