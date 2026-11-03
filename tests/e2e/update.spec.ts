import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * Installed apps are usually resumed, not relaunched, so a new deploy must
 * take over an open page by itself: when a new service worker activates over
 * an old one, it reloads open windows into the new version.
 *
 * Simulates a deploy by rewriting dist/sw.js on the running server (Playwright
 * can't intercept the browser's service-worker update fetch). The config runs
 * this spec alone, after all other tests.
 */
const SW = 'dist/sw.js';

test('an open app reloads itself into a newly deployed version', async ({ page }) => {
  const original = readFileSync(SW, 'utf8');
  try {
    await page.goto('/#/settings');
    await expect
      .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15_000 })
      .toBe(true);

    // Mark this page instance; a reload clears the marker.
    const marker = () => page.evaluate(() => (window as { marker?: number }).marker);
    await page.evaluate(() => {
      (window as { marker?: number }).marker = 1;
    });

    // No reload without a new version (e.g. on first install).
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration())?.update();
    });
    await page.waitForTimeout(1000);
    expect(await marker()).toBe(1);

    // "Deploy" a new version, then let the app find it.
    const next = original.replace(/const VERSION = "([^"]+)"/, 'const VERSION = "$1-next"');
    expect(next).not.toBe(original);
    writeFileSync(SW, next);
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration())?.update();
    });

    await expect.poll(marker, { timeout: 15_000 }).toBeUndefined();
    await expect(page).toHaveURL(/#\/settings$/);
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    const keys = await page.evaluate(() => caches.keys());
    expect(keys.filter((k) => k.startsWith('pinochle-'))).toEqual([
      expect.stringMatching(/-next$/),
    ]);
  } finally {
    writeFileSync(SW, original);
  }
});
