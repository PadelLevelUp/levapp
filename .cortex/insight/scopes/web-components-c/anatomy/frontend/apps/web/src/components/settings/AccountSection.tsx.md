---
path: frontend/apps/web/src/components/settings/AccountSection.tsx
extracted_at: 2026-09-03T14:16:04Z
extraction_level: 2
size_lines: 92
size_tokens: 778
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "3b0cb17925034bb0db89b6bb7db05abaf2b417dba83d5e8a7255194bc0704228"
---

## Purpose

`AccountSection` renders the Settings page's in-app account-deletion control, required for App Store guideline 5.1.1(v). It's a single destructive `Button` that opens an `AlertDialog` confirm, calls `deleteAccount`, and on success logs the user out and redirects to `/auth`; on failure it toasts and re-enables the button. The component's own doc comment records the deliberate design choice: a single confirm dialog, not a type-to-confirm input, matching the destructive-confirm pattern used elsewhere in the codebase rather than inventing a stricter one.

## Connections

Uses:
- `@/api/auth` (`deleteAccount`): the destructive call itself.
- `@/auth/AuthContext` (`useAuth` → `logout`): clears the session after a successful delete.
- `@/components/ui/{alert-dialog,button}`, `@/hooks/use-toast`: confirm-dialog UI and result feedback.
- `react-router-dom` (`useNavigate`): redirect to `/auth` post-delete.

Used by: not observed within this scope (rendered by the Settings page's Account tab, outside this scope).

Semantically related (not imports): shares its single-AlertDialog destructive-confirm pattern with `ImportHistorySection`'s "revert import" dialog and `StudentNotificationBlocksSection`'s "block everything" confirm — the codebase has no type-to-confirm precedent anywhere in Settings.
