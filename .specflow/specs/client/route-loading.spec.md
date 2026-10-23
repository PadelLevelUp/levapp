---
id: client.route-loading
status: implementing
depends_on: [client.query-cache]
implements: ../../specs-business/client/web-opens-quickly-on-a-first-visit.business.md
governed_by: [R-024]
---

# client.route-loading

> Linear: PAD-585. Drafted 2026-10-10 by Session E (wave 14) from the PAD-571 speed study
> (`.cortex/atlas/decisions/2026-10-09-app-speed-study.md`, cause 1: "one 2.4 MB chunk, 0 lazy
> routes"). Web only: see Notes.

### Intent
The web app's first download carries the shell every page needs plus the page being opened, not
all ~35 pages, both locales and every chart library. Pages load as separate chunks; the menu's
pages are fetched in the background once a signed-in screen is up, so navigation stays instant;
a chunk that vanished in a deploy reloads the app once instead of breaking it. A build-time
budget holds the gain.

### Surfaces
- **Web** `frontend/apps/web`: `src/routes/lazyPages.ts` (new: one loader per page, the
  `React.lazy` components and `prefetchAppPages`), `src/lib/lazyWithReload.ts` (new),
  `App.tsx` (routes render the lazy pages inside one `Suspense`), `src/auth/HomeRoute.tsx`,
  `src/components/layout/AppLayout.tsx` (starts the background prefetch), `src/i18n.ts`
  (Portuguese bundled, English loaded on demand), `src/auth/AuthContext.tsx` (waits for the
  user's language before the session counts as restored), `vite.config.ts` (`manualChunks`,
  `manifest`), `index.html` (no font host since PAD-635), `src/main.tsx` (imports the self-hosted faces),
  `scripts/check-entry-budget.mjs` (new).
- **CI** `.github/workflows/checks-frontend.yaml`: builds the web app and runs the budget check.
- **Mobile, backend** — no change.

### Entities
- **READS:** none. **WRITES:** none (a `sessionStorage` key for the one-shot reload).

### Rules

1. **Every page is a lazy chunk.** `App.tsx` and `HomeRoute.tsx` import no page module
   statically; every page is a `React.lazy` component from `src/routes/lazyPages.ts`, whose
   loaders are the only `import("…/pages/…")` expressions in the app. Shared components stay
   ordinary imports (Rollup puts code shared by several pages in a shared chunk).
2. **One Suspense boundary, no text.** The routes render inside one `Suspense` whose fallback is a
   full-height empty surface in the page background colour (no text, so no i18n; no spinner, so a
   cached chunk shows no flash).
3. **Background prefetch after the first signed-in screen.** When `AppLayout` mounts, it schedules
   `prefetchAppPages()` on idle (`requestIdleCallback` with a 5 s timeout, else a 1 s `setTimeout`; skipped under unit tests, covered by the E2E prefetch test), which calls the
   loaders of every page reachable from the menu. Each loader runs at most once per page load.
   Public pages (landing, legal, invite, auth) are not prefetched.
4. **A missing chunk reloads once.** Every lazy page goes through `lazyWithReload(loader)`: when
   the dynamic import rejects, and no reload happened in the last 10 s (`sessionStorage` key
   `levapp.chunkReloadAt`), it records the time and calls `window.location.reload()`; otherwise
   it rethrows. A deploy replaces the hashed chunks and the server answers a missing one with 404
   (PAD-584), so this is how an open tab reaches the new version.
   **(B-532) Not while the page is being left:** for 2 s after `beforeunload`, a rejected import
   neither reloads nor rethrows — the navigation that cancelled the chunk loads (WebKit rejects the
   import) finishes instead of being sent back to the page being left. The window ends on its own,
   so a leave the user cancels does not switch the reload off.
5. **Vendor chunks for cache stability.** `vite.config.ts` `build.rollupOptions.output.manualChunks`
   groups `react`/`react-dom`/`react-router`/`scheduler` (`vendor-react`), `@radix-ui/*`
   (`vendor-radix`), `i18next`/`react-i18next` (`vendor-i18n`), and each lazily loaded language's
   area files (`locale-<lng>`, one request per language switch). Nothing else is forced into a
   group; there is no catch-all vendor chunk. Chart libraries are **not** grouped: a manual
   group becomes a static import of the entry as soon as Rollup places a shared CommonJS helper
   in it (measured: a `vendor-charts` group put 110 kB gzip of Recharts in the first download),
   and Recharts is reached only through lazy pages, so Rollup splits it on its own.
6. **Portuguese bundled, English on demand.** `i18n.ts` bundles the fallback language (pt)
   eagerly and loads any other supported language through an i18next backend over a lazy
   `import.meta.glob`; `i18n.changeLanguage(lng)` resolves after that language's strings are in
   place, so no screen renders keys. `AuthContext` awaits the user's language before ending the
   session-restore `loading` state, so a signed-in English user never sees Portuguese first.
7. **The fonts are self-hosted and do not block the first paint (PAD-635).** Poppins (600, 700)
   and Plus Jakarta Sans (400–700) come from `@fontsource/poppins` and
   `@fontsource/plus-jakarta-sans`, imported in `src/main.tsx` and bundled as the app's own
   assets; every face is `font-display: swap`, so the fallback face paints first. No page
   requests, preconnects to or names `fonts.googleapis.com` or `fonts.gstatic.com`: a font
   request would send the visitor's address to Google before any consent (PAD-602 privacy
   review). The same holds for the staff console (`admin.foundation` rule 12a).
