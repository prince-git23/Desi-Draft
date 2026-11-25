/**
 * Team cards verification — four holographic ProfileCards.
 *   node audit/tools/team-cards.mjs   (dev or preview server on DD_URL)
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
  const dirs = entries.filter((d) => d.startsWith('chromium-')).sort().reverse();
  for (const d of dirs) {
    for (const sub of ['chrome-win64', 'chrome-win', 'chrome-linux64', 'chrome-linux']) {
      for (const bin of ['chrome.exe', 'chrome']) {
        const p = path.join(base, d, sub, bin);
        if (await fs.access(p).then(() => true, () => false)) return p;
      }
    }
  }
  return null;
}

const EXPECTED = [
  { name: 'Ashlee', title: 'Founder / Strategist', handle: 'chilly.potatooo', url: 'https://www.instagram.com/chilly.potatooo/', img: 'ashlee.webp' },
  { name: 'Riddhi', title: 'Coordinator / Insight Planner', handle: 'xoxo._.rii_', url: 'https://www.instagram.com/xoxo._.rii_/', img: 'riddhi.webp' },
  { name: 'Aastha', title: 'Coordinator / Operations Lead', handle: 'aastha.r07', url: 'https://www.instagram.com/aastha.r07/', img: 'aastha.webp' },
  { name: 'Prince', title: 'Editor / Developer', handle: 'idiotic_.prince', url: 'https://www.instagram.com/idiotic_.prince/', img: 'prince.webp' },
];

const VIEWPORTS = [
  { w: 1920, h: 1080, tag: '1920' },
  { w: 1440, h: 900, tag: '1440' },
  { w: 1366, h: 768, tag: '1366' },
  { w: 1280, h: 800, tag: '1280' },
  { w: 1024, h: 768, tag: '1024' },
  { w: 820, h: 900, tag: '820' },
  { w: 768, h: 1024, tag: '768' },
  { w: 430, h: 932, tag: '430' },
  { w: 390, h: 844, tag: '390' },
  { w: 360, h: 800, tag: '360' },
  { w: 320, h: 720, tag: '320' },
];

const browser = await chromium.launch({ executablePath: await resolveChromium() });

const report = {};

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  // KineticTestimonials (elsewhere on the page) passes fetchPriority to an img
  // through React 18, which logs a warning. Not this section's, and pre-existing.
  const unrelated = (text) => text.includes('fetchPriority') || text.includes('fetchpriority');
  page.on('console', (m) => m.type() === 'error' && !unrelated(m.text()) && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.querySelector('#team')?.scrollIntoView({ block: 'start' }));
  await sleep(1600);

  const data = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('#team .profile-card'));
    return {
      count: cards.length,
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      cols: (() => {
        const grid = document.querySelector('#team .grid');
        return grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0;
      })(),
      cards: cards.map((card) => {
        const rect = card.getBoundingClientRect();
        const img = card.querySelector('.profile-card__photo');
        const link = card.querySelector('.profile-card__contact');
        const handle = card.querySelector('.profile-card__handle');
        const btn = link?.getBoundingClientRect();
        return {
          name: card.querySelector('.profile-card__name')?.textContent,
          title: card.querySelector('.profile-card__title')?.textContent,
          handle: handle?.textContent,
          href: link?.getAttribute('href'),
          target: link?.getAttribute('target'),
          rel: link?.getAttribute('rel'),
          aria: link?.getAttribute('aria-label'),
          tag: link?.tagName,
          img: img?.getAttribute('src'),
          imgOk: Boolean(img && img.complete && img.naturalWidth > 0),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
          btnInside: btn ? btn.right <= rect.right + 0.5 && btn.bottom <= rect.bottom + 0.5 : false,
          handleClipped: handle ? handle.scrollWidth > handle.clientWidth + 1 : true,
          spotlight: getComputedStyle(card.querySelector('.profile-card__holo')).maskImage !== 'none',
        };
      }),
    };
  });

  if (data.count !== 4) fail(`${vp.tag}: ${data.count} cards, expected 4`);
  if (data.overflowX > 0) fail(`${vp.tag}: horizontal overflow ${data.overflowX}px`);
  const expectCols = vp.w >= 1280 ? 4 : vp.w >= 640 ? 2 : 1;
  if (data.cols !== expectCols) fail(`${vp.tag}: ${data.cols} columns, expected ${expectCols}`);
  data.cards.forEach((card, i) => {
    const want = EXPECTED[i];
    if (!want) return;
    if (card.name !== want.name) fail(`${vp.tag}: card ${i} name ${card.name}`);
    if (card.title !== want.title) fail(`${vp.tag}: ${want.name} title ${card.title}`);
    if (card.handle !== `@${want.handle}`) fail(`${vp.tag}: ${want.name} handle ${card.handle}`);
    if (card.href !== want.url) fail(`${vp.tag}: ${want.name} href ${card.href}`);
    if (card.target !== '_blank' || !card.rel?.includes('noopener')) fail(`${vp.tag}: ${want.name} link target/rel`);
    if (card.aria !== `View ${want.name} on Instagram`) fail(`${vp.tag}: ${want.name} aria ${card.aria}`);
    if (!card.img?.endsWith(want.img)) fail(`${vp.tag}: ${want.name} img ${card.img}`);
    if (!card.imgOk) fail(`${vp.tag}: ${want.name} image failed to load`);
    if (!card.btnInside) fail(`${vp.tag}: ${want.name} contact button outside card`);
    if (card.handleClipped) fail(`${vp.tag}: ${want.name} handle clipped`);
    if (!card.spotlight) fail(`${vp.tag}: ${want.name} foil mask missing`);
  });
  if (errors.length) fail(`${vp.tag}: console errors → ${errors.slice(0, 3).join(' | ')}`);

  const shots = [];
  if (['1440', '768', '390', '320'].includes(vp.tag)) {
    const team = await page.$('#team');
    await team.screenshot({ path: path.join(FRAMES, `team-${vp.tag}.png`) });
    shots.push(`team-${vp.tag}.png`);
  }
  if (['1440', '390'].includes(vp.tag)) {
    const card = await page.$('#team .profile-card');
    const box = await card.boundingBox();
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.2);
    await sleep(120);
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.35, { steps: 12 });
    await sleep(600);
    await page.screenshot({ path: path.join(FRAMES, `team-${vp.tag}-hover.png`) });
    shots.push(`team-${vp.tag}-hover.png`);
    // release the pointer: the card must settle back to rest
    await page.mouse.move(2, 2);
    await sleep(2400);
    const settled = await page.evaluate(() => {
      const card = document.querySelector('#team .profile-card');
      const s = getComputedStyle(card);
      return { rx: s.getPropertyValue('--pc-rotate-x').trim(), active: s.getPropertyValue('--pc-active').trim() };
    });
    if (Math.abs(parseFloat(settled.rx)) > 0.01 || parseFloat(settled.active) > 0.01) {
      fail(`${vp.tag}: card did not settle (rotate ${settled.rx}, active ${settled.active})`);
    }
    report[`settle-${vp.tag}`] = settled;
  }

  report[vp.tag] = {
    cols: data.cols,
    overflowX: data.overflowX,
    cardWidth: data.cards[0]?.w,
    cardHeight: data.cards[0]?.h,
    errors: errors.length,
    shots,
  };
  console.log(vp.tag, JSON.stringify(report[vp.tag]));
  await context.close();
}

// Reduced motion: no tilt transform, card still rendered and readable.
const rm = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const rmPage = await rm.newPage();
await rmPage.goto(BASE, { waitUntil: 'networkidle' });
await rmPage.evaluate(() => document.querySelector('#team')?.scrollIntoView({ block: 'start' }));
await sleep(1200);
const rmData = await rmPage.evaluate(() => {
  const card = document.querySelector('#team .profile-card');
  const body = card.querySelector('.profile-card__body');
  const rect = card.getBoundingClientRect();
  const btn = card.querySelector('.profile-card__contact').getBoundingClientRect();
  return {
    transform: getComputedStyle(body).transform,
    visible: rect.height > 300 && getComputedStyle(card).visibility === 'visible',
    btnInside: btn.right <= rect.right + 0.5,
  };
});
if (rmData.transform !== 'none') fail(`reduced-motion: body transform ${rmData.transform}`);
if (!rmData.visible) fail('reduced-motion: card not visible');
if (!rmData.btnInside) fail('reduced-motion: contact button outside card');
await rmPage.screenshot({ path: path.join(FRAMES, 'team-1440-reduced.png') });
report.reduced = rmData;
await rm.close();

await browser.close();
await fs.writeFile(path.join(FRAMES, '..', 'team-report.json'), JSON.stringify(report, null, 2));

console.log('\n' + (failures.length ? `FAILURES (${failures.length}):\n- ${failures.join('\n- ')}` : 'ALL TEAM CHECKS PASSED'));
process.exit(failures.length ? 1 : 0);
