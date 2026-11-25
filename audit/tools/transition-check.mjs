/**
 * Intro → manifesto hand-off check.
 *   node audit/tools/transition-check.mjs
 * Verifies the phone pin is short and fully used, the manifesto heading lands
 * below the travelling sentence instead of on top of it, the pin is rebuilt (not
 * duplicated) when the breakpoint changes, and reduced motion skips the pin.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.DD_URL || 'http://127.0.0.1:5183/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const fail = (m) => failures.push(m);

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

const probe = () =>
  page.evaluate(() => {
    const intro = document.querySelector('#intro');
    const spacer = intro.parentElement;
    const line = intro.querySelector('.display');
    const heading = document.querySelector('#manifesto .mf-heading');
    const scrolled = window.scrollY;
    const rel = (el) => {
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom) };
    };
    const lineR = line.getBoundingClientRect();
    return {
      scrollY: Math.round(scrolled),
      spacerHeight: spacer?.classList.contains('pin-spacer')
        ? Math.round(spacer.getBoundingClientRect().height)
        : null,
      pinSpacers: document.querySelectorAll('main .pin-spacer').length,
      introHeight: Math.round(intro.getBoundingClientRect().height),
      line: {
        left: Math.round(lineR.left),
        right: Math.round(lineR.right),
        top: Math.round(lineR.top),
        bottom: Math.round(lineR.bottom),
      },
      heading: rel(heading),
      progress:
        spacer?.classList.contains('pin-spacer')
          ? Math.round(
              ((window.scrollY) / (spacer.getBoundingClientRect().height - intro.getBoundingClientRect().height)) * 100
            ) / 100
          : null,
    };
  });

const browser = await chromium.launch({ executablePath: await resolveChromium() });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: 'networkidle' });
await sleep(3200);

const setScroll = async (y) => {
  await page.evaluate(async (y) => {
    const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
    window.__ddScrollTo?.(y);
    await raf();
    await raf();
    await raf();
  }, y);
  await sleep(80);
};

const geo = await page.evaluate(() => {
  const intro = document.querySelector('#intro');
  const spacer = intro.parentElement;
  return {
    introTop: Math.round(intro.getBoundingClientRect().top + window.scrollY),
    introHeight: Math.round(intro.getBoundingClientRect().height),
    spacerHeight: Math.round(spacer.getBoundingClientRect().height),
    vh: window.innerHeight,
  };
});
const pin = geo.spacerHeight - geo.introHeight;
console.log('390 geometry', JSON.stringify(geo), 'pin', pin);

// Phone pin: 60% of the viewport, short enough to hand over quickly.
if (Math.abs(pin - Math.round(geo.vh * 0.6)) > 6) fail(`phone pin ${pin}px, want ~${Math.round(geo.vh * 0.6)}`);
if (geo.introHeight !== geo.vh) fail(`phone intro height ${geo.introHeight}, want ${geo.vh}`);

// The lead copy is still the first thing after the film, and still paced out
// before the fixed header can reach it — the refactor moved this tween into the
// breakpoint context, so it is re-checked here.
await setScroll(400);
const leadIn = await page.evaluate(() => {
  const p = document.querySelector('#intro p');
  return { opacity: Number(getComputedStyle(p).opacity), top: Math.round(p.getBoundingClientRect().top) };
});
if (leadIn.opacity < 0.9) fail(`lead copy hidden after the hero (opacity ${leadIn.opacity})`);
await setScroll(geo.introTop + 60);
const leadOut = await page.evaluate(() => Number(getComputedStyle(document.querySelector('#intro p')).opacity));
if (leadOut > 0.05) fail(`lead copy still visible at the pin (opacity ${leadOut})`);
console.log('lead copy', JSON.stringify({ in: leadIn, out: leadOut }));

let minHeadingTop = Infinity;
let overlap = null;
for (let i = 0; i <= 10; i++) {
  const y = geo.introTop + Math.round((pin * i) / 10);
  await setScroll(y);
  const s = await probe();
  // Sentence gone at the end of the pin: no glyph may remain on screen.
  if (i === 10 && s.line.right > 0) fail(`sentence still on screen at pin end (right ${s.line.right})`);
  // Halfway through the pin the sentence must still be crossing.
  if (i === 5 && s.line.right < 80) fail(`sentence already gone at mid pin (right ${s.line.right})`);
  if (s.heading.top < s.line.bottom - 4) {
    overlap = { y, headingTop: s.heading.top, lineBottom: s.line.bottom };
  }
  minHeadingTop = Math.min(minHeadingTop, s.heading.top);
  if (i === 10) {
    if (s.heading.top > geo.vh * 0.9) fail(`manifesto heading still off screen at pin end (${s.heading.top})`);
    console.log('pin end', JSON.stringify({ heading: s.heading, line: s.line, progress: s.progress }));
  }
}
if (overlap) fail(`manifesto heading collides with the sentence: ${JSON.stringify(overlap)}`);

// The pin's last frame must already show the next section, not bare cream.
await setScroll(geo.introTop + pin);
const atRelease = await probe();
if (atRelease.heading.top > geo.vh) fail('manifesto not in view when the pin releases');

// Rebuilding across breakpoints: no stacked pin spacers, one intro pin only.
const widths = [
  [390, 844, 0.6],
  [1440, 900, 1.65],
  [360, 800, 0.6],
  [834, 1112, 1.65],
  [390, 844, 0.6],
];
for (const [w, h, ratio] of widths) {
  await page.setViewportSize({ width: w, height: h });
  await page.evaluate(() => window.__ddScrollTo?.(0));
  await sleep(900);
  const s = await page.evaluate(() => {
    const intro = document.querySelector('#intro');
    const spacer = intro.parentElement;
    return {
      spacers: document.querySelectorAll('.pin-spacer').length,
      introSpacers: document.querySelectorAll('#intro').length,
      height: Math.round(spacer.getBoundingClientRect().height),
      introHeight: Math.round(intro.getBoundingClientRect().height),
      vh: window.innerHeight,
    };
  });
  const want = s.introHeight + Math.round(s.vh * ratio);
  console.log(`${w}x${h}`, JSON.stringify(s), 'want spacer', want);
  if (s.spacers !== 1) fail(`${w}x${h}: ${s.spacers} pin spacers (duplicate ScrollTrigger)`);
  if (Math.abs(s.height - want) > 8) fail(`${w}x${h}: spacer ${s.height}, want ~${want}`);
}

// Reduced motion: no pin, no pull, manifesto directly after the intro.
const rm = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
const rmPage = await rm.newPage();
await rmPage.goto(BASE, { waitUntil: 'networkidle' });
await sleep(1200);
const rmState = await rmPage.evaluate(() => {
  const intro = document.querySelector('#intro');
  const man = document.querySelector('#manifesto');
  return {
    spacers: document.querySelectorAll('.pin-spacer').length,
    introBottom: Math.round(intro.getBoundingClientRect().bottom + window.scrollY),
    manTop: Math.round(man.getBoundingClientRect().top + window.scrollY),
    margin: getComputedStyle(man).marginTop,
  };
});
console.log('reduced', JSON.stringify(rmState));
if (rmState.spacers !== 0) fail(`reduced: ${rmState.spacers} pin spacers`);
if (rmState.manTop !== rmState.introBottom) fail(`reduced: manifesto starts ${rmState.manTop} but intro ends ${rmState.introBottom}`);
await rmPage.screenshot({ path: path.join(here, '..', 'frames', 'transition-reduced-390.png') });
await rm.close();

await browser.close();
console.log('\n' + (failures.length ? `FAILURES (${failures.length}):\n- ${failures.join('\n- ')}` : 'ALL TRANSITION CHECKS PASSED'));
process.exit(failures.length ? 1 : 0);
