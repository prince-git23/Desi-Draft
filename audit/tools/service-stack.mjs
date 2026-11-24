/**
 * Mobile service deck check.
 *
 *   node audit/tools/service-stack.mjs
 *
 * At 430, 390, 360 and 320 (portrait) and 844×390 (landscape):
 *   - the accordion is gone and the deck is the only presentation mounted;
 *   - all five services are present with their own number, title, description,
 *     feature list and evidence link, and every photograph decoded;
 *   - nothing is clipped: the card is at least as tall as its content;
 *   - a horizontal drag sends the top card back, the indicator follows, and a
 *     tap on the evidence link navigates instead of turning the card;
 *   - a vertical wheel over the deck still scrolls the page;
 *   - the arrow keys cycle, and the hint is present.
 *
 * Reduced motion at 390: the deck is static and still readable.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = 'http://127.0.0.1:4174';
// Phones in portrait. 844×390 is a phone in landscape, where the width is past
// the deck's breakpoint: it is checked as the accordion instead, below.
const SIZES = [
  [430, 932],
  [390, 844],
  [360, 800],
  [320, 720],
];
const LANDSCAPE = [844, 390];

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

const probe = () => {
  const deck = document.querySelector('.stack');
  const cards = [...document.querySelectorAll('.stack .svc-card')];
  const topEl = document.querySelector('.stack-card[data-top]');
  const topCard = topEl?.querySelector('.svc-card');
  const body = topCard?.querySelector('.svc-card__body');
  const cardRect = topCard?.getBoundingClientRect();
  const bodyRect = body?.getBoundingClientRect();
  const link = topEl?.querySelector('.svc-card__link');
  return {
    accordion: document.querySelectorAll('.svc-acc').length,
    stacks: document.querySelectorAll('.stack').length,
    cards: cards.length,
    topCount: document.querySelectorAll('.stack-card[data-top]').length,
    top: topEl?.querySelector('.svc-card__number')?.textContent?.trim(),
    topTitle: topCard?.querySelector('.svc-card__title')?.textContent?.trim(),
    topDesc: topCard?.querySelector('.svc-card__desc')?.textContent?.trim(),
    topFeatures: topCard ? topCard.querySelectorAll('.svc-card__features li').length : 0,
    linkHref: link?.getAttribute('href'),
    linkH: link ? Math.round(link.getBoundingClientRect().height) : 0,
    cardH: cardRect ? Math.round(cardRect.height) : 0,
    contentH: topCard ? Math.round(topCard.scrollHeight) : 0,
    bodyInside: bodyRect && cardRect ? bodyRect.bottom <= cardRect.bottom + 1 : null,
    deckH: deck ? Math.round(deck.getBoundingClientRect().height) : 0,
    deckW: deck ? Math.round(deck.getBoundingClientRect().width) : 0,
    touchAction: topEl ? getComputedStyle(topEl).touchAction : null,
    pos: document.querySelector('.svc-stack__pos')?.textContent?.replace(/\s+/g, ' ').trim(),
    hint: document.querySelector('.svc-stack__hint')?.textContent?.trim(),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    images: cards.map((c) => {
      const img = c.querySelector('img');
      return { ok: !!img && img.complete && img.naturalWidth > 0, w: img?.naturalWidth ?? 0 };
    }),
    services: cards.map((c) => ({
      no: c.querySelector('.svc-card__number')?.textContent?.trim(),
      title: c.querySelector('.svc-card__title')?.textContent?.trim(),
      desc: c.querySelector('.svc-card__desc')?.textContent?.trim()?.slice(0, 40),
      features: c.querySelectorAll('.svc-card__features li').length,
      href: c.querySelector('.svc-card__link')?.getAttribute('href'),
    })),
  };
};

const cycle = async (page, width) => {
  const box = await page.locator('.stack-card[data-top]').boundingBox();
  const y = box.y + Math.min(box.height * 0.45, 180);
  await page.mouse.move(box.x + box.width * 0.5, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5 + 150, y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(900);
  void width;
};

for (const [W, H] of SIZES) {
  const page = await browser.newPage({
    viewport: { width: W, height: H },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.evaluate(() => document.getElementById('services')?.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(900);

  const before = await page.evaluate(probe);

  console.log(
    `\n=== ${W}x${H} accordion=${before.accordion} stacks=${before.stacks} cards=${before.cards} top=${before.top} "${before.topTitle}" ` +
      `card=${before.deckW}x${before.cardH} content=${before.contentH} overflow=${before.overflow} errors=${errors.length}`
  );
  console.log(`    features=${before.topFeatures} link=${before.linkHref} touch=${before.touchAction} pos="${before.pos}" hint="${before.hint}"`);

  if (before.accordion !== 0) fail(`${W}: the accordion is still mounted on a phone (${before.accordion})`);
  if (before.stacks !== 1) fail(`${W}: expected one deck, found ${before.stacks}`);
  if (before.cards !== 5) fail(`${W}: expected 5 service cards, found ${before.cards}`);
  if (before.topCount !== 1) fail(`${W}: ${before.topCount} cards claim to be on top`);
  if (before.overflow !== 0) fail(`${W}: horizontal overflow ${before.overflow}px`);
  if (before.hint !== 'Swipe to explore') fail(`${W}: swipe hint missing`);
  if (!/^01 \/ 05$/.test(before.pos ?? '')) fail(`${W}: position indicator reads "${before.pos}"`);
  if (before.touchAction !== 'pan-y') fail(`${W}: top card touch-action is ${before.touchAction}, vertical scroll may be blocked`);
  if (before.contentH > before.cardH + 1) fail(`${W}: card content ${before.contentH}px exceeds the ${before.cardH}px card`);
  if (before.bodyInside !== true) fail(`${W}: card copy spills past the card`);
  if (!before.linkHref || before.linkH < 28) fail(`${W}: evidence link missing or too small (${before.linkH}px)`);
  if (before.images.some((i) => !i.ok)) fail(`${W}: a service image failed to decode`);
  if (before.topFeatures < 6) fail(`${W}: top card shows ${before.topFeatures} features`);

  // Every service keeps its own real content.
  const expected = ['01', '02', '03', '04', '05'];
  const numbers = before.services.map((s) => s.no);
  if (numbers.join(',') !== expected.join(',')) fail(`${W}: service numbers are ${numbers.join(',')}`);
  if (before.services.some((s) => !s.title || !s.desc || s.features < 6 || !s.href))
    fail(`${W}: a service card lost its title, description, features or link`);
  console.log(`    services: ${before.services.map((s) => `${s.no} ${s.title} (${s.features}) → ${s.href}`).join(' | ')}`);

  await page.screenshot({ path: `audit/frames/stack-${W}x${H}.png` });
  await page.locator('.svc-stack').scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  await page.locator('.svc-stack').screenshot({ path: `audit/frames/stack-${W}x${H}-deck.png` });
  await page.evaluate(() => document.getElementById('services')?.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(600);

  // Drag the top card away: the next service must come forward.
  const topBefore = before.top;
  await cycle(page, W);
  const afterDrag = await page.evaluate(probe);
  console.log(`    drag → top ${topBefore} -> ${afterDrag.top}, pos "${afterDrag.pos}"`);
  if (afterDrag.top === topBefore) fail(`${W}: a 150px drag did not change the top card`);
  if (!afterDrag.pos?.startsWith(afterDrag.top)) fail(`${W}: indicator did not follow the new top card`);
  await page.screenshot({ path: `audit/frames/stack-${W}x${H}-cycled.png` });

  // A tap on the evidence link navigates; it must not be read as a card turn.
  await page.evaluate(() => {
    window.__svcClicks = 0;
    window.__svcTrap = (event) => {
      const link = event.target instanceof Element ? event.target.closest('.svc-card__link') : null;
      if (!link) return;
      window.__svcClicks += 1;
      event.preventDefault();
    };
    document.addEventListener('click', window.__svcTrap, true);
  });
  const link = page.locator('.stack-card[data-top] .svc-card__link');
  await link.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  const topPreLink = (await page.evaluate(probe)).top;
  await link.tap().catch(() => link.click());
  await page.waitForTimeout(600);
  const afterTap = await page.evaluate(probe);
  const clicks = await page.evaluate(() => window.__svcClicks);
  console.log(`    link tap → clicks=${clicks} top ${topPreLink} -> ${afterTap.top}`);
  if (clicks !== 1) fail(`${W}: the evidence link did not receive the tap (${clicks})`);
  if (afterTap.top !== topPreLink) fail(`${W}: tapping the evidence link turned the card`);

  // With the trap removed the same link is a real navigation.
  await page.evaluate(() => document.removeEventListener('click', window.__svcTrap, true));
  const href = await page.evaluate(() => document.querySelector('.stack-card[data-top] .svc-card__link')?.getAttribute('href'));
  await link.tap().catch(() => link.click());
  await page.waitForTimeout(900);
  const landed = new URL(page.url()).pathname;
  console.log(`    link navigates → ${landed}`);
  if (landed !== href) fail(`${W}: evidence link went to ${landed}, expected ${href}`);
  await page.goBack({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.evaluate(() => document.getElementById('services')?.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(600);

  // Vertical scrolling over the deck still moves the page.
  const box = await page.locator('.stack-card[data-top]').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.4);
  const y0 = await page.evaluate(() => scrollY);
  await page.mouse.wheel(0, 320);
  await page.waitForTimeout(600);
  const y1 = await page.evaluate(() => scrollY);
  console.log(`    wheel → ${Math.round(y0)} -> ${Math.round(y1)}`);
  if (!(y1 > y0)) fail(`${W}: a vertical wheel over the deck did not scroll the page`);

  // Keyboard: the deck takes focus and the arrow keys cycle it.
  await page.evaluate(() => document.querySelector('.stack')?.focus());
  const beforeKey = (await page.evaluate(probe)).top;
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(800);
  const afterKey = (await page.evaluate(probe)).top;
  console.log(`    keyboard → ${beforeKey} -> ${afterKey}`);
  if (afterKey === beforeKey) fail(`${W}: ArrowRight did not cycle the deck`);

  if (errors.length) fail(`${W}: console errors — ${errors.slice(0, 2).join(' / ')}`);
  await page.close();
}

// Landscape phone: 844 is past the breakpoint, so the accordion must be the one
// mounted there — and still fit.
{
  const [W, H] = LANDSCAPE;
  const page = await browser.newPage({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.getElementById('services')?.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(900);
  const info = await page.evaluate(() => ({
    accordion: document.querySelectorAll('.svc-acc').length,
    panels: document.querySelectorAll('.svc-acc__panel').length,
    stacks: document.querySelectorAll('.stack').length,
    open: document.querySelectorAll('.svc-acc__panel[data-open="true"]').length,
    bodyFits: (() => {
      const open = document.querySelector('.svc-acc__panel[data-open="true"]');
      if (!open) return null;
      const p = open.getBoundingClientRect();
      const b = open.querySelector('.svc-acc__body').getBoundingClientRect();
      return b.bottom <= p.bottom + 1;
    })(),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  await page.screenshot({ path: `audit/frames/stack-landscape-${W}x${H}.png` });
  console.log(`\n=== landscape ${W}x${H} accordion=${info.accordion} panels=${info.panels} deck=${info.stacks} overflow=${info.overflow}`);
  if (info.accordion !== 1 || info.panels !== 5) fail(`${W}x${H} landscape: the accordion is not the mounted gallery`);
  if (info.stacks !== 0) fail(`${W}x${H} landscape: the phone deck is mounted on a wide viewport`);
  if (info.open !== 1) fail(`${W}x${H} landscape: ${info.open} accordion panels open`);
  if (info.bodyFits !== true) fail(`${W}x${H} landscape: the open panel spills`);
  if (info.overflow !== 0) fail(`${W}x${H} landscape: horizontal overflow ${info.overflow}px`);
  if (errors.length) fail(`${W}x${H} landscape: console errors — ${errors[0]}`);
  await page.close();
}

// Reduced motion: static deck, still complete.
const rm = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await rm.emulateMedia({ reducedMotion: 'reduce' });
await rm.goto(BASE, { waitUntil: 'networkidle' });
await rm.evaluate(() => document.getElementById('services')?.scrollIntoView({ block: 'start' }));
await rm.waitForTimeout(900);
const rmA = await rm.evaluate(probe);
const rmRectA = await rm.locator('.stack-card[data-top]').boundingBox();
await rm.waitForTimeout(900);
const rmRectB = await rm.locator('.stack-card[data-top]').boundingBox();
await rm.screenshot({ path: 'audit/frames/stack-390x844-reduced.png' });
console.log(
  `\n=== reduced motion: cards=${rmA.cards} top=${rmA.top} moved=${Math.round(rmRectB.y - rmRectA.y)}px overflow=${rmA.overflow}`
);
if (rmA.cards !== 5) fail('reduced motion: deck is incomplete');
if (Math.abs(rmRectB.y - rmRectA.y) > 1) fail('reduced motion: the deck is still moving on its own');
await rm.close();

await browser.close();
console.log(failures ? `\n${failures} STACK FAILURE(S)` : '\nSERVICE STACK CLEAN');
process.exit(failures ? 1 : 0);
