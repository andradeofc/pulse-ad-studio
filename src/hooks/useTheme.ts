import { useEffect } from 'react';
import { initAccentColor } from './useAccentColor';

type Theme = 'light' | 'dark' | 'system';

export function useThemeInitializer() {
  useEffect(() => {
    const stored = localStorage.getItem('theme') as Theme | null;
    const theme = stored || 'dark'; // Default to dark
    
    const root = document.documentElement;
    
    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', prefersDark);
    } else if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    // Initialize accent color from localStorage
    initAccentColor();
  }, []);
}
