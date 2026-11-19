# .githooks

`pre-push` runs `prepush-gate.sh` on what you push. Install once per clone (every worktree shares it):

```bash
git config core.hooksPath .githooks
```

What the gate checks, how to run it by hand (`bash .githooks/prepush-gate.sh`, `--full`,
`PREPUSH_DRY=1`) and which Node it uses are in the header of `prepush-gate.sh` and in "Before every
push: the pre-push gate" in `.claude/CLAUDE.md`. The frontend checks need Node 24.15.0 (`.nvmrc`);
the gate switches with nvm when it can and refuses Node 25 or newer otherwise (PAD-930).

## The escape hatch: `[skip-prepush: <reason>]`

A line `[skip-prepush: <reason>]` in the message of a pushed commit makes the hook skip the gate,
print the reason, and push. Never use `--no-verify`.

**The trade-off the owner took (PAD-720, 2026-10-21).** Skipping the local gate, for example overnight
when the machine is starved, trades local gate time for CI reds. Each red a skip lets through costs a
full CI run and a failure email to the pushing account, and the next push repeats both. The owner
accepted that trade for named situations only; it is a choice, not a default.

Rules for using it (the reasoning is in the header of `prepush-gate.sh`; do not restate it here):

- The reason names what is skipped: the known reds by test name or ledger id, or the situation and who
  decided it.
- Run the tests for what you changed anyway.
- A marker covers every later push that contains its commit, so drop it from the message once the
  reason is gone: `cortex/code/githooks/a-skip-prepush-marker-exempts-every-push-that-contains-its-commit.md`.
