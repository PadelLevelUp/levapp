---
id: B-155
title: "Settings sections reloaded when the language settled and silently undid an unsaved edit (web and iOS)"
type: incomplete-rule
severity: high
status: resolved
affects:
  - settings.coach-working-hours
  - calendar.seasons
  - evaluations.categories
  - frontend/apps/web/src/components/settings/WorkingHoursSection.tsx
  - frontend/apps/web/src/components/settings/SeasonsSection.tsx
  - frontend/apps/mobile/src/features/settings/working-hours-section.tsx
  - frontend/apps/mobile/src/features/settings/seasons-section.tsx
  - frontend/apps/mobile/src/features/settings/evaluation-categories-section.tsx
proposed_fix: "Loading effects read t/toast through refs and have empty deps; working hours also never lets a load replace a touched week. A ratcheted guard fails on any loading hook that lists t or toast."
opened: 2026-09-21T21:00:00Z
resolved: 2026-09-22T00:06:39Z
---

# B-155 — an edit made just after opening Settings was undone, without a word

**Source:** the release integrator's Playwright run of wave 1 (2026-09-21 20:46–20:55 UTC):
`coach-working-hours.spec.ts` red at :78 and :27 on a tree where Session D had reported "3/3". Two
of Session D's PRs (#347, #350) were dropped from the wave for it. Ticket PAD-392. Number from
Session D's second range (B-155–159).

**What happened:** a click on the working-hours card "changed nothing" — the Sunday switch read
"working" again; "add window" left 22:00 in place. The failure COUNT varied between runs on
byte-identical files (1 failed / 2 passed, then 2 failed / 1 passed): a race, not a stale bundle, a
seed difference or the add-window function.

**Where the wrong value first appears:** the section's load effect was
`useEffect(load, [t, toast])`, and `load` REPLACES the week. `t` gets a new identity when the
language changes — on web at every page load (i18n starts at "pt", `AuthContext` then applies the
account's language). The effect re-ran; `loading` gates only the first load, so the rows stayed
clickable while a second GET was in flight; when it resolved it overwrote the edit.

**Evidence, weakest to strongest:**
1. Session D's own PASSING log (2026-09-21 19:15 UTC): 8 GETs of `/coach/working-hours` for 4 page
   loads, two per load, and the app does not use React StrictMode. The signal was there, unread.
2. The integrator's traces: in BOTH failures the second GET resolved just after the click it
   undid — 57192 vs click end 57186 (:78), 18059 vs 18058 (:27), trace-monotonic ms; it left
   together with a second `GET /app/season`, right after `/auth/me` and `/app/coach` resolved.
3. Playwright, fresh seed each run: the existing spec on STAGING's components passed 3/3 (the race
   did not fire that night — plain runs were never the proof). A spec that holds later loads open
   and clicks during the hold was RED 3/3 on staging's components, each time at the assertion
   AFTER the hold ("off" expected, "working" received), and GREEN 3/3 on the fix, each printing
   `GETs=1 held=0`.
4. **Primary proof — component tests, no timing at all:** the mounted section is handed a NEW `t`
   after an edit. On staging's `WorkingHoursSection`: 2 failed / 1 passed (the day went back to
   "working"; three language changes made FOUR loads). On staging's `SeasonsSection`: 2 failed (the
   typed label "Epoca nova" was replaced by "2026/27"; four loads). On the fix: 3/3 and 2/2.

**Reach:** 36 hook dependency arrays naming `t`/`toast` were read across both apps (9 of them
multi-line, missed by a first single-line grep). AFFECTED, 5: working hours web + iOS, seasons web
+ iOS, evaluation categories iOS. NOT affected, 29 (refetches of read-only data, submit handlers,
labels). One structurally similar reset effect on iOS (`waiting-list-dialog`), unreachable, left.
NOT checked: deps other than `t`/`toast` that change when the account settles; `packages/hooks`.

**iOS, said plainly:** no behavioural proof exists or is possible today. Both shells render one
Settings section at a time, so "edit → switch language → edit survives" cannot be driven from the
UI (PAD-394, B-157); Maestro cannot hold a request open; the mobile test harness mounts no
components (PAD-393, B-156). iOS rests on: the same code shape as the web components proven
broken, the same fix, and the guard naming all three iOS sections on the old code and none on the
new.

**Affected specs:**
- Dev: `settings/coach-working-hours.spec.md`, `calendar/seasons.spec.md`, `evaluations/categories.spec.md`
- Business: no drift — no business spec describes when a settings form loads.

### Change Plan

No rule said when a Settings form loads or what a load may replace → incomplete rule. Component
tests first (red on staging's components), then the fix in all five sections, then a guard so the
next section cannot reintroduce it.

### Resolution

- Spec: `settings.coach-working-hours` rule 7 + criterion; `calendar.seasons` rule 15 + criterion;
  `evaluations.categories` rule 8.
- Code: the five sections — `t`/`toast` read through refs, empty deps; working hours also never
  lets a load replace a touched week, and clears that flag after a successful save.
- Tests: two web component tests (primary); the delayed-load Playwright spec (secondary; kept
  because it was stable 3/3 in both directions); the guard
  `apps/web/src/lib/loading-effects-deps.test.ts`, ratcheted both ways, its baseline generated from
  its own scan (10 reviewed-harmless loaders, each with a reason). The guard's own old/new check:
  with the five fixes reverted it names exactly the five sections; with them in place it passes,
  including on the tree with wave 1 merged in.
- Lesson recorded: a green run on an idle backend is a race won, not a property of the code.
- Resolved: 2026-09-22 (PAD-392).
