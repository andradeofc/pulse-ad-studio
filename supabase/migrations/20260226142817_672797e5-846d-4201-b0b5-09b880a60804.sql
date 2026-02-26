-- Add proxy_protocol column to facebook_profiles
ALTER TABLE public.facebook_profiles
ADD COLUMN proxy_protocol text DEFAULT 'http';

COMMENT ON COLUMN public.facebook_profiles.proxy_protocol IS 'Proxy protocol: http, https, or socks5';