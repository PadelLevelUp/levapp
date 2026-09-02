---
name: autonomously-implement-ticket
description: >
  Implement a Linear ticket end-to-end AND open the pull request, fully autonomously, with no
  human-in-the-loop review step. Use this skill whenever the user wants a ticket taken all the way
  to an open PR without stopping for Discord/Tailscale review — e.g. they paste a prompt starting
  with "Autonomously implement the following ticket", or say "autonomously implement this ticket",
  "implement this ticket and open the PR", "take this ticket all the way to a PR", or "run this
  ticket end to end and open a PR". This is the hands-off sibling of implement-ticket: same
  spec-driven workflow (classify → E2E test → plan → implement → iterate → regression), but instead
  of serving a preview and pinging Discord for approval, it verifies in a browser and opens the PR
  for the user to merge. Do NOT ask the user any questions. Do NOT serve via Tailscale or notify
  Discord. Prefer this skill over implement-ticket when the user explicitly wants the PR opened
  without a manual review gate.
---

# Autonomously Implement Ticket — Spec-Driven, Straight to PR

Execute this entire workflow without asking the user any questions. If something is ambiguous,
make a reasonable decision and document it in the commit message and PR body.

The goal: take the ticket from nothing to an **open pull request** the user can merge. There is no
human review gate in the middle — no Tailscale preview, no Discord approval. Quality comes from the
spec classification, the E2E test, the full regression pass, and a quick browser sanity-check before
the PR goes up.

## Step 0: Pre-flight & Branch

```bash
source .claude/secrets.env
```

Check the current branch:
```bash
git branch --show-current
```

Expected: `feature/pad-<id>` or `feature/pad-<id>-<short-slug>` (lowercase ticket ID). If you're
already on it, continue.

If you're **not** on a feature branch (e.g. on `main`), create one yourself — this skill is meant
to run without the SessionStart hook. Derive the ID from the ticket and add a short slug (e.g.
ticket `PAD-123` → `feature/pad-123-player-export`), branching from the latest main:
```bash
git fetch origin main
git switch -c feature/pad-<id>-<short-slug> origin/main
```

## Step 1: Spec Classification

**Mandatory. Never skip.**

Use the `/classify-ticket` skill. Pass it the ticket's Title, Type, and Description.

It returns:
- Classification (Bug, Spec Gap, Spec Change, New Feature, Rule Violation, Standalone, or LEGACY_MODE)
- Related spec ID
- Any spec/rule changes (already committed by the skill)
- The acceptance criteria the E2E test should verify

If classification is LEGACY_MODE (no specs/ directory), proceed using the ticket description
directly for all subsequent steps.

## Step 2: Write E2E Test (TDD)

Use the `/write-e2e-test` skill.

**If specs exist:** Write the test from the acceptance criteria returned by `/classify-ticket` in
Step 1. The spec is the source of truth — if the spec and ticket disagree, the spec wins (it was
already updated in Step 1 if needed).

**If LEGACY_MODE:** Write the test from the ticket description directly.

The test MUST fail initially.

## Step 3: Plan the Implementation

Use the `/plan-implementation` skill. Include in the plan:
- The spec classification from Step 1
- The specific rules and acceptance criteria the implementation must satisfy
- Any impacted specs from the impact analysis

## Step 4: Execute the Plan

Implement the changes step by step:
- Backend: follow Flask/SQLAlchemy patterns in `levelup_backend/`
- Frontend: follow React/TypeScript/Tailwind/shadcn patterns in `levelup_frontend/`
- Bot: make changes to `levelup_issue_bot`
- Follow all rules in RULES.md

## Step 4b: Port it to iOS

If Step 4 touched `apps/web`, build the matching `apps/mobile` screen now — same
ticket, same branch. Parity is the default; web-only is the exception.

Checklist:
- [ ] Screen under `apps/mobile/app/(tabs)/` + implementation in `apps/mobile/src/features/<feature>/`
- [ ] Locale namespace hand-added to `apps/mobile/src/lib/i18n.ts` (**static imports** — pt AND en; without this the screen renders raw key paths)
- [ ] Same role gating as web
- [ ] Shared logic pulled into `packages/*` or a plain `.ts` module both shells import — the shells should differ in presentation only
- [ ] Verified in the simulator, not just typechecked

Skipping this needs a very strong reason recorded in the PR body and the spec.

## Step 5: Test & Iterate

Use the `/run-e2e-iterate` skill. Run the E2E test from Step 2. Max 5 iterations.

**NEVER modify test assertions to make them pass.** If the test is wrong, the spec is wrong — fix
the spec first (re-run `/classify-ticket`), then update the test.

## Step 6: Regression Check

Use the `/run-e2e-iterate` skill. Run ALL E2E tests. Max 5 iterations.

Before fixing a regression: understand WHY your change broke it. If it violated another spec's
rules, resolve at the spec level first, then fix the code.

