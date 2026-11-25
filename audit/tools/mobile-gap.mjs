/**
 * Mobile transition diagnostic.
 *   node audit/tools/mobile-gap.mjs [width height]
 * Walks the page in fixed scroll steps and measures how much of the viewport
 * (below the fixed header) is covered by real content — text, media, controls.
 * Blank runs longer than a third of a screen are reported with the section that
 * owns that scroll range, so the gap is located from evidence, not guessed.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
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

const argW = Number(process.argv[2]) || 0;
const argH = Number(process.argv[3]) || 0;
const VIEWPORTS = argW ? [[argW, argH || Math.round(argW * 2.16)]] : [
  [360, 800],
  [390, 844],
  [430, 932],
  [834, 1112],
];

const browser = await chromium.launch({ executablePath: await resolveChromium() });

for (const [w, h] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await sleep(3200);

  // Walk the page once so every ScrollTrigger and lazy image is awake.
  const height = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
      window.__ddScrollTo?.(y);
      await sleep(16);
    }
    window.__ddScrollTo?.(0);
    await sleep(400);
    return document.documentElement.scrollHeight;
  });
  await sleep(1200);

  const skeleton = await page.evaluate(() => {
    const secs = Array.from(document.querySelectorAll('main > section')).map((s) => {
      const r = s.getBoundingClientRect();
      const spacer = s.parentElement?.classList.contains('pin-spacer') ? s.parentElement : null;
      return {
        id: s.id || '(none)',
        top: Math.round(r.top + window.scrollY),
        height: Math.round(r.height),
        pinSpacer: spacer ? Math.round(spacer.getBoundingClientRect().height) : null,
        pinned: Boolean(spacer),
        marginTop: getComputedStyle(s).marginTop,
      };
    });
    return { total: document.documentElement.scrollHeight, secs };
  });

  const step = 60;
  const samples = [];
  for (let y = 0; y <= height - h; y += step) {
    const sample = await page.evaluate(
      async ({ y, step }) => {
        const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
        window.__ddScrollTo?.(y);
        await raf();
        await raf();

        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const HEADER = 96; // fixed header band, never counted as content
        const CELL = 8;
        const cols = Math.ceil(vw / CELL);
        const rows = Math.ceil((vh - HEADER) / CELL);
        const grid = new Uint8Array(cols * rows);

        const candidates = document.querySelectorAll(
          'p,h1,h2,h3,h4,h5,h6,li,img,video,button,svg,figure,blockquote,span,a,canvas'
        );
        const mark = (r) => {
          const top = Math.max(r.top, HEADER);
          const bottom = Math.min(r.bottom, vh);
          const left = Math.max(r.left, 0);
          const right = Math.min(r.right, vw);
          if (right <= left || bottom <= top) return;
          for (let cy = Math.floor((top - HEADER) / CELL); cy < Math.ceil((bottom - HEADER) / CELL); cy++) {
            for (let cx = Math.floor(left / CELL); cx < Math.ceil(right / CELL); cx++) {
              if (cy >= 0 && cy < rows && cx >= 0 && cx < cols) grid[cy * cols + cx] = 1;
            }
          }
        };

        for (const el of candidates) {
          if (el.closest('header') || el.closest('[aria-hidden="true"].pointer-events-none.fixed')) continue;
          const cs = getComputedStyle(el);
          if (cs.position === 'fixed' || cs.position === 'sticky') continue;
          if (el instanceof HTMLElement && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
          const text = el.childElementCount === 0 ? (el.textContent || '').trim() : '';
          const media = /^(IMG|VIDEO|SVG|CANVAS|BUTTON)$/.test(el.tagName);
          if (!text && !media) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) continue;
          mark(r);
        }

        let filled = 0;
        for (let i = 0; i < grid.length; i++) filled += grid[i];
        const coverage = filled / grid.length;

        // Which section owns the scroll position, and what is on screen.
        const secs = Array.from(document.querySelectorAll('main > section')).map((s) => {
          const r = s.getBoundingClientRect();
          return { id: s.id, top: Math.round(r.top), height: Math.round(r.height) };
        });
        const inView = secs.filter((s) => s.top < vh - 40 && s.top + s.height > 0).map((s) => s.id);
        return { y, coverage, inView, step };
      },
      { y, step }
    );
    samples.push(sample);
  }

  // Group blank samples into runs.
  const blankLimit = 0.006;
  const runs = [];
  let start = null;
  for (const s of samples) {
    if (s.coverage <= blankLimit) {
      if (!start) start = s;
    } else if (start) {
      runs.push([start, samples[samples.indexOf(s) - 1]]);
      start = null;
    }
  }
  if (start) runs.push([start, samples[samples.length - 1]]);

  const bigRuns = runs
    .map(([a, b]) => ({ from: a.y, to: b.y, px: b.y - a.y + step, screens: +((b.y - a.y + step) / h).toFixed(2), sections: a.inView }))
    .filter((r) => r.px >= h * 0.3);

  console.log(`\n=== ${w}x${h} — page ${height}px`);
  console.log('sections:', JSON.stringify(skeleton.secs));
  console.log('blank runs >= 0.3 screen:', JSON.stringify(bigRuns, null, 0));
  const blankPx = samples.filter((s) => s.coverage <= blankLimit).length * step;
  console.log(`blank total: ${blankPx}px of ${height}px (${((blankPx / height) * 100).toFixed(1)}%)`);
  await ctx.close();
}

await browser.close();
