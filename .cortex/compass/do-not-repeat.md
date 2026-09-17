# Do not repeat

Index of recurring-mistake rules. Each entry points at a rule in `rules/`.

- **Writing a durable lesson into `docs/`** — it is local, untracked and dies with the worktree; three sessions did it in one night (PAD-339). Durable → `.cortex/`, publicly. → [R-036](rules/R-036-operational-identifiers-stay-out-of-the-public-knowledge-layer.md)
- **Writing the VM's name, address, project, zone, bucket or the SSH command into a tracked file** — the repo is public and the aggregate is a map (PAD-344). Local `docs/infra/environment.md`, variables in runbooks. → [R-036](rules/R-036-operational-identifiers-stay-out-of-the-public-knowledge-layer.md)
- **Stating a time after an API stall without re-reading the clock** — a coordinator session resumed after an API stall reads the clock again with `date -u` before stating any time; the 2026-09-16 coordinator reported 18:26 for 21:26. Same family as [machine-local-zone-is-WEST](environment.md): timestamps come from `date -u` in the same command as the work.
