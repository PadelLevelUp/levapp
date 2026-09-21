# Archive register

One entry per ingested document — active and superseded. Updated by
`cortex-archive-ingest` on every ingestion or version update.

| Slug | Kind | Version | Status | Origin |
|---|---|---|---|---|
| `2026-09-03-monorepo-cortex-workspace-handoff` | handoff | 2026-09-03 | active | Claude Code session that executed the monorepo/Cortex migration; full text also at `docs/handoffs/` (local-only — `docs/` is gitignored) |
| `infra-handoff-2026-08-25` | handoff | 2026-08-25 | active | Infrastructure snapshot prepared 2026-08-25 for an infra discussion; two items now stale (B-003 fixed, tfstate claim wrong) — see `extracted/summary.md` |
| `notifications-internals` | technical-reference | 2026-08-25 | active | Pre-rewrite code snapshot of the notification engine; superseded by `.specflow/specs/notifications/` and the current code |
| `data-model-audit-2026-09-02` | audit | 2026-09-02 | active | Six-angle audit of the `levelup_backend` data model at pre-monorepo `98d58ca`; durable artifact linked from Linear PAD-188 (ticket-ising the findings). Ingested 2026-09-06 while investigating the messaging-ticket cluster — see `extracted/findings.md` |
| `privacy-policy-2026-09-06` | legal-document | 2026-09-06 | active | Reviewed Privacy Policy received by email 2026-09-06; not yet published — PAD-219, blocked on PAD-198 (parental consent) |
| `terms-of-service-2026-09-06` | legal-document | 2026-09-06 | active | Reviewed Terms of Service received by email 2026-09-06; not yet published — PAD-219, blocked on PAD-198 (parental consent) |
| `treino-quadro-tatico-2026-09-08` | design-canvas | 2026-09-08 | active | Claude Design canvas from the product owner for the redesigned Treino page: a three-mode tactical board (Magnético / Situações de jogo / Exercícios de cesto), desktop + mobile. Visual prototype only; behaviour inferred in `extracted/requirements.md`, open questions in `extracted/open-questions.md` |
| `2026-09-08-mobile-calendar-design` | design-canvas | 2026-09-08 | active | Claude Design canvas (Dia / Semana / Mês artboards) handed over 2026-09-08 as the new mobile calendar style for web-at-phone-widths and iOS; ingested while planning the restyle — see `extracted/summary.md` for the gaps the design leaves open |
| `sistema-de-avaliacoes-2026-09-21` | design-canvas | 2026-09-21 | active | Claude Design canvas from the product owner for the new evaluation system: per-class evaluation panel, 1–5 stars saved on tap, a grouped padel competency catalogue ("Gerir competências"), per-player evolution and history, a two-step "Partilhar avaliação" flow, and a reminder-frequency setting. Desktop coach web only; behaviour lives mostly in the script. Requirements `AV-001…AV-090` in `extracted/requirements.md`, 7 owner questions + 18 build defaults in `extracted/open-questions.md` |
| `sistema-de-avaliacoes-explained-2026-09-21` | technical-reference | 2026-09-21 | active | English explainer of the canvas above, audited against it; its unique content is the comparison with what ships at `00e53375f` (the player sees nothing today; history is stored but never served; per-category scales; what App Store 1.0/1.1.0 pin) — see `extracted/summary.md`. Full text also at `docs/reference/` (local-only) |
