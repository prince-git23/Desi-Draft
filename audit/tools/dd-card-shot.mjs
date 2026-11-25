/**
 * DD monogram in the card's foil mask — visual + computed-style check.
 *   node audit/tools/dd-card-shot.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const FRAMES = path.join(here, '..', 'frames');
const BASE = process.env.DD_URL || 'http://127.0.0.1:5183/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];

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

for (const [w, h, tag] of [
  [1440, 900, 'desk'],
  [390, 844, 'phone'],
  [320, 720, 'narrow'],
]) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: Number(process.env.DD_DPR || 2),
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.querySelector('#team')?.scrollIntoView({ block: 'start' }));
  await sleep(1400);

  const states = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('#team .profile-card'));
    return cards.map((card, i) => {
      const holo = card.querySelector('.profile-card__holo');
      const cs = getComputedStyle(holo);
      const mask = cs.maskImage || cs.webkitMaskImage || '';
      const tile = card.getBoundingClientRect();
      return {
        i,
        mask: mask.replace(/^url\("?/, '').replace(/"?\)$/, '').split('/').pop(),
        maskSize: cs.maskSize || cs.webkitMaskSize,
        maskRepeat: cs.maskRepeat || cs.webkitMaskRepeat,
        tile: [Math.round(tile.width), Math.round(tile.height)],
      };
    });
  });
  states.forEach((s) => {
    if (!s.mask.includes('holo-pattern-dd.png')) failures.push(`${tag} card${s.i + 1}: mask ${s.mask}`);
    if (!/180%/.test(s.maskSize)) failures.push(`${tag} card${s.i + 1}: mask-size ${s.maskSize}`);
  });

  await page.screenshot({ path: path.join(FRAMES, `dd-team-${tag}.png`) });

  const first = page.locator('#team .profile-card').first();
  await first.screenshot({ path: path.join(FRAMES, `dd-card-${tag}-rest.png`) });

  // Tilt to the top-right: the mask slides, so the monogram must stay inside.
  const box = await first.boundingBox();
  await page.mouse.move(box.x + box.width - 12, box.y + 14);
  await sleep(700);
  await first.screenshot({ path: path.join(FRAMES, `dd-card-${tag}-hover-tr.png`) });

  // Opposite corner: reveal the other copies of the mark.
  await page.mouse.move(box.x + 10, box.y + box.height - 12);
  await sleep(700);
  await first.screenshot({ path: path.join(FRAMES, `dd-card-${tag}-hover-bl.png`) });

  const overflow = await page.evaluate(() => {
    const card = document.querySelector('#team .profile-card');
    const tile = card.querySelector('.profile-card__tile').getBoundingClientRect();
    const body = card.querySelector('.profile-card__body').getBoundingClientRect();
    return {
      tileInsideBody: tile.top >= body.top - 1 && tile.bottom <= body.bottom + 1 && tile.left >= body.left - 1,
      pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  if (!overflow.tileInsideBody) failures.push(`${tag}: tile escapes its frame`);
  if (overflow.pageOverflow > 0) failures.push(`${tag}: horizontal overflow ${overflow.pageOverflow}`);

  console.log(tag, JSON.stringify(states[0]), JSON.stringify(overflow));
  await ctx.close();
}

await browser.close();
console.log(failures.length ? `FAILURES:\n- ${failures.join('\n- ')}` : 'DD MASK CHECKS PASSED');
process.exit(failures.length ? 1 : 0);
