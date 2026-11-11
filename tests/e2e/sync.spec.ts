import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { startGame, watchConsole } from './helpers';

/** Turn sync on from Settings and return this device's sync code. */
async function startSyncing(page: Page): Promise<string> {
  await page.goto('/#/settings');
  await page.getByRole('button', { name: 'Start syncing' }).click();
  await expect(page.getByText('Synced', { exact: true })).toBeVisible({ timeout: 10_000 });
  const code = page.getByLabel('Sync code', { exact: true });
  if (!(await code.isVisible())) await page.getByRole('button', { name: 'Show code' }).click();
  return (await code.innerText()).trim();
}

test('two devices sync games, live bids and deletions, encrypted', async ({ page, browser }) => {
  const errors = watchConsole(page);
  // Everything the server receives must be ciphertext.
  const uploads: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'PUT' && r.url().includes('/api/sync/')) uploads.push(r.postData() ?? '');
  });

  // Device A: a game, then sync on.
  await startGame(page);
  const gameUrl = page.url();
  const code = await startSyncing(page);
  expect(code).toMatch(/^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/);
  expect(uploads.length).toBeGreaterThan(0);
  for (const body of uploads) {
    expect(body).not.toMatch(/Ann|Bob|"players"|"games"/);
  }

  // Device B: a separate browser joins through the invite link.
  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  const errorsB = watchConsole(b);
  await b.goto(`/#/join/${code}`);
  await b.getByRole('button', { name: 'Join' }).click();
  await expect(b.getByText('Synced', { exact: true })).toBeVisible({ timeout: 10_000 });
  // The secret code is not left in the address bar.
  expect(b.url()).not.toContain(code);
  await b.goto('/#/history');
  await expect(b.getByText('Ann & Cy')).toBeVisible({ timeout: 10_000 });
  expect(errorsB, 'console errors on B after joining').toEqual([]);

  // A bid typed on A shows live on B's table display.
  await b.goto(gameUrl.slice(gameUrl.indexOf('#')));
  await b.getByRole('button', { name: 'Show table' }).click();
  await page.goto(gameUrl);
  await page
    .getByRole('group', { name: 'Who took the bid?' })
    .getByRole('button', { name: /^Bob/ })
    .click();
  await page.getByLabel('Bid', { exact: true }).fill('30');
  await expect(b.getByText(/Bob bid 30/)).toBeVisible({ timeout: 10_000 });
  expect(errorsB, 'console errors on B on the table display').toEqual([]);

  // Deleting the game on B removes it on A.
  await b.getByRole('button', { name: 'Scoresheet' }).click();
  await b.getByRole('button', { name: 'Game menu' }).click();
  expect(errorsB, 'console errors on B with the game menu open').toEqual([]);
  await b.getByRole('button', { name: 'Delete game' }).click();
  await b.getByRole('button', { name: 'Delete game' }).last().click();
  await expect(b.getByRole('link', { name: 'New game' })).toBeVisible();
  expect(errorsB, 'console errors on B after deleting').toEqual([]);
  await page.goto('/#/history');
  await expect(page.getByText('No games yet.')).toBeVisible({ timeout: 10_000 });
  expect(errors, 'console errors on A after the deletion synced').toEqual([]);
  expect(errorsB, 'console errors on B after the deletion synced').toEqual([]);

  await ctxB.close();
  expect(errors).toEqual([]);
  expect(errorsB).toEqual([]);
});

test('an invalid invite link is refused', async ({ page }) => {
  await page.goto('/#/join/NOT-A-REAL-CODE-UUUU-UUUU-UUUU');
  await expect(page.getByRole('heading', { name: 'Invite link not valid' })).toBeVisible();
});

test('stopping sync keeps this device’s games', async ({ page }) => {
  await startGame(page);
  await startSyncing(page);
  await page.getByRole('button', { name: 'Stop syncing on this device' }).click();
  await expect(page.getByRole('button', { name: 'Start syncing' })).toBeVisible();
  await page.goto('/#/history');
  await expect(page.getByText('Ann & Cy')).toBeVisible();
});
