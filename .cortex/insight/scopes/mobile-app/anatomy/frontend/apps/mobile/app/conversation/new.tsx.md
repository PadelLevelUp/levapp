---
path: frontend/apps/mobile/app/conversation/new.tsx
extracted_at: 2026-09-03T14:11:46Z
extraction_level: 2
size_lines: 143
size_tokens: 1310
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "94d88b5e8a8660162616ee2edd28d369c59826764955e3db163d00997624a5fe"
---

## Purpose

Start-a-conversation picker: searchable list of messageable users (excluding self). Picking someone either replaces navigation into an already-open conversation with them (checked against the first page of existing conversations) or creates a new one and navigates there.

## Connections

Uses:
- `frontend/apps/mobile/src/auth/AuthContext.tsx`: `useAuth()` for `me.id` (self-exclusion) (unresolved alias).
- `@/features/messages/hooks` (`useMessageableUsers`), `@/features/messages/utils` (`initialsOf`, `normalizeId`): outside this scope.
- `@levelup/api` (`messagesApi.createConversation`), `@levelup/hooks` (`useConversations`), `@levelup/config` (`lightTheme`), `@levelup/types` (`User`): outside this scope (packages).

Used by: no file within this scope.

## Insights

- The existing-conversation check only looks at the FIRST 100 conversations (`useConversations(1, 100)`) — good enough to catch the common case of reopening a recent thread, but a very active user with >100 conversations could still get a duplicate-looking navigation if the target conversation has fallen off that page. The backend create endpoint is trusted to handle the actual dedup/reuse semantics.
