---
path: frontend/apps/web/e2e/dashboard/dashboard-i18n.spec.ts
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 117
size_tokens: 1095
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "85c915ba5ce12669fa8260f5f4a58a0000b9302fc09191ba63bcc6cf9fa8247f"
---

## Purpose

PAD-77 regression coverage that the coach and student dashboards render
fully in Portuguese with no leftover English strings — several dashboard
labels used to be emitted as English literals by the backend and bypassed
i18n even when the selected language was pt. Each test switches language
via Settings at a forced desktop viewport (the switch hangs under mobile)
and restores English in a `finally` block so the shared seed DB stays
English for later specs.

## Connections

- Uses:
  - `helpers/auth.ts`: `loginAsCoach`, `loginAsStudent`.
  - `helpers/navigation.ts`: `openSettings`, `openDashboard`.
- Used by: — (leaf spec file)
- Semantically related (not imports): `.specflow/specs/dashboard/blocks.spec.md`;
  its `openPreferences`/`selectLanguage` helper pair is duplicated (not
  imported) in `editor/editor-i18n.spec.ts` (this scope) and
  `settings/language-preference.spec.ts` (sibling scope).
