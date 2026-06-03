import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import { App } from './App.js';

/**
 * Web entry point. Mounts the React tree and loads the Tailwind stylesheet so
 * the Vite + React + Tailwind toolchain is functional. The full AppShell, the
 * six analytical pages, and the Signal Center drawer are implemented by later
 * tasks (see tasks 20+); this bootstrap establishes the build/dev pipeline.
 */
const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container #root not found in index.html');
}

const queryClient = new QueryClient();

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
