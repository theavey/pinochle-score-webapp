import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { enterHand, saveHand, startGame, watchConsole } from './helpers';

const table = (page: Page) => page.getByRole('main', { name: 'Table display' });

/** Wait until the page has rendered a frame (media-query change events fire then). */
const nextFrame = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );

test('phone: turning sideways shows the table display', async ({ page }, info) => {
  test.skip(info.project.name === 'tablet', 'phone-only behaviour');
  const errors = watchConsole(page);
  const portrait = page.viewportSize();
  if (!portrait) throw new Error('needs a viewport');
  const landscape = { width: portrait.height, height: portrait.width };

  await startGame(page);
  await enterHand(page, { bidder: 'Bob', bid: 30, meld: [8, 12], defenderTricks: 7 });
  await saveHand(page);

  // Turn sideways: totals and the last hand appear automatically.
  await page.setViewportSize(landscape);
  await expect(table(page)).toBeVisible();
  await expect(table(page).getByLabel('15 points')).toBeVisible();
  await expect(table(page).getByLabel('30 points')).toBeVisible();
  await expect(table(page).getByText('Hand 1: Bob made 30')).toBeVisible();

  // Back upright: the scoresheet returns. Start entering the next bid there.
  await page.setViewportSize(portrait);
  await expect(table(page)).toBeHidden();
  await page
    .getByRole('group', { name: 'Who took the bid?' })
    .getByRole('button', { name: /^Cy/ })
    .click();
  await page.getByLabel('Bid', { exact: true }).fill('32');
  await page.getByLabel(/^Meld: Ann & Cy/).fill('14');

  // Sideways again: the live bid shows (and replaces the last-hand line on a phone).
  await page.setViewportSize(landscape);
  await expect(table(page).getByText('Cy bid 32 · needs 18')).toBeVisible();
  await expect(table(page).getByText('Hand 1: Bob made 30')).toBeHidden();

  // Closing it in landscape keeps it closed, so hands can be entered sideways.
  await table(page).getByRole('button', { name: 'Scoresheet' }).click();
  await expect(table(page)).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Scoresheet' })).toBeVisible();
  await page.waitForTimeout(300);
  await expect(table(page)).toBeHidden();

  // The next rotation re-arms it. Browsers re-check media queries when they
  // render, so let one frame render upright, as a real rotation does.
  await page.setViewportSize(portrait);
  await nextFrame(page);
  await page.setViewportSize(landscape);
  await expect(table(page)).toBeVisible();

  expect(errors).toEqual([]);
});

test('tablet: the Show table button opens it; landscape alone does not', async ({ page }, info) => {
  test.skip(info.project.name !== 'tablet', 'tablet-only behaviour');
  const errors = watchConsole(page);
  const portrait = page.viewportSize();
  if (!portrait) throw new Error('needs a viewport');

  await startGame(page);
  await enterHand(page, { bidder: 'Bob', bid: 30, meld: [8, 12], defenderTricks: 7 });
  await saveHand(page);
  await page
    .getByRole('group', { name: 'Who took the bid?' })
    .getByRole('button', { name: /^Cy/ })
    .click();
  await page.getByLabel('Bid', { exact: true }).fill('32');

  // An iPad in landscape keeps the scoresheet (hands are entered that way).
  await page.setViewportSize({ width: portrait.height, height: portrait.width });
  await page.waitForTimeout(300);
  await expect(table(page)).toBeHidden();

  await page.getByRole('button', { name: 'Show table' }).click();
  await expect(table(page)).toBeVisible();
  // Room for both lines: the live bid (meld not entered yet) and the last hand.
  await expect(table(page).getByText('Cy bid 32', { exact: true })).toBeVisible();
  await expect(table(page).getByText('Hand 1: Bob made 30')).toBeVisible();

  await table(page).getByRole('button', { name: 'Scoresheet' }).click();
  await expect(page.getByRole('heading', { name: 'Scoresheet' })).toBeVisible();
  expect(errors).toEqual([]);
});
