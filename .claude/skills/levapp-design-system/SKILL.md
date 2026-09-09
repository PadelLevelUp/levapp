---
name: levapp-design-system
description: Use this skill to generate well-branded interfaces and assets for LevApp (formerly LevelUp), the padel/tennis academy app, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

# LevApp design system

The brand is **LevApp**. It was called **LevelUp**, and parts of the plumbing still are —
the GitHub org (`PadelLevelUp/levapp`) and the npm scope (`@levelup/*`, verified
2026-09-09 in `frontend/packages/*/package.json`). The user-facing names have already
moved: `frontend/apps/mobile/app.json:3` is `"name": "LevApp"` and
`frontend/apps/web/index.html:6` is `<title>LevApp</title>`. Treat "LevelUp" and "LevApp"
as the same product; write **LevApp** in anything new and user-facing, and don't rename
code identifiers unless asked to.

Read `readme.md` first, then the files below. If the user invokes this skill with no
other guidance, ask what they want to build, ask a couple of sharp questions, and act as
an expert designer.

## The redesign shipped — this system IS production

**This used to say the opposite; the correction matters more than anything else here.**

An earlier version of this file (verified 2026-08-06) said the redesign was *not*
implemented, that production shipped a "different, green" system, and that introducing
navy/blue was a rebrand needing explicit permission. That was true for about one day. The
repaint landed in `9e38378` and `b362c58`, both dated **2026-08-07** — "FASE 1a — swap the
shared token layer to LevApp navy/blue" and "FASE 1 — typography, primitives, chrome, and
semantic colour". **Do not ask permission to use blue. Blue is the shipping primary.**

Re-verified 2026-09-09 against `origin/staging` (`faab7eb`):

| Claim | Evidence |
|---|---|
| Primary is the LevApp blue | `frontend/packages/config/src/tokens.ts:78` — `primary: "220 84% 47%", // blue-600 #1355DC` |
| A test *asserts* it is blue | `frontend/packages/config/src/tokens.test.ts:45-48` — `it("brand primary is the LevApp blue in the light theme")`, `expect(lightThemeHsl.primary).toBe("220 84% 47%")` |
| A test forbids green as primary | `tokens.test.ts:55-62` — `it("green is reserved for success — it is never the brand primary")` |
| The web renders the same values | `frontend/apps/web/src/index.css:31` — `--primary: 220 84% 47%;`, and `tokens.test.ts:105-128` fails the build if `index.css` and `tokens.ts` drift |
| The navy chrome is real | `index.css:71` — `--sidebar-background: 217 58% 12%` (navy-800 `#0D1B31`) |
| The navy hero gradient is real | `frontend/apps/web/src/pages/LandingPage.tsx:66` — `linear-gradient(150deg, #16294A 0%, #0B1524 100%)` |
| The type stack shipped too | `frontend/apps/web/tailwind.config.ts:19-20` — Plus Jakarta Sans `sans`, Poppins `display`; loaded in `index.html:20` |

Every brand hex in `tokens/colors.css` and `tokens/dark.css` now appears in production,
converted to HSL triplets. The colour split is gone.

## What still genuinely differs: vocabulary, not colour

The palette is one palette. The **way you name and reach it** is not, and that is the only
distinction left worth carrying.

| | This skill (`tokens/*.css`) | Production (`frontend/`) |
|---|---|---|
| Token form | literal hex, `--lv-blue-600: #1355DC`, used as `var(--lv-*)` | HSL triplet, `--primary: 220 84% 47%`, used as `hsl(var(--primary))` or a Tailwind class |
| Vocabulary | a full ramp (`--lv-grey-50…800`, `--lv-blue-50…700`) plus semantic aliases (`--surface-*`, `--text-*`, `--action-*`, `--status-*-bg/fg/solid`) | the shadcn set only: `primary`, `muted-foreground`, `border`, `card`, `destructive`, plus `academy` / `private` / `success` / `warning` / `info` and the `success-strong` / `warning-strong` text pairs |
| Tints | a named token per tint (`--status-done-bg`) | Tailwind opacity modifiers — `bg-success/15`, `bg-primary/10`, `bg-warning/10` |
| Dark selector | `[data-theme="dark"]` | `.dark` class (`tailwind.config.ts:4`, `darkMode: ["class"]`) |
| Components | plain `.jsx` in `components/` | shadcn/ui + Tailwind in `frontend/apps/web/src/components/ui/` — reuse, don't re-author |

So, in production code: write `bg-primary`, never `var(--lv-blue-600)`; write
`bg-success/15 text-success-strong`, never `--status-done-bg`. There is no production
token for `--lv-blue-200` or `--surface-sunken` — reach for the nearest shadcn token or an
opacity modifier rather than inventing one.

**One trap.** The values round-tripped through HSL, so production hexes land within ~1/255
of this skill's: `220 84% 47%` renders `#1356DD`, not `#1355DC`. They are the same colour
by intent. Never hand-copy a hex from `tokens/colors.css` into production — use the token,
or the test that guards `index.css` against `tokens.ts` will be comparing two things that
were meant to be one.

**Changing a production colour** still means editing `frontend/packages/config/src/tokens.ts`
*and* `frontend/apps/web/src/index.css` together — nothing syncs them at runtime, only
`tokens.test.ts`. Web and mobile both read that package (`frontend/apps/mobile/tailwind.config.js`
calls `nativewindTheme()`), so a partial change desyncs the two apps.

## Where to look
- `readme.md` — content fundamentals (pt-PT, informal *tu*), visual foundations, iconography, and eight rules of thumb. Read this first.
- `styles.css` → `tokens/*.css` — every colour, type, space, radius, shadow and motion token. Use `var(--*)`; never hardcode a hex.
- `components/core/*.prompt.md` and `components/app/*.prompt.md` — one page each on what a component is and when to use it. The adherence rules live here.
- `ui_kits/coach-app/` — a working click-through of the app. Fork these screens rather than starting from scratch.
- `assets/logo/README.md` — mark variants, clear-space rules, and the SVG-in-email constraint.
- `frontend/apps/web/src/index.css`, `frontend/apps/web/tailwind.config.ts`, `frontend/packages/config/src/tokens.ts` — the tokens production actually renders, and the authority when this skill and the code disagree.

Paths are relative to the monorepo root (`PadelLevelUp/levapp`). Anything in this skill
still written as `levelup_frontend/` means `frontend/`; the repos merged on 2026-09-03.

## Non-negotiables
These now hold everywhere, prototype and production alike, because production renders this
system: blue is identity and action; green means done and nothing else; cards in lists use
borders, not shadows; every time/score/count is tabular; 44px touch targets; no emoji;
nothing bounces; pt-PT, addressed as *tu*.
