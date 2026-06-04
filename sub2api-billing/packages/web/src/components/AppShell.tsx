import { useState, type JSX, type ReactNode } from 'react';
import { useTheme } from '../hooks/useTheme.js';

/** Navigation link definition. */
interface NavLink {
  label: string;
  path: string;
  icon: ReactNode;
}

const NAV_LINKS: NavLink[] = [
  { label: 'Dashboard', path: '/', icon: <DashboardIcon /> },
  { label: 'Users', path: '/users', icon: <UsersIcon /> },
  { label: 'Models', path: '/models', icon: <ModelsIcon /> },
  { label: 'Keys', path: '/keys', icon: <KeysIcon /> },
  { label: 'Cost', path: '/cost', icon: <CostIcon /> },
];

export interface AppShellProps {
  children: ReactNode;
  unreadCount?: number;
  onBellClick?: () => void;
  activePath?: string;
  onNavigate?: (path: string) => void;
}

export function AppShell({
  children,
  unreadCount = 0,
  onBellClick,
  activePath = '/',
  onNavigate,
}: AppShellProps): JSX.Element {
  const { theme, toggleTheme } = useTheme();
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="app-shell-bg min-h-screen text-[var(--text)]">
      <aside className="glass-panel custom-scrollbar fixed inset-y-0 left-0 z-40 hidden h-screen w-64 flex-col border-r border-[var(--border-soft)] md:flex">
        <div className="px-6 py-7">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(173,198,255,0.12)] text-[var(--primary)]">
              <AnalyticsIcon />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--text-dim)]">
                Synthetix
              </p>
              <h1 className="mt-1 text-xl font-semibold text-[var(--text)]">AI Usage Analytics</h1>
            </div>
          </div>
        </div>

        <nav aria-label="Main navigation" className="flex-1 px-4">
          <ul className="space-y-2">
            {NAV_LINKS.map((link) => {
              const active = activePath === link.path;
              return (
                <li key={link.path}>
                  <button
                    type="button"
                    onClick={() => onNavigate?.(link.path)}
                    className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${
                      active
                        ? 'bg-[var(--secondary-strong)] text-[#00311f] shadow-[0_12px_30px_rgba(0,165,114,0.25)]'
                        : 'text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--text)]'
                    }`}
                  >
                    <span className="opacity-90">{link.icon}</span>
                    <span>{link.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mt-6 border-t border-[var(--border-soft)] p-4">
          <div className="panel-muted flex items-center gap-3 rounded-2xl p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(77,142,255,0.2)] text-sm font-bold text-[var(--primary)]">
              AU
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">Admin User</p>
              <p className="text-xs text-[var(--text-dim)]">System Architect</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-h-screen min-w-0 md:pl-64">
        <header className="glass-panel sticky top-0 z-30 border-b border-[var(--border-soft)]">
          <div className="flex min-h-[74px] items-center justify-between gap-4 px-4 py-3 md:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                aria-label="Toggle navigation"
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border)] bg-white/5 text-[var(--text)] hover:bg-white/10 md:hidden"
                onClick={() => setNavOpen((prev) => !prev)}
              >
                <HamburgerIcon />
              </button>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--text-dim)]">
                  Enterprise cockpit
                </p>
                <h2 className="truncate text-xl font-semibold text-[var(--text)] md:text-2xl">
                  Usage Analytics
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2 md:gap-3">
              <button
                type="button"
                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                className="inline-flex h-11 items-center gap-2 rounded-2xl border border-[var(--border)] bg-white/5 px-3 text-sm font-medium text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--text)]"
                onClick={toggleTheme}
              >
                {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
                <span className="hidden sm:inline">Theme</span>
              </button>
              <button
                type="button"
                aria-label="Notifications"
                className="relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border)] bg-white/5 text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--text)]"
                onClick={onBellClick}
              >
                <BellIcon />
                {unreadCount > 0 ? (
                  <span
                    aria-label={`${unreadCount} unread notifications`}
                    className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[10px] font-bold text-white"
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                ) : null}
              </button>
            </div>
          </div>
        </header>

      {navOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setNavOpen(false)} aria-hidden="true" />
          <nav className="glass-panel absolute inset-y-0 left-0 w-72 border-r border-[var(--border-soft)] p-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--text-dim)]">
                Navigation
              </span>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--text)]"
                onClick={() => setNavOpen(false)}
              >
                <CloseIcon />
              </button>
            </div>
            <ul className="space-y-2">
              {NAV_LINKS.map((link) => {
                const active = activePath === link.path;
                return (
                  <li key={link.path}>
                    <button
                      type="button"
                      onClick={() => {
                        onNavigate?.(link.path);
                        setNavOpen(false);
                      }}
                      className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${
                        active
                          ? 'bg-[var(--secondary-strong)] text-[#00311f]'
                          : 'text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--text)]'
                      }`}
                    >
                      {link.icon}
                      {link.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      ) : null}

        <main className="px-4 py-6 md:px-8 md:py-8">
          <div className="app-card-grid">{children}</div>
        </main>
      </div>
    </div>
  );
}

function AnalyticsIcon() {
  return (
    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M4 19V5m5 14V9m5 10V11m6 8H2"
      />
    </svg>
  );
}

function HamburgerIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
      />
    </svg>
  );
}

function DashboardIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10-2a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6z"
      />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
      />
    </svg>
  );
}

function ModelsIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    </svg>
  );
}

function KeysIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
      />
    </svg>
  );
}

function CostIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}
