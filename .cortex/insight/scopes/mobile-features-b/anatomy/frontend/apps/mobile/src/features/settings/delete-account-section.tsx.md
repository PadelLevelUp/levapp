---
path: frontend/apps/mobile/src/features/settings/delete-account-section.tsx
extracted_at: 2026-09-03T14:12:18Z
extraction_level: 2
size_lines: 117
size_tokens: 984
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d81c6e127d7e24a6256d43fcdf9923169a016c49621a2427bd57806561e0509a"
---

## Purpose

`DeleteAccountSection` implements in-app account deletion, required by App Store guideline 5.1.1(v) and visible to all roles (not coach-gated). The confirmation flow is a single `AlertDialog` confirm — the doc comment explains this deliberately matches every other destructive flow already in this codebase (player remove, message delete): there is no type-to-confirm precedent anywhere, and the dialog copy already states the action is permanent and irreversible, so a two-step confirm (open dialog, tap confirm) is consistent rather than an outlier for this one action. On success it logs the user out via `useAuth().logout()`.

## Connections

Uses (external, not in this scope): `@levelup/api`'s `authApi.deleteAccount()`; `@/auth/AuthContext`'s `useAuth()` for `logout()`.

Used by: `frontend/apps/mobile/src/features/settings/account-section.tsx`: renders `<DeleteAccountSection />` beneath the legal-links card (visible via direct import in that file; not captured as a resolved in-scope edge in this scope's L1 data).
