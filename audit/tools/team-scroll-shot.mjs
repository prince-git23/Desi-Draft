/** Viewport screenshots at real scroll positions (element shots skip lazy paint). */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const FRAMES = path.join(here, '..', 'frames');
const BASE = process.env.DD_URL || 'http://127.0.0.1:5183/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function resolveChromium() {
  const base = path.join(process.env.LOCALAPPDATA || process.env.HOME || '', 'ms-playwright');
  const entries = await fs.readdir(base).catch(() => []);
  for (const d of entries.filter((e) => e.startsWith('chromium-')).sort().reverse()) {
    for (const sub of ['chrome-win64', 'chrome-win']) {
      const p = path.join(base, d, sub, 'chrome.exe');
      if (await fs.access(p).then(() => true, () => false)) return p;
    }
  }
  return null;
}

const browser = await chromium.launch({ executablePath: await resolveChromium() });
const results = {};

for (const [w, h] of [[390, 844], [320, 720]]) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.querySelector('#team')?.scrollIntoView({ block: 'start' }));
  await sleep(900);

  const cards = await page.$$('#team .profile-card');
  for (let i = 0; i < cards.length; i += 1) {
    await cards[i].scrollIntoViewIfNeeded();
    await sleep(700);
    const shot = path.join(FRAMES, `team-${w}-card${i + 1}.png`);
    await page.screenshot({ path: shot });
    const painted = await page.evaluate((index) => {
      const card = document.querySelectorAll('#team .profile-card')[index];
      const img = card.querySelector('.profile-card__photo');
      const r = img.getBoundingClientRect();
      return {
        src: img.getAttribute('src'),
        loaded: img.complete && img.naturalWidth > 0,
        inViewport: r.top < window.innerHeight && r.bottom > 0,
        opacity: getComputedStyle(img).opacity,
        visibility: getComputedStyle(img).visibility,
      };
    }, i);
    results[`${w}-${i + 1}`] = painted;
    console.log(w, i + 1, JSON.stringify(painted));
  }
  await context.close();
}

await browser.close();
process.exit(Object.values(results).every((r) => r.loaded && r.inViewport) ? 0 : 1);
