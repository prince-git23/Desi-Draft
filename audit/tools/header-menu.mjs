/**
 * Header, Work menu and hero composition.
 *
 *   node audit/tools/header-menu.mjs
 *
 * Phones (390, 360, 430):
 *   - tap Work: the menu opens and is still open 1.5 s later (the old bug closed
 *     it again inside the same tap);
 *   - all project rows and the all-work CTA are present while it is open;
 *   - tapping a project navigates and the menu closes;
 *   - tapping Work again closes it; Escape closes it; a tap outside closes it;
 *   - the WhatsApp action is present, visible and points at wa.me.
 *
 * Desktop (1440): hover opens, leaving closes, click keeps it open.
 *
 * Every width: the hero headline is painted, sits below the header, and the
 * hero shell is a bounded region (560–900 px) rather than the whole viewport;
 * the portrait cut is the one fetched under 768, the widescreen master above.
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
let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.log(`FAIL  ${msg}`);
};

const menuState = (page) =>
  page.evaluate(() => {
    const el = document.getElementById('work-menu');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      open: el.getAttribute('aria-hidden') === 'false',
      opacity: Number(cs.opacity),
      rows: [...el.querySelectorAll('a')].map((a) => ({ href: a.getAttribute('href'), text: a.textContent.trim().slice(0, 24) })),
      expanded: document.querySelector('.work-burst')?.getAttribute('aria-expanded'),
      box: (() => {
        const b = el.getBoundingClientRect();
        return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom) };
      })(),
    };
  });

const heroState = (page) =>
  page.evaluate(() => {
    const sec = document.getElementById('hero');
    const shell = sec.querySelector(':scope > div');
    const h1 = sec.querySelector('h1');
    const head = h1.parentElement;
    const video = sec.querySelector('video');
    const img = sec.querySelector('img');
    const hb = head.getBoundingClientRect();
    const h1b = h1.getBoundingClientRect();
    const cs = getComputedStyle(h1);
    return {
      shellH: Math.round(shell.getBoundingClientRect().height),
      shellBottom: Math.round(shell.getBoundingClientRect().bottom),
      h1Top: Math.round(h1b.top),
      h1Bottom: Math.round(h1b.bottom),
      h1Visible: cs.visibility === 'visible' && Number(cs.opacity) > 0.9 && h1b.height > 10,
      headTop: Math.round(hb.top),
      fontSize: Math.round(parseFloat(cs.fontSize)),
      text: h1.textContent.replace(/\s+/g, ' ').trim(),
      // How far the first word is still pushed below its mask line, in px.
      wordShift: (() => {
        const tf = getComputedStyle(sec.querySelector('.hero-word-inner')).transform;
        return tf === 'none' ? 0 : Math.round(new DOMMatrixReadOnly(tf).m42);
      })(),
      // The portrait cut is chosen by orientation as well as width.
      portraitCut: window.matchMedia('(orientation: portrait), (max-width: 767px)').matches,
      src: (video?.currentSrc || img?.currentSrc || '').split('/').pop(),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      whatsapp: (() => {
        const btn = document.querySelector('header button[aria-label="Chat on WhatsApp"]');
        if (!btn) return null;
        const b = btn.getBoundingClientRect();
        return { visible: b.width > 10 && b.height > 10, right: Math.round(innerWidth - b.right) };
      })(),
    };
  });

const open_ = async (page) => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3200);
};

/* ---------------------------------------------------------------- phones --- */
for (const [W, H] of [
  [430, 932],
  [390, 844],
  [360, 800],
]) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await open_(page);

  const hero = await heroState(page);
  console.log(
    `\n=== ${W}x${H} hero: shell=${hero.shellH} h1=${hero.fontSize}px top=${hero.h1Top} bottom=${hero.h1Bottom} visible=${hero.h1Visible} src=${hero.src} overflow=${hero.overflow} wa=${JSON.stringify(hero.whatsapp)}`
  );
  if (!hero.h1Visible) fail(`${W}: the hero headline is not painted`);
  if (hero.shellH < 559 || hero.shellH > 901) fail(`${W}: hero is ${hero.shellH}px tall, outside 560–900`);
  if (hero.headTop < 72) fail(`${W}: the headline starts under the fixed header (${hero.headTop}px)`);
  if (hero.h1Bottom > hero.shellBottom) fail(`${W}: the headline runs past the hero shell`);
  if (hero.fontSize < 33 || hero.fontSize > 55) fail(`${W}: phone headline is ${hero.fontSize}px, outside 34–54`);
  if (!/9x16|portrait/i.test(hero.src)) fail(`${W}: phone fetched ${hero.src}, expected the portrait master`);
  if (hero.overflow !== 0) fail(`${W}: horizontal overflow ${hero.overflow}px`);
  if (!hero.whatsapp?.visible) fail(`${W}: the WhatsApp action is missing on a phone`);
  if (Number.isNaN(hero.whatsapp?.right)) fail(`${W}: the WhatsApp action has no box`);
  await page.screenshot({ path: `audit/frames/header-${W}-closed.png` });

  // Tap Work: open, then still open.
  await page.locator('.work-burst').tap();
  await page.waitForTimeout(700);
  const opened = await menuState(page);
  await page.screenshot({ path: `audit/frames/header-${W}-menu.png` });
  await page.waitForTimeout(1500);
  const later = await menuState(page);
  console.log(`    tap work: open=${opened.open} opacity=${opened.opacity} rows=${opened.rows.length} after 1.5s open=${later.open} opacity=${later.opacity}`);
  if (!opened.open) fail(`${W}: tapping Work did not open the menu`);
  if (!later.open) fail(`${W}: the menu closed itself 1.5s after opening`);
  if (later.opacity < 0.9) fail(`${W}: the menu never became visible (opacity ${later.opacity})`);
  if (later.rows.length < 4) fail(`${W}: the open menu shows ${later.rows.length} links, expected 3 projects + all work`);
  if (later.box.l < 0 || later.box.r > W + 1) fail(`${W}: the menu is outside the viewport`);
  if (later.expanded !== 'true') fail(`${W}: the trigger does not report aria-expanded=true`);

  // Tap a project: navigate, and the menu closes.
  const target = later.rows[0];
  await page.locator('#work-menu a').first().tap();
  await page.waitForTimeout(1200);
  const landed = new URL(page.url()).pathname;
  const afterNav = await menuState(page);
  console.log(`    project tap → ${landed} (expected ${target.href}) menu open=${afterNav.open}`);
  if (landed !== target.href) fail(`${W}: project tap went to ${landed}, expected ${target.href}`);
  if (afterNav.open) fail(`${W}: the menu stayed open after navigating`);

  // Back home, then: second tap closes, Escape closes, outside tap closes.
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2600);
  await page.locator('.work-burst').tap();
  await page.waitForTimeout(600);
  const opened2 = await menuState(page);
  await page.locator('.work-burst').tap();
  await page.waitForTimeout(600);
  const closed2 = await menuState(page);
  console.log(`    tap again: opened=${opened2.open} → closed=${closed2.open}`);
  if (!opened2.open) fail(`${W}: the second open attempt failed`);
  if (closed2.open) fail(`${W}: tapping Work again did not close the menu`);

  await page.locator('.work-burst').tap();
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const afterEsc = await menuState(page);
  const focusOnBurst = await page.evaluate(() => document.activeElement?.classList.contains('work-burst'));
  console.log(`    escape: open=${afterEsc.open} focus=${focusOnBurst}`);
  if (afterEsc.open) fail(`${W}: Escape did not close the menu`);
  if (!focusOnBurst) fail(`${W}: Escape did not return focus to the Work burst`);

  await page.locator('.work-burst').tap();
  await page.waitForTimeout(500);
  const beforeOutside = await menuState(page);
  await page.touchscreen.tap(W / 2, H - 60);
  await page.waitForTimeout(600);
  const afterOutside = await menuState(page);
  console.log(`    outside tap: opened=${beforeOutside.open} → open=${afterOutside.open}`);
  if (!beforeOutside.open) fail(`${W}: could not open the menu for the outside-tap check`);
  if (afterOutside.open) fail(`${W}: a tap outside did not close the menu`);

  if (errors.length) fail(`${W}: console errors — ${errors.slice(0, 2).join(' / ')}`);
  await page.close();
}

