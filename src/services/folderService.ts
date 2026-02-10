import { supabase } from '@/integrations/supabase/client';

export interface CreativeFolder {
  id: string;
  user_id: string;
  name: string;
  parent_id: string | null;
  color: string;
  created_at: string;
  updated_at: string;
}

/**
 * Fetch all folders for the current user
 */
export async function fetchFolders(): Promise<CreativeFolder[]> {
  const { data, error } = await supabase
    .from('creative_folders')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw error;
  return data as CreativeFolder[];
}

/**
 * Create a new folder
 */
export async function createFolder(name: string, parentId?: string | null, color?: string): Promise<CreativeFolder> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuário não autenticado');

  const { data, error } = await supabase
    .from('creative_folders')
    .insert({
      user_id: user.id,
      name,
      parent_id: parentId || null,
      color: color || '#10b981',
    })
    .select()
    .single();

  if (error) throw error;
  return data as CreativeFolder;
}

/**
 * Rename a folder
 */
export async function renameFolder(id: string, name: string): Promise<CreativeFolder> {
  const { data, error } = await supabase
    .from('creative_folders')
    .update({ name })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as CreativeFolder;
}

/**
 * Delete a folder (creatives inside will have folder_id set to null)
 */
export async function deleteFolder(id: string): Promise<void> {
  const { error } = await supabase
    .from('creative_folders')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

/**
 * Move creatives to a folder (or to root if folderId is null)
 */
export async function moveCreativesToFolder(creativeIds: string[], folderId: string | null): Promise<void> {
  const { error } = await supabase
    .from('creatives')
    .update({ folder_id: folderId })
    .in('id', creativeIds);

  if (error) throw error;
}

/**
 * Update folder color
 */
export async function updateFolderColor(id: string, color: string): Promise<CreativeFolder> {
  const { data, error } = await supabase
    .from('creative_folders')
    .update({ color })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as CreativeFolder;
}
