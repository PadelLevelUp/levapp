---
id: delivery.backend-ci-lanes
status: implementing
depends_on: [delivery.ci-images]
implements: ../../specs-business/delivery/owner-sees-breakage-before-release.business.md
governed_by: [R-030]
---

# delivery.backend-ci-lanes

### Intent
The backend suite runs on both databases on every pull request (R-030), and finishes well inside
its time cap even on a loaded day. A lane cancelled at its cap holds a PR or a promotion for
another hour, and a test that no lane runs is a test nobody runs.

### Entities
- **`backend-tests.yaml`**: the `sqlite` job, the `postgres` matrix (groups 1 and 2), and the
  `shards` job.

### Rules
1. The SQLite lane runs the whole suite in one job (60-minute cap).
2. The Postgres lane runs as two pytest-split shards (`--splits 2 --group N`). Each shard is a job
   with its own database and a 60-minute cap. `flask db check` runs on group 1 only. The split is
   by test count until a durations file is committed.
3. Each shard writes the ids it selected (`LEVAPP_SHARD_IDS`). The `shards` job compares their union
   with a full `--collect-only` and fails, naming the ids, on a test that is in no shard, in two
   shards, or unknown to the collection.
4. The every-test-file-is-collected guard (B-127) holds inside a shard. The conftest records the
   items pytest-split deselects, and the guard counts them as collected. A `--collect-only`
   command is not a lane.
5. `test_backend_ci_timeouts.py` pins each cap by job name.

### Acceptance Criteria

#### The shards run every test exactly once
- **Given** shard id lists and a full collection
- **When** a test is in no shard, in both, or not in the collection
- **Then** `check_shards_cover_suite.py` exits 1 and names it
- **And** when the shards partition the collection, it exits 0 and prints the counts

#### The collection guard holds inside a shard
- **Given** the Postgres lane's pytest command with `--splits 2 --group N`
- **When** `test_a_full_session_collected_every_file_that_defines_a_test` runs in either shard
- **Then** it passes, because the other shard's files count as collected through the deselected items

#### Each shard has its own cap
- **Given** `backend-tests.yaml`
- **Then** the Postgres matrix job has `timeout-minutes: 60` and the SQLite job has 60

### Notes
- Numbers that led here (PAD-654): the 14 green Postgres runs on 12–13 Oct had a median of 54 min
  (range 46–73) against a 75 cap; two runs used 94–98% of it. The suite is 4241 tests in 402
  files, in one flat directory, so a split by directory was not possible.
- No ruleset requires these checks by name, so renaming the Postgres job needed no owner step.