/* --------------------------------------------------------------- desktop --- */
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await open_(page);

  const hero = await heroState(page);
  console.log(
    `\n=== 1440x900 hero: shell=${hero.shellH} h1=${hero.fontSize}px visible=${hero.h1Visible} src=${hero.src} wa=${JSON.stringify(hero.whatsapp)}`
  );
  if (!hero.h1Visible) fail('1440: the hero headline is not painted');
  if (hero.shellH < 559 || hero.shellH > 901) fail(`1440: hero is ${hero.shellH}px tall`);
  if (hero.fontSize < 43 || hero.fontSize > 83) fail(`1440: headline is ${hero.fontSize}px, outside 44–82`);
  if (!/16x9/.test(hero.src)) fail(`1440: fetched ${hero.src}, expected the widescreen master`);
  if (hero.overflow !== 0) fail(`1440: horizontal overflow ${hero.overflow}px`);
  if (!hero.whatsapp?.visible) fail('1440: the desktop WhatsApp action is missing');

  await page.screenshot({ path: 'audit/frames/header-1440-closed.png' });

  await page.locator('.work-burst').hover();
  await page.waitForTimeout(700);
  const hovered = await menuState(page);
  await page.screenshot({ path: 'audit/frames/header-1440-menu.png' });
  await page.locator('#work-menu').hover();
  await page.waitForTimeout(400);
  const stillOpen = await menuState(page);
  await page.mouse.move(1200, 700);
  await page.waitForTimeout(700);
  const closed = await menuState(page);
  console.log(`    hover: open=${hovered.open} → over panel=${stillOpen.open} → away=${closed.open}`);
  if (!hovered.open) fail('1440: hovering Work did not open the menu');
  if (!stillOpen.open) fail('1440: the menu closed while the pointer was over it');
  if (closed.open) fail('1440: the menu did not close when the pointer left');

  // A click must not toggle a hover-opened menu shut: move in, click, and the
  // panel is still there under the pointer.
  await page.locator('.work-burst').click();
  await page.waitForTimeout(500);
  const clicked = await menuState(page);
  await page.locator('.work-burst').click();
  await page.waitForTimeout(500);
  const clickedTwice = await menuState(page);
  console.log(`    click: open=${clicked.open} | second click: open=${clickedTwice.open}`);
  if (!clicked.open) fail('1440: clicking Work did not leave the menu open');
  if (!clickedTwice.open) fail('1440: a second click closed a hover menu');

  // The WhatsApp dialog still carries the wa.me destination.
  await page.mouse.move(1200, 700);
  await page.waitForTimeout(500);
  await page.locator('header button[aria-label="Chat on WhatsApp"]').click();
  await page.waitForTimeout(700);
  const wa = await page.evaluate(() => {
    const a = [...document.querySelectorAll('a[href^="https://wa.me"]')].map((el) => el.getAttribute('href'));
    return { hrefs: [...new Set(a)], dialog: !!document.querySelector('[role="dialog"]') };
  });
  console.log(`    whatsapp: ${JSON.stringify(wa)}`);
  if (!wa.hrefs.includes('https://wa.me/919021513161')) fail('1440: the WhatsApp dialog lost the wa.me destination');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  if (errors.length) fail(`1440: console errors — ${errors.slice(0, 2).join(' / ')}`);
  await page.close();
}

