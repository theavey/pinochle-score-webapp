import { expect, test } from '@playwright/test';
import { enterHand, saveHand, startGame, totals, watchConsole } from './helpers';

test('plays a full game to 150 with sets, throw-ins and a stuck dealer', async ({ page }) => {
  const errors = watchConsole(page);
  await startGame(page);

  // Hand 1: Ann deals; Bob bids 30 and makes it (12 meld + 18 tricks).
  await expect(page.getByRole('button', { name: /Dealer: Ann/ })).toBeVisible();
  await enterHand(page, { bidder: 'Bob', bid: 30, meld: [8, 12], defenderTricks: 7 });
  await expect(page.getByRole('status').filter({ hasText: 'made it' })).toBeVisible();
  await saveHand(page);
  expect(await totals(page)).toEqual(['15', '30']);

  // Hand 2: Bob deals; Cy bids 35 and is set (10 meld + 20 tricks = 30).
  await expect(page.getByRole('heading', { name: 'Hand 2' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Dealer: Bob/ })).toBeVisible();
  await enterHand(page, { bidder: 'Cy', bid: 35, meld: [10, 6], defenderTricks: 5 });
  await expect(page.getByText('SET', { exact: true })).toBeVisible();
  await saveHand(page);
  expect(await totals(page)).toEqual(['−20', '41']);

  // Hand 3: Cy deals, everyone passes, Cy is stuck at 25 and throws in.
  await enterHand(page, { bidder: 'Cy', stuck: true, meld: [4, 9], throwIn: true });
  await saveHand(page);
  expect(await totals(page)).toEqual(['−45', '50']);

  // Hand 4: Di bids 60 on big meld; Ann & Cy take no tricks and lose their meld.
  await enterHand(page, { bidder: 'Di', bid: 60, meld: [15, 80], defenderTricks: 0 });
  await expect(page.getByText('meld lost')).toBeVisible();
  await saveHand(page);
  expect(await totals(page)).toEqual(['−45', '155']);

  await expect(page.getByText(/Bob & Di win, 155/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Final score' })).toBeVisible();

  await page.getByRole('link', { name: 'History' }).click();
  await expect(page.getByText('Finished')).toBeVisible();
  await page.getByRole('link', { name: 'Back to home' }).click();
  await page.getByRole('link', { name: 'Stats' }).click();
  await expect(page.getByRole('row', { name: /^Bob 1–0/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /^Cy 0–1/ })).toBeVisible();
  // Cy bid twice: set once, threw in once. Both count as not made.
  await expect(page.getByRole('row', { name: /^Cy 0–1 0% 2 0%/ })).toBeVisible();

  expect(errors).toEqual([]);
});

test('keeps a half-entered hand and the game across reloads', async ({ page }) => {
  await startGame(page);
  await enterHand(page, { bidder: 'Ann', bid: 27, meld: [11, 3], defenderTricks: 9 });
  const url = page.url();

  await page.reload();
  await expect(page.getByLabel('Bid', { exact: true })).toHaveValue('27');
  await expect(page.getByLabel(/^Meld: Ann & Cy/)).toHaveValue('11');
  await expect(page.getByLabel(/^Trick points/)).toHaveValue('9');

  // Opening the app fresh goes straight back to the game in progress.
  await page.goto('/');
  await expect(page).toHaveURL(url);
  await saveHand(page);
  expect(await totals(page)).toEqual(['27', '12']);
});

test('fixes an earlier hand and recalculates, with undo', async ({ page }) => {
  await startGame(page);
  await enterHand(page, { bidder: 'Ann', bid: 25, meld: [10, 5], defenderTricks: 10 });
  await saveHand(page);
  await enterHand(page, { bidder: 'Bob', bid: 25, meld: [5, 15], defenderTricks: 5 });
  await saveHand(page);
  expect(await totals(page)).toEqual(['35', '50']);

  await page.getByRole('button', { name: 'Edit hand 1' }).click();
  await expect(page.getByRole('heading', { name: 'Editing hand 1' })).toBeVisible();
  await page.getByLabel(/^Meld: Ann & Cy/).fill('20');
  await saveHand(page);
  expect(await totals(page)).toEqual(['45', '50']);

  await page.getByRole('button', { name: 'Undo' }).click();
  expect(await totals(page)).toEqual(['35', '50']);
});

test('ends a game early with the leader winning', async ({ page }) => {
  await startGame(page);
  await enterHand(page, { bidder: 'Ann', bid: 25, meld: [10, 5], defenderTricks: 10 });
  await saveHand(page);
  await page.getByRole('button', { name: 'Game menu' }).click();
  await page.getByRole('button', { name: /End game now/ }).click();
  await page.getByRole('button', { name: 'End game', exact: true }).click();
  await expect(page.getByText(/Ann & Cy win \(called\)/)).toBeVisible();
});

test('shows field errors instead of saving a bad hand', async ({ page }) => {
  await startGame(page);
  await saveHand(page);
  await expect(page.getByText('Pick who won the bid')).toBeVisible();
  await page
    .getByRole('group', { name: 'Who took the bid?' })
    .getByRole('button', { name: /^Bob/ })
    .click();
  await page.getByLabel('Bid', { exact: true }).fill('20');
  await saveHand(page);
  await expect(page.getByText('Minimum bid is 25')).toBeVisible();
  expect(await totals(page)).toEqual(['0', '0']);
});

test('escapes player names (no HTML injection)', async ({ page }) => {
  await page.goto('/#/new');
  await page.getByRole('button', { name: /^Seat bottom/ }).click();
  const evil = '<img src=x onerror=alert(1)>';
  await page.getByLabel('Player name').fill(evil);
  await page.getByLabel('Player name').press('Enter');
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Seat bottom/ })).toContainText('<img');
});
