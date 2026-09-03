---
path: frontend/apps/web/src/pages/PrivacyPolicyPage.tsx
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 192
size_tokens: 1991
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "c3c02851329e6526c161a84d5c395a384ea440ea5c658f4bfd8e5e030a257e2c"
---

## Purpose

Static legal page at `/privacy`, explicitly flagged in a header comment as "a template — review with legal counsel before publishing." Covers what's collected (account info, optional phone, message content, class/attendance/evaluation data), how it's used, that data is never sold, message-content handling, retention, and — the most operationally concrete section — account deletion: describes that Settings → Account → "Delete account" signs the user out everywhere, anonymizes their PII (name/email/phone/photo), and removes them from coach/player lists, while retaining an anonymized record so other users' class/attendance/message history stays coherent. Hardcodes `EFFECTIVE_DATE` and `PRIVACY_CONTACT_EMAIL` (`privacy@levelup.app`) as local constants — not sourced from config or i18n. Not translated (`react-i18next` is not imported; all text is hardcoded English).

## Connections

Uses: `react-router-dom` (`Link`, external), `@/components/ui/card` (outside this scope).

Used by: `frontend/apps/web/src/App.tsx`, mounted unguarded at `/privacy`; linked from `AuthPage.tsx`, `RegisterPage.tsx`, `SupportPage.tsx`, `TermsPage.tsx` (all this scope).
