---
path: frontend/apps/web/src/pages/SupportPage.tsx
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 62
size_tokens: 453
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "96a627bdb337f442fe85f02ffd332d5bdd6a474fc8f4ae88195423da463c0131"
---

## Purpose

Static support/contact page at `/support`: a single mailto link to `padellevelup2026@gmail.com` (the real support inbox, distinct from the placeholder `privacy@levelup.app` used on the legal pages) and cross-links to Privacy Policy, Terms, and sign-in. This is the page `LandingPage.tsx`'s "Recebi um convite" CTA points to, on the reasoning that a player with a dead or missing invitation link needs a human, and there's no tokenless invite-lookup flow to send them to instead.

## Connections

Uses: `react-router-dom` (`Link`, external), `@/components/ui/card` (outside this scope).

Used by: `frontend/apps/web/src/App.tsx`, mounted unguarded at `/support`; linked from `LandingPage.tsx`, `PrivacyPolicyPage.tsx`, `TermsPage.tsx` (all this scope).