/* ------------------------------------------------------- widths and motion --- */
for (const [W, H] of [
  [1920, 1080],
  [1600, 900],
  [1366, 768],
  [1280, 800],
  [1024, 768],
  [820, 900],
  [768, 1024],
  [320, 720],
]) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await open_(page);
  const hero = await heroState(page);
  console.log(
    `\n--- ${W}x${H} shell=${hero.shellH} h1=${hero.fontSize}px visible=${hero.h1Visible} top=${hero.h1Top} src=${hero.src} overflow=${hero.overflow}`
  );
  if (!hero.h1Visible) fail(`${W}: headline hidden`);
  if (hero.headTop <= 72) fail(`${W}: headline tucked under the header`);
  if (hero.overflow !== 0) fail(`${W}: overflow ${hero.overflow}px`);
  if (hero.shellH < 559 || hero.shellH > 901) fail(`${W}: hero ${hero.shellH}px`);
  const expectPortrait = hero.portraitCut;
  if (expectPortrait && !/9x16|portrait/i.test(hero.src)) fail(`${W}: portrait viewport fetched ${hero.src}`);
  if (!expectPortrait && !/16x9/.test(hero.src)) fail(`${W}: landscape viewport fetched ${hero.src}`);
  if (!hero.whatsapp?.visible) fail(`${W}: no WhatsApp action`);
  if (errors.length) fail(`${W}: console errors — ${errors[0]}`);
  await page.screenshot({ path: `audit/frames/header-${W}.jpg`, type: 'jpeg', quality: 68 });
  await page.close();
}

