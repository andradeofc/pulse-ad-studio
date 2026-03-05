/**
 * Facebook Ad Locale IDs - Official mapping from Facebook Marketing API
 * Source: GET /search?type=adlocale (queried 2026-03-05)
 * These IDs are stable and rarely change.
 * 
 * Used in:
 * - targeting.locales (audience targeting)
 * - asset_customization_rules.customization_spec.locales (DLO)
 */

export interface FacebookLocale {
  id: number;
  name: string;
}

// Sorted by priority: common languages first, then alphabetical
export const FACEBOOK_LOCALES: FacebookLocale[] = [
  // === Most common (priority) ===
  { id: 16, name: 'Português (Brasil)' },
  { id: 31, name: 'Português (Portugal)' },
  { id: 1005, name: 'Português (Todos)' },
  { id: 6, name: 'Inglês (EUA)' },
  { id: 24, name: 'Inglês (Reino Unido)' },
  { id: 1001, name: 'Inglês (Todos)' },
  { id: 23, name: 'Espanhol' },
  { id: 7, name: 'Espanhol (Espanha)' },
  { id: 1002, name: 'Espanhol (Todos)' },
  { id: 9, name: 'Francês (França)' },
  { id: 44, name: 'Francês (Canadá)' },
  { id: 1003, name: 'Francês (Todos)' },
  { id: 5, name: 'Alemão' },
  { id: 10, name: 'Italiano' },
  // === Rest alphabetical ===
  { id: 36, name: 'Africâner' },
  { id: 87, name: 'Albanês' },
  { id: 28, name: 'Árabe' },
  { id: 68, name: 'Armênio' },
  { id: 53, name: 'Azerbaijano' },
  { id: 59, name: 'Basco' },
  { id: 45, name: 'Bengali' },
  { id: 54, name: 'Bielo-russo' },
  { id: 55, name: 'Bósnio' },
  { id: 37, name: 'Búlgaro' },
  { id: 1, name: 'Catalão' },
  { id: 73, name: 'Cazaque' },
  { id: 56, name: 'Cebuano' },
  { id: 20, name: 'Chinês simplificado (China)' },
  { id: 21, name: 'Chinês tradicional (Hong Kong)' },
  { id: 22, name: 'Chinês tradicional (Taiwan)' },
  { id: 1004, name: 'Chinês (Todos)' },
  { id: 86, name: 'Cingalês' },
  { id: 12, name: 'Coreano' },
  { id: 38, name: 'Croata' },
  { id: 76, name: 'Curdo setentrional (Kurmanji)' },
  { id: 4, name: 'Dinamarquês' },
  { id: 57, name: 'Esperanto' },
  { id: 33, name: 'Eslovaco' },
  { id: 34, name: 'Esloveno' },
  { id: 58, name: 'Estoniano' },
  { id: 62, name: 'Faroês' },
  { id: 26, name: 'Filipino' },
  { id: 8, name: 'Finlandês' },
  { id: 83, name: 'Flamengo' },
  { id: 63, name: 'Frísio' },
  { id: 65, name: 'Galego' },
  { id: 3, name: 'Galês' },
  { id: 72, name: 'Georgiano' },
  { id: 39, name: 'Grego' },
  { id: 66, name: 'Guarani' },
  { id: 67, name: 'Guzerate' },
  { id: 29, name: 'Hebraico' },
  { id: 46, name: 'Híndi' },
  { id: 14, name: 'Holandês' },
  { id: 30, name: 'Húngaro' },
  { id: 25, name: 'Indonésio' },
  { id: 64, name: 'Irlandês' },
  { id: 69, name: 'Islandês' },
  { id: 11, name: 'Japonês' },
  { id: 70, name: 'Japonês (Kansai)' },
  { id: 71, name: 'Javanês' },
  { id: 75, name: 'Kannada' },
  { id: 74, name: 'Khmer' },
  { id: 78, name: 'Letão' },
  { id: 40, name: 'Lituano' },
  { id: 79, name: 'Macedônio' },
  { id: 41, name: 'Malaio' },
  { id: 50, name: 'Malaiala' },
  { id: 81, name: 'Marati' },
  { id: 80, name: 'Mongol' },
  { id: 82, name: 'Nepalês' },
  { id: 13, name: 'Norueguês (Dano-norueguês)' },
  { id: 84, name: 'Norueguês (Nynorsk)' },
  { id: 85, name: 'Pachto' },
  { id: 60, name: 'Persa' },
  { id: 15, name: 'Polonês' },
  { id: 47, name: 'Punjabi' },
  { id: 32, name: 'Romeno' },
  { id: 17, name: 'Russo' },
  { id: 42, name: 'Sérvio' },
  { id: 88, name: 'Suaíle' },
  { id: 18, name: 'Sueco' },
  { id: 89, name: 'Tadjique' },
  { id: 35, name: 'Tailandês' },
  { id: 48, name: 'Tâmil' },
  { id: 2, name: 'Tcheco' },
  { id: 49, name: 'Télugo' },
  { id: 19, name: 'Turco' },
  { id: 52, name: 'Ucraniano' },
  { id: 90, name: 'Urdu' },
  { id: 91, name: 'Uzbeque' },
  { id: 27, name: 'Vietnamita' },
];

/**
 * Get locale name by Facebook adlocale ID
 */
export function getLocaleNameById(id: number): string {
  const found = FACEBOOK_LOCALES.find(l => l.id === id);
  return found?.name || `Locale ${id}`;
}
