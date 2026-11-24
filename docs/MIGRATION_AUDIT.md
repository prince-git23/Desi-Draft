# Migration audit — latest Desi Draft into `prince-git23/Desi-Draft`

Date: 2026‑11‑25
Direction: **Folder A → Folder B** (source → destination). Never the reverse.

| | Path | Role |
| --- | --- | --- |
| **A** | `C:\Users\Prince yadav\OneDrive\Desktop\web dev course\Advancementss\Learning_Projects\Desi_Draft` | Source of truth. Git root is the parent `Advancementss` repo (`prince-git23/Advancements`); its remote was **not touched**. |
| **B** | `C:\Users\Prince yadav\OneDrive\Desktop\Desi_Draft1` | Destination. Own repo, `origin = https://github.com/prince-git23/Desi-Draft.git`, branch `main`, one commit (`d98ea67 first commit`), clean tree before migration. |

Backups (outside both folders): `%LOCALAPPDATA%\Temp\desi-migration-backup-20261125\`
`folderA-source.tar.gz` (52 MB), `folderB-with-git.tar.gz` (55 MB, includes B's `.git`), plus
`folderA-git-status.txt`, `folderB-git-log.txt`, `folderB-remote.txt`.

## 1. Comparison before copying

`diff -rq` on the two trees (excluding `.git`, `node_modules`, `dist`, `.cloud-attachments`,
`.freebuff`, `.env`, `server/data`) found **no file that exists in B and not in A except generated
`audit/frames` screenshots**. Nothing was deleted or renamed in A, so no obsolete source file could
survive in B.

Identical, untouched by the copy: `index.html`, `vite.config.ts`, `tsconfig.json`,
`tailwind.config.js`, `postcss.config.js`, `scripts/`, `server/`, `.env.example`, and the whole of
`public/` (98 files — every image, video, poster and font; verified byte-identical afterwards).

## 2. New files migrated

| File | Why |
| --- | --- |
| `src/components/ui/Stack.tsx` | ReactBits Stack, TypeScript port; press on `a`/`button`/form controls is left to the control, non-top cards set `inert`. |
| `src/components/ui/Stack.css` | The component's own stylesheet. |
| `src/components/ui/ServiceStack.tsx` | Mobile-only services deck built from `serviceGroups`; measured card height. |
| `src/components/ui/ServiceStack.css` | Cream service card, 16:10 media, two-column feature grid. |
| `src/global.d.ts` | `window.__ddReady` declaration for the hero reveal gate. |
| `audit/tools/service-stack.mjs` | Deck checks: five complete cards, no clipping, drag/tap/keyboard, link-vs-turn, vertical scroll. |
| `audit/tools/header-menu.mjs` | Work menu tap/hover/Escape/outside-click, hero composition and video source, WhatsApp action, 75–150 % zoom. |

## 3. Modified files migrated

| File | Change |
| --- | --- |
| `src/components/Hero.tsx` | Hero shell `clamp(560px,82svh,900px)` instead of `100svh`; headline `clamp(2.75rem,5.2vw,5.125rem)` / mobile `clamp(2.125rem,9vw,3.375rem)`; reveal plays at once when `__ddReady` is already set, fallback 1.4 s. |
| `src/App.tsx` | Sets `window.__ddReady` with both `dd:ready` dispatches. |
| `src/components/Header.tsx` | Hover open/close only for `pointerType === 'mouse'`; touch is handled once by the click toggle. |
| `src/components/layout/WorkMenu.tsx` | Same pointer-type gate on the panel; rows 16 px, statuses 11 px, chips 10 px. |
| `src/components/PillarsFan.tsx` | Fan restored for ≥1024, snap strip 768–1023, endless phone marquee <768. |
| `src/components/Services.tsx` | Renders `ServiceStack` below 768 and `AccordionGallery` above; only one is mounted. |
| `src/components/Footer.tsx` | Contact-verified footer, three groups, contact strip, staged wordmark → sticker reveal. |
| `src/components/Manifesto.tsx` | Section heading scale `clamp(2rem,4.2vw,3.5rem)`. |
| `src/index.css` | `.type-section`, `.lede`, marquee and pillar-run styles. |
| `src/lib/hooks.ts` | `useMediaQuery`. |
| `package.json` / `package-lock.json` | `motion@^14.14.0` — copied as a matched pair. |
| `README.md`, `audit/README.md` | Contact row, physics note, new audit rows. |
| `docs/FINAL_RESPONSIVE_AUDIT.md`, `docs/FINAL_MOTION_AUDIT.md`, `docs/LAUNCH_READINESS.md` | Hero/menu/type-scale and contact/CTA documentation. |
| `audit/tools/cta.mjs`, `footer-check.mjs`, `pillar-text.mjs`, `pillars.mjs`, `services.mjs`, `team-footer.mjs` | Updated assertions for the new footer, pillars modes and mobile deck. |
| `audit/frames/footer-*.jpg` (19 tracked) | Re-shot against the new footer so the tracked frames are not stale. |

## 4. Preserved from B (not overwritten)

| Item | Reason |
| --- | --- |
| `.git/` | Target repository history and the GitHub remote. |
| `.gitignore` | B's version is the newer, richer one (`.vite/`, `*.tsbuildinfo`, `.cloud-attachments/`, `.freebuff/`, `*.sqlite`, `server/tmp/`). A's is a subset; B's was kept. |
| `.freebuff/`, `.cloud-attachments/` | Local assistant state, never committed. |
| Remote `origin` | Verified as `https://github.com/prince-git23/Desi-Draft.git`. |

