// Render public/icon.svg to the PNG sizes iOS/Android need.
// Usage: node scripts/generate-icons.mjs  (uses the Playwright Chromium)
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8');
const targets = [
  { file: 'apple-touch-icon.png', size: 180, pad: 0, round: false },
  { file: 'icon-192.png', size: 192, pad: 0, round: true },
  { file: 'icon-512.png', size: 512, pad: 0, round: true },
  // Maskable icons need the art inside the central safe zone on a full-bleed background.
  { file: 'icon-maskable-512.png', size: 512, pad: 0.12, round: false },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  // iOS rounds corners itself, so the touch icon is a full square.
  const art = t.round ? svg : svg.replace('rx="112"', 'rx="0"');
  const inner = Math.round(t.size * (1 - 2 * t.pad));
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<html><body style="margin:0;background:${t.round ? 'transparent' : '#1f6b43'};display:grid;place-items:center;width:${t.size}px;height:${t.size}px">` +
      art.replace('<svg ', `<svg width="${inner}" height="${inner}" `) +
      '</body></html>',
  );
  await page.screenshot({
    path: new URL(`../public/${t.file}`, import.meta.url).pathname,
    omitBackground: t.round,
  });
  console.log('wrote', t.file);
}
await browser.close();
