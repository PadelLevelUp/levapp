# evidence/m3 — on-demand Android batch (ci-tools m3, PAD-710)

Not suite flows: the planner reads only `flows/*.yaml`, so nothing here reaches the nightly or a
`flows=.` run (test "keeps a flow under evidence/ out of every shard", maestro-shards.test.ts).
Run all of it in one job: `gh workflow run android-build.yaml --ref feature/ci-tools-android -f flows=evidence/m3`.

- `82-clear-player-notes-diag.yaml` (v2): the box text after each erase / input / Enter, and the
  server's note after each save.
- `132-email-prompt-diag.yaml`: what /me says after the PATCH and after the app's sign-in, and
  whether the prompt is below the fold; ends in a deliberate failure so Maestro saves the hierarchy.
- `fix-*.yaml`: copies of the flows fixed for the third dispatch (105, 46, 59, 33), paths
  re-rooted, so one dispatch proves them.

The whole folder is deleted before the stream PR.
