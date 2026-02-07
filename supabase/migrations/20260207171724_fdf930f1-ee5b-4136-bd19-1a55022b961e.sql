-- Add Business Manager columns to facebook_ad_accounts
ALTER TABLE public.facebook_ad_accounts 
ADD COLUMN business_id text,
ADD COLUMN business_name text;