# Summary — monorepo cutover, Cortex adoption, Google Workspace (2026-09-02/03)

Three repos became one (`PadelLevelUp/levapp`, history preserved, old repos archived). Releases now flow feature → PR → `staging` (staging.levapp.app) → PR → `main` (levapp.app), enforced by rulesets and a source-branch guard. Cortex 3.3 was initialised at the root: 85 developer leaves migrated, 33 business outcomes authored, 24 compass rules, 14 ledger bugs (7 surfaced by insight extraction and filed as PAD-173…179), 679 insight entries and 26 concepts. The production JWT/session secret defect (B-003) was fixed with a startup guard and a one-time rotation. `levapp.app` gained Google Workspace (one seat, `admin@levapp.app`, aliases `noreply@`/`hello@`) with MX/SPF/DMARC in Cloudflare; DKIM is time-gated by Google until ~2026-09-06.

Committed full text: `docs/handoffs/2026-09-03-monorepo-cortex-workspace-handoff.md`. Decisions extracted to `.cortex/atlas/decisions/` (see `extracted/decisions/`).
