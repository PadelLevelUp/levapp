---
id: decision.2026-09-13-adopting-unowned-work
title: Adopting work we did not write, and what counts as proving a fix
date: 2026-09-13T21:30:00Z
compass_rules:
  - R-033
  - R-034
---

# Adopting work we did not write, and what counts as proving a fix

On 2026-09-13, while six sessions worked in parallel, a scheduled unattended job
(`levapp-test-health`) put two artefacts in front of us within a day of each other. The first
was a Linear ticket, PAD-312, reporting a backend test as broken; it had been produced from a
checkout parked on a feature branch six days old, and a session spent most of an evening
proving the failure had already been fixed. The second was a pull request, #258, fixing a real
clock-dependent defect in a test seed — correct, small, well argued, and opened from a checkout
that was exactly level with `staging`.

Two decisions came out of that pairing.

**The change is adopted, not merged.** Nothing authored by an unattended job merges without
someone who has read it standing behind it. The quality of #258 is the reason rather than the
counter-argument: a good pull request from an unowned source is how the practice of merging
unowned pull requests gets established, and the one that is wrong will arrive at three in the
morning looking just as plausible. The adopting session's body carries a `Ran against:` line, a
first-person ownership paragraph, and a section naming every claim it inherited without
re-running — because after adoption, the parts that were checked and the parts that were
inherited are indistinguishable to every later reader. That became R-033.

**A fix is proven by four runs.** #258's residual question was whether the fix could be right
about the cause and wrong about the outcome: the seeded block still spanned UTC midnight, the
exact shape of B-058. Four runs of one test file answered it — old code with the trigger
present and absent, new code with both — and took seconds. Verifying only that the fix is green
proves neither that the bug existed nor that the change is what removed it. That became R-034,
deliberately kept separate from R-033: someone verifying a fix they wrote themselves will never
open a rule about adopting other people's work, and they are the population that most needs it.

A third question, whether the job should be allowed to open pull requests at all, is recorded
against PAD-333 as a recommendation rather than a rule. The job's routine definition lives
outside this repository and is the owner's to change; nothing we can merge here constrains it.
