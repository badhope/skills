import { useAppStore } from '../app/store';

export function useStore() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const theme = useAppStore((s) => s.theme);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);

  return { sidebarOpen, theme, toggleSidebar, toggleTheme, setSidebarOpen };
}
