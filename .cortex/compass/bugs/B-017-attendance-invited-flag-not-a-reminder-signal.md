---
id: B-017
title: "Class-detail attendance shows \"Reminder sent\" for players no reminder was ever sent to"
type: layer-drift
severity: medium
status: resolved
affects:
  - attendance.presence
  - notifications.reminders
  - backend/padel_app/services/lesson_service.py
  - backend/padel_app/modules/notification_engine_api.py
  - frontend/apps/web/src/components/calendar/AttendanceRow.tsx
  - frontend/apps/mobile/src/features/calendar/ParticipantRow.tsx
  - frontend/src/locales/en/calendar.json
  - frontend/src/locales/pt/calendar.json
related_specs:
  - .specflow/specs/attendance/presence.spec.md
  - .specflow/specs/classes/instances.spec.md
  - .specflow/specs/notifications/reminders.spec.md
proposed_fix: "Stop overloading Presence.invited as a reminder signal. Either (a) gate the badge on the reminder/invitation record that actually exists in the notification engine instead of on Presence.invited, or (b) add a distinct column (e.g. Presence.reminder_sent_at) written only by the reminder flow and gate both shells on it, or (c) if the badge is meant to mean \"on the roster\", relabel the keys on both shells so they stop asserting a message was sent."
opened: 2026-09-06T00:00:00Z
resolved: 2026-09-09T00:00:00Z
---

# B-017 — Attendance's `invited` flag is not a reminder signal, but both shells label it as one

## What is wrong

Both shells render a status badge on every class-detail attendance row gated on
`Presence.invited`, and label the un-confirmed case as a *reminder that was sent*:

- `frontend/apps/web/src/components/calendar/AttendanceRow.tsx:78` — `{invited && (…)}`
  wraps the icon; `:95` renders
  `confirmed ? t("calendar.attendance.confirmedAttendance") : t("calendar.attendance.reminderSent")`.
- `frontend/apps/mobile/src/features/calendar/ParticipantRow.tsx:84-92` — `presence?.invited ? (…)`
  renders the identical pair of keys in a `Badge`.
- The strings those keys resolve to are assertions about a message having been sent:
  `frontend/src/locales/en/calendar.json` → `"reminderSent": "Reminder sent"`;
  `frontend/src/locales/pt/calendar.json` → `"reminderSent": "Lembrete enviado"`.

But `invited` is not set by the reminder flow. It is set unconditionally, for **every**
enrolled player, the moment an instance is materialized:

- `backend/padel_app/services/lesson_service.py:143-149` — inside
  `get_or_materialize_instance`, the loop `for rel in lesson.players_relations:` creates
  `Presence(..., invited=True, confirmed=False, validated=False)` for each enrolment. No
  notification has been produced at that point; `_maybe_schedule_instance` is only called
  afterwards (`:154`) and merely *schedules* jobs that may never fire (auto-invite off,
  instance cancelled, the coach never approving a semi-auto batch).

The backend already documents this in prose and relies on it elsewhere:

- `backend/padel_app/services/presence_overview_service.py:23-28` — "``Presence.invited`` is
  NOT a guest signal: materialization sets it True for every enrolled player
  (``lesson_service.get_or_materialize_instance``)."
- `backend/padel_app/tests/test_presence_overview.py:8` repeats the same caveat.
- `backend/padel_app/helpers/dashboard/kpis.py:64` filters `P.invited == True` as a proxy for
  *enrolled*, and `backend/padel_app/helpers/calendar_helpers.py:134` filters
  `Presence.invited == False` to find the *not-on-the-roster* case — both readings treat the
  column as roster membership, not as messaging state.

The only place that writes `invited` for a genuine invitation is
`backend/padel_app/modules/notification_engine_api.py:628` (`presence.invited = True` on a
vacancy fill), which sets the same column the materializer already set — so the two meanings
are indistinguishable once written.

## Consequence

On a class nobody was ever notified about, every roster row shows the warning-coloured
badge "Reminder sent" / "Lembrete enviado". The coach reads it as "I have already chased
these students", which is exactly the decision the badge exists to inform. The Portuguese
copy is if anything worse than the English, because `"Lembrete enviado"` is unambiguously
past-tense and unhedged.

This is a **shared** defect, wrong identically on both shells, so no user sees a
discrepancy — which is why it has survived. It is a layer drift, not a translation bug:
the presentation layer names a domain state the data layer does not carry.

## Why it is still shipping

Tracked as **PAD-199**. Recorded from PAD-158, which translated the mobile attendance badges. That ticket
deliberately kept parity with web's existing `calendar.attendance.*` keys rather than
inventing a mobile-only label — being wrong in two languages on two shells is recoverable
in one edit, whereas a mobile-only label would have made the two shells disagree and hidden
the real bug behind a cosmetic one. PAD-158 added no new attendance-semantics key; it only
reused what web already renders. The semantic fix is deliberately out of that ticket's
scope and belongs here.

## Proposed fix

Three options, in preference order:

1. **Gate on the notification record.** The notification engine knows what it actually sent.
   Expose that per-presence (a reminder/invitation row or a timestamp) and have both shells
   gate the badge on it. Correct by construction, no new denormalised state to keep honest.
2. **Add `Presence.reminder_sent_at`,** written only by the reminder/invitation paths, and
   gate both shells on it. Cheaper, but adds a second field that can drift from the engine.
3. **Relabel.** If the badge is really meant to say "on the roster for this instance",
   change `calendar.attendance.reminderSent` in both locale trees to say that, and rename
   the key so no future reader re-introduces the wrong reading. Cheapest; concedes the
   feature.

Whichever is chosen, the fix must land on **both** shells in the same ticket (R-024) —
`AttendanceRow.tsx` and `ParticipantRow.tsx` gate on the same field with the same keys.

## Resolution (PAD-199, 2026-09-09)

Option 1. `serialize_presence` now emits `reminderSentAt`, derived by
`presence_signal_service.reminder_sent_at_by_presence` from the newest `notification_reminder`
message for that (player, instance) or the message behind a `NotificationEvent` for the pair.
`AttendanceRow.tsx` and `ParticipantRow.tsx` gate the badge on it; `invited` is no longer read by
either shell. Rules: `attendance.presence` 1a, `calendar.event-detail` 3a.
