---
id: R-033
title: "Work you did not write is adopted under your name, with what you re-ran and what you inherited labelled apart"
source:
  - ../../atlas/decisions/2026-09-13-adopting-unowned-work.md
governs:
  - "backend/padel_app/tests/**/*.py"
  - "frontend/apps/web/e2e/**/*.ts"
  - ".claude/skills/**/*.md"
confidence: EXTRACTED
status: active
---

# R-033 — Work you did not write is adopted under your name, with what you re-ran and what you inherited labelled apart

A change authored by an unattended job, another session, or anyone outside this conversation
does not merge on its own appearance. Someone who has read it takes it over, and the PR body
then carries three things:

1. **`Ran against:` as its first line** — the commit, the ref and the timestamp the verification
   actually ran against, in UTC with the zone named.
2. **An ownership paragraph**, in the first person: you reviewed the change, you reproduced the
   problem, you verified the fix, it is yours now.
3. **A section headed "Claimed by `<source>`, NOT re-verified by me"**, listing every claim you
   are inheriting rather than checking — full-suite numbers, root-cause probes, anything the
   source asserted about its own work — each with the reason you did not re-run it.

All three are required. The third is the one that gets dropped on a busy night and the one that
matters most.

**Why:** on 2026-09-13 an unattended `levapp-test-health` run opened a correct, small,
well-argued PR (#258) while six sessions were working. The change being good is the reason for
this rule, not an argument against it: a good PR from an unowned source is how the practice of
merging unowned PRs gets established, and the one that is wrong arrives at 3 a.m. months later
looking exactly as plausible. The same job had already cost a session an evening with a ticket
filed from a checkout six days stale (PAD-312 → PAD-333).

**Adoption launders provenance.** The moment your name is on the PR, the parts you checked and
the parts you inherited become indistinguishable to every future reader. A labelled list keeps
that boundary permanently visible and costs one heading.

**How to apply:**
- Verify before adopting, to the standard in R-034 — and re-run the smallest thing that
  distinguishes true from false rather than trusting a source's account of its own work. What
  you cannot re-run goes under requirement 3 with its reason.
- **A process defect in the source is a separate ticket, never a reason to reject a correct
  change.** #258's merge-base was `staging`'s head, zero commits behind, while the run that
  filed PAD-312 was six days back: same job, different runs, different facts. Judge the change
  on its merits; track the source's behaviour where it belongs.
- **The label works on a hunk, not only a whole PR.** Carrying one paragraph of someone else's
  wording is fine when the body says whose it is and that you did not verify it; that is
  cheaper than a follow-up PR nobody reviews. Send a reword to its author rather than silently
  changing their sentence.
- **Know what you can enforce.** A fix to a skill file in this repo binds the next run of that
  skill. What an unattended job is *told* to do lives in its routine definition outside the
  repo and is the owner's to change, so a rule aimed there is a recommendation we cannot merge
  — and saying so plainly is part of filing it.
- The rule governs an act rather than a directory; the globs above are where unowned work has
  actually arrived. It applies wherever the act does.
- Rule number 33 assigned by the coordinator on 2026-09-13.
