import { supabase } from '@/integrations/supabase/client';

export interface FacebookProfile {
  id: string;
  user_id: string;
  facebook_id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  status: 'active' | 'expired' | 'inactive';
  permissions: string[];
  token_expires_at: string | null;
  page_token_valid: boolean;
  proxy_host: string | null;
  proxy_port: number | null;
  proxy_username: string | null;
  proxy_password: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FacebookAdAccount {
  id: string;
  profile_id: string;
  account_id: string;
  name: string;
  nickname: string | null;
  currency: string | null;
  timezone: string | null;
  status: string;
  business_id: string | null;
  business_name: string | null;
  amount_spent: number | null;
  spend_updated_at: string | null;
  created_at: string;
}

// Fetch all Facebook profiles for the current user
export async function fetchFacebookProfiles(): Promise<FacebookProfile[]> {
  const { data, error } = await supabase
    .from('facebook_profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching profiles:', error);
    throw error;
  }

  return (data || []) as FacebookProfile[];
}

// Fetch ad accounts for a specific profile
export async function fetchAdAccounts(profileId: string): Promise<FacebookAdAccount[]> {
  const { data, error } = await supabase
    .from('facebook_ad_accounts')
    .select('*')
    .eq('profile_id', profileId)
    .order('name');

  if (error) {
    console.error('Error fetching ad accounts:', error);
    throw error;
  }

  return (data || []) as FacebookAdAccount[];
}

// Validate a Facebook token (public endpoint)
export async function validateFacebookToken(accessToken: string) {
  const { data, error } = await supabase.functions.invoke('facebook-validate-token', {
    body: { accessToken },
  });

  if (error) {
    console.error('Error validating token:', error);
    throw error;
  }

  return data;
}

// Add a new Facebook profile with token
export async function addFacebookProfile(accessToken: string) {
  const { data, error } = await supabase.functions.invoke('facebook-add-profile', {
    body: { accessToken },
  });

  if (error) {
    console.error('Error adding profile:', error);
    throw error;
  }

  return data;
}

// Sync ad accounts for a profile
export async function syncFacebookAdAccounts(profileId: string) {
  const { data, error } = await supabase.functions.invoke('facebook-sync-accounts', {
    body: { profileId },
  });

  if (error) {
    console.error('Error syncing accounts:', error);
    throw error;
  }

  return data;
}

// Delete a Facebook profile
export async function deleteFacebookProfile(profileId: string) {
  const { data, error } = await supabase.functions.invoke('facebook-delete-profile', {
    body: { profileId },
  });

  if (error) {
    console.error('Error deleting profile:', error);
    throw error;
  }

  return data;
}

// Update proxy configuration
export async function updateFacebookProfileProxy(
  profileId: string,
  proxy: {
    proxyHost?: string;
    proxyPort?: number;
    proxyUsername?: string;
    proxyPassword?: string;
  }
) {
  const { data, error } = await supabase.functions.invoke('facebook-update-proxy', {
    body: { profileId, ...proxy },
  });

  if (error) {
    console.error('Error updating proxy:', error);
    throw error;
  }

  return data;
}

// Update token and sync all data (accounts, pixels, pages)
export async function updateFacebookToken(profileId: string, accessToken: string) {
  const { data, error } = await supabase.functions.invoke('facebook-update-token', {
    body: { profileId, accessToken },
  });

  if (error) {
    console.error('Error updating token:', error);
    throw error;
  }

  return data;
}

// Sync Business Managers for a profile (or all profiles if no profileId)
export async function syncBusinessManagers(profileId?: string) {
  const { data, error } = await supabase.functions.invoke('facebook-sync-business-managers', {
    body: profileId ? { profile_id: profileId } : {},
  });

  if (error) {
    console.error('Error syncing business managers:', error);
    throw error;
  }

  return data;
}
