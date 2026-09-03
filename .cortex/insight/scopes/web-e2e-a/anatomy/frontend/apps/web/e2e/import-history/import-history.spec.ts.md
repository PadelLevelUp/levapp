---
path: frontend/apps/web/e2e/import-history/import-history.spec.ts
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 231
size_tokens: 2274
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "351aff969c2f139e637ee96b4bf1346b7e5ffd5f6a9068fc2078dcf37b6ea45e"
---

## Purpose

PAD-21 coverage for the import-history section under Settings → Import
Data: seeded imports (via the non-streaming `/api/app/import/confirm`
endpoint) show up as history entries with date/item-count metadata, and
the revert flow — open a confirmation dialog naming the affected item
counts, cancel without deleting, or confirm and have exactly that upload's
imported players removed while other uploads' players remain (verified by
per-name search, since pagination can put them off page 1).

## Connections

- Uses:
  - `helpers/auth.ts`: `loginAsCoach`, `COACH_USERNAME`, `COACH_PASSWORD`.
  - `helpers/navigation.ts`: `openSettings`.
- Used by: — (leaf spec file)
- Semantically related (not imports): `.specflow/specs/import/revert.spec.md`;
  `seedImportViaAPI` seeds via the pre-streaming confirm endpoint that
  `import-history/import-confirm-504.spec.ts`'s PAD-11 fix supersedes.
