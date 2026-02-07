-- Create the update_updated_at_column function first
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create facebook_profiles table
CREATE TABLE public.facebook_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  facebook_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  avatar_url TEXT,
  access_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'inactive')),
  permissions TEXT[] DEFAULT '{}',
  token_expires_at TIMESTAMP WITH TIME ZONE,
  page_token_valid BOOLEAN DEFAULT false,
  proxy_host TEXT,
  proxy_port INTEGER,
  proxy_username TEXT,
  proxy_password TEXT,
  last_synced_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, facebook_id)
);

-- Create facebook_ad_accounts table (synced from Facebook)
CREATE TABLE public.facebook_ad_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.facebook_profiles(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  currency TEXT,
  timezone TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(profile_id, account_id)
);

-- Enable RLS
ALTER TABLE public.facebook_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facebook_ad_accounts ENABLE ROW LEVEL SECURITY;

-- Helper function: check if user owns profile
CREATE OR REPLACE FUNCTION public.user_owns_facebook_profile(profile_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.facebook_profiles
    WHERE id = profile_id AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- RLS Policies for facebook_profiles
CREATE POLICY "Users can view their own Facebook profiles"
  ON public.facebook_profiles FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create their own Facebook profiles"
  ON public.facebook_profiles FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own Facebook profiles"
  ON public.facebook_profiles FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own Facebook profiles"
  ON public.facebook_profiles FOR DELETE
  USING (user_id = auth.uid());

-- RLS Policies for facebook_ad_accounts (via profile ownership)
CREATE POLICY "Users can view ad accounts from their profiles"
  ON public.facebook_ad_accounts FOR SELECT
  USING (public.user_owns_facebook_profile(profile_id));

CREATE POLICY "Users can insert ad accounts from their profiles"
  ON public.facebook_ad_accounts FOR INSERT
  WITH CHECK (public.user_owns_facebook_profile(profile_id));

CREATE POLICY "Users can update ad accounts from their profiles"
  ON public.facebook_ad_accounts FOR UPDATE
  USING (public.user_owns_facebook_profile(profile_id));

CREATE POLICY "Users can delete ad accounts from their profiles"
  ON public.facebook_ad_accounts FOR DELETE
  USING (public.user_owns_facebook_profile(profile_id));

-- Trigger for updated_at
CREATE TRIGGER update_facebook_profiles_updated_at
  BEFORE UPDATE ON public.facebook_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();