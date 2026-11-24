/**
 * Five-pillar section check.
 *
 *   node audit/tools/pillars.mjs
 *
 * 1920 / 1440 / 1280 / 1024 — the fan: five overlapping cards, no card leaving
 * the section or the viewport, and hover separating the row outwards.
 *
 * 1000 / 768 — the strip: five cards, swipeable, tap selects, a vertical wheel
 * over it still scrolls the page.
 *
 * 430 / 390 / 360 / 320 — the phone run: copies fill the track, the drift stays
 * inside one copy, and a pointer over it freezes the motion.
 *
 * Reduced motion at 390: one static copy, reachable by hand.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = 'http://127.0.0.1:4174';
const base = path.join(process.env.LOCALAPPDATA, 'ms-playwright');
const dirs = (await fs.readdir(base)).filter((d) => d.startsWith('chromium')).sort().reverse();
let exe = null;
for (const d of dirs) {
  const p = path.join(base, d, 'chrome-win64', 'chrome.exe');
  if (await fs.access(p).then(() => 1, () => 0)) {
    exe = p;
    break;
  }
}

const browser = await chromium.launch({ executablePath: exe });
const widths = [
  [1920, 1080],
  [1440, 900],
  [1280, 800],
  [1024, 768],
  [1000, 800],
  [768, 1024],
  [430, 932],
  [390, 844],
  [360, 800],
  [320, 720],
];

const probe = () => {
  const section = document.getElementById('manifesto');
  const marquee = section?.querySelector('.pillars-marquee');
  const track = section?.querySelector('.pillars-track');
  const first = section?.querySelector('.pillars-set') ?? section?.querySelector('.pillars');
  const holder = section?.querySelector('.pillars[data-mode]') ?? marquee;
  const heading = section?.querySelector('.mf-heading');
  const cards = first ? [...first.querySelectorAll('.pillar')] : [];
  const rects = cards.map((el) => el.getBoundingClientRect());
  const sec = section.getBoundingClientRect();
  const tf = track ? getComputedStyle(track).transform : 'none';
  const tx = tf === 'none' ? 0 : Math.round(new DOMMatrixReadOnly(tf).m41 * 10) / 10;
  return {
    mode: holder?.getAttribute('data-mode') ?? null,
    sectionH: Math.round(section.offsetHeight),
    gapHeading:
      heading && rects.length
        ? Math.round(rects[0].top + scrollY - (heading.getBoundingClientRect().bottom + scrollY))
        : null,
    cardW: rects.length ? Math.round(rects[0].width) : 0,
    cardH: rects.length ? Math.round(rects[0].height) : 0,
    cards: cards.length,
    copies: section ? section.querySelectorAll('.pillars-set').length : 0,
    unit: track ? Math.round(track.firstElementChild?.getBoundingClientRect().width ?? 0) : 0,
    trackW: track ? Math.round(track.getBoundingClientRect().width) : 0,
    tx,
    reachableW: holder ? Math.round(holder.scrollWidth) : 0,
    holderW: holder ? Math.round(holder.clientWidth) : 0,
    pageOverflow: Math.round(document.documentElement.scrollWidth - document.documentElement.clientWidth),
    outOfViewport: rects.filter((r) => r.left < -1 || r.right > innerWidth + 1).length,
    outOfSectionH: rects.filter((r) => r.top < sec.top - 1 || r.bottom > sec.bottom + 1).length,
    rects: rects.map((r) => ({ l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top) })),
  };
};

const go = async (page) => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  await page.evaluate(() => {
    const el = document.getElementById('manifesto');
    window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 90);
  });
  await page.waitForTimeout(900);
};

const fails = [];
const fail = (w, msg) => fails.push(`${w}: ${msg}`);

for (const [w, h] of widths) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: w < 1024, isMobile: w < 768 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await go(page);

  const before = await page.evaluate(probe);
  await page.screenshot({ path: `audit/frames/pillars-${w}.png` });

  let motion = null;
  let paused = null;
  let hovered = null;
  let strip = null;

  if (before.mode === 'marquee') {
    const t0 = await page.evaluate(probe);
    await page.waitForTimeout(1200);
    const t1 = await page.evaluate(probe);
    motion = {
      from: t0.tx,
      to: t1.tx,
      moved: Math.round(t1.tx - t0.tx),
      within: t1.tx >= -before.unit - 1 && t1.tx <= 1,
    };

    const box = await page.locator('.pillars-marquee').boundingBox();
    await page.mouse.move(box.x + Math.min(box.width, w) / 2, box.y + box.height / 2);
    await page.waitForTimeout(500);
    const p0 = await page.evaluate(probe);
    await page.waitForTimeout(700);
    const p1 = await page.evaluate(probe);
    paused = { from: p0.tx, to: p1.tx, still: Math.abs(p1.tx - p0.tx) < 0.6 };
    await page.mouse.move(4, 4);
    await page.screenshot({ path: `audit/frames/pillars-${w}-paused.png` });

    if (before.cards !== 5) fail(w, `run shows ${before.cards} cards in the first copy, expected 5`);
    if (before.copies < 2) fail(w, `run has ${before.copies} copy, so the loop has a bare stretch`);
    if (before.pageOverflow !== 0) fail(w, `page overflows horizontally by ${before.pageOverflow}px`);
    if (before.unit * before.copies !== before.trackW) fail(w, `track ${before.trackW}px is not ${before.copies}× the ${before.unit}px copy`);
    if (motion.moved > -10) fail(w, `track did not drift (${motion.moved}px in 1.2s)`);
    if (!motion.within) fail(w, `track left its loop range (x=${motion.to}, copy=${before.unit})`);
    if (!paused.still) fail(w, `pointer did not pause the run (moved ${Math.round(paused.to - paused.from)}px)`);
    if (before.outOfSectionH) fail(w, `${before.outOfSectionH} card(s) below/above the section`);
  } else if (before.mode === 'strip') {
    const box = await page.locator('.pillars').boundingBox();
    await page.locator('.pillar').nth(2).tap();
    await page.waitForTimeout(400);
    const tapped = await page.evaluate(() => ({
      pressed: document.querySelectorAll('.pillar')[2].getAttribute('aria-pressed'),
      active: document.querySelectorAll('.pillar')[2].getAttribute('data-active'),
    }));

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const y0 = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, 320);
    await page.waitForTimeout(500);
    const y1 = await page.evaluate(() => scrollY);
    strip = {
      tapped,
      scroll: { before: Math.round(y0), after: Math.round(y1), moved: y1 > y0 },
      scrollable: before.reachableW > before.holderW + 1,
    };
    await page.screenshot({ path: `audit/frames/pillars-${w}-tap.png` });

    if (before.cards !== 5) fail(w, `strip shows ${before.cards} cards, expected 5`);
    if (!strip.scrollable) fail(w, 'strip is not swipeable, so cards 4–5 are unreachable');
    if (tapped.pressed !== 'true') fail(w, 'tap did not select the card');
    if (!strip.scroll.moved) fail(w, 'a wheel over the strip did not scroll the page');
    if (before.pageOverflow !== 0) fail(w, `page overflows horizontally by ${before.pageOverflow}px`);
  } else {
    // Fan: the row opens outwards from the hovered card and never escapes.
    await page.locator('.pillar').nth(2).hover({ force: true });
    await page.waitForTimeout(800);
    const after = await page.evaluate(probe);
    hovered = {
      leftMoved: after.rects[0].l - before.rects[0].l,
      rightMoved: after.rects[4].r - before.rects[4].r,
      centreLift: after.rects[2].t - before.rects[2].t,
      outAfter: after.outOfViewport,
    };
    await page.screenshot({ path: `audit/frames/pillars-${w}-hover.png` });
    await page.mouse.move(4, 4);

    if (before.cards !== 5) fail(w, `fan shows ${before.cards} cards, expected 5`);
    if (before.pageOverflow !== 0) fail(w, `page overflows horizontally by ${before.pageOverflow}px`);
    if (before.outOfViewport) fail(w, `${before.outOfViewport} card(s) outside the viewport at rest`);
    if (before.outOfSectionH) fail(w, `${before.outOfSectionH} card(s) below/above the section`);
    if (hovered.leftMoved >= 0 || hovered.rightMoved <= 0) fail(w, `hover did not separate the row (${hovered.leftMoved}/${hovered.rightMoved})`);
    if (hovered.centreLift >= 0) fail(w, 'the hovered card did not lift');
    if (hovered.outAfter) fail(w, `${hovered.outAfter} card(s) left the viewport while separated`);
  }

  if (errors.length) fail(w, `console errors: ${errors.join(' | ')}`);

  console.log(
    `\n=== ${w}x${h} mode=${before.mode} cards=${before.cards} copies=${before.copies} card=${before.cardW}x${before.cardH} sectionH=${before.sectionH} gap=${before.gapHeading}`
  );
  console.log(
    `    unit=${before.unit} track=${before.trackW} overflow=${before.pageOverflow} out=${before.outOfViewport} reach=${before.reachableW}/${before.holderW} errors=${errors.length}`
  );
  if (motion) console.log(`    drift: ${motion.from} -> ${motion.to} (${motion.moved}px / 1.2s) within=${motion.within}`);
  if (paused) console.log(`    pointer: ${paused.from} -> ${paused.to} still=${paused.still}`);
  if (hovered) console.log(`    hover: ${JSON.stringify(hovered)}`);
  if (strip) console.log(`    strip: ${JSON.stringify(strip)}`);
  await page.close();
}

// Reduced motion at phone width: static, one copy, all five reachable.
const rm = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', hasTouch: true, isMobile: true });
await go(rm);
const rm0 = await rm.evaluate(probe);
await rm.waitForTimeout(900);
const rm1 = await rm.evaluate(probe);
await rm.screenshot({ path: 'audit/frames/pillars-390-reduced.png' });
await rm.close();
await browser.close();

console.log(
  `\n=== reduced motion: mode=${rm0.mode} cards=${rm0.cards} copies=${rm0.copies} x=${rm0.tx}->${rm1.tx} reach=${rm0.reachableW}/${rm0.holderW} overflow=${rm0.pageOverflow}`
);
if (rm0.mode !== 'marquee') fail('rm', `reduced motion on a phone rendered ${rm0.mode}`);
if (rm0.copies !== 1) fail('rm', `reduced motion rendered ${rm0.copies} copies, expected 1`);
if (rm0.cards !== 5) fail('rm', `reduced motion shows ${rm0.cards} cards, expected 5`);
if (Math.abs(rm1.tx - rm0.tx) > 0.6) fail('rm', `reduced motion still moves (${rm0.tx} -> ${rm1.tx})`);
if (rm0.reachableW <= rm0.holderW) fail('rm', 'reduced motion has no way to reach the five cards');

if (fails.length) {
  console.log(`\nPILLARS FAILED\n - ${fails.join('\n - ')}`);
  process.exit(1);
}
console.log('\nPILLARS CLEAN');
