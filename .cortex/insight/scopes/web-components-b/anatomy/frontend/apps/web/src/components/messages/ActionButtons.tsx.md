---
path: frontend/apps/web/src/components/messages/ActionButtons.tsx
extracted_at: 2026-09-03T14:17:06Z
extraction_level: 2
size_lines: 76
size_tokens: 618
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "c3b9766c0c5c599f39b00307f35b2b857dd234535ca23f5d8616b930c2c81f36"
---

## Purpose

Renders yes/no (accept/decline) response buttons for a `MessageAction` (e.g. responding to an invite-style message). Three states per action: already responded (shows a static accepted/declined pill), the viewer is the message's own sender (shows an italic "waiting for response" note instead of buttons — only the recipient can respond), or actionable (Check/X buttons calling `onRespond`).

## Connections

Uses: `@/components/ui/button`; `@/types` (`MessageAction`); `@/lib/utils` (`cn`).

Used by: not referenced by any other file in this scope (no `edges_within_scope`/`edges_crossing_scope` entry) — likely consumed by a messages-related page or a message-rendering path outside this scope's `files[]`, or is a leftover component superseded by the inline accept/decline UI now built directly into `MessageBubble.tsx` (which implements equivalent yes/no logic itself rather than delegating to this component).

Semantically related (not imports): `messages/MessageBubble.tsx`'s inline invite/reminder response buttons duplicate this component's accepted/declined/waiting-for-response state machine rather than reusing it.