// Browser zoom. A 1440px window at N% zoom exposes 1440 / N CSS pixels, so
// these viewports are exactly what the same window shows at 75–150%.
for (const [zoom, W, H] of [
  ['75%', 1920, 1200],
  ['90%', 1600, 1000],
  ['100%', 1440, 900],
  ['110%', 1309, 819],
  ['125%', 1152, 720],
  ['150%', 960, 600],
]) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await open_(page);
  const hero = await heroState(page);
  await page.locator('.work-burst').hover();
  await page.waitForTimeout(600);
  const menu = await menuState(page);
  console.log(
    `\n--- zoom ${zoom} (${W}x${H} css) shell=${hero.shellH} h1=${hero.fontSize}px visible=${hero.h1Visible} menu=${menu.open} fits=${menu.box.r <= W + 1} overflow=${hero.overflow}`
  );
  if (!hero.h1Visible) fail(`zoom ${zoom}: headline hidden`);
  if (hero.overflow !== 0) fail(`zoom ${zoom}: overflow ${hero.overflow}px`);
  if (hero.shellH < 559 || hero.shellH > 901) fail(`zoom ${zoom}: hero ${hero.shellH}px`);
  if (!hero.whatsapp?.visible) fail(`zoom ${zoom}: WhatsApp hidden`);
  if (!menu.open) fail(`zoom ${zoom}: the Work menu did not open`);
  if (menu.box.r > W + 1 || menu.box.l < 0) fail(`zoom ${zoom}: the menu runs outside the viewport`);
  if (errors.length) fail(`zoom ${zoom}: console errors — ${errors[0]}`);
  await page.screenshot({ path: `audit/frames/zoom-${zoom.replace('%', '')}.jpg`, type: 'jpeg', quality: 66 });
  await page.close();
}

// Reduced motion: the type is settled and the film does not move.
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const hero = await heroState(page);
  const paused = await page.evaluate(() => document.querySelector('#hero video')?.paused ?? null);
  await page.screenshot({ path: 'audit/frames/header-1440-reduced.jpg', type: 'jpeg', quality: 68 });
  console.log(`\n=== reduced motion: visible=${hero.h1Visible} wordShift=${hero.wordShift}px videoPaused=${paused}`);
  if (!hero.h1Visible) fail('reduced motion: headline hidden');
  // Settled means the words are at their own baseline, not 112% below it.
  if (Math.abs(hero.wordShift) > 1) fail(`reduced motion: words still offset by ${hero.wordShift}px`);
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} HEADER FAILURE(S)` : '\nHEADER · HERO CLEAN');
process.exit(failures ? 1 : 0);
