import { expect, test } from '@playwright/test';

test('loads and keeps working with no network after the first visit', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Pinochle Score' })).toBeVisible();
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
