# evidence/m3 — on-demand Android batch (ci-tools m3, PAD-710)

Not suite flows: the planner reads only `flows/*.yaml`, so nothing here reaches the nightly or a
`flows=.` run (test "keeps a flow under evidence/ out of every shard", maestro-shards.test.ts).
Run all of it in one job: `gh workflow run android-build.yaml --ref feature/ci-tools-android -f flows=evidence/m3`.

- `fix-46-tactical-board.yaml`: a copy of 46 as fixed on this branch, paths re-rooted, so one
  dispatch proves it.

The whole folder is deleted before the stream PR.
