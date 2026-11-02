import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * Some browsers implement built-in controls with internal stylesheets that a
 * strict CSP can block (seen in WebKit on the Settings page). Render each
 * native element the app uses, alone, under the production CSP, and require
 * that none of them triggers a CSP violation.
 */
const csp =
  /Content-Security-Policy: (.+)/.exec(readFileSync('public/_headers', 'utf8'))?.[1] ?? '';

const ELEMENTS: Record<string, string> = {
  details: '<details><summary>More</summary><p>Body</p></details>',
  fileInput: '<label>Import <input type="file" accept="application/json,.json"></label>',
  select: '<select><option>One</option><option>Two</option></select>',
  checkbox: '<label><input type="checkbox"> Toggle</label>',
  textInput: '<input type="text" inputmode="numeric" pattern="[0-9]*">',
  dialog: '<dialog><p>Closed dialog</p></dialog>',
  table: '<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>',
};

for (const [name, html] of Object.entries(ELEMENTS)) {
  test(`<${name}> renders without CSP violations`, async ({ page }) => {
    expect(csp).toContain("style-src 'self'");
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.route('**/csp-probe', (route) =>
      route.fulfill({
        contentType: 'text/html',
        headers: { 'Content-Security-Policy': csp },
        body: `<!doctype html><html><body>${html}</body></html>`,
      }),
    );
    await page.goto('/csp-probe');
    await page.waitForTimeout(300);
    expect(errors).toEqual([]);
  });
}
