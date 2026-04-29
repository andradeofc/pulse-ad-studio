import { supabase } from '@/integrations/supabase/client';

export interface MetadataResult {
  total: number;
  succeeded: number;
  failed: number;
  results: Array<{ id: string; ok: boolean; error?: string }>;
}

export async function changeImageMetadata(params: {
  creativeIds?: string[];
  folderId?: string | null;
}): Promise<MetadataResult> {
  const { data, error } = await supabase.functions.invoke('process-image-metadata', {
    body: params,
  });
  if (error) throw error;
  return data as MetadataResult;
}
