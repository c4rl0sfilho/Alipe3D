import { LoaderCircle, Menu } from 'lucide-react';
import { Suspense, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AlertsBell } from './AlertsBell';
import { Sidebar } from './Sidebar';
import { UserMenu } from './UserMenu';
import { titleForPath } from './navigation';

const COLLAPSED_KEY = 'alipe3d:sidebar-collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function AppLayout() {
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, current ? '0' : '1');
      } catch {
        // Preferência visual apenas: ignorar se o armazenamento estiver indisponível.
      }
      return !current;
    });
  };

  return (
    <div className="flex min-h-dvh">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="-ml-1 rounded-md p-1.5 text-ink-muted hover:bg-canvas lg:hidden"
            aria-label="Abrir menu"
          >
            <Menu className="size-5" />
          </button>
          <p className="flex-1 truncate text-sm font-medium text-ink-muted">
            {titleForPath(pathname)}
          </p>
          <AlertsBell />
          <UserMenu />
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
          <Suspense
            fallback={
              <div className="flex justify-center py-20">
                <LoaderCircle
                  className="size-6 animate-spin text-brand-500"
                  aria-label="Carregando"
                />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
