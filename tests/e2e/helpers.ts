import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Fail the test on any console error (CSP violations show up here). */
export function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const { url, lineNumber } = msg.location();
      errors.push(url ? `${msg.text()} [at ${url}:${lineNumber}]` : msg.text());
    }
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

/** Create a game with Ann & Cy (team 0) vs Bob & Di (team 1); Ann deals first. */
export async function startGame(page: Page) {
  await page.goto('/');
  await page.getByRole('link', { name: 'New game' }).click();
  const names = ['Ann', 'Bob', 'Cy', 'Di'];
  const seats = ['bottom', 'left', 'top', 'right'];
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: new RegExp(`^Seat ${seats[i]}`) }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Player name').fill(names[i] ?? '');
    await dialog.getByLabel('Player name').press('Enter');
    await expect(dialog).toBeHidden();
  }
  await expect(page.getByText('Ann & Cy vs Bob & Di')).toBeVisible();
  await page.getByRole('radio', { name: 'Ann' }).click();
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.getByRole('heading', { name: 'Hand 1' })).toBeVisible();
}

export interface HandEntry {
  bidder: string;
  bid?: number;
  stuck?: boolean;
  meld: [number, number];
  bidderTricks?: number;
  throwIn?: boolean;
}

export async function enterHand(page: Page, h: HandEntry) {
  const form = page.locator('#hand-form');
  if (h.stuck) {
    await form.getByRole('button', { name: /Everyone passed/ }).click();
  } else {
    await form
      .getByRole('group', { name: 'Who took the bid?' })
      .getByRole('button', { name: new RegExp(`^${h.bidder}`) })
      .click();
    await form.getByLabel('Bid', { exact: true }).fill(String(h.bid));
  }
  await form.getByLabel(/^Meld: Ann & Cy/).fill(String(h.meld[0]));
  await form.getByLabel(/^Meld: Bob & Di/).fill(String(h.meld[1]));
  if (h.throwIn) {
    await form.getByRole('checkbox', { name: /throws in/ }).check();
  } else {
    await form.getByLabel(/^Trick points/).fill(String(h.bidderTricks));
  }
}

export async function saveHand(page: Page) {
  await page.getByRole('button', { name: /^Save (hand|changes)$/ }).click();
}

export async function totals(page: Page): Promise<[string, string]> {
  const t = page.locator('.team-total');
  return [(await t.nth(0).innerText()).trim(), (await t.nth(1).innerText()).trim()];
}
