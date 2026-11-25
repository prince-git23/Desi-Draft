/**
 * One-off: inspect the supplied DD logo, key it to a white-on-transparent mask
 * tile, and prove whether an embedded data-URI <image> renders inside an SVG
 * used as a CSS mask (the vector path) or whether the tile must be rasterised.
 *   node audit/tools/dd-mask-test.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..', '..');
const SRC = path.join(
  ROOT,
  '.cloud-attachments',
  '319378f0fe643c0a19bd724fc094b2635a12bef4fd887aff26832cbe76f0ddd0.webp'
);

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

const bytes = await fs.readFile(SRC);
const dataUrl = `data:image/webp;base64,${bytes.toString('base64')}`;

const browser = await chromium.launch({ executablePath: await resolveChromium() });
const page = await (await browser.newContext({ viewport: { width: 600, height: 600 } })).newPage();
await page.setContent('<body style="margin:0;background:#fff"></body>');

const keyed = await page.evaluate(async (src) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, w, h).data;
  let minA = 255;
  let opaqueLight = 0;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] < minA) minA = d[i];
    if (d[i] > 200 && (d[i - 3] + d[i - 2] + d[i - 1]) / 3 > 240) opaqueLight++;
  }
  const hasAlpha = minA < 250;
  const out = ctx.createImageData(w, h);
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    const luma = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
    // Ink coverage: an alpha source already carries its own coverage; an opaque
    // one (white page around a black mark) gives coverage as 1 - luminance.
    let cov = hasAlpha ? a : a * (1 - luma);
    if (cov < 0.02) cov = 0;
    out.data[i] = 255;
    out.data[i + 1] = 255;
    out.data[i + 2] = 255;
    out.data[i + 3] = Math.round(cov * 255);
  }
  ctx.putImageData(out, 0, 0);
  // Trim to the mark so the mask box can be aligned to the star it replaces.
  const px = out.data;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] > 30) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  const tw = x1 - x0 + 1;
  const th = y1 - y0 + 1;
  const t = document.createElement('canvas');
  t.width = tw;
  t.height = th;
  t.getContext('2d').drawImage(c, x0, y0, tw, th, 0, 0, tw, th);
  return {
    w,
    h,
    hasAlpha,
    opaqueLight,
    trim: { x0, y0, tw, th, aspect: +(tw / th).toFixed(3) },
    png: t.toDataURL('image/png'),
  };
}, dataUrl);

console.log('source', JSON.stringify({ w: keyed.w, h: keyed.h, hasAlpha: keyed.hasAlpha, opaqueLight: keyed.opaqueLight }));
console.log('trim  ', JSON.stringify(keyed.trim));

await fs.writeFile(path.join(ROOT, 'public/images/team/dd-monogram.png'), Buffer.from(keyed.png.split(',')[1], 'base64'));

// Does a data-URI <image> inside a CSS mask SVG render in Chromium?
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220"><image href="${keyed.png}" x="20" y="20" width="120" height="120" preserveAspectRatio="xMidYMid meet"/></svg>`;
const maskUrl = `data:image/svg+xml,${encodeURIComponent(svg)}`;

await page.setContent(
  `<body style="margin:0;background:#fff">
     <div id="box" style="width:220px;height:220px;background:#e00;
       -webkit-mask-image:url("${maskUrl}");mask-image:url("${maskUrl}");
       -webkit-mask-size:220px 220px;mask-size:220px 220px;
       -webkit-mask-repeat:no-repeat;mask-repeat:no-repeat"></div>
   </body>`
);
await page.waitForTimeout(300);
const shot = await page.screenshot();
const stats = await page.evaluate(async (b64) => {
  const img = new Image();
  img.src = `data:image/png;base64,${b64}`;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let red = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] > 180 && d[i + 1] < 90) red++;
  return { red, total: d.length / 4 };
}, shot.toString('base64'));

console.log('embed test', JSON.stringify(stats), stats.red > 200 ? 'EMBEDDED IMAGE RENDERS' : 'EMBEDDED IMAGE BLOCKED');
await browser.close();
