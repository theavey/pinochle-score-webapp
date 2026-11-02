import { expect, test } from '@playwright/test';
import { watchConsole } from './helpers';

test('loads and keeps working with no network after the first visit', async ({ page, context }) => {
  const errors = watchConsole(page);
  await page.goto('/');
  try {
    await expect(page.getByRole('heading', { name: 'Pinochle Score' })).toBeVisible();
  } catch (err) {
    // Surface console errors so a blank page explains itself in CI logs.
    throw new Error(`App did not render. Console errors: ${errors.join(' | ') || 'none'}`, {
      cause: err,
    });
  }
  // Wait for the service worker to finish caching the app.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Pinochle Score' })).toBeVisible();
  await page.getByRole('link', { name: 'New game' }).click();
  await expect(page.getByRole('heading', { name: 'New game' })).toBeVisible();
  await context.setOffline(false);
});
