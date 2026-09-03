---
path: frontend/apps/web/src/pages/TermsPage.tsx
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 142
size_tokens: 1356
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "875ddeb388459620428756a8c2840a89883ef9fb6b86ca7705b554d419235beb"
---

## Purpose

Static legal page at `/terms`, also flagged as a template pending legal review (same disclaimer comment as `PrivacyPolicyPage.tsx`). Covers accounts (username/password only, no social sign-in), acceptable use, coach/player content responsibility, a pointer to the Privacy Policy for data handling and account deletion, suspension/termination, availability disclaimers, and change notices. Shares the same hardcoded `EFFECTIVE_DATE` and `privacy@levelup.app` contact constant pattern as `PrivacyPolicyPage.tsx`; not translated (no `react-i18next`).

## Connections

Uses: `react-router-dom` (`Link`, external), `@/components/ui/card` (outside this scope).

Used by: `frontend/apps/web/src/App.tsx`, mounted unguarded at `/terms`; linked from `AuthPage.tsx`, `PrivacyPolicyPage.tsx`, `RegisterPage.tsx`, `SupportPage.tsx` (all this scope).
