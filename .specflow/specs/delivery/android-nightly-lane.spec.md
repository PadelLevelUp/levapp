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
   - **1b. A pull request that changes flow files also runs exactly those flows** (PAD-710
     follow-up). This is one more job, `changed`, next to whatever else the PR runs.
     - The changed flows are the files under `.maestro/flows/*.yaml` that the PR adds or modifies
       and that are runnable (tagged and deleted flows drop out).
     - They run in suite order, led by the warm-up, on their own fresh emulator and database.
     - Every flow edit gets an Android proof on its own PR in minutes, without the four-shard cost.
       A change under `subflows/` alone does not trigger the job, because it would touch many flows.
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
7. **While the lane is being brought up, a red is reported, not failed (PAD-720).**
   - While `ANDROID_LANE_EXPERIMENTAL` is `"true"` in `android-build.yaml`, each Maestro step runs
     with `continue-on-error`, so a red shard does not fail the run and GitHub sends no failure email.
   - Each shard writes `shard-verdict.txt`: exit code, flows expected, flows finished, and any
     watchdog stop.
   - The `lane-result` job reads every shard's artifact and posts one check run, **Android lane**:
     - `success` when every flow passed in every shard;
     - `neutral` while the lane is experimental and something is red;
     - `failure` once the lane is strict. A failure also fails the run.
     - The check's summary names each red flow with its reason, each watchdog stop, and each shard
       that reported nothing.
   - The lane turns **strict** when the flag is removed, or automatically on a scheduled run on
     `main` whose two previous scheduled runs both posted a `success` Android lane (the PAD-710
     acceptance). Pull requests stay neutral while the flag is set.

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

#### A pull request's changed flows run on their own (rule 1b)
- **Given** a pull request that modifies `flows/27-unknown-sender-block.yaml` and
  `flows/47-push-tap-routing.yaml`, and deletes `flows/99-gone.yaml`
- **When** the plan runs
- **Then** the matrix holds `changed` next to `all`, and the changed job's config lists exactly
  `01-login` then `27-unknown-sender-block`
- **And** `47-push-tap-routing` (tagged `ios-only`) and the deleted flow are not in it

#### An experimental red lane is neutral, a strict one fails (rule 7)
- **Given** shard 2 reports `[Failed] 27-unknown-sender-block (…) (Element not found: chat-back)`
  and shard 3 left no artifact
- **When** the lane is experimental and has fewer than two recent greens
- **Then** the Android lane check is `neutral`, and its summary names `27-unknown-sender-block`,
  its reason, and "shard 3 reported nothing"
- **And** with the flag off, or after two scheduled greens on `main`, the same input is `failure`,
  and a run where every flow passed is `success`

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
