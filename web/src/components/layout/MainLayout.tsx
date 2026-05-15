import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useAppStore } from '@/app/store';
import { cn } from '@/lib/cn';

export function MainLayout() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <Header />
        <main className={cn('flex-1 overflow-auto', !sidebarOpen && 'transition-all')}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
