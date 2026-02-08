import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

type NamingContext = 'campaign' | 'adset' | 'ad';

export interface Preset {
  id: string;
  name: string;
  template: string;
  context: NamingContext;
  isDefault?: boolean;
  isFavorite?: boolean;
}

export interface CustomVariable {
  id?: string;
  key: string;
  label: string;
  value: string;
}

const defaultPresets: Preset[] = [
  {
    id: 'default-ntp',
    name: 'NTP',
    template: '[CP{{sequencial:01}}] [{{conta_apelido}} + {{conjunto_catalogo}}] [{{nicho}}] [{{pagina_nome}}] [TDC {{budget}}] [{{dia}}/{{mes}}] - {{conjunto_catalogo}}',
    context: 'campaign',
    isDefault: true,
    isFavorite: false,
  },
  {
    id: 'default-elton',
    name: 'PRESET ELTON',
    template: '[CP{{sequencial:08}}][{{budget}}][{{estrutura}}][{{conta_apelido}}][{{ano2}}_{{mes}}_{{dia}}][{{hora}}_{{minuto}}]',
    context: 'campaign',
    isDefault: true,
    isFavorite: false,
  },
  {
    id: 'default-simples',
    name: 'Simples',
    template: '{{conta_apelido}}_{{criativo}}_{{sequencial:01}}',
    context: 'campaign',
    isDefault: true,
    isFavorite: false,
  },
];

