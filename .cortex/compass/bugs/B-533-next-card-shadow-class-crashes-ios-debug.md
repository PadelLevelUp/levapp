---
id: B-533
title: "iOS debug build: switching the student's calendar to 'Só as minhas aulas' could crash with \"Couldn't find a navigation context\" — the card that became the next class gained a shadow-md class after its first render"
type: incomplete-rule
severity: high
status: resolved
resolved: 2026-10-15T10:30:00Z
affects:
  - .specflow/specs/calendar/mobile-views.spec.md
  - frontend/apps/mobile/src/features/calendar/EventCard.tsx
proposed_fix: "The next class's lift is inline style (Tailwind's shadow-md as shadowColor/Offset/Opacity/Radius + elevation); the card's className no longer depends on being next."
opened: 2026-10-15T09:00:00Z
---

# B-533: the next card's shadow class crashed the iOS debug build

**Source:** PAD-675, found by the promotion 13 gate (flow 270 red 1 in 2); la-1410-SessionB.

**What happens:** `EventCard` added `shadow-md` to its className only while it is the next class.
`nextEventId` is computed from the student's filtered events, so tapping "Só as minhas aulas" can
make an already-mounted card the next class. Tailwind's `shadow-*` sets CSS variables
(`--tw-shadow…`); react-native-css-interop treats a component that starts setting variables after
its first render as an "upgrade", and in a dev build prints a warning that stringifies the
component's props — which threw "Couldn't find a navigation context", a Render Error over the
calendar. A release build skips the warning path (only remounts). Same family as PAD-664's filter
control (d78bde521) and memory native-modal-sheet-traps-ios.

**Evidence (2×2):**
- Base, staging 86d2a03de, pinned iPhone 17 Pro, debug build from Metro: flow 270 ×3 → 2 red
  (65 COMPLETED / 1 FAILED at "Scroll until calendar-relation-invited" after
  `calendar-student-filter-mine`), 1 green (77/0); Metro logged "Couldn't find a navigation context"
  twice, once per red run.
- Unit `next-card-static-class.test.tsx`: red on the base (className `rounded-2xl p-4 shadow-md
  active:opacity-90` vs `rounded-2xl p-4 active:opacity-90`; no inline shadow), green after.
- Fix: flow 270 ×3 on the same device and data (see PAD-675's PR).
