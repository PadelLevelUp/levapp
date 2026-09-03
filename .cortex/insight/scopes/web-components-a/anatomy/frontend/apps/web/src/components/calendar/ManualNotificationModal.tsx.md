---
path: frontend/apps/web/src/components/calendar/ManualNotificationModal.tsx
extracted_at: 2026-09-03T14:16:49Z
extraction_level: 2
size_lines: 343
size_tokens: 3017
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d34b48cc90203ccef28642bb8f88f36ac042e8eb0ab396a8c88c621cd26f94b4"
---

## Purpose

The "Notify" modal opened from `ClassDetailSheet`'s footer: lets a coach select students (via `getNotificationGroups`-derived collapsible groups with tri-state select-all checkboxes, or a free-text search over eligible players) and manually send them a class invitation, excluding anyone already invited (`existingPlayerIds`). Its local `PlayerToggleRow` row component binds a `<label htmlFor>` to its checkbox (PAD-74) so clicking the checkbox, avatar or name toggles exactly once — the previous markup had onClick on the row *and* onCheckedChange on the checkbox, double-firing the toggle. On send, `handleSend` splits any skipped students by cause — PAD-107 "marked this slot unavailable" (toast.error, names listed) vs PAD-112 "opted out of notifications by preference" (toast.warning, names + reason) — so a short sent-count reads as the students' own choice rather than a failure, and suppresses the generic "sent to 0" toast whenever everyone was already covered by one of those two toasts.

## Connections

Uses: none within this scope; imports `@/api/notificationEngine` (`sendManualNotifications`, `getNotificationGroups`), `sonner` (`toast`), `@/components/ui/*` — all outside this scope.

Used by: `frontend/apps/web/src/components/calendar/ClassDetailSheet.tsx` — opened via the footer "Notify" button, passed `coachPlayers`/`existingPlayerIds` derived from the class's current roster/invitations.
