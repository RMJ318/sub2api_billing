import { useState, type JSX } from 'react';
import { AppShell } from './components/AppShell.js';

/**
 * Application root. Wraps page content in the AppShell which provides
 * navigation, theme toggle (dark-mode-first, persisted to localStorage),
 * Bell icon with unread badge, and responsive card-grid layout.
 *
 * Analytical pages and the Signal Center drawer are implemented by later tasks.
 */
export function App(): JSX.Element {
  const [activePath, setActivePath] = useState('/');
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <AppShell
      activePath={activePath}
      onNavigate={setActivePath}
      unreadCount={3}
      onBellClick={() => setDrawerOpen((prev) => !prev)}
    >
      <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
        <h1 className="text-2xl font-semibold">AI Usage Analytics</h1>
        <p className="mt-2 text-neutral-500 dark:text-neutral-400">
          Platform scaffold ready. Analytical pages are implemented by
          subsequent tasks.
        </p>
        <p className="mt-1 text-sm text-neutral-400 dark:text-neutral-500">
          Current page: <code>{activePath}</code>
          {drawerOpen && ' | Signal Center open'}
        </p>
      </div>
    </AppShell>
  );
}
