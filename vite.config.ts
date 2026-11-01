/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { serviceWorkerPlugin } from './scripts/sw-plugin.ts';

export default defineConfig({
  plugins: [preact(), serviceWorkerPlugin()],
  build: {
    target: 'es2022',
    // Keep everything in one script so the service worker never serves a page
    // that references a lazily-loaded chunk from an older deploy.
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
    sourcemap: false,
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
