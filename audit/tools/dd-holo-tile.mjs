/**
 * Builds the team card's foil tile with the DD monogram in place of the
 * four-point sparkles.
 *   node audit/tools/dd-holo-tile.mjs
 *
 * Inputs
 *   .cloud-attachments/<supplied DD logo>.webp  — black mark, opaque white ground
 *   public/images/team/holo-pattern.svg         — the studio aura (ring, dots, rules)
 * Outputs
 *   public/images/team/dd-monogram.png   — the mark alone, white on transparent
 *   public/images/team/holo-pattern-dd.png — one tile: aura + DD at every sparkle
 *
 * The tile is a CSS mask source, so only alpha matters. It is rasterised at 6x
 * the SVG's 220 units (1320px) because a data-URI <image> inside an SVG used as
 * a mask is dropped by Chromium — verified before choosing this route.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..', '..');
const TEAM = path.join(ROOT, 'public/images/team');
const SRC = path.join(
  ROOT,
  '.cloud-attachments',
  '319378f0fe643c0a19bd724fc094b2635a12bef4fd887aff26832cbe76f0ddd0.webp'
);

/** Every four-point sparkle in holo-pattern.svg, with the box it occupied. */
const SPARKLES = [
  { d: 'M42 20c3.2 13.2 7.6 17.6 20.8 20.8', box: [21.2, 20, 41.6, 41.6] }, // the large top-right one
  { d: 'M158 46c1.7 7 4 9.3 11 11', box: [147, 46, 22, 22] },
  { d: 'M96 128c2.2 9 5.2 12 14.2 14.2', box: [81.8, 128, 28.4, 28.4] },
  { d: 'M176 168c1.4 5.8 3.3 7.7 9.1 9.1', box: [166.9, 168, 18.2, 18.2] },
  { d: 'M28 112c1.2 5 2.9 6.7 7.9 7.9', box: [20.1, 112, 15.8, 15.8] },
  { d: 'M120 6l7.4 12.6L140 22', box: [100, 6, 40, 36] }, // outlined sparkle
  { d: 'M66 168l6 10.4 10.4 2.6', box: [55.6, 168, 20.8, 30] }, // outlined sparkle
];

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

// The aura art keeps everything except the sparkles.
const svgPath = path.join(TEAM, 'holo-pattern.svg');
const svgSource = await fs.readFile(svgPath, 'utf8');
const keptLines = svgSource
  .split(/\r?\n/)
  .filter((line) => !SPARKLES.some((s) => line.includes(s.d)));
const removed = svgSource.split(/\r?\n/).length - keptLines.length;
if (removed !== SPARKLES.length) {
  throw new Error(`expected to remove ${SPARKLES.length} sparkles, removed ${removed}`);
}
const auraSvg = keptLines
  .join('\n')
  .replace(
    /<!-- Desi Draft foil tile[\s\S]*?-->/,
    '<!-- Desi Draft foil aura: ring, dots and rules only. The sparkles that used\n       to sit here are now the DD monogram; run audit/tools/dd-holo-tile.mjs to\n       rebuild /images/team/holo-pattern-dd.png from this file + dd-monogram.png. -->'
  );

const logoBytes = await fs.readFile(SRC);
const logoUrl = `data:image/webp;base64,${logoBytes.toString('base64')}`;

const browser = await chromium.launch({ executablePath: await resolveChromium() });
const page = await (await browser.newContext({ viewport: { width: 600, height: 600 } })).newPage();
await page.setContent('<body style="margin:0;background:#fff"></body>');

const mark = await page.evaluate(async (src) => {
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
  const hasAlpha = (() => {
    for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
    return false;
  })();
  const out = ctx.createImageData(w, h);
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    const luma = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
    // The supplied file is black ink on an opaque white ground, so coverage is
    // 1 - luminance; an alpha source would already carry its own coverage.
    let cov = hasAlpha ? a : a * (1 - luma);
    if (cov < 0.02) cov = 0;
    out.data[i] = 255;
    out.data[i + 1] = 255;
    out.data[i + 2] = 255;
    out.data[i + 3] = Math.round(cov * 255);
  }
  ctx.putImageData(out, 0, 0);

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
  return { w, h, hasAlpha, tw, th, aspect: tw / th, png: t.toDataURL('image/png') };
}, logoUrl);

await fs.writeFile(path.join(TEAM, 'dd-monogram.png'), Buffer.from(mark.png.split(',')[1], 'base64'));
console.log('mark', JSON.stringify({ source: [mark.w, mark.h], alpha: mark.hasAlpha, trimmed: [mark.tw, mark.th] }));

const tile = await page.evaluate(
  async ({ aura, monogram, sparkles, scale, size }) => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';

    const load = (src) =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });

    const auraImg = await load(`data:image/svg+xml,${encodeURIComponent(aura)}`);
    const dd = await load(monogram);

    ctx.scale(scale, scale);
    ctx.drawImage(auraImg, 0, 0, size / scale, size / scale);

    // Fit the mark inside each sparkle's box, keeping its own proportions.
    for (const { box } of sparkles) {
      const [bx, by, bw, bh] = box;
      const aspect = dd.width / dd.height;
      const h = Math.min(bh, bw / aspect);
      const w = h * aspect;
      ctx.drawImage(dd, bx + (bw - w) / 2, by + (bh - h) / 2, w, h);
    }
    return canvas.toDataURL('image/png');
  },
  { aura: auraSvg, monogram: mark.png, sparkles: SPARKLES, scale: 6, size: 1320 }
);

await fs.writeFile(path.join(TEAM, 'holo-pattern-dd.png'), Buffer.from(tile.split(',')[1], 'base64'));
await fs.writeFile(svgPath, auraSvg);
await browser.close();

const stat = async (p) => (await fs.stat(path.join(TEAM, p))).size;
console.log(
  'tile',
  JSON.stringify({ tile: '1320x1320', bytes: await stat('holo-pattern-dd.png'), monogramBytes: await stat('dd-monogram.png') })
);
console.log('aura svg updated (sparkles removed):', svgPath);
