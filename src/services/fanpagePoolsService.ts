import { supabase } from '@/integrations/supabase/client';

export interface FanpagePool {
  id: string;
  user_id: string;
  name: string;
  color: string;
  creator_profile_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface FanpagePoolPage {
  id: string;
  pool_id: string;
  page_id: string;
  profile_id: string;
  created_at: string;
}

export interface PoolWithPages extends FanpagePool {
  pages: FanpagePoolPage[];
}

export async function fetchPools(): Promise<PoolWithPages[]> {
  const { data: pools, error } = await supabase
    .from('fanpage_pools')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const ids = (pools ?? []).map((p) => p.id);
  if (ids.length === 0) return [];

  const { data: links, error: e2 } = await supabase
    .from('fanpage_pool_pages')
    .select('*')
    .in('pool_id', ids);
  if (e2) throw e2;

  return (pools ?? []).map((p) => ({
    ...(p as FanpagePool),
    pages: ((links ?? []) as FanpagePoolPage[]).filter((l) => l.pool_id === p.id),
  }));
}

export async function createPool(name: string, color: string, creatorProfileId?: string | null): Promise<FanpagePool> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Não autenticado');

  const { data, error } = await supabase
    .from('fanpage_pools')
    .insert({ user_id: user.id, name, color, creator_profile_id: creatorProfileId ?? null })
    .select()
    .single();
  if (error) throw error;
  return data as FanpagePool;
}

export async function updatePool(
  id: string,
  patch: { name?: string; color?: string; creator_profile_id?: string | null },
): Promise<void> {
  const { error } = await supabase.from('fanpage_pools').update(patch).eq('id', id);
  if (error) throw error;
}

// Backwards-compatible alias
export async function renamePool(id: string, name: string, color?: string): Promise<void> {
  await updatePool(id, { name, ...(color ? { color } : {}) });
}

export async function deletePool(id: string): Promise<void> {
  const { error } = await supabase.from('fanpage_pools').delete().eq('id', id);
  if (error) throw error;
}

export async function addPagesToPool(
  poolId: string,
  pages: { page_id: string; profile_id: string }[],
): Promise<void> {
  if (pages.length === 0) return;
  const rows = pages.map((p) => ({ pool_id: poolId, page_id: p.page_id, profile_id: p.profile_id }));
  const { error } = await supabase
    .from('fanpage_pool_pages')
    .upsert(rows, { onConflict: 'pool_id,page_id' });
  if (error) throw error;
}

export async function removePageFromPool(poolId: string, pageId: string): Promise<void> {
  const { error } = await supabase
    .from('fanpage_pool_pages')
    .delete()
    .eq('pool_id', poolId)
    .eq('page_id', pageId);
  if (error) throw error;
}
