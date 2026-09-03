---
path: frontend/apps/web/src/components/calendar/OverlapConfirmDialog.tsx
extracted_at: 2026-09-03T14:16:49Z
extraction_level: 2
size_lines: 52
size_tokens: 365
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "8d60872f218a91703381e0e77e9852c96e07e1a1f27945deef12ed8ff5fadb96"
---

## Purpose

PAD-99's non-blocking "this time overlaps another event" warning dialog — a plain confirm/cancel `AlertDialog` with no scope choice (unlike `ClassScopeDialog`). Confirming proceeds with the save anyway; the check this dialog gates on never hard-blocks a booking, only warns.

## Connections

Uses: none within this scope; imports `@/components/ui/alert-dialog`, `react-i18next` — both outside this scope.

Used by: `frontend/apps/web/src/components/calendar/AddClassSheet.tsx` (create-time overlap warning) and `frontend/apps/web/src/components/calendar/ClassDetailSheet.tsx` (edit-time overlap warning when date/start/end changes).
