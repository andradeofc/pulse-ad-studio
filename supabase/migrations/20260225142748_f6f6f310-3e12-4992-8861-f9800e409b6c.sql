-- Add nickname column to facebook_ad_accounts
ALTER TABLE public.facebook_ad_accounts ADD COLUMN nickname text DEFAULT NULL;