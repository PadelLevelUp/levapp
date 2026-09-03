---
path: frontend/apps/web/e2e/editor/editor-i18n.spec.ts
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 99
size_tokens: 1010
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d47a142e5c6f1cea67e995ac94ac7d9015c1673c6f1dd0d886ba42550ae7a2a0"
---

## Purpose

PAD-55 i18n coverage for the super-admin Editor tool (the seeded coach is
a super-admin) and a vendored shadcn/ui Sheet primitive's accessibility
label, checked in both English and Portuguese, plus confirming the root
path "/" no longer resolves to a dead scaffold ("Welcome to your blank
app"). Restores English afterward so the shared seed DB stays consistent
for later specs.

## Connections

- Uses:
  - `helpers/auth.ts`: `loginAsCoach`.
  - `helpers/navigation.ts`: `openSettings`.
- Used by: — (leaf spec file)
- Semantically related (not imports): duplicates (rather than imports) the
  `openPreferences`/`selectLanguage` helper pair also defined in
  `dashboard/dashboard-i18n.spec.ts` (this scope).
