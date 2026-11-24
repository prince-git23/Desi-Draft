/**
 * Desi Draft — contact CTA audit.
 *
 *   npm run build && npx vite preview --port 4174 --host 127.0.0.1
 *   DD_URL=http://127.0.0.1:4174/ node audit/tools/cta.mjs
 *
 * Every enquiry CTA must reach a real destination: the verified inbox, with the
 * subject the footer promises. The header's on-site contact panel is the path
 * for visitors without a mail client, so it is checked separately.
 *
 * Read-only.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.DD_URL || 'http://127.0.0.1:4174/';
const EMAIL = 'desidraftt@gmail.com';

async function resolveChromium() {
  const base = path.join(process.env.LOCALAPPDATA || process.env.HOME || '', 'ms-playwright');
  const entries = await fs.readdir(base).catch(() => []);
  const dirs = entries.filter((d) => d.startsWith('chromium')).sort().reverse();
  for (const d of dirs) {
    for (const sub of ['chrome-win64', 'chrome-win', 'chrome-headless-shell-win64', 'chrome-linux64', 'chrome-linux']) {
      for (const bin of ['chrome.exe', 'chrome-headless-shell.exe', 'headless_shell.exe', 'chrome']) {
        const p = path.join(base, d, sub, bin);
        if (await fs.access(p).then(() => true, () => false)) return p;
      }
    }
  }
  return null;
}

const browser = await chromium.launch({
  headless: true,
  executablePath: (await resolveChromium()) || undefined,
});
const errors = [];
const report = [];
const fail = (m) => report.push(`FAIL  ${m}`);
const pass = (m) => report.push(`ok    ${m}`);

/** An enquiry control is a mailto to the verified inbox, not a dialog trigger. */
async function checkMailto(page, label, route, subject) {
  await page.goto(new URL(route, BASE).href, { waitUntil: 'load' });
  // Sections below the fold reveal on scroll, so walk the page like a visitor.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(900);
  const link = page.getByRole('link', { name: new RegExp(label, 'i') }).first();
  if (!(await link.count())) {
    fail(`${route} → no enquiry link "${label}"`);
    return;
  }
  const href = (await link.getAttribute('href')) ?? '';
  const [addr, qs] = href.split('?');
  const actual = qs ? new URLSearchParams(qs).get('subject') : null;
  if (addr !== `mailto:${EMAIL}`) fail(`${route} → "${label}" points at ${href}`);
  else if (actual !== subject) fail(`${route} → "${label}" subject is "${actual}", expected "${subject}"`);
  else pass(`${route} → "${label}" → ${addr} "${actual}"`);
}