Because no human reviews this before it becomes a PR, the full regression pass is your main safety
net. Don't open the PR with known-failing tests — if you genuinely can't get green within the
iteration budget, stop and report what's failing instead of opening the PR.

## Step 7: Update Spec Status

If a new spec was created in Step 1, update its `status:` to `implemented` now that tests pass.

## Step 8: Commit & Push

```bash
git add -A
git commit -m "<type>(PAD-<id>): <summary>"
git push -u origin HEAD
```

Use `fix` for bugs, `feat` for features, `refactor` for improvements.

Note: spec/rule changes were already committed separately by `/classify-ticket` in Step 1.

## Step 9: Browser Verification

Before opening the PR, sanity-check the change in a real browser with Claude in Chrome. This is the
last quality gate, so it's worth the few minutes — a green E2E suite can still miss an obviously
broken layout or interaction.

Serve locally (no Tailscale — localhost only):
```bash
if ! curl -s http://localhost:5000/ > /dev/null 2>&1; then
  cd levelup_backend && source .venv/bin/activate && source ../.claude/secrets.env && \
    nohup flask run --host 127.0.0.1 --port 5000 > /tmp/flask-ticket.log 2>&1 &
  cd ..
  sleep 3
fi

if ! lsof -i :8080 > /dev/null 2>&1; then
  cd levelup_frontend && nohup npm run dev > /tmp/vite-ticket.log 2>&1 &
  cd ..
  sleep 3
fi

curl -s http://localhost:8080/ > /dev/null 2>&1 && echo "Frontend OK" || echo "Frontend FAILED"
curl -s http://localhost:5000/ > /dev/null 2>&1 && echo "Backend OK" || echo "Backend FAILED"
```

Then drive the app with Claude in Chrome (`mcp__claude-in-chrome__*` — load via ToolSearch first if
the tools are deferred). Open `http://localhost:8080`, log in, and walk the specific flow the ticket
changed. Confirm the new behavior actually works and nothing adjacent is visibly broken.

- If it looks right, continue to the PR.
- If you find a real problem, go back to Step 4, fix it, and re-run Steps 5–6 before proceeding.

Note: this repo lives on iCloud Drive, so Vite HMR sometimes misses edits — if the page doesn't
reflect your changes, restart the Vite dev server rather than trusting a stale bundle.

## Step 10: Open the Pull Request

Open the PR with `gh` (GitHub account `pedropacheco95`). The branch is already pushed from Step 8.

Gather a quick change summary for the body:
```bash
CHANGED_FILES=$(git diff --name-only origin/main...HEAD)
```

```bash
gh pr create \
  --base main \
  --head "$(git branch --show-current)" \
  --title "PAD-<id>: <ticket title>" \
  --body "<body from template below>"
```

**PR body template:**
```
## Ticket
[PAD-<id>](<linear-ticket-url-if-known>)

## Classification
<Bug | Spec Gap | Spec Change | New Feature | Rule Violation | Standalone> — `<spec-id>`
<1-line: what the spec change was, or "spec unchanged">

## What changed
<2-4 lines describing what was implemented or fixed and why.>

## Files changed
<key files grouped by area: backend / frontend / specs — what changed in each>

## Testing
- E2E test: `<path/to/test.spec.ts>` (added/updated, passing)
- Full E2E regression: passing
- Browser-verified locally: <one line on the flow you walked through>

## Notes
<any reasonable decisions made for ambiguous parts of the ticket, or "none">
```

After creating the PR, **print the PR URL** so the user can open and merge it.

## Step 11: Cleanup & Stop

Stop the local dev servers you started for verification (leave any pre-existing ones the user was
running — only kill what this run spawned):
```bash
# only if this run started them
kill $(lsof -ti :5000) 2>/dev/null; kill $(lsof -ti :8080) 2>/dev/null; true
```

Then **stop.** The user reviews and merges the PR. Do not serve via Tailscale and do not notify
Discord — that's intentionally not part of this skill.

## Rules

- **NEVER ask the user questions.** Work with what you have.
- **NEVER skip spec classification (Step 1).** If specs/ exists, classify first.
- **NEVER skip the E2E test.** Writing the test first is mandatory.
- **NEVER skip the plan.** Planning before coding is mandatory.
- **NEVER modify test assertions just to make them pass.** Fix the implementation.
- **Spec changes get their own commit** (handled by `/classify-ticket`).
- **If a regression fails, check for spec conflicts first** before touching code.
- **Do NOT open the PR if tests are red.** A green regression suite is the gate that replaces human
  review here — if you can't get there, stop and report rather than opening a broken PR.
- **No Tailscale, no Discord.** This skill ends at an open PR; the user merges it.
- If something is genuinely impossible, document it and stop.
- If no specs/ directory, run in legacy mode — log it and proceed with the ticket description directly.
