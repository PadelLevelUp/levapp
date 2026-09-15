---
id: R-031
title: "Resolving a spec conflict in a batch: establish which side is stale and take the current one — never assume the batch's is newer"
source:
  - ../bugs/B-079-e2e-load-flakes.md
governs:
  - ".specflow/specs/**/*.spec.md"
  - ".specflow/specs-business/**/*.business.md"
confidence: OBSERVED
status: active
---

# R-031 — Resolving a spec conflict in a batch: establish which side is stale, and take the current one

A branch cut **before the previous batch landed** carries the spec text as it was *then*. When it
conflicts during integration, its side usually holds two things at once:

1. a rule the batch has since **reworded** — superseded text, and
2. one rule that is **genuinely new** — the branch's contribution.

**Check:** parse both sides into rules by number. For any number present on both sides,
**establish which side is stale and take the current one**; prefer HEAD's version only when you
cannot tell. Take the numbers unique to the incoming branch. A resolution that cannot state which
side is stale, and why, has not been understood — and "keep both" is not an answer to that
question, it is a way of not asking it.

**Not every conflict in this family is this one.** Ledger `_index.md`, `.maestro/config.yaml`
`flowsOrder` and `packages/config/src/index.ts` are append-only lists, and there keep-both *is*
correct. The distinction is whether the two sides are **adding to a list** or **restating the same
numbered item**. Only the relation between the two sides tells you which you are looking at —
the same shape as R-026's collision, which is why that became a test rather than a firmer
convention.

## Why the rule says "establish", and not "prefer the batch's version"

This rule was first written as *take HEAD's version of any number present on both sides*. That is
the common case and it is **silently wrong in the inverse one**. Within hours of being written it
met its counter-example: `attendance/presence.spec.md` rule 9 read "rule 8 is PAD-288's, **in
flight**" on staging and "rule 8 is PAD-288's, **landed in batch 6**" on the incoming branch —
853 characters, differing by one phrase — and the branch was right, because PAD-288 had landed.
The naive form would have reinstated stale text, nothing would have gone red, and the spec would
have quietly lied about what shipped.

Four conflicts in this one file on 2026-09-12, three in one direction and one in the other. A rule
that is right three times in four is not a rule; it is a habit with a good record. The heuristic
was mistaken for a certainty, which is the failure this week kept producing in other forms.

## What the assert catches

- **Reinstated text.** A rule 7 reading "HELD, waiting on the owner's answers to decisions 6-8"
  came back to life in a batch where those decisions had been taken the day before.
- **A dropped sentence.** Two sides' rule 8 looked identical in truncated output and differed by
  one appended clause about when the coach's phone is pushed. A blind keep-both dropped it,
  nothing failed, and only a superset check refused the merge.

Expect the author to disagree in good faith: a branch rebuilt on staging can report "no conflicts"
truthfully, because the clash exists only against the batch, which contains a PR the author never
saw. Tell them which two PRs collide; do not ask them to re-verify.
