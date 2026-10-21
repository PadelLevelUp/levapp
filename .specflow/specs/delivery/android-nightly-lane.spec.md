---
id: delivery.android-nightly-lane
status: implementing
depends_on: [delivery.ci-images]
implements: ../../specs-business/delivery/owner-sees-breakage-before-release.business.md
---

# delivery.android-nightly-lane

### Intent
The whole Android Maestro suite runs every night on the emulator lane (`android-build.yaml`,
PAD-297) and finishes well inside its time cap. When something goes wrong the run is red and
names the flow. From 2026-10-08 to 2026-10-21 the single job hit its 100-minute cap every night,
and GitHub reported it as "cancelled". It cost about 115 runner minutes a night and gave no
signal (PAD-710).

### Entities
- **`android-build.yaml`**: the `apk` job, the `plan` step that picks the shard list, and the
  `maestro` matrix.
- **`.maestro/android-shards.json`**: the shard cut points (`starts`), the warm-up flow and the
  order-bearing `chains`.
- **`scripts/maestro-shards.mjs`**: the planner. It turns `config.yaml` plus `android-shards.json`
  into one workspace config per shard. It also holds the coverage check.
- **`scripts/ci-android-maestro.sh`**: runs one shard's Maestro process under the watchdog.

### Rules
1. **Who runs what.**
   - A pull request runs the smoke list in one job.
   - The schedule, and a dispatch whose `flows` is `.`, run the whole suite as N parallel shards.
     N is the length of `starts` in `android-shards.json`.
   - A dispatch with an explicit flow list runs that list in one job.
   - A pull request that changes the lane itself also runs the whole suite as shards. The lane
     files are `android-build.yaml`, `ci-android-maestro.sh`, `maestro-shards.mjs` and
     `android-shards.json`. Otherwise a lane change is first exercised by the nightly run on `main`,
     after promotion.
2. **A shard is a contiguous slice of the suite order.**
   - The suite order is `config.yaml`'s `flowsOrder`, followed by any `flows/*.yaml` it does not
     list, by file name.
   - Flows tagged `ios-only` or `open-defect-probe` are removed before slicing.
   - Shard k runs from `starts[k]` up to the flow before `starts[k+1]`.
   - Each shard is its own job, with its own emulator, its own freshly seeded database and a
     90-minute cap. One Maestro process runs per shard, with `continueOnFailure`.
   - Shards after the first begin with the warm-up flow (`01-login`), so every shard reaches its
     first flow from the same state the single job did.
3. **Coverage.** The planner's check fails, naming the flow, if any of these hold:
   - a runnable flow is in no shard or in two shards;
   - a tagged flow is in a shard;
   - a `starts` entry is not a runnable flow;
   - a `chains` entry is split across shards or appears out of order.

   Chains are flows that rely on an earlier flow's data, for example 03 creates the class 05
   deletes. A unit test runs the check against the committed files.
4. **A slow flow is a named red, never "cancelled".**
   - A watchdog in `ci-android-maestro.sh` reads the newest `maestro.log` for `Running flow <name>`
     lines.
   - It stops Maestro when one flow has run longer than `FLOW_LIMIT_MIN` (12). The slowest passing
     flow on 2026-10-21 was 7 min.
   - It also stops Maestro when the shard has run longer than `SHARD_BUDGET_MIN` (75). That fires
     before the job cap.
   - In either case it prints a GitHub `::error` naming the flow that was running, and the shard
     then exits 1.
5. **Results per shard.**
   - Each shard uploads `maestro-results-<shard>`. Artifact names are unique within a run.
   - Each shard writes its `[Passed]`/`[Failed]` lines and any watchdog stop to the job summary.
6. The Postgres service's health check names its database (`pg_isready -U … -d postgres`). Without
   it, every probe logged `FATAL: database "padel_app_user" does not exist`, about 1,200 lines a
   night.

### Acceptance Criteria

#### Every runnable flow is in exactly one shard
- **Given** the committed `config.yaml` and `android-shards.json`
- **When** the planner builds the shards
- **Then** the union of the shards, warm-ups aside, equals the runnable suite, and no flow appears
  twice
- **And** `36-android-evidence`, which is not in `flowsOrder`, is in the last shard
- **And** `47-push-tap-routing`, `122-warm-push-tap-shows-the-message`,
  `85-working-hours-invalid-day` and `92-working-hours-minute-grid` are in no shard

#### A split chain is refused by name
- **Given** a `starts` list that puts `05-class-deletion` in a later shard than `03-class-management`
- **When** the check runs
- **Then** it reports the chain `03-class-management → 05-class-deletion` as split

#### A shard's workspace config runs only its own flows, in order
- **Given** shard 2 of 4
- **When** the planner writes its config
- **Then** `flows` lists exactly `flows/01-login.yaml` and then shard 2's files
- **And** `flowsOrder` lists the same names in the same order, with `continueOnFailure: true`

#### A hung flow is named
- **Given** `maestro.log`'s last `Running flow 61-availability-two-cards` line, older than
  `FLOW_LIMIT_MIN`
- **When** the watchdog runs its check
- **Then** it stops Maestro and prints
  `::error title=Maestro flow over its limit::61-availability-two-cards …`
- **And** the shard exits 1, so the run is red rather than cancelled

#### The nightly suite fits
- **Given** the schedule on `main`
- **When** two consecutive nightly runs complete
- **Then** each shard either passes or fails and names its failing flows, and no shard is cancelled
  at its cap

### Notes
- Numbers that led here, from run 39568851531 on 2026-10-21:
  - 64 flows finished in 97 minutes, 47 passing and 17 failing.
  - Flow 61 was mid-run, not hung, when the cap hit.
  - The suite is 131 runnable flows, about 198 min of emulator time (64 measured, the rest at the
    91 s average).
  - The first cut points (`01-login`, `52-dialog-overlay-rate`, `66-academy-class-waitlist`,
    `121-class-request-ends-after-n-classes`) balance those estimates at about 47–54 min per shard.
  - Re-cut from the first nightly's measured durations.
- Per-shard databases are stricter than the old single job. A flow that silently relied on an
  earlier flow's leftovers fails on its own shard. That is a finding for the flow, and the fix is to
  add it to `chains` or make it self-contained.
- The 17 reds of 2026-10-21 are classified on PAD-710. Product defects are filed as their own
  tickets and are not fixed here.
