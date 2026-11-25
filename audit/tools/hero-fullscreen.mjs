/**
 * Hero — full-viewport film audit.
 *   node audit/tools/hero-fullscreen.mjs
 * Verifies, at every required viewport, that the film covers the whole first
 * fold, the headline and controls sit inside it, and nothing overflows.
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

const VIEWPORTS = [
  [1920, 1080],
  [1440, 900],
  [1366, 768],
  [1280, 800],
  [1024, 768],
  [430, 932],
  [390, 844],
];

const browser = await chromium.launch({ executablePath: await resolveChromium() });
const report = {};

for (const [w, h] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/fetchPriority|fetchpriority/.test(m.text())) return; // pre-existing, Testimonials
    errors.push(m.text());
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(3600); // let the headline entrance finish

  const data = await page.evaluate(() => {
    const vp = { w: window.innerWidth, h: window.innerHeight };
    const hero = document.querySelector('#hero');
    const media = hero.querySelector('video, img');
    const h1 = hero.querySelector('h1');
    const label = hero.querySelector('#hero span');
    const intro = document.querySelector('#intro');
    const shell = hero.firstElementChild;
    const shellRect = shell.getBoundingClientRect();
    const shellStyle = getComputedStyle(shell);
    const mediaRect = media.getBoundingClientRect();
    const h1Rect = h1.getBoundingClientRect();
    const controls = Array.from(hero.querySelectorAll('button')).map((b) => {
      const r = b.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        label: b.getAttribute('aria-label'),
        inside: r.left >= -0.5 && r.top >= -0.5 && r.right <= vp.w + 0.5 && r.bottom <= vp.h + 0.5,
        visible: getComputedStyle(b).opacity !== '0' && getComputedStyle(b).visibility !== 'hidden',
        hittable: Boolean(hit && (hit === b || b.contains(hit))),
        size: [Math.round(r.width), Math.round(r.height)],
      };
    });
    const h1Style = getComputedStyle(h1);
    return {
      vp,
      heroHeight: Math.round(hero.getBoundingClientRect().height),
      heroTop: Math.round(hero.getBoundingClientRect().top),
      mediaTag: media.tagName,
      mediaBox: {
        x: Math.round(mediaRect.x),
        y: Math.round(mediaRect.y),
        w: Math.round(mediaRect.width),
        h: Math.round(mediaRect.height),
      },
      objectFit: getComputedStyle(media).objectFit,
      currentSrc: media.currentSrc || media.getAttribute('src') || '',
      headline: {
        text: h1.innerText.replace(/\s+/g, ' ').trim(),
        box: {
          top: Math.round(h1Rect.top),
          bottom: Math.round(h1Rect.bottom),
          left: Math.round(h1Rect.left),
          right: Math.round(h1Rect.right),
        },
        opacity: h1Style.opacity,
        visibility: h1Style.visibility,
        inViewport: h1Rect.top >= 0 && h1Rect.bottom <= vp.h && h1Rect.left >= 0 && h1Rect.right <= vp.w,
        wordOpacity: getComputedStyle(hero.querySelector('.hero-word-inner')).opacity,
      },
      labelText: label?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 24),
      controls,
      introTop: intro ? Math.round(intro.getBoundingClientRect().top) : null,
      overflowX: document.documentElement.scrollWidth - vp.w,
      pageHeight: document.documentElement.scrollHeight,
      fullscreenShell: Boolean(hero.firstElementChild?.classList.contains('absolute')),
      // The card frame: 5px in from left/right/bottom, flush to the top, with a
      // rounded bottom edge. The gaps are read from the shell's own rectangle so
      // padding, margin or a transform on the film cannot fake them.
      frame: {
        left: Math.round(shellRect.left),
        top: Math.round(shellRect.top),
        right: Math.round(vp.w - shellRect.right),
        bottom: Math.round(vp.h - shellRect.bottom),
        radiusBottom: shellStyle.borderBottomLeftRadius,
        radiusTop: shellStyle.borderTopLeftRadius,
        overflow: shellStyle.overflow,
      },
    };
  });

  const tag = `${w}x${h}`;
  if (data.heroHeight !== h) fail(`${tag}: hero height ${data.heroHeight}, viewport ${h}`);
  if (data.heroTop !== 0) fail(`${tag}: hero starts at ${data.heroTop}`);
  if (data.frame.left !== 5 || data.frame.right !== 5) {
    fail(`${tag}: side gap ${data.frame.left}/${data.frame.right}, want 5/5`);
  }
  if (data.frame.bottom !== 5) fail(`${tag}: bottom gap ${data.frame.bottom}, want 5`);
  if (data.frame.top !== 0) fail(`${tag}: top gap ${data.frame.top}, want 0`);
  const radiusAndOverflowOk =
    parseFloat(data.frame.radiusBottom) >= 12 &&
    parseFloat(data.frame.radiusTop) === 0 &&
    /hidden|clip/.test(data.frame.overflow);
  if (!radiusAndOverflowOk) {
    fail(`${tag}: frame radius ${data.frame.radiusTop}/${data.frame.radiusBottom} overflow ${data.frame.overflow}`);
  }
  if (data.mediaBox.x > 0 || data.mediaBox.y > 0 || data.mediaBox.x + data.mediaBox.w < w || data.mediaBox.y + data.mediaBox.h < h) {
    fail(`${tag}: film does not cover viewport ${JSON.stringify(data.mediaBox)}`);
  }
  if (data.objectFit !== 'cover') fail(`${tag}: object-fit ${data.objectFit}`);
  const wantPortrait = w <= 767;
  const expects = wantPortrait ? 'hero-mobile-portrait.mp4' : 'desi-draft-hero-16x9.mp4';
  if (!data.currentSrc.includes(expects)) fail(`${tag}: source ${data.currentSrc}`);
  if (!data.headline.inViewport) fail(`${tag}: headline outside viewport ${JSON.stringify(data.headline.box)}`);
  if (data.headline.visibility !== 'visible' || Number(data.headline.opacity) < 0.99) {
    fail(`${tag}: headline opacity ${data.headline.opacity} / ${data.headline.visibility}`);
  }
  // "we" and "make" are separate spans with a margin instead of a space, so the
  // concatenated innerText reads "wemake"; the words are still both present.
  if (!/we\s*make content for the new desi mainstream/i.test(data.headline.text)) {
    fail(`${tag}: headline copy "${data.headline.text}"`);
  }
  if (data.controls.length < 2) fail(`${tag}: only ${data.controls.length} controls`);
  data.controls.forEach((c) => {
    if (!c.inside) fail(`${tag}: control ${c.label} outside viewport`);
    if (!c.visible) fail(`${tag}: control ${c.label} hidden`);
    if (!c.hittable) fail(`${tag}: control ${c.label} covered`);
  });
  if (data.introTop !== null && data.introTop < h - 1) fail(`${tag}: intro overlaps the hero (${data.introTop} < ${h})`);
  if (data.overflowX > 0) fail(`${tag}: horizontal overflow ${data.overflowX}`);
  if (errors.length) fail(`${tag}: console → ${errors.slice(0, 2).join(' | ')}`);

  await page.screenshot({ path: path.join(FRAMES, `hero-full-${w}.png`) });
  report[tag] = {
    heroHeight: data.heroHeight,
    mediaBox: data.mediaBox,
    frame: data.frame,
    source: data.currentSrc.split('/').pop(),
    headline: data.headline.box,
    controls: data.controls.map((c) => `${c.label}${c.inside && c.hittable ? '' : '!'}`),
    introTop: data.introTop,
    overflowX: data.overflowX,
    pageHeight: data.pageHeight,
  };
  console.log(tag, JSON.stringify(report[tag]));
  await ctx.close();
}

// Reduced motion: still full-bleed, headline present, no entrance needed.
const rm = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const rmPage = await rm.newPage();
await rmPage.goto(BASE, { waitUntil: 'networkidle' });
await sleep(1200);
const rmData = await rmPage.evaluate(() => {
  const hero = document.querySelector('#hero');
  const media = hero.querySelector('video, img');
  const r = media.getBoundingClientRect();
  const h1 = hero.querySelector('h1');
  return {
    height: Math.round(hero.getBoundingClientRect().height),
    covers: r.left <= 0 && r.top <= 0 && r.right >= window.innerWidth && r.bottom >= window.innerHeight,
    headline: getComputedStyle(h1.querySelector('.hero-word-inner')).opacity,
    headlineBox: Math.round(h1.getBoundingClientRect().top),
  };
});
if (rmData.height !== 900) fail(`reduced: hero height ${rmData.height}`);
if (!rmData.covers) fail('reduced: film does not cover viewport');
if (Number(rmData.headline) < 0.99) fail(`reduced: headline opacity ${rmData.headline}`);
await rmPage.screenshot({ path: path.join(FRAMES, 'hero-full-1440-reduced.png') });
report.reduced = rmData;
await rm.close();

await browser.close();
await fs.writeFile(path.join(FRAMES, '..', 'hero-report.json'), JSON.stringify(report, null, 2));
console.log('\n' + (failures.length ? `FAILURES (${failures.length}):\n- ${failures.join('\n- ')}` : 'ALL HERO CHECKS PASSED'));
process.exit(failures.length ? 1 : 0);
