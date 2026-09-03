---
path: frontend/apps/web/src/components/dashboard/coach/primitives.tsx
extracted_at: 2026-09-03T14:17:06Z
extraction_level: 3
size_lines: 258
size_tokens: 1738
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "8c469a804cb31c982d46dcd86de43c381b83ce4c128494f3761fbecf8c700e50"
---

## Purpose

The shared visual vocabulary for the coach dashboard, imported by every `dashboard/coach/*` block (`NeedsYouQueue`, `NextClassHero`, `Schedule7Days`, `WeekPulse`) so each block doesn't re-decide the same rules independently. Encodes: green (`success`) means "done" and nothing else, amber (`warning`) means "needs the coach" and no other status colour exists on this screen; a badge only renders when it carries information; every time/date/x-of-y count is `tabular-nums` so columns don't jitter; list cards use borders, never shadows — the hero (`NextClassHero`, outside this file) is the only gradient surface allowed.

## Main players

- `Eyebrow` (lines 16–33) — critical. Section label: uppercase, tracked, muted `<span>` — deliberately never a heading element, so it doesn't participate in document outline/heading-level semantics.
- `FillBar` (lines 40–66) — critical. Capacity bar; amber fill only when the class is under capacity (`short`), otherwise `bg-primary`. A full and an under-filled class must never look alike — this is what replaced an older uniform-red bar.
- `FillCount` (lines 69–81) — supporting. `filled/capacity` text, coloured amber only when short, otherwise muted; always `tabular-nums`.
- `AvatarStack` (lines 90–133) — critical. Overlapping player-initial circles with a `+n` overflow badge; the `onNavy` prop swaps the separating ring and overflow-badge colours to match `NextClassHero`'s permanently-navy surface (the ring would otherwise use the theme's `card` colour, which is wrong on a surface that never inverts).
- `StatusBadge` (lines 139–158) — critical. Exactly two tones by design: `attention` (amber) and `done` (green) — no third tone exists, which is what keeps the two meaningful.
- `ActionCard` (lines 166–206) — critical. A queue-row card with an optional 4px left accent (`attention` amber or `accent` blue) and full keyboard/click interactivity (`role="button"`, Enter/Space handling) when given `onClick`. Only two accents exist; items with nothing urgent get none, which is what makes the accent mean something when present.
- `StatCard` (lines 213–234) — critical. A metric card that always pairs `value` with a `sub` denominator line — the `sub` prop is required, not optional, because a bare count alone tells the coach nothing about whether it's good or bad.
- `Sparkbars` (lines 240–257) — supporting. Desktop-only 7-bar trend, `aria-hidden` (decorative), with the most recent bar highlighted (`bg-primary` vs `bg-primary/25`) and a 6%-height floor so an empty day still shows a visible baseline rather than nothing.

## Insights

- This file is the single place the coach dashboard's colour-semantics contract lives: green=done-only, amber=needs-coach-only, badges/accents are opt-in signals rather than decoration. Every consuming block (`NeedsYouQueue.tsx`, `NextClassHero.tsx`, `Schedule7Days.tsx`, `WeekPulse.tsx`) relies on these primitives to keep that contract consistent instead of re-implementing badge/accent logic per block.
- `AvatarStack`'s `onNavy` prop is a concrete instance of a broader pattern in this codebase: components that must render correctly on a surface that does NOT follow the light/dark theme inversion (the sidebar/hero navy) need an explicit prop rather than relying on semantic tokens alone.
- `Sparkbars`'s minimum bar height (`Math.max(6, ...)`) is a deliberate UX decision, not a Recharts-style animation workaround (contrast with `presences/PresenceCharts.tsx`'s `isAnimationActive={false}`, a different codebase — Recharts is not used here, these are hand-rolled `<span>` bars).

## Connections

Uses: `@/lib/utils` (`cn`) for conditional classNames; `react` (`ReactNode` type only).

Used by (all within this scope, via `resolvedImports`): `dashboard/coach/NeedsYouQueue.tsx` (`ActionCard`, `Eyebrow`), `dashboard/coach/NextClassHero.tsx` (`AvatarStack`), `dashboard/coach/Schedule7Days.tsx` (`Eyebrow`, `FillBar`, `FillCount`, `StatusBadge`), `dashboard/coach/WeekPulse.tsx` (`Eyebrow`, `Sparkbars`, `StatCard`).

Semantically related (not imports): `presences/PresenceMarkToggle.tsx` — cites the same "design tokens, not raw palette colours" rationale (`success-strong` etc. exist because the solid tint is unreadable on its own 15% wash), applied to a different domain (attendance marks rather than dashboard badges).

## Query pointers

If you need to add a new coach-dashboard block, read this file first for the shared card/badge/accent vocabulary before inventing new markup.
If you need to change the dashboard's colour-semantics rule (what green/amber mean, when a badge shows), this is the one file to change — every consuming block inherits it.
If you need the desktop/mobile breakpoint the dashboard blocks key off, read `dashboard/coach/useIsDesktop.ts` next (this file has no breakpoint logic of its own; blocks that need it use Tailwind's `lg:` directly or the hook).
