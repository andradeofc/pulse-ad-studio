-- Add spend columns to facebook_ad_accounts table
ALTER TABLE public.facebook_ad_accounts 
ADD COLUMN IF NOT EXISTS amount_spent numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS spend_updated_at timestamp with time zone;