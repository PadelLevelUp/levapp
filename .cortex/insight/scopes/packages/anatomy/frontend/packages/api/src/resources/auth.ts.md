---
path: frontend/packages/api/src/resources/auth.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 58
size_tokens: 450
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d8bb04a56f1902bda4b1661f9cbdd7b22d91e5da0b486b3757af30bac0245db2"
---

## Purpose

The signed-in user's own profile: `getMe`, partial `updateMe` (PAD-81, only sent keys are changed server-side), and `deleteAccount` (App Store 5.1.1(v) compliance — soft-deletes the account and invalidates all sessions server-side). `MeResponse` also carries the student's own three INDEPENDENT notification-block preference flags (PAD-112), where `blockAllNotifications` is a superset in effect but never implies or clears the other two.

## Connections

Uses:
- `frontend/packages/api/src/client.ts`: `getApi()` for `/auth/me` GET/PATCH/DELETE.

Used by:
- `frontend/packages/api/src/index.ts`: re-exported as `authApi`.
