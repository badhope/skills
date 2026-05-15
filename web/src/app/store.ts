import { create } from 'zustand';

interface AppState {
  sidebarOpen: boolean;
  theme: 'dark' | 'light';
  toggleSidebar: () => void;
  toggleTheme: () => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  sidebarOpen: true,
  theme: 'dark',
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleTheme: () =>
    set((s) => {
      const next = s.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      return { theme: next };
    }),
  setSidebarOpen: (open: boolean) => set({ sidebarOpen: open }),
}));
