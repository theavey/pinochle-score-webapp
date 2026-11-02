import { expect, test } from '@playwright/test';
import { watchConsole } from './helpers';

test('changes a default rule and keeps it after reload', async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto('/#/settings');
  const group = page.getByRole('radiogroup', { name: 'On a throw-in, defenders score' });
  await expect(group.getByRole('radio', { name: 'Their meld', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await group.getByRole('radio', { name: 'Nothing' }).click();
  await page.reload();
  await expect(
    page
      .getByRole('radiogroup', { name: 'On a throw-in, defenders score' })
      .getByRole('radio', { name: 'Nothing' }),
  ).toHaveAttribute('aria-checked', 'true');
  expect(errors).toEqual([]);
});
