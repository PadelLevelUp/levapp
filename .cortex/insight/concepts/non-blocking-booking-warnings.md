Three coach actions that touch scheduling — creating a class (`AddClassSheet`), editing one (`ClassDetailSheet`), and notifying students (`AddClassSheet`, `ManualNotificationModal`) — surface a warning dialog on a risky condition but never hard-block the action; the coach always has a way to proceed. PAD-99 warns on a time-slot overlap (`OverlapConfirmDialog`); PAD-107 warns when a selected student marked the slot unavailable (`UnavailableStudentDialog`, also a toast); PAD-112 tells a coach, by name, which students were skipped because they opted out of notifications entirely (toast-only). All three share the same design decision: the real enforcement is server-side, the client-side warning exists purely to keep the coach informed — every check backing one of these dialogs fails open (an errored availability lookup is swallowed silently rather than blocking the save).

## Implemented by
`frontend/apps/web/src/components/calendar/OverlapConfirmDialog.tsx`
`frontend/apps/web/src/components/calendar/UnavailableStudentDialog.tsx`
`frontend/apps/web/src/components/calendar/AddClassSheet.tsx`
`frontend/apps/web/src/components/calendar/ClassDetailSheet.tsx`
`frontend/apps/web/src/components/calendar/ManualNotificationModal.tsx`

## Related concepts
[[single-occurrence-vs-series-scope]]
