import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface FacebookLocale {
  id: number;
  name: string;
}

// Fallback locales (from Facebook API docs) - used only if API call fails
const FALLBACK_LOCALES: FacebookLocale[] = [
  { id: 6, name: 'English (US)' },
  { id: 24, name: 'English (UK)' },
  { id: 5, name: 'German' },
  { id: 9, name: 'French (France)' },
  { id: 10, name: 'Spanish (Spain)' },
];

let cachedLocales: FacebookLocale[] | null = null;
let fetchPromise: Promise<FacebookLocale[]> | null = null;

async function fetchLocalesFromApi(): Promise<FacebookLocale[]> {
  try {
    const { data, error } = await supabase.functions.invoke('facebook-search-locales');
    if (error) throw error;
    if (data?.locales && Array.isArray(data.locales) && data.locales.length > 0) {
      // Sort: prioritize common languages
      const priorityIds = new Set([6, 24, 5, 9, 10]); // EN_US, EN_UK, DE, FR, ES
      const sorted = data.locales.sort((a: FacebookLocale, b: FacebookLocale) => {
        const aP = priorityIds.has(a.id) ? 0 : 1;
        const bP = priorityIds.has(b.id) ? 0 : 1;
        if (aP !== bP) return aP - bP;
        return a.name.localeCompare(b.name);
      });
      cachedLocales = sorted;
      return sorted;
    }
    throw new Error('Empty response');
  } catch (err) {
    console.warn('[useAdLocales] Failed to fetch from API, using fallback:', err);
    return FALLBACK_LOCALES;
  }
}

export function useAdLocales() {
  const [locales, setLocales] = useState<FacebookLocale[]>(cachedLocales || FALLBACK_LOCALES);
  const [loading, setLoading] = useState(!cachedLocales);

  useEffect(() => {
    if (cachedLocales) {
      setLocales(cachedLocales);
      setLoading(false);
      return;
    }

    if (!fetchPromise) {
      fetchPromise = fetchLocalesFromApi();
    }

    fetchPromise.then(result => {
      setLocales(result);
      setLoading(false);
    });
  }, []);

  return { locales, loading };
}

// Helper to get locale name by ID from cached data
export function getLocaleNameById(id: number): string {
  if (cachedLocales) {
    const found = cachedLocales.find(l => l.id === id);
    if (found) return found.name;
  }
  return `Locale ${id}`;
}
