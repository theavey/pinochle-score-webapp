import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { enterHand, saveHand, startGame, watchConsole } from './helpers';

test('exports a backup and restores it into an empty browser', async ({ page, browser }) => {
  const errors = watchConsole(page);
  await startGame(page);
  await enterHand(page, { bidder: 'Ann', bid: 25, meld: [10, 5], bidderTricks: 15 });
  await saveHand(page);

  await page.goto('/#/settings');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^pinochle-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await download.path();
  const text = readFileSync(path, 'utf8');
  expect(JSON.parse(text)).toMatchObject({ format: 'pinochle-score-backup' });

  // A fresh context has empty storage, like a new phone.
  const ctx = await browser.newContext();
  const fresh = await ctx.newPage();
  await fresh.goto('/#/settings');
  await fresh.locator('input[type=file]').setInputFiles(path);
  await expect(fresh.getByText('Backup has 1 game and 4 players.')).toBeVisible();
  await fresh.getByRole('button', { name: 'Merge' }).click();
  await fresh.goto('/#/history');
  await expect(fresh.getByText('Ann & Cy')).toBeVisible();
  await ctx.close();

  expect(errors).toEqual([]);
});

test('rejects a file that is not a backup', async ({ page }) => {
  await page.goto('/#/settings');
  await page.locator('input[type=file]').setInputFiles({
    name: 'evil.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"format":"pinochle-score-backup","data":{"__proto__":{"x":1}}}'),
  });
  await expect(page.getByRole('alert')).toContainText('damaged');
});
