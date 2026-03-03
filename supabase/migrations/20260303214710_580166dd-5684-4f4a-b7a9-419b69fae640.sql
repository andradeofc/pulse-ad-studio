
ALTER TABLE public.facebook_profiles DROP CONSTRAINT facebook_profiles_status_check;
ALTER TABLE public.facebook_profiles ADD CONSTRAINT facebook_profiles_status_check 
  CHECK (status = ANY (ARRAY['active'::text, 'expired'::text, 'inactive'::text, 'disconnected'::text]));
