---
id: B-668
title: "PAD-702's config guard went red on staging: #788 (PAD-646) added the four ASC_* keys to both VM deploys after #797's CI had run, so sources.txt lacked them"
type: test-defect
severity: low
status: resolved
affects:
  - infra/k8s/overlays/staging/sources.txt
  - infra/k8s/overlays/prod/sources.txt
  - delivery.k8s-manifests
proposed_fix: "Add ASC_KEY_ID, ASC_ISSUER_ID, ASC_APP_ID (var) and ASC_PRIVATE_KEY (secret) to both overlays' sources.txt."
opened: 2026-10-22T15:30:00Z
resolved: 2026-10-22T15:45:00Z
---

# B-668: the k8s config guard went red on staging after two PRs crossed

**Source:** la-2110-SessionF, merging staging into #798 (PAD-703) after #797 (PAD-702) landed at
15:15 UTC on 2026-10-22.

**What happened:** `infra/k8s/tests/test_pad702_config.py` failed 4 tests on a clean checkout of
staging eaa5d508f (52 passed): `test_every_key_the_backend_reads_is_set_or_unset_on_purpose` and
`test_sources_equal_the_vm_deploy`, each for staging and prod. All four named the same keys:
`ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_APP_ID` and `ASC_PRIVATE_KEY`.

**Root cause:** #788 (PAD-646, work dashboard v2) added those keys to `config.py` and to the `-e`
lines of `deploy-staging.yaml` and `deploy-prod.yaml`. It merged before #797, but #797's CI was
green at 9421b13d5, before #788 landed, and its branch was never re-run against the new staging.
The guard did its job; its own data (`sources.txt`) was stale. k8s-lint has no path filter, so
every PR into staging then went red on it.

**Why test-defect:** the rule (delivery.k8s-manifests rule 9/10) and its test are right. The
test's fixture data fell behind a crossing merge, and no code is wrong.

### Resolution
- `infra/k8s/overlays/{staging,prod}/sources.txt`: the four keys, three as `var` and the private
  key as `secret`, with the same GitHub names as the VM deploys.
- `pytest infra/k8s/tests/`: 56 passed (was 4 failed, 52 passed).
- Left to #798 (PAD-703): its `_deploy-gke.yaml` write-config `env:` blocks must list the same
  four keys, because its test requires each block to equal `sources.txt`. That edit waits for the
  owner's approval.
- Lesson: a PR that adds a guard over a list other PRs also change should be re-run against
  staging right before it merges.
