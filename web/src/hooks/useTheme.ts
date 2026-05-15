import { useEffect } from 'react';
import { useAppStore } from '../app/store';

export function useTheme() {
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return { theme, toggleTheme, isDark: theme === 'dark' };
}
