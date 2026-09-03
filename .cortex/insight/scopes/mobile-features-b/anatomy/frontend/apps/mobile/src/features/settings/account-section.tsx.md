---
path: frontend/apps/mobile/src/features/settings/account-section.tsx
extracted_at: 2026-09-03T14:12:18Z
extraction_level: 2
size_lines: 78
size_tokens: 559
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "415b70dec7c1e2e9bde4c7f9762d3e772a46796682082c891f0e8be8b5bd27e6"
---

## Purpose

`AccountSection` is the Settings "Account" pane: the hosted legal pages (privacy policy, terms of service, opened via `Linking.openURL` through an unexported `LegalLinkRow` helper) plus in-app account deletion. Both satisfy App Store guideline 5.1.1 requirements. The doc comment notes these links were previously loose cards scattered on a flat settings screen; they now live in one place (mirroring where web keeps its legal links, inside the Account tab), preserving the original testIDs (`settings-legal`/`settings-privacy-policy`/`settings-terms`/`settings-account`) on the same elements rather than duplicating them elsewhere.

## Connections

Uses: `frontend/apps/mobile/src/features/settings/delete-account-section.tsx`: renders `<DeleteAccountSection />` directly beneath the legal-links card (imported via the `@/features/settings/delete-account-section` path alias; not captured as a resolved in-scope edge in this scope's L1 data, but visible directly in the import statement).

Used by: no in-scope file imports this section (no in-edges in this scope's L1 data) — it is presumably composed into the Settings screen's section router outside this scope, alongside `settings-sections.ts`'s `"account"` entry.

Semantically related (not imports): `frontend/apps/mobile/src/features/settings/settings-sections.ts` — its `SETTINGS_SECTIONS` registry defines the `"account"` nav entry (`labelKey: "settings.nav.account"`) that presumably routes to this component, though the routing itself lives outside this scope.
