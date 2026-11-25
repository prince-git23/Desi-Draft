/**
 * Frame probe for the intro → manifesto hand-off.
 *   node audit/tools/probe-intro.mjs [width height] [label]
 */
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

const w = Number(process.argv[2]) || 390;
const h = Number(process.argv[3]) || 844;
const label = process.argv[4] || `${w}`;

const browser = await chromium.launch({ executablePath: await resolveChromium() });
const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: 'networkidle' });
await sleep(3200);

const geo = await page.evaluate(() => {
  const intro = document.querySelector('#intro');
  const spacer = intro.parentElement;
  const r = (el) => {
    const b = el.getBoundingClientRect();
    return { top: Math.round(b.top + window.scrollY), height: Math.round(b.height) };
  };
  return {
    intro: r(intro),
    spacer: spacer?.classList.contains('pin-spacer') ? r(spacer) : null,
    manifesto: r(document.querySelector('#manifesto')),
    vh: window.innerHeight,
    svh: document.documentElement.style.height,
  };
});
console.log('geometry', JSON.stringify(geo));

const tops = [geo.intro.top, ...Array.from({ length: 13 }, (_, i) => Math.round(geo.intro.top + ((geo.spacer?.height ?? h) * (i + 1)) / 14))];
for (const y of tops) {
  await page.evaluate(async (y) => {
    const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
    window.__ddScrollTo?.(y);
    await raf();
    await raf();
  }, y);
  await sleep(120);
  const info = await page.evaluate(() => {
    const vh = window.innerHeight;
    const frag = [];
    document.querySelectorAll('#intro .display, #intro .intro-char, #manifesto h2').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.bottom > 0 && r.top < vh && r.width > 1) {
        const t = (el.textContent || '').trim();
        if (t) frag.push(`${el.className.split(' ')[0]}:${Math.round(r.left)}..${Math.round(r.right)}`);
      }
    });
    return frag.slice(0, 3).join(' | ');
  });
  await page.screenshot({ path: path.join(FRAMES, `probe-${label}-${y}.png`) });
  console.log(y, info);
}
await ctx.close();
await browser.close();
