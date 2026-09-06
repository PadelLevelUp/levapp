---
id: B-020
title: "PAD-158's \"the sweep finds nothing left\" missed five English surfaces on the iOS app"
type: missing-criterion
severity: medium
status: resolved
affects:
  - settings.language
  - classes.detail-visibility
  - dashboard.blocks
  - frontend/apps/mobile/app/class/[id].tsx
  - frontend/apps/mobile/app/event/new.tsx
  - frontend/apps/mobile/app/event/[id].tsx
  - frontend/apps/mobile/app/player/new.tsx
  - frontend/apps/mobile/src/features/dashboard/DashboardBlocks.tsx
  - frontend/apps/mobile/src/components/ui/date-picker-input.tsx
related_specs:
  - .specflow/specs/settings/language.spec.md
  - .specflow/specs/classes/detail-visibility.spec.md
  - .specflow/specs/dashboard/blocks.spec.md
proposed_fix: "Render each surface through the existing locale tree or the shared date formatters; where the label came from a hardcoded array (weekday initials) delete the array and key off the day number."
opened: 2026-09-06T00:00:00Z
closed: 2026-09-06T00:00:00Z
---

# B-020 — PAD-158's "the sweep finds nothing left" missed five English surfaces on the iOS app

PAD-158 (every visible string in pt) and PAD-157 (dates in the app locale) both closed
claiming a clean sweep of `apps/mobile`. The 2026-09-06 simulator pass on a `pt-PT`
device found five surfaces still in English:

1. **`app/class/[id].tsx`** rendered the literal `Participants ({n}/{m})` on every class
   detail screen — while `calendar.detail.participants` (`Participantes`) and
   `calendar.detail.participantsCount` already existed in **both** locales and web's
   `ClassDetailSheet` already used them.
2. **The student dashboard's "As tuas próximas aulas"** printed `Mon 7 Sep · 10:00`. The
   backend's `_date_label` (`padel_app/tools/tools.py`) formats `dateLabel` server-side
   with `%a`/`%b`, which has no notion of the app's language; the generic `ClassList`
   block rendered it verbatim. The coach dashboard never showed the bug because
   `CoachDashboard.tsx` formats from ISO itself via `shortDate(iso, language)`.
3. **The new-event recurrence weekday chips** were an English initials array
   (`{value: 1, label: "M"}, …`) in `app/event/new.tsx` and `app/event/[id].tsx`, even
   though `availability.dayInitials.<0-6>` exists in both locales and both the class form
   and `BlockerForm` already used it. A pt app showed `M T W T F S S` for `S T Q Q S S D`.
4. **The in-app date picker's wheel** showed `September / October / November` beside its
   own `Concluído` / `Cancelar` buttons: `@react-native-community/datetimepicker` follows
   the *device* locale unless given a `locale` prop, and nothing passed one.
5. **`app/player/new.tsx`** set `"Failed to create the invite. Please try again."` as a
   raw string, the only literal `setError` left in the app.

The common thread is that the sweep looked for untranslated *keys*, not untranslated
*renderings*. Four of the five had the right translation sitting unused in
`src/locales/{pt,en}/`, and the fifth was a native control that needs a locale
identifier rather than a translated string. A `grep` for `t(` finds none of them.

Fixed under PAD-158's follow-up, except item 3 in `app/event/[id].tsx`, which was owned
by a concurrent PAD-160 branch at the time and is called out in that PR body.
