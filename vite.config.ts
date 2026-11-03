/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { serviceWorkerPlugin } from './scripts/sw-plugin.ts';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};
const buildDate = new Date().toISOString().slice(0, 10);

/** Short commit id, so Settings shows exactly which build a device is running. */
function commitId(): string {
  const fromCi = process.env.WORKERS_CI_COMMIT_SHA ?? process.env.GITHUB_SHA;
  if (fromCi) return fromCi.slice(0, 7);
  try {
    return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  plugins: [preact(), serviceWorkerPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(`${pkg.version} · ${commitId()} (${buildDate})`),
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