8. **A budget holds the gain.** `vite build` writes a manifest; `scripts/check-entry-budget.mjs`
   sums the gzip size of the entry chunk and its static imports (JS and CSS) and fails above
   **320 kB**, and fails if any single JS chunk exceeds 500 kB raw. CI runs build + check on every
   PR that touches `frontend/`. (300 kB until PAD-406: React 19 added ~15 kB to an entry the
   PAD-656 site had brought to ~288 kB; the owner raised the budget rather than trim the entry.)

### Acceptance Criteria

#### No page is imported statically (rules 1, 4)
- **Given** `App.tsx` and `HomeRoute.tsx`
- **When** the source guard reads them
- **Then** neither has a static import from a `pages/` module, and every page component they
  render is exported by `lazyPages.ts`, each built with `lazyWithReload`

#### A missing chunk reloads once, then fails honestly (rule 4)
- **Given** a loader that rejects with "Failed to fetch dynamically imported module"
- **When** the lazy page loads with no reload recorded
- **Then** `window.location.reload` is called once and the time is stored
- **And Given** a reload recorded 3 s ago **When** it rejects again **Then** the error is rethrown
  and no reload happens

#### Leaving the page during a chunk load does not bounce back (rule 4, B-532)
- **Given** a coach just signed in on WebKit, the dashboard's chunks still loading
- **When** the page navigates to `/calendar` (a `beforeunload`), cancelling those loads
- **Then** the app does not reload and the browser arrives at `/calendar`
- **And** a chunk that fails more than 2 s after a cancelled leave reloads as before

#### The menu's pages are prefetched once (rule 3)
- **Given** `prefetchAppPages()` called twice
- **When** the loaders are counted
- **Then** each menu page's loader ran exactly once and no public page's loader ran

#### English arrives before the switch (rule 6)
- **Given** the real `i18n` module with only Portuguese loaded
- **When** `await i18n.changeLanguage("en")`
- **Then** `i18n.t("nav.calendar")` (an existing key) returns the English string and
  `i18n.hasResourceBundle("en", "translation")` is true

#### The first download is within budget (rule 8)
- **Given** `npm run build --workspace apps/web`
- **When** `node apps/web/scripts/check-entry-budget.mjs` runs
- **Then** it prints the entry gzip total ≤ 320 kB and exits 0, and no JS chunk exceeds 500 kB raw

#### The session waits for the user's language (rule 6)
- **Given** a stored session whose user's language is English, with the English chunk slow
- **When** the session restores
- **Then** `loading` stays true until the language has arrived; **and Given** the chunk fails to
  load, **Then** the session still restores in the current language

#### No page asks Google for a font (rule 7, PAD-635)
- **Given** a visitor who has not answered the cookie banner, and then a signed-in coach
- **When** they open `/`, `/auth`, `/dashboard` and `/calendar`
- **Then** no request goes to `fonts.googleapis.com` or `fonts.gstatic.com`, every font file
  comes from the page's own origin, each of the six faces loads by name, and the body still
  renders in Plus Jakarta Sans (`e2e/client/pad635-self-hosted-fonts.spec.ts`); the landing
  page's zero-foreign-request guard (`e2e/landing/hubspot-consent.spec.ts`) allows no host at
  all, and `index.html` names no Google font host (`landing-guards.test.ts`)

#### Navigation still works everywhere (rules 1–3)
- **Given** the web E2E suite
- **When** it runs against the split build
- **Then** it passes as it does at the base, including `e2e/client/query-cache.spec.ts`
  (its counters read `/api/` only, so chunk fetches do not count); `e2e/client/route-loading.spec.ts`
  opens every menu page for a coach and a student through the menu and by URL, the role-only
  URLs and every public page, and sees the idle prefetch fetch pages nobody clicked

### Notes
- **Web-only (R-024 exception).** The iOS app bundles its JavaScript inside the binary; there is
  no download to split, and its launch is PAD-587. Recorded in the PR body too.
- Measured before (faa4e721f): one JS chunk 2,422.80 kB raw / 674.45 kB gzip; CSS 100.44 kB /
  17.26 kB. Each locale is ~43 kB gzip.
- Measured after (the PAD-585 build): entry and its static imports 262.65 kB gzip (5 files);
  with the opened page's chunks, landing 273.71 kB, invite 279.54 kB, coach dashboard 300.71 kB,
  calendar 358.58 kB; English is one 40.52 kB gzip chunk fetched on demand; no chunk over
  500 kB raw. The 300 kB budget leaves ~37 kB of headroom on the entry.
- GAP (NORMAL): the app has no error boundary above the routes, so a chunk that fails twice
  within 10 s (rule 4 rethrows) unmounts the app to a blank page. Before this leaf the single
  bundle failed the same way when its own download failed, so this is a narrower path, not a new
  class. A boundary with a reload action is a follow-up leaf.
- Notes, not rules: the idle prefetch loads all nine menu pages whatever the role, so a student
  also fetches coach-only chunks once per deploy. `build.manifest` puts
  `dist/.vite/manifest.json` in the image, where nginx serves it; it lists chunk names that are
  public anyway.
- The nginx half of the PAD-571 bundle finding (gzip, immutable `/assets/`, HTTP/2) is PAD-584.
- A data router (`createBrowserRouter` with route `lazy`) was not adopted: `BrowserRouter` with
  `React.lazy` gives the same split without migrating every route.