## 5. Excluded (never copied)

`.git/` from A (A's git lives in the parent anyway), `node_modules/`, `dist/`, `.env` and private env
files, `server/data/`, `.cloud-attachments/`, `.freebuff/`, `audit/verify.json` (generated),
`audit/frames/probe-hero-*.png` (temporary debug captures), and the 95 new `audit/frames` screenshots
produced during this round — 24 MB of generated output, reproducible with the audit tools and
referenced by no document. They remain on disk in B but are not staged.

## 6. Post-copy verification

- `diff -rq` A vs B (same excludes): **NONE** — the trees are identical apart from the items in §4/§5.
- `public/` 98 files in both, byte-identical.
- `npm ci` **OK** (after stopping Folder B's own Vite dev server, PID 69720, which held
  `node_modules/@esbuild/win32-x64/esbuild.exe` open and made the install fail with `EPERM`).
- `npm run build` **exit 0**; bundle `dist/assets/index-CWSxhHxs.js` is byte-for-byte the same hash as
  A's build, i.e. the migrated source produces the same output.
- Audits run against B's own `dist` on `http://127.0.0.1:4174`:

| Check | Result |
| --- | --- |
| `verify.mjs` | 54 page loads, 0 problems |
| `header-menu.mjs` | `HEADER · HERO CLEAN` (13 widths, menu paths, WhatsApp, zoom 75–150 %, reduced motion) |
| `responsive.mjs` | `RESPONSIVE SWEEP CLEAN` |
| `services.mjs` | `ALL SERVICES CHECKS PASSED` |
| `service-stack.mjs` | `SERVICE STACK CLEAN` |
| `pillars.mjs` | `PILLARS CLEAN` |
| `footer-check.mjs` | `FOOTER CLEAN` |
| `team-footer.mjs` | `TEAM · TESTIMONIALS · FOOTER CLEAN` |
| `cta.mjs` | `ALL CTA CHECKS PASSED` |

Backend: `server/index.mjs` and `.env.example` are identical between the folders; no build step, and
no secret was copied. The enquiry API is unchanged by this migration.

## 7. Git plan

Branch `sync/latest-desidraft` on top of `origin/main`, one commit, pushed to `origin`, then a pull
request into `main`. No force-push; `main` is not written to directly.
