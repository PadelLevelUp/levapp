---
path: frontend/packages/validation/src/index.test.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 297
size_tokens: 2290
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "76c002e8beaaa8e1de85bd834c208c9a8e49e8dfae7820d85a6304d7ab7b6c87"
---

## Purpose

Unit tests for every schema in `validation/src/index.ts` — valid-value acceptance, minimum-length rejections with exact message text, password-confirmation refinements (`registerSchema`, `coachInviteAcceptSchema`, `playerInviteAcceptSchema`), and the conditional `superRefine` rules on `classFormSchema` (days-of-week/end-date required only when recurring).

## Connections

Uses:
- `frontend/packages/validation/src/index.ts`: `usernameSchema`, `passwordSchema`, `loginSchema`, `registerSchema`, `coachInviteAcceptSchema`, `playerInviteAcceptSchema`, `playerFormSchema`, `classFormSchema`, `exerciseFormSchema`, `availabilityBlockerSchema` under test.

Used by: none (leaf test file).
