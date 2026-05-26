import { supabase } from '@/integrations/supabase/client';

export interface ValidateCredentialsResult {
  valid: boolean;
  userId?: string;
  userName?: string;
  email?: string | null;
  avatarUrl?: string | null;
  scopes?: string[];
  expiresAt?: string | null;
  isShortLived?: boolean;
  appName?: string | null;
  appId?: string | null;
  appIdMatches?: boolean | null;
  error?: string;
  errorCode?: number | null;
}

export async function validateFacebookCredentials(input: {
  accessToken: string;
  appId?: string;
  appSecret?: string;
}): Promise<ValidateCredentialsResult> {
  const { data, error } = await supabase.functions.invoke('facebook-validate-credentials', {
    body: input,
  });
  if (error) throw error;
  return data as ValidateCredentialsResult;
}

export interface ExchangeTokenResult {
  success: boolean;
  accessToken?: string;
  expiresAt?: string;
  expiresIn?: number;
  isLongLived?: boolean;
  error?: string;
}

export async function exchangeFacebookToken(input: {
  appId: string;
  appSecret: string;
  shortToken: string;
  profileId?: string;
}): Promise<ExchangeTokenResult> {
  const { data, error } = await supabase.functions.invoke('facebook-exchange-token', {
    body: input,
  });
  if (error) throw error;
  return data as ExchangeTokenResult;
}

export interface ProfileTask {
  id: string;
  user_id: string;
  profile_id: string | null;
  task_type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  current_step: number;
  total_steps: number;
  current_step_key: string | null;
  progress: Array<{ step: number; key: string; message: string; at: string; meta?: any }>;
  result: any;
  error: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export async function createProfileTask(userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('facebook_profile_tasks' as any)
    .insert({
      user_id: userId,
      task_type: 'add_profile',
      status: 'pending',
      current_step: 0,
      total_steps: 8,
    })
    .select('id')
    .single();
  if (error) throw error;
  return (data as any).id as string;
}

export async function addFacebookProfileWithTask(input: {
  accessToken: string;
  taskId?: string;
  appId?: string | null;
  appSecret?: string | null;
  isLongLived?: boolean;
  proxyConfig?: {
    protocol: string;
    host: string;
    port: number;
    username?: string;
    password?: string;
  } | null;
}) {
  const { data, error } = await supabase.functions.invoke('facebook-add-profile', {
    body: input,
  });
  if (error) throw error;
  return data;
}
