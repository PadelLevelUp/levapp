---
concept: non-blocking-booking-warnings
---

# Non-blocking booking warnings

Three coach actions that touch scheduling — creating a class (`AddClassSheet`), editing one (`ClassDetailSheet`), and notifying students (`AddClassSheet`, `ManualNotificationModal`) — surface a warning dialog on a risky condition but never hard-block the action; the coach always has a way to proceed. PAD-99 warns on a time-slot overlap with an existing event (`OverlapConfirmDialog`). PAD-107 warns when a selected student marked the slot unavailable (`UnavailableStudentDialog`, also surfaced as a toast in `ManualNotificationModal` and `ClassDetailSheet`'s remind button). PAD-112 tells a coach, by name, which students were skipped because they opted out of notifications entirely (toast-only, no dialog — `ManualNotificationModal`, `ClassDetailSheet`). All three share the same underlying design decision: the enforcement (or lack of it) that matters is server-side; the client-side warning exists purely to keep the coach informed, so every check that backs one of these dialogs fails open (an errored availability lookup in `AddClassSheet.checkUnavailableThenSave` is swallowed silently rather than blocking the save).

## Members

- `frontend/apps/web/src/components/calendar/OverlapConfirmDialog.tsx` — PAD-99
- `frontend/apps/web/src/components/calendar/UnavailableStudentDialog.tsx` — PAD-107
- `frontend/apps/web/src/components/calendar/AddClassSheet.tsx` — orchestrates both, save pipeline
- `frontend/apps/web/src/components/calendar/ClassDetailSheet.tsx` — PAD-99 on edit, PAD-107/112 via remind button
- `frontend/apps/web/src/components/calendar/ManualNotificationModal.tsx` — PAD-107/112 toast split
