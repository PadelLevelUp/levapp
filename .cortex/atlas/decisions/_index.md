# Decisions — index

**Read this when:** you need the "why" behind a convention, an architecture choice, or
a rule — before proposing to change any of them.

**What's here:**
- `YYYY-MM-DD-<slug>.md` — one dated narrative per decision: what was chosen and why.

**How to navigate:** follow `compass_rules:` to the rules a decision produced,
`supersedes:` to the decision it replaced, and `sources:` to the raw material.
- [2026-09-06 — Open registration and connections](2026-09-06-open-registration-and-connections.md) — anyone registers; roster grows by QR/invite/claim; student↔student by username with block/report; supersedes PAD-137's pending-request model
- [2026-09-09 — Production stays on one gunicorn worker until SSE has a shared broker](2026-09-09-single-worker-until-sse-broker.md) — in-memory SSE registry is per-process; scale out needs Redis pub/sub first (R-027)
