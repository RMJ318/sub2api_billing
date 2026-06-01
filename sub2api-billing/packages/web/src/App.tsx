import type { JSX } from 'react';

/**
 * Placeholder application root. Establishes that React + Tailwind render and
 * that the dark-mode-first theme (the `dark` class on <html>) is in effect.
 * The real AppShell (navigation, theme toggle, Bell/Signal Center) and the six
 * analytical pages are built by later tasks.
 */
export function App(): JSX.Element {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 p-8">
      <h1 className="text-2xl font-semibold">AI Usage Analytics</h1>
      <p className="mt-2 text-neutral-400">
        Platform scaffold ready. Analytical pages are implemented by subsequent
        tasks.
      </p>
    </main>
  );
}