async function checkPanel(page, origin, width) {
  const opener = page.getByRole('button', { name: /contact desi draft about/i }).first();
  if (!(await opener.count())) {
    fail(`${origin} → no contact-panel trigger`);
    return;
  }
  await opener.click();
  const dialog = page.getByRole('dialog');
  const open = await dialog.waitFor({ state: 'visible', timeout: 2500 }).then(() => true, () => false);
  if (!open) {
    fail(`${origin} → contact panel did not open`);
    return;
  }
  if (width) {
    const box = await dialog.boundingBox();
    const inside = box && box.x >= 0 && box.x + box.width <= width + 0.5;
    if (!inside) fail(`${origin} → panel overflows the viewport (${box ? `${box.x}+${box.width}` : 'no box'})`);
    else pass(`${origin} → contact panel fits (${Math.round(box.width)}px wide)`);
  } else {
    const title = (await dialog.getAttribute('aria-label')) ?? '';
    pass(`${origin} → contact panel opens (${title})`);
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
}

/* ---- desktop ---------------------------------------------------------- */
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await desktop.newPage();
page.on('pageerror', (e) => errors.push(String(e).slice(0, 140)));

const routes = ['/', '/work', '/work/floral-alchemy', '/work/cut-to-the-beat', '/work/studio-identity'];
const anchors = new Set();
for (const route of routes) {
  await page.goto(new URL(route, BASE).href, { waitUntil: 'load' });
  await page.waitForTimeout(250);
  const found = await page.evaluate(() =>
    [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'))
  );
  found.forEach((h) => anchors.add(h));
}

const dead = [...anchors].filter((h) => !h || h === '#' || h === '/#' || /^javascript:/i.test(h));
if (dead.length) fail(`dead or placeholder hrefs: ${dead.join(', ')}`);
else pass('no empty, "#" or javascript: hrefs in any rendered page');

const mailto = [...anchors].filter((h) => /^mailto:/i.test(h));
const badMail = mailto.filter((h) => {
  const [addr, qs] = h.split('?');
  if (addr !== `mailto:${EMAIL}`) return true;
  return qs ? !new URLSearchParams(qs).get('subject') : false;
});
if (!mailto.length) fail('no mailto CTA for the verified inbox');
else if (badMail.length) fail(`mailto links with an unverified address or empty subject: ${badMail.join(', ')}`);
else pass(`${mailto.length} enquiry CTAs point at mailto:${EMAIL}`);

const fake = [...anchors].filter((h) => /instagram\.com\/?$|linkedin\.com\/?$|tiktok\.com\/?$|wa\.me\/$/i.test(h ?? ''));
if (fake.length) fail(`platform-homepage links: ${fake.join(', ')}`);
else pass('no platform-homepage social links');

await checkMailto(page, 'start a conversation', '/', 'Project enquiry — services');
// Group 01 is an open collaboration invitation whose CTA is "work with us".
await checkMailto(page, 'work with us', '/', 'Collaboration with Desi Draft');
await checkMailto(page, 'start a project', '/', 'Project enquiry — Desi Draft');
await checkPanel(page, '/');

// Flora Alchemy is live, so its case-study CTA leaves for the real site
// instead of the contact panel. That link must be external and opener-free.
await page.goto(new URL('/work/floral-alchemy', BASE).href, { waitUntil: 'load' });
await page.waitForTimeout(250);
const live = page.getByRole('link', { name: /visit live website/i }).first();
if (!(await live.count())) fail('/work/floral-alchemy → no "Visit Live Website" link');
else {
  const href = await live.getAttribute('href');
  const target = await live.getAttribute('target');
  const rel = (await live.getAttribute('rel')) ?? '';
  if (href !== 'https://flora-alchemyy.vercel.app/') fail(`/work/floral-alchemy → live link points at ${href}`);
  else if (target !== '_blank' || !/noopener/.test(rel)) fail('/work/floral-alchemy → live link missing target/_blank + noopener');
  else pass('/work/floral-alchemy → "Visit Live Website" → flora-alchemyy.vercel.app (new tab, noopener)');
}
await checkMailto(page, 'start a conversation', '/work/cut-to-the-beat', 'Project enquiry — cut to the beat');

/* ---- mobile ----------------------------------------------------------- */
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const mp = await phone.newPage();
mp.on('pageerror', (e) => errors.push(String(e).slice(0, 140)));
await mp.goto(new URL('/', BASE).href, { waitUntil: 'load' });
await mp.waitForTimeout(700);
await mp.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await mp.waitForTimeout(600);

const mobileLink = mp.getByRole('link', { name: /start a project/i }).first();
if (!(await mobileLink.count())) fail('390px → footer "start a project" missing');
else {
  const href = (await mobileLink.getAttribute('href')) ?? '';
  const box = await mobileLink.boundingBox();
  if (!href.startsWith(`mailto:${EMAIL}`)) fail(`390px → CTA points at ${href}`);
  else if (!box || box.height < 44) fail(`390px → CTA is ${box ? Math.round(box.height) : 0}px tall`);
  else pass(`390px → footer CTA is a ${Math.round(box.height)}px mailto link`);
}
await checkPanel(mp, '390px', 390);

await browser.close();
report.forEach((l) => console.log(l));
const failures = report.filter((l) => l.startsWith('FAIL')).length + errors.length;
errors.slice(0, 4).forEach((e) => console.log(`      console: ${e}`));
console.log(`\n${failures === 0 ? 'ALL CTA CHECKS PASSED' : `${failures} PROBLEM(S)`}`);
process.exit(failures ? 1 : 0);
