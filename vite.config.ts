import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';
import packageJson from './package.json' with { type: 'json' };

export default defineConfig({
  // Relative base so the build works under any GitHub Pages repo path.
  base: './',
  // svelteTesting resolves Svelte's browser build for component tests only.
  plugins: [svelte(), svelteTesting()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts', 'data-pipeline/**/*.test.ts'],
    environment: 'node',
  },
});
