import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';
import packageJson from './package.json' with { type: 'json' };

export default defineConfig(({ mode }) => ({
  // Relative base so the build works under any GitHub Pages repo path.
  base: './',
  plugins: [svelte()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  // Svelte's server build has no mount(); component tests need the browser build.
  resolve: mode === 'test' ? { conditions: ['browser'] } : undefined,
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts', 'data-pipeline/**/*.test.ts'],
    environment: 'node',
  },
}));
