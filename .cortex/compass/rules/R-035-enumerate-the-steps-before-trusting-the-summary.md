---
id: R-035
title: "Prove a procedure by enumerating its commands against what the system actually runs"
source:
  - ../../atlas/decisions/2026-09-13-prod-rollback-procedure.md
governs:
  - ".github/workflows/*.yaml"
  - ".cortex/atlas/decisions/*.md"
  - "backend/scripts/*.sh"
confidence: EXTRACTED
status: active
---

# R-035 — Prove a procedure by enumerating its commands against what the system actually runs

A summary of a procedure reads as though the procedure exists. Before a runbook, a recovery
path or a deploy change is called done, write it out as the commands someone will run, in
order, and check each one against what the system *actually* does at that point — the line in
the workflow, the entrypoint, the file on the host — not against what the design says it does.

**Why:** three times on one ticket (PAD-338), by two sessions independently, analysis produced a
confident summary and enumeration found it wrong:

- "the previous image survives, so it is a rollback mitigation" — writing the step "start the
  previous image" raised "what does it do when it starts": it runs `flask db upgrade`, and
  fails against a schema that has moved;
- "keep the last three images" — writing the pipeline against sample output showed one image on
  two rows, so it kept two;
- "the previous image is on the VM under its commit tag" — writing what the VM runs
  (`docker pull …:latest`) showed the commit tag never left the registry, and that the manual
  `docker run` needed secrets that live only in GitHub.

The first version of the decision recorded this as "a pattern worth liking, not yet seen twice
independently; if another session hits it on its own, it earns a number". Session A hit it on
its own on 2026-09-16. Number R-035 confirmed by the coordinator on 2026-09-16, with the title reworded.

**How to apply:**
- The one-command version of a recovery path is the deliverable; a paragraph describing the
  recovery is not. The rest of this list is how to get there.
- For every command in a runbook, name where its inputs come from (a file on the host, a
  secret in CI, a tag on a registry) and confirm that source exists *at that point in the
  sequence*. "It is on the VM" is a claim to check, not a premise.
- When a change adds a behaviour to a path nobody watches (a deploy script, a cron), test the
  pipeline against sample input that includes the shapes you did not design for: duplicates,
  one row, no rows.
- Write the cases that do not work as steps too, ending in "this has no recovery" where that is
  the truth. A reader who finds only the working cases assumes the others are covered.
