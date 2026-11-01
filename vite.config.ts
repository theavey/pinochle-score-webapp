/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { readFileSync } from 'node:fs';
import { serviceWorkerPlugin } from './scripts/sw-plugin.ts';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};
const buildDate = new Date().toISOString().slice(0, 10);

export default defineConfig({
  plugins: [preact(), serviceWorkerPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(`${pkg.version} (${buildDate})`),
  },
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
