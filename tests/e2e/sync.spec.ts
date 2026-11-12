import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { startGame, watchConsole } from './helpers';

const INVITE = /^[0-9A-Z]{5}-[0-9A-Z]{5}$/;

/** The invite code Settings shows after "Start syncing" or "Invite a device". */
async function shownInvite(page: Page): Promise<string> {
  const code = page.getByLabel('Invite code', { exact: true });
  await expect(code).toBeVisible({ timeout: 10_000 });
  return (await code.innerText()).trim();
}

/** Turn sync on from Settings and return the one-time invite it makes. */
async function startSyncing(page: Page): Promise<string> {
  await page.goto('/#/settings');
  await page.getByRole('button', { name: 'Start syncing' }).click();
  await expect(page.getByText('Synced', { exact: true })).toBeVisible({ timeout: 10_000 });
  return shownInvite(page);
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
  expect(code).toMatch(INVITE);
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
  // The (now used) invite is not left in the address bar.
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
  // Checked before closing B: in WebKit, closing a browser context can log a
  // CSP message of its own after the app has finished.
  expect(errorsB, 'console errors on B after the deletion synced').toEqual([]);
  await ctxB.close();
});

test('an invite works once', async ({ page, browser }) => {
  const errors = watchConsole(page);
  const code = await startSyncing(page);

  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await b.goto(`/#/join/${code}`);
  // Opening the link alone doesn't use it up (link previews, accidental opens).
  await expect(b.getByRole('heading', { name: 'Join this sync group?' })).toBeVisible();
  const ctxC = await browser.newContext();
  const c = await ctxC.newPage();
  await c.goto(`/#/join/${code}`);
  await c.getByRole('button', { name: 'Join' }).click();
  await expect(c.getByText('Synced', { exact: true })).toBeVisible({ timeout: 10_000 });

  // Now it's used: B can't join with it.
  await b.getByRole('button', { name: 'Join' }).click();
  await expect(b.getByRole('heading', { name: 'Invite already used or expired' })).toBeVisible();
  expect(errors).toEqual([]);
  await ctxB.close();
  await ctxC.close();
});

test('joins by typing an invite code', async ({ page, browser }) => {
  await startGame(page);
  await startSyncing(page);
  // A fresh invite from "Invite a device" (the first one is still unused; both work).
  await page.getByRole('button', { name: 'Invite a device' }).click();
  const code = await shownInvite(page);

  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await b.goto('/#/settings');
  await b.getByRole('button', { name: 'Join with a code' }).click();
  await b.getByLabel('Invite code', { exact: true }).fill(code.toLowerCase().replace('-', ' '));
  await b.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(b.getByText('Synced', { exact: true })).toBeVisible({ timeout: 10_000 });
  await b.goto('/#/history');
  await expect(b.getByText('Ann & Cy')).toBeVisible({ timeout: 10_000 });
  await ctxB.close();
});

test('invalid and old-style invite links are refused', async ({ page }) => {
  await page.goto('/#/join/NOT-A-REAL-CODE-UUUU-UUUU-UUUU');
  await expect(page.getByRole('heading', { name: 'Invite link not valid' })).toBeVisible();
  // Links that carried the permanent sync code no longer work.
  await page.goto('/#/join/0123-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXYZ');
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
