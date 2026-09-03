---
path: frontend/apps/web/e2e/availability/student-blockers.spec.ts
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 97
size_tokens: 880
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "ef1364b082bc046307ae1b578a45e1219130be5a1acef0b00925e19175b9187a"
---

## Purpose

PAD-28 baseline coverage for student availability-blocker management: a
student can reach the blocker UI, create a one-time blocker, create a
recurring blocker, and delete a blocker (gated by a confirm dialog). The
functional counterpart to `mobile-layout.spec.ts`'s viewport-fit checks
and `unavailable-student-notifications.spec.ts`'s cross-role coach-warning
checks.

## Connections

- Uses:
  - `helpers/auth.ts`: `loginAsStudent`.
- Used by: — (leaf spec file)
- Semantically related (not imports): `.specflow/specs/calendar/student-blockers.spec.md`;
  the same blocker CRUD surface is exercised more deeply, cross-role, by
  `availability/unavailable-student-notifications.spec.ts` (L3, this scope).
