import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { sharedTestConfig } from '../../vitest.shared.js';

export default defineConfig({
  plugins: [react()],
  test: {
    ...sharedTestConfig,
    name: 'web',
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: [
      ...(sharedTestConfig?.setupFiles as string[]),
      './test/setup/dom.setup.ts',
    ],
  },
});
