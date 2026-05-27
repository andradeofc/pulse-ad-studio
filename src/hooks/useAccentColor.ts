import { useEffect, useState } from 'react';

export type AccentColorId = 'emerald' | 'purple' | 'blue' | 'green' | 'orange' | 'pink' | 'cyan';

export interface AccentPalette {
  h: number;
  s: number;
  l: number;
  name: string;
  color: string;
}

export const accentPalettes: Record<AccentColorId, AccentPalette> = {
  emerald: { h: 160, s: 84, l: 39, name: 'Esmeralda', color: 'hsl(160, 84%, 39%)' },
  purple:  { h: 262, s: 83, l: 58, name: 'Roxo',      color: 'hsl(262, 83%, 58%)' },
  blue:    { h: 217, s: 91, l: 60, name: 'Azul',      color: 'hsl(217, 91%, 60%)' },
  green:   { h: 142, s: 76, l: 36, name: 'Verde',     color: 'hsl(142, 76%, 36%)' },
  orange:  { h: 25,  s: 95, l: 53, name: 'Laranja',   color: 'hsl(25, 95%, 53%)' },
  pink:    { h: 330, s: 81, l: 60, name: 'Rosa',      color: 'hsl(330, 81%, 60%)' },
  cyan:    { h: 189, s: 94, l: 43, name: 'Ciano',     color: 'hsl(189, 94%, 43%)' },
};

const STORAGE_KEY = 'accent-color';

export function applyAccentColor(colorId: AccentColorId) {
  const palette = accentPalettes[colorId];
  if (!palette) return;

  const root = document.documentElement;
  const { h, s, l } = palette;
  const hsl = `${h} ${s}% ${l}%`;
  const hslLight = `${h} ${s}% ${Math.min(l + 11, 100)}%`;

  // Core tokens
  root.style.setProperty('--primary', hsl);
  root.style.setProperty('--ring', hsl);

  // Sidebar tokens
  root.style.setProperty('--sidebar-primary', hsl);
  root.style.setProperty('--sidebar-ring', hsl);

  // Gradients and shadows (must be full CSS value strings)
  root.style.setProperty('--gradient-primary', `linear-gradient(135deg, hsl(${hsl}), hsl(${hslLight}))`);
  root.style.setProperty('--shadow-glow', `0 0 40px hsl(${hsl} / 0.3)`);
  root.style.setProperty('--shadow-button', `0 4px 14px hsl(${hsl} / 0.4)`);

  // Light mode variants
  root.style.setProperty('--gradient-hero', `linear-gradient(135deg, hsl(${hsl} / 0.1), hsl(217 91% 60% / 0.05))`);

  // Dark mode variants (only applied when .dark is present, but setting on root covers both)
  root.style.setProperty('--gradient-hero', `linear-gradient(135deg, hsl(${hsl} / 0.2), hsl(217 91% 60% / 0.1))`);
}

export function useAccentColor() {
  const [accentColor, setAccentColorState] = useState<AccentColorId>(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as AccentColorId | null;
    return stored || 'emerald';
  });

  useEffect(() => {
    applyAccentColor(accentColor);
  }, [accentColor]);

  const setAccentColor = (colorId: AccentColorId) => {
    setAccentColorState(colorId);
    localStorage.setItem(STORAGE_KEY, colorId);
  };

  return { accentColor, setAccentColor };
}

export function initAccentColor() {
  const stored = localStorage.getItem(STORAGE_KEY) as AccentColorId | null;
  applyAccentColor(stored || 'emerald');
}
