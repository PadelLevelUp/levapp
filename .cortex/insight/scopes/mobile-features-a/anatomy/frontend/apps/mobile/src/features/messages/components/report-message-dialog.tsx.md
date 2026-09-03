---
path: frontend/apps/mobile/src/features/messages/components/report-message-dialog.tsx
extracted_at: 2026-09-03T14:12:16Z
extraction_level: 2
size_lines: 140
size_tokens: 1132
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "56adc4f61a5fc80984dfc605aedf66a1d5be962d6ef734e2deadc3d1fef97a68"
---

## Purpose

Report dialog shared by two entry points: the message long-press context menu (report one specific message) and the chat header's "Report" action (reports the most recent message from the other participant). Preset reason radio list (spam/harassment/inappropriate/other) rendered as a plain `Pressable` list with a hand-drawn radio dot — no radio-group primitive is installed on mobile — plus optional free-text details, combined into one reason string and POSTed via `messagesApi.reportMessage`.

## Connections

Uses:
- `@levelup/api` (frontend/packages/api/src/index.ts): `messagesApi.reportMessage`.
- `@/components/ui/{dialog,button,text,textarea,toast}`, `@/lib/utils` (outside this scope): `cn`.

Used by: none within this scope — opened both from the message long-press menu and the chat header, outside this slice.

Semantically related (not imports): the hand-drawn radio-dot list mirrors the same "no primitive installed, roll a Pressable list" pattern used in `message-context-menu.tsx` and `chat-more-options-menu.tsx`.
