# Rules — index

**Read this when:** you are about to write or edit project files — check whether a
rule's `governs` glob matches the target path first.

**What's here:**
- `R-NNN-<slug>.md` — one file per rule: title, source, governed globs, optional machine check.

**How to navigate:** follow `source:` to the atlas decision or bug justifying the
rule; `governs:` names the constrained paths; `check:` is the testable predicate.
- [R-027 — SSE fan-out is per-process: one gunicorn worker until a shared broker exists](R-027-sse-single-gunicorn-worker.md) — governs the Dockerfile and deploy workflows
