import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * Some browsers implement built-in controls with internal stylesheets that a
 * strict CSP can block (seen in WebKit on the Settings page). Render each
 * native element the app uses, alone, under the production CSP, and require
 * that none of them triggers a CSP violation. (<select> is not used for this
 * reason: WebKit's built-in select styling is blocked. ESLint bans it.)
 */
const csp =
  /Content-Security-Policy: (.+)/.exec(readFileSync('public/_headers', 'utf8'))?.[1] ?? '';

const ELEMENTS: Record<string, string> = {
  details: '<details><summary>More</summary><p>Body</p></details>',
  fileInput: '<label>Import <input type="file" accept="application/json,.json"></label>',
  checkbox: '<label><input type="checkbox"> Toggle</label>',
  textInput: '<input type="text" inputmode="numeric" pattern="[0-9]*">',
  dialog: '<dialog><p>Closed dialog</p></dialog>',
  table: '<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>',
};

/** Elements that need script to reach the state the app puts them in. */
const SCRIPTED: Record<string, { html: string; script: string }> = {
  modalDialog: {
    html: '<dialog id="d"><p>Body</p><button type="button">OK</button></dialog>',
    script:
      "const d = document.getElementById('d'); d.showModal(); setTimeout(() => { d.close(); d.remove(); }, 100);",
  },
  nonModalDialog: {
    html: '<dialog id="d"><p>Body</p><button type="button">OK</button></dialog>',
    script:
      "const d = document.getElementById('d'); d.show(); setTimeout(() => { d.close(); d.remove(); }, 100);",
  },
};

const cases = [
  ...Object.entries(ELEMENTS).map(([name, html]) => ({ name, html, script: '' })),
  ...Object.entries(SCRIPTED).map(([name, c]) => ({ name, ...c })),
];

for (const { name, html, script } of cases) {
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
        body: `<!doctype html><html><body>${html}${script ? '<script src="/csp-probe.js"></script>' : ''}</body></html>`,
      }),
    );
    // Same-origin script file: the CSP blocks inline scripts.
    await page.route('**/csp-probe.js', (route) =>
      route.fulfill({ contentType: 'text/javascript', body: script }),
    );
    await page.goto('/csp-probe');
    await page.waitForTimeout(script ? 600 : 300);
    expect(errors).toEqual([]);
  });
}
