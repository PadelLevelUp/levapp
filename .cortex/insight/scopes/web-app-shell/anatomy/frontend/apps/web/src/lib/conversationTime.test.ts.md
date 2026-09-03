---
path: frontend/apps/web/src/lib/conversationTime.test.ts
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 3
size_lines: 62
size_tokens: 594
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "55b1adcedb45fb83614d90fc112f9e471031fe724eb9c1a0f9fce1bfdcdc70f9"
---

## Purpose

Vitest unit suite for `formatConversationTimestamp` (PAD-98), pinning the exact behavior at each relative-day boundary against a fixed reference "now" (Monday 2026-07-27 15:00 local).

## Main players

- `NOW` (line 5) — fixed reference `Date` all test cases anchor to, injected via the function's `now` option so the tests never depend on the real clock.
- `describe("formatConversationTimestamp (PAD-98)", ...)` (lines 7–61, critical) — six `it` cases: null input → `""`; same-day message → time-only pattern (`/\d{1,2}[:.]\d{2}/`), asserted to NOT match "yesterday"; a message from the prior calendar day → the exact `yesterdayLabel` string passed in (checked for both an English and a Portuguese label, proving the label is passed through verbatim rather than translated internally); a message 4 days back (Thursday) with `language: "en"` → `"Thu"`; the same Thursday with `language: "pt"` → asserted only to differ from `"Thu"` and be non-empty (does not pin the exact PT abbreviation string); a message 26 days back → short date matching `/2026/`.

## Insights

- The PT-weekday assertion is deliberately loose (`not.toBe("Thu")` + non-empty) rather than pinning the exact Portuguese abbreviation — a lower-confidence assertion than the EN case, likely to avoid coupling the test to date-fns's exact PT locale string.
- All test dates are constructed with the `new Date(year, month, day, ...)` local-time constructor (not UTC), so this suite's pass/fail is implicitly timezone-sensitive to whatever timezone the test runner executes in — the day-difference math depends on local calendar days, not UTC days.
- This file exists specifically because `conversationTime.ts` was designed to be pure and injectable (`now`, pre-translated `yesterdayLabel`) — the whole point of that design was to make exactly this kind of deterministic, no-mocking unit test possible.

## Connections

Uses: `./conversationTime` (`formatConversationTimestamp`, this scope), `vitest` (external, `describe`/`expect`/`it`).

Used by: run via `npm test` / `vitest` for the web app (this file is a leaf — nothing imports it).

## Query pointers

If you change `formatConversationTimestamp`'s day-boundary logic, update and re-run this file first — it is the executable spec for "today vs. yesterday vs. this week vs. older." If a test fails after a date-fns version bump, suspect the loose PT-weekday assertion or a timezone difference in the CI runner before assuming the implementation is wrong.
