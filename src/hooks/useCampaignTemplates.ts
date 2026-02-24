import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { CampaignConfig } from '@/stores/campaignStore';

export interface CampaignTemplate {
  id: string;
  name: string;
  description: string | null;
  config: Partial<CampaignConfig>;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
}

export function useCampaignTemplates() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<CampaignTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadTemplates = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setTemplates([]);
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('campaign_templates')
        .select('*')
        .order('is_favorite', { ascending: false })
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Error loading templates:', error);
        toast({ title: 'Erro', description: 'Falha ao carregar templates.', variant: 'destructive' });
      } else {
        // Parse config from JSON
        const parsed = (data || []).map(t => ({
          ...t,
          config: typeof t.config === 'string' ? JSON.parse(t.config) : t.config,
        }));
        setTemplates(parsed);
      }
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const saveTemplate = useCallback(async (
    name: string,
    config: Partial<CampaignConfig>,
    description?: string
  ): Promise<CampaignTemplate | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: 'Erro', description: 'Você precisa estar logado.', variant: 'destructive' });
        return null;
      }

      // Resolve effective user ID for collaborators
      const { data: teamMember } = await supabase
        .from('team_members' as any)
        .select('owner_id')
        .eq('member_id', user.id)
        .eq('status', 'active')
        .maybeSingle();
      
      const effectiveId = teamMember ? (teamMember as any).owner_id : user.id;

      // Clean config before saving - remove non-serializable data
      const cleanConfig = cleanConfigForSave(config) as unknown as Record<string, never>;

      const { data, error } = await supabase
        .from('campaign_templates')
        .insert([{
          user_id: effectiveId,
          name,
          description: description || null,
          config: cleanConfig,
        }])
        .select()
        .single();

      if (error) {
        console.error('Error saving template:', error);
        toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
        return null;
      }

      const newTemplate = {
        ...data,
        config: typeof data.config === 'string' ? JSON.parse(data.config) : data.config,
      };

      setTemplates(prev => [newTemplate, ...prev]);
      toast({ title: 'Template salvo!', description: `"${name}" foi salvo com sucesso.` });
      return newTemplate;
    } catch (error) {
      console.error('Error saving template:', error);
      return null;
    }
  }, [toast]);

  const updateTemplate = useCallback(async (
    templateId: string,
    updates: { name?: string; description?: string; config?: Partial<CampaignConfig> }
  ): Promise<boolean> => {
    try {
      const updateData: Record<string, unknown> = {};
      
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.config !== undefined) updateData.config = cleanConfigForSave(updates.config);

      const { error } = await supabase
        .from('campaign_templates')
        .update(updateData)
        .eq('id', templateId);

      if (error) {
        console.error('Error updating template:', error);
        toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
        return false;
      }

      setTemplates(prev => prev.map(t => 
        t.id === templateId ? { ...t, ...updates } : t
      ));
      toast({ title: 'Atualizado!', description: 'Template atualizado com sucesso.' });
      return true;
    } catch (error) {
      console.error('Error updating template:', error);
      return false;
    }
  }, [toast]);

  const deleteTemplate = useCallback(async (templateId: string): Promise<boolean> => {
    try {
      const template = templates.find(t => t.id === templateId);
      
      const { error } = await supabase
        .from('campaign_templates')
        .delete()
        .eq('id', templateId);

      if (error) {
        console.error('Error deleting template:', error);
        toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
        return false;
      }

      setTemplates(prev => prev.filter(t => t.id !== templateId));
      toast({ title: 'Excluído!', description: `"${template?.name}" foi excluído.` });
      return true;
    } catch (error) {
      console.error('Error deleting template:', error);
      return false;
    }
  }, [templates, toast]);

  const toggleFavorite = useCallback(async (templateId: string): Promise<boolean> => {
    const template = templates.find(t => t.id === templateId);
    if (!template) return false;

    const newFavoriteStatus = !template.is_favorite;

    try {
      const { error } = await supabase
        .from('campaign_templates')
        .update({ is_favorite: newFavoriteStatus })
        .eq('id', templateId);

      if (error) {
        console.error('Error toggling favorite:', error);
        return false;
      }

      setTemplates(prev => {
        const updated = prev.map(t => 
          t.id === templateId ? { ...t, is_favorite: newFavoriteStatus } : t
        );
        // Reorder: favorites first
        return updated.sort((a, b) => {
          if (a.is_favorite === b.is_favorite) {
            return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
          }
          return a.is_favorite ? -1 : 1;
        });
      });

      toast({ 
        title: newFavoriteStatus ? 'Favoritado!' : 'Removido dos favoritos',
      });
      return true;
    } catch (error) {
      console.error('Error toggling favorite:', error);
      return false;
    }
  }, [templates, toast]);

  return {
    templates,
    isLoading,
    saveTemplate,
    updateTemplate,
    deleteTemplate,
    toggleFavorite,
    reload: loadTemplates,
  };
}

// Helper to clean config for serialization
function cleanConfigForSave(config: Partial<CampaignConfig>): Record<string, unknown> {
  const cleaned = { ...config };
  
  // Remove non-serializable or temporary fields
  delete (cleaned as Record<string, unknown>).selectedCreatives; // Creatives should be selected fresh
  
  // Convert dates to ISO strings
  if (cleaned.scheduleStart instanceof Date) {
    (cleaned as Record<string, unknown>).scheduleStart = cleaned.scheduleStart.toISOString();
  }
  if (cleaned.scheduleEnd instanceof Date) {
    (cleaned as Record<string, unknown>).scheduleEnd = cleaned.scheduleEnd.toISOString();
  }

  return cleaned as Record<string, unknown>;
}
