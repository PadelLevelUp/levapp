---
name: levapp-design-system
description: Use this skill to generate well-branded interfaces and assets for LevApp (formerly LevelUp), the padel/tennis academy app, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

# LevApp design system

The brand is **LevApp**. It was called **LevelUp**, and the codebase still is — repos
(`levelup_frontend/`, `levelup_backend/`), the npm scope (`@levelup/*`), `app.json`'s
`"name": "LevelUp"` and the web `<title>` all carry the old name. Treat "LevelUp" and
"LevApp" as the same product; write **LevApp** in anything new and user-facing, and
don't rename code identifiers unless asked to.

Read `readme.md` first, then the files below. If the user invokes this skill with no
other guidance, ask what they want to build, ask a couple of sharp questions, and act as
an expert designer.

## First decide which mode you are in

**This matters more than anything else in the skill.** The redesign described here is
**not implemented in production** — verified 2026-08-06, no navy hex appears anywhere in
`levelup_frontend`.

| Mode | What to do |
|---|---|
| **Prototype / mock / slide / artifact** | Use this system as-is. Copy assets out, write static HTML that imports `styles.css`, fork a screen from `ui_kits/coach-app/`. Navy + blue, `var(--lv-*)` tokens. |
| **Production code** (`levelup_frontend/`) | The app ships a **different, green** system: shadcn + Tailwind, HSL-triplet CSS vars. Match it. Use its token names (`bg-primary`, `text-muted-foreground`), not `--lv-*`. Bring across the *principles* here — borders not shadows, tabular numerals, one primary action, no emoji, pt-PT `tu` — not the palette. |

Introducing navy/blue into production is a rebrand, not a styling choice: it changes
`packages/config/src/tokens.ts`, which has a test asserting the primary **is** the green.
Do it only when the user explicitly asks for the redesign, and expect to update
`tokens.test.ts` alongside. See "Production reality" in `readme.md`.

## Where to look
- `readme.md` — content fundamentals (pt-PT, informal *tu*, no emoji), visual foundations, iconography, production reality, and eight rules of thumb. Read this first.
- `styles.css` → `tokens/*.css` — every colour, type, space, radius, shadow and motion token for the *redesign*. Use `var(--*)`; never hardcode a hex.
- `components/core/*.prompt.md` and `components/app/*.prompt.md` — one page each on what a component is and when to use it. The adherence rules live here.
- `ui_kits/coach-app/` — a working click-through of the app. Fork these screens rather than starting from scratch.
- `assets/logo/README.md` — mark variants and clear-space rules.
- `levelup_frontend/apps/web/src/index.css`, `apps/web/tailwind.config.ts`, `packages/config/src/tokens.ts` — the tokens production actually renders. Read these before touching production code.

## Non-negotiables
These hold in **both** modes. Blue is identity and action *in the redesign* — in
production the equivalent role is `primary`; either way, one accent carries identity and
action. Green means done and nothing else; cards in lists use borders, not shadows; every
time/score/count is tabular; 44px touch targets; no emoji; nothing bounces; pt-PT,
addressed as *tu*.
