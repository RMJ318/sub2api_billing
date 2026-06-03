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
  /** The page content to render inside the shell. */
  children: ReactNode;
  /** Number of unread signals for the Bell badge. */
  unreadCount?: number;
  /** Callback when the Bell icon is activated. */
  onBellClick?: () => void;
  /** Currently active navigation path (for highlighting). */
  activePath?: string;
  /** Callback when a navigation link is clicked. */
  onNavigate?: (path: string) => void;
}

/**
 * Application shell providing:
 * - Navigation sidebar with links to Dashboard, Users, Models, Keys, Cost
 * - Header with Bell icon (unread badge count) and theme toggle
 * - Class-based dark theme defaulting to dark, persisted to localStorage
 * - Responsive layout:
 *   - Multi-column card grid >= 768px with visible nav sidebar
 *   - Single-column with collapsed nav (hamburger) 320–768px
 *   - Single-column with horizontal scroll < 320px
 */
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
    <div className="min-h-screen bg-neutral-100 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      {/* Header */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-neutral-200 bg-white px-4 dark:border-neutral-800 dark:bg-neutral-900">
        {/* Left: hamburger (mobile) + title */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Toggle navigation"
            className="md:hidden rounded p-1.5 hover:bg-neutral-200 dark:hover:bg-neutral-700"
            onClick={() => setNavOpen((prev) => !prev)}
          >
            <HamburgerIcon />
          </button>
          <span className="text-lg font-semibold whitespace-nowrap">
            AI Usage Analytics
          </span>
        </div>

        {/* Right: theme toggle + Bell */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            className="rounded p-1.5 hover:bg-neutral-200 dark:hover:bg-neutral-700"
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          <button
            type="button"
            aria-label="Notifications"
            className="relative rounded p-1.5 hover:bg-neutral-200 dark:hover:bg-neutral-700"
            onClick={onBellClick}
          >
            <BellIcon />
            {unreadCount > 0 && (
              <span
                aria-label={`${unreadCount} unread notifications`}
                className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white"
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar - visible on md+ */}
        <nav
          aria-label="Main navigation"
          className={`
            fixed inset-y-0 left-0 z-40 mt-14 w-56 transform border-r border-neutral-200 bg-white transition-transform dark:border-neutral-800 dark:bg-neutral-900
            md:static md:z-auto md:mt-0 md:translate-x-0 md:transition-none
            ${navOpen ? 'translate-x-0' : '-translate-x-full'}
          `}
        >
          <ul className="flex flex-col gap-1 p-3">
            {NAV_LINKS.map((link) => (
              <li key={link.path}>
                <button
                  type="button"
                  onClick={() => {
                    onNavigate?.(link.path);
                    setNavOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors
                    ${
                      activePath === link.path
                        ? 'bg-neutral-200 text-neutral-900 dark:bg-neutral-700 dark:text-white'
                        : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'
                    }
                  `}
                >
                  {link.icon}
                  {link.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Backdrop for mobile nav */}
        {navOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/40 md:hidden"
            onClick={() => setNavOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Main content area with responsive grid */}
        <main className="min-w-0 flex-1 overflow-x-auto p-4 md:p-6">
          <div className="app-card-grid">{children}</div>
        </main>
      </div>
    </div>
  );
}

/* ---------- SVG Icons ---------- */

function HamburgerIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 6h16M4 12h16M4 18h16"
      />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
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
    <svg
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
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
    <svg
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
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
    <svg
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
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
    <svg
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
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
    <svg
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
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
    <svg
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
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
    <svg
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}
