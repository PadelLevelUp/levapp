---
id: R-036
title: "Operational identifiers stay out of the tracked knowledge layer; docs/ is local and disposable"
source:
  - ../../atlas/decisions/2026-09-10-vm-ingress-nginx-only-ssh-stays-open.md
  - ../bugs/B-069-postgres-container-published-on-all-interfaces.md
governs:
  - ".cortex/**/*.md"
  - ".specflow/**/*.md"
  - ".claude/**/*"
  - "*.md"
check: "backend/padel_app/tests/test_public_knowledge_layer_guard.py — fails when a guarded identifier appears in a tracked knowledge-layer file"
confidence: MEASURED
status: active
---

# R-036 — Operational identifiers stay out of the tracked knowledge layer; docs/ is local and disposable

The repository is public, and so is everything tracked in `.cortex/`, `.specflow/` and
`.claude/`. Conventions, rules, decisions, domain terms and the bug ledger belong there. **The
operator's map of production does not**: the VM's name, the GCP project (and the bucket names
that carry it as a prefix), the zone, the public and internal addresses, the SSH command that
combines them, the account identities behind the consoles, and data-handling specifics that say
where a copy of the customer data lives. Each line is defensible alone; together they are a
reconnaissance package next to whatever port happens to be open that week (PAD-344, PAD-229).

**Where the operational half goes:** the local, gitignored `docs/infra/environment.md`. Tracked
runbooks refer to it by variable (`"$VM" --zone "$ZONE" --project "$PROJECT"`) or by role
("the VM", "the state bucket"). `.claude/secrets.env` stays the home for secrets, which were
never the problem here.

**`docs/` is local, untracked and disposable** (PAD-339). It does not travel to a clone, a
fresh worktree or a teammate, and it is not backed up. That is by design — it is what keeps
internal prose out of a public repository — so it is never tracked. Anything that must
outlive this machine is written into `.cortex/`, publicly.

**Why:** PAD-344 found `.cortex/compass/environment.md` world-readable with the VM's name,
project, zone, public IP, the exact SSH command, every container and host port, the identity
accounts and the fact that staging holds an unanonymised copy of production where prod
passwords work — beside PAD-229's then-open tcp:5000. PAD-339 found three sessions in one
night writing durable lessons into `docs/`, told by `.claude/CLAUDE.md` that it was "the one
home for prose", and losing them at the next worktree.

**How to apply:**
- Before writing a host, address, project, zone, bucket or console account into a tracked
  file, stop: it goes in `docs/infra/environment.md`, and the tracked file says "see the local
  map" or uses the variable.
- The guard test is the check: it hashes the identifiers, so it is not itself a map, and it
  scans `.cortex/` (minus the code-mirroring `insight/`), `.specflow/`, `.claude/` and
  root-level Markdown on every PR. A new identifier is added as a digest, never as text.
- The code carries what it needs (`backend/terraform/`, the workflows, `config.py`'s guard
  list). That is a separate, accepted exposure: the decision on 2026-09-16 was that the repo
  stays public and the knowledge layer stops aggregating the map; it was not to scrub IaC.
- No history rewrite: `main` and `staging` are ruleset-protected against force-pushes, a
  rewrite would break every clone, worktree and open PR, the same identifiers remain in the
  code's history regardless, and the exposure that made the map dangerous (tcp:5000, tcp:3389)
  is closed (PAD-229). Treat the identifiers as known-public; the rule stops the aggregate map
  going forward.
- Rule number from Session A's reserved range, 2026-09-16 (unconfirmed until the coordinator
  vetoes).
