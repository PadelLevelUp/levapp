---
id: B-253
title: "A [skip-prepush] line in any commit of a push skips the gate for the whole push, and for every later branch that contains that commit"
type: incomplete-rule
severity: medium
status: triaged
affects:
  - .githooks/pre-push
  - .githooks/prepush-gate.sh
proposed_fix: "Honour the marker only on the tip commit of the pushed ref, or only for the push that first introduces the commit."
opened: 2026-10-02T12:47:22Z
---

# B-253: one justified skip exempts every push that contains its commit

**Source:** Session-A as integrator of batch wave 11a (PR #502), 2026-10-02. Found while pushing, not reproduced separately.

**What happens:** the pre-push hook's escape hatch is "a line `[skip-prepush: <reason>]` in one of the pushed commits' messages". The hook looks at every commit the push would add to the remote ref. A branch that merges or is cut from a branch carrying such a commit therefore skips the gate too, for a reason that was given for another push.

**Evidence:** pushing `batch/wave-11a` at 448ddd1b7 printed "pre-push gate SKIPPED for refs/heads/batch/wave-11a by a pushed commit: [skip-prepush: PAD-462 dropdown-menu.reopen timeout under load ~450; passes alone 3/3; outside this diff; coordinator D146]". The marker is on ab21ca03a, a commit of #500 (`feature/pad-477`), where the skip was justified for that push. The batch contained 88 changed files from three PRs and none of its checks ran at push time. The gate script, run by hand on the same head, passed (103 s).

**What should happen:** a skip covers the push it was written for. Any other push is gated.

**Consequence until fixed:** every branch that contains ab21ca03a skips its gate until that commit is in staging (the hook compares against the remote ref, so once it is in staging it is no longer a pushed commit for a branch cut from staging). The same holds for any future marker.

### Change plan (not started)
- Rule: the gate's own header comment and memory `prepush-gate` state the hatch's scope.
- Fix direction, one of: honour the marker only on the tip commit of the pushed ref; or only when the commit carrying it is not already on any remote branch (the push that introduces it).
- Test: a scratch repository with the hook; a marker on a non-tip commit must not skip.
- Until then: an integrator who sees "SKIPPED" runs `bash .githooks/prepush-gate.sh` by hand and says so in the PR.
