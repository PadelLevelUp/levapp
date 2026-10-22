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
6. **Every backend install comes from `poetry.lock` (PAD-671).** That covers each CI job (the three
   lanes here, `e2e-subset`, `admin-e2e`, `android-build`) and the image (`backend/Dockerfile`,
   behind deploy-staging and deploy-prod).
   - Each one installs `backend/requirements.txt` (main) or `backend/requirements-dev.txt`
     (main + dev, for the test lanes) with `--require-hashes`, then the package itself with
     `--no-deps`. An upstream release cannot change what CI tests or what a deploy image holds.
   - Each site first pins pip itself (`pip==25.1.1`). The runners' and a fresh venv's pip 23.0.1
     reads a hashed requirement that another package asks for with extras (`google-api-core[grpc]`)
     as unpinned, and refuses the whole install. pip 23.3 and later accept it.
   - Both files are `poetry export` output, with hashes. Regenerate them whenever `poetry.lock`
     changes:
     `poetry export -f requirements.txt --only main -o requirements.txt` and
     `--with dev -o requirements-dev.txt` (Poetry 2.x needs `poetry-plugin-export`).
   - `test_pad671_installs_come_from_the_lock.py` fails in three cases:
     - an install site resolves the backend from `pyproject.toml` ranges, meaning any pip install of
       the backend path without `--no-deps` (continued and chained statements included), or a site
       without its own hashed requirements install before it;
     - an exported file names a different package set, version or hash set than `poetry.lock`;
     - it finds fewer install sites than it expects.

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

#### Backend installs come from the lock (rule 6)
- **Given** the workflows and `backend/Dockerfile`
- **When** a step pip-installs the backend
- **Then** it first installs a hashed `requirements*.txt` with `--require-hashes` and installs the
  package with `--no-deps`. Any bare install of the backend path makes the guard fail and name the
  file and line.
- **And** `requirements.txt` holds exactly `poetry.lock`'s main-group packages at their locked
  versions and hashes, and `requirements-dev.txt` holds all of the lock's packages the same way.
  py-vapid sits at 1.9.4 in both, where the 2026-10-14 incident pulled the broken 1.9.5.

#### Each shard has its own cap
- **Given** `backend-tests.yaml`
- **Then** the Postgres matrix job has `timeout-minutes: 60` and the SQLite job has 60

### Notes
- Rule 6 comes from the 2026-10-14 incident. py-vapid 1.9.5 (sdist with an absolute symlink) broke
  every `pip install .` job from ~19:10Z to ~19:40Z, while `poetry.lock` pinned 1.9.4 (PAD-671).
- Numbers that led here (PAD-654): the 14 green Postgres runs on 12–13 Oct had a median of 54 min
  (range 46–73) against a 75 cap; two runs used 94–98% of it. The suite is 4241 tests in 402
  files, in one flat directory, so a split by directory was not possible.
- No ruleset requires these checks by name, so renaming the Postgres job needed no owner step.