export function useNamingPresets() {
  const { toast } = useToast();
  const [presets, setPresets] = useState<Preset[]>(defaultPresets);
  const [customVariables, setCustomVariables] = useState<CustomVariable[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load presets and variables from database
  const loadFromDatabase = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setPresets(defaultPresets);
        setCustomVariables([]);
        setIsLoading(false);
        return;
      }

      // Fetch user presets - order by favorite first, then by created_at
      const { data: userPresets, error: presetsError } = await supabase
        .from('naming_presets')
        .select('*')
        .order('is_favorite', { ascending: false })
        .order('created_at', { ascending: true });

      if (presetsError) {
        console.error('Error loading presets:', presetsError);
      } else {
        const mappedPresets: Preset[] = (userPresets || []).map(p => ({
          id: p.id,
          name: p.name,
          template: p.template,
          context: p.context as NamingContext,
          isDefault: false,
          isFavorite: p.is_favorite || false,
        }));
        // Sort: user favorites first, then user presets, then defaults
        const userFavorites = mappedPresets.filter(p => p.isFavorite);
        const userNonFavorites = mappedPresets.filter(p => !p.isFavorite);
        setPresets([...userFavorites, ...userNonFavorites, ...defaultPresets]);
      }

      // Fetch user custom variables
      const { data: userVars, error: varsError } = await supabase
        .from('naming_variables')
        .select('*')
        .order('created_at', { ascending: true });

      if (varsError) {
        console.error('Error loading variables:', varsError);
      } else {
        const mappedVars: CustomVariable[] = (userVars || []).map(v => ({
          id: v.id,
          key: v.key,
          label: v.label,
          value: v.value,
        }));
        setCustomVariables(mappedVars);
      }
    } catch (error) {
      console.error('Error loading naming data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFromDatabase();
  }, [loadFromDatabase]);

  // Save new preset
  const savePreset = useCallback(async (name: string, template: string, context: NamingContext): Promise<Preset | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: 'Erro', description: 'Você precisa estar logado para salvar presets.', variant: 'destructive' });
        return null;
      }

      const { data, error } = await supabase
        .from('naming_presets')
        .insert({
          user_id: user.id,
          name,
          template,
          context,
        })
        .select()
        .single();

      if (error) {
        console.error('Error saving preset:', error);
        toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
        return null;
      }

      const newPreset: Preset = {
        id: data.id,
        name: data.name,
        template: data.template,
        context: data.context as NamingContext,
        isDefault: false,
      };

      setPresets(prev => [...prev, newPreset]);
      toast({ title: 'Preset salvo!', description: `"${name}" foi salvo com sucesso.` });
      return newPreset;
    } catch (error) {
      console.error('Error saving preset:', error);
      return null;
    }
  }, [toast]);

  // Update existing preset template
  const updatePreset = useCallback(async (presetId: string, template: string): Promise<boolean> => {
    const preset = presets.find(p => p.id === presetId);
    if (!preset || preset.isDefault) {
      toast({ title: 'Não permitido', description: 'Presets padrão não podem ser alterados.', variant: 'destructive' });
      return false;
    }

    try {
      const { error } = await supabase
        .from('naming_presets')
        .update({ template, updated_at: new Date().toISOString() })
        .eq('id', presetId);

      if (error) {
        console.error('Error updating preset:', error);
        toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
        return false;
      }

      setPresets(prev => prev.map(p => p.id === presetId ? { ...p, template } : p));
      toast({ title: 'Atualizado!', description: `"${preset.name}" foi atualizado com sucesso.` });
      return true;
    } catch (error) {
      console.error('Error updating preset:', error);
      return false;
    }
  }, [presets, toast]);

  // Rename preset
  const renamePreset = useCallback(async (presetId: string, newName: string): Promise<boolean> => {
    const preset = presets.find(p => p.id === presetId);
    if (!preset || preset.isDefault) return false;

    try {
      const { error } = await supabase
        .from('naming_presets')
        .update({ name: newName })
        .eq('id', presetId);

      if (error) {
        console.error('Error renaming preset:', error);
        toast({ title: 'Erro ao renomear', description: error.message, variant: 'destructive' });
        return false;
      }

      setPresets(prev => prev.map(p => p.id === presetId ? { ...p, name: newName } : p));
      toast({ title: 'Renomeado!', description: 'O preset foi renomeado com sucesso.' });
      return true;
    } catch (error) {
      console.error('Error renaming preset:', error);
      return false;
    }
  }, [presets, toast]);

  // Delete preset
  const deletePreset = useCallback(async (presetId: string): Promise<boolean> => {
    const preset = presets.find(p => p.id === presetId);
    if (!preset || preset.isDefault) {
      toast({ title: 'Não permitido', description: 'Presets padrão não podem ser excluídos.', variant: 'destructive' });
      return false;
    }

    try {
      const { error } = await supabase
        .from('naming_presets')
        .delete()
        .eq('id', presetId);

      if (error) {
        console.error('Error deleting preset:', error);
        toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
        return false;
      }

      setPresets(prev => prev.filter(p => p.id !== presetId));
      toast({ title: 'Excluído!', description: 'O preset foi excluído com sucesso.' });
      return true;
    } catch (error) {
      console.error('Error deleting preset:', error);
      return false;
    }
  }, [presets, toast]);

  // Toggle favorite status
  const toggleFavorite = useCallback(async (presetId: string): Promise<boolean> => {
    const preset = presets.find(p => p.id === presetId);
    if (!preset || preset.isDefault) {
      toast({ title: 'Não permitido', description: 'Presets padrão do sistema não podem ser favoritados.', variant: 'destructive' });
      return false;
    }

    const newFavoriteStatus = !preset.isFavorite;

    try {
      const { error } = await supabase
        .from('naming_presets')
        .update({ is_favorite: newFavoriteStatus })
        .eq('id', presetId);

      if (error) {
        console.error('Error toggling favorite:', error);
        toast({ title: 'Erro', description: error.message, variant: 'destructive' });
        return false;
      }

      // Update local state and reorder
      setPresets(prev => {
        const updated = prev.map(p => 
          p.id === presetId ? { ...p, isFavorite: newFavoriteStatus } : p
        );
        // Reorder: favorites first, then non-favorites, defaults last
        const userFavorites = updated.filter(p => !p.isDefault && p.isFavorite);
        const userNonFavorites = updated.filter(p => !p.isDefault && !p.isFavorite);
        const defaults = updated.filter(p => p.isDefault);
        return [...userFavorites, ...userNonFavorites, ...defaults];
      });

      toast({ 
        title: newFavoriteStatus ? 'Favoritado!' : 'Removido dos favoritos',
        description: newFavoriteStatus 
          ? `"${preset.name}" agora aparecerá primeiro na lista.`
          : `"${preset.name}" foi removido dos favoritos.`
      });
      return true;
    } catch (error) {
      console.error('Error toggling favorite:', error);
      return false;
    }
  }, [presets, toast]);

  // Save or update custom variable
  const saveVariable = useCallback(async (key: string, label: string, value: string): Promise<CustomVariable | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: 'Erro', description: 'Você precisa estar logado para salvar variáveis.', variant: 'destructive' });
        return null;
      }

      const existingVar = customVariables.find(v => v.key === key);

      if (existingVar && existingVar.id) {
        // Update existing
        const { error } = await supabase
          .from('naming_variables')
          .update({ label, value })
          .eq('id', existingVar.id);

        if (error) {
          console.error('Error updating variable:', error);
          return null;
        }

        const updatedVar = { ...existingVar, label, value };
        setCustomVariables(prev => prev.map(v => v.key === key ? updatedVar : v));
        return updatedVar;
      } else {
        // Insert new
        const { data, error } = await supabase
          .from('naming_variables')
          .insert({
            user_id: user.id,
            key,
            label,
            value,
          })
          .select()
          .single();

        if (error) {
          console.error('Error saving variable:', error);
          return null;
        }

        const newVar: CustomVariable = {
          id: data.id,
          key: data.key,
          label: data.label,
          value: data.value,
        };

        setCustomVariables(prev => [...prev, newVar]);
        return newVar;
      }
    } catch (error) {
      console.error('Error saving variable:', error);
      return null;
    }
  }, [customVariables, toast]);

  // Delete custom variable
  const deleteVariable = useCallback(async (key: string): Promise<boolean> => {
    const variable = customVariables.find(v => v.key === key);
    if (!variable || !variable.id) {
      setCustomVariables(prev => prev.filter(v => v.key !== key));
      return true;
    }

    try {
      const { error } = await supabase
        .from('naming_variables')
        .delete()
        .eq('id', variable.id);

      if (error) {
        console.error('Error deleting variable:', error);
        return false;
      }

      setCustomVariables(prev => prev.filter(v => v.key !== key));
      return true;
    } catch (error) {
      console.error('Error deleting variable:', error);
      return false;
    }
  }, [customVariables]);

  // Update variable value locally (for immediate feedback) and in DB
  const updateVariableValue = useCallback(async (key: string, newValue: string) => {
    const variable = customVariables.find(v => v.key === key);
    if (!variable) return;

    // Update locally first for immediate feedback
    setCustomVariables(prev => prev.map(v => v.key === key ? { ...v, value: newValue } : v));

    // Then persist to database
    if (variable.id) {
      await supabase
        .from('naming_variables')
        .update({ value: newValue })
        .eq('id', variable.id);
    }
  }, [customVariables]);

  return {
    presets,
    customVariables,
    isLoading,
    savePreset,
    updatePreset,
    renamePreset,
    deletePreset,
    toggleFavorite,
    saveVariable,
    deleteVariable,
    updateVariableValue,
    reload: loadFromDatabase,
  };
}
