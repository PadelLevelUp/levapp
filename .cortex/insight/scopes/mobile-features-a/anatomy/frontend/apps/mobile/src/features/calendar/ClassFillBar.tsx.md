---
path: frontend/apps/mobile/src/features/calendar/ClassFillBar.tsx
extracted_at: 2026-09-03T14:12:16Z
extraction_level: 3
size_lines: 70
size_tokens: 602
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "4df1f31cea86d185f9df7eed7a33c234bf4ba4c8f552981ad14bcd87cdb01503"
---

## Purpose

Three-way fill visualization for a class card: confirmed (solid) / awaiting-response (half-strength) / free seats (track). `participantCount` from the API is confirmed + awaiting — a player who hasn't answered still holds their spot — so a bare "7/16" can't tell you whether those 7 are actually coming; this bar can. React Native port of `apps/web/src/components/calendar/ClassFillBar.tsx`; the web version draws in `currentColor` (inherits whatever hue the parent card proved legible), but RN has no colour inheritance for `backgroundColor`, so the caller must resolve and pass a concrete `color` prop.

## Main players

- `ClassFillBar` (lines 26–69, critical): the sole export. Clamps `filled`/`confirmed` into `[0, capacity]`, computes percentage widths for the confirmed and awaiting segments via `withAlpha`-derived tints of the caller-supplied `color`, and renders nothing when `capacity <= 0`.

## Insights

- `withAlpha(color, alpha) ?? color` is a deliberate fallback: an undefined `backgroundColor` renders fully transparent in RN with no error, which would silently erase the awaiting/track segments if `color` ever arrives in a notation `withAlpha` can't parse. Falling back to the solid colour keeps the bar visibly correct (just less nuanced) instead of invisible.
- `accessibilityValue={{ min: 0, max: capacity, now: safeConfirmed }}` reports *confirmed*, not *filled*, as the progress value — the accessible semantics track "seats actually secured," not "seats spoken for."
- Values are clamped defensively (`Math.max(0, Math.min(...))`) even though callers are expected to pass sane numbers — this component never trusts its inputs to be in-range.

## Connections

Uses:
- `@levelup/config` (frontend/packages/config/src/index.ts): `FILL_AWAITING_ALPHA`, `FILL_TRACK_ALPHA`, `withAlpha`.

Used by:
- `frontend/apps/mobile/src/features/calendar/EventCard.tsx`: renders `<ClassFillBar>` inside the fill row, passing a colour already resolved for contrast against the card.

## Query pointers

If you need to change how class fill is visualized, also read: `EventCard.tsx` (the only consumer, and where `color` gets resolved before being passed in). If you need to keep parity with web, also read: `apps/web/src/components/calendar/ClassFillBar.tsx`.
