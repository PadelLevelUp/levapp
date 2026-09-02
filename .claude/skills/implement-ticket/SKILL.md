---
name: implement-ticket
description: >
  Autonomously implement a Linear ticket end-to-end using spec-driven development. Use this skill
  whenever the user pastes a prompt that starts with "Implement the following ticket" or contains a
  ticket block with fields like Ticket, Title, Type, Priority, Description, and Reporter. Also
  triggers when the user says "implement this ticket", "work on this ticket", or "execute this
  ticket". Routes through spec classification first, then executes the full workflow from E2E test
  through implementation to serving and Discord notification. This variant STOPS for
  Discord/Tailscale review before any PR is opened — it never opens the PR itself. If the user
  wants the ticket taken straight to an OPEN pull request with no review gate (they say "open the
  PR", "all the way to a PR", "skip the review", "no Discord/Tailscale", "hands-off", "I'll merge",
  or start with "Autonomously implement the following ticket"), use autonomously-implement-ticket
  instead. Do NOT ask the user any questions.
---

# Implement Ticket — Spec-Driven Autonomous Workflow

Execute this entire workflow without asking the user any questions. If something is ambiguous,
make a reasonable decision and document it in your commit message.

## Step 0: Pre-flight

```bash
source .claude/secrets.env
```

Verify branch:
```bash
git branch --show-current
```
Expected: `feature/<ticket-id-lowercase>`. If not, create it manually.

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

**If specs exist:** Write the test from the acceptance criteria returned by `/classify-ticket`
in Step 1. The spec is the source of truth — if the spec and ticket disagree, the spec wins
(it was already updated in Step 1 if needed).

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
- Bot: make changes to levelup_issue_bot
- Follow all rules in RULES.md

## Step 5: Test & Iterate

Use the `/run-e2e-iterate` skill. Run the E2E test from Step 2. Max 5 iterations.

**NEVER modify test assertions to make them pass.** If the test is wrong, the spec is wrong —
fix the spec first (re-run `/classify-ticket`), then update the test.

## Step 6: Regression Check

Use the `/run-e2e-iterate` skill. Run ALL E2E tests. Max 5 iterations.

Before fixing a regression: understand WHY your change broke it. If it violated another spec's
rules, resolve at the spec level first, then fix the code.

## Step 7: Update Spec Status

If a new spec was created in Step 1, update its `status:` to `implemented` now that tests pass.

## Step 8: Commit

```bash
git add -A
git commit -m "<type>(<ticket-id>): <summary>"
git push -u origin HEAD
```

Use `fix` for bugs, `feat` for features, `refactor` for improvements.

Note: spec/rule changes were already committed separately by `/classify-ticket` in Step 1.

## Step 9: Serve via Tailscale

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

tailscale serve --bg --set-path / http://localhost:8080
```

Get the preview URL:
```bash
tailscale status --json | jq -r '.Self.DNSName' | sed 's/\.$//'
```

## Step 10: Notify Reporter on Discord

Extract reporter info from ticket prompt. Build the notification message.

```bash
CHANGED_FILES=$(git diff --name-only main...HEAD | head -15)
BACKEND_COUNT=$(echo "$CHANGED_FILES" | grep -c "^levelup_backend/" || echo 0)
FRONTEND_COUNT=$(echo "$CHANGED_FILES" | grep -c "^levelup_frontend/" || echo 0)
SPEC_COUNT=$(echo "$CHANGED_FILES" | grep -c "^specs/" || echo 0)
RULE_COUNT=$(echo "$CHANGED_FILES" | grep -c "^RULES.md" || echo 0)
TOTAL_COUNT=$(echo "$CHANGED_FILES" | wc -l | tr -d ' ')
```

**Message format:**

For **Bug**:
```
<@DISCORD_USER_ID> — **TICKET-ID** is ready for review!

**What happened:** Bug fix — the code wasn't matching the spec.
**Spec:** `<spec-id>` (unchanged — the spec was already correct)
**What was wrong:** <1-line explanation of what the code did vs what the spec says>

**Branch:** `feature/ticket-id`
**Preview:** https://tailscale-hostname
**Changes:** X files (Y backend, Z frontend)

**Files changed:**
<file list>

React with ✅ when approved, then I'll run `/open-pr`.
```

For **Spec Gap**:
```
<@DISCORD_USER_ID> — **TICKET-ID** is ready for review!

**What happened:** Spec gap — this scenario wasn't covered by any acceptance criteria.
**Spec:** `<spec-id>` (updated)
**What was added:**
> ### <criterion name>
> - **Given** <precondition>
> - **When** <action>
> - **Then** <expected outcome>
**Why:** <1-line explanation of why this case was missing>

**Branch:** `feature/ticket-id`
**Preview:** https://tailscale-hostname
**Changes:** X files (Y backend, Z frontend, W specs)

**Files changed:**
<file list>

React with ✅ when approved, then I'll run `/open-pr`.
```

For **Spec Change**:
```
<@DISCORD_USER_ID> — **TICKET-ID** is ready for review!

**What happened:** Spec change — existing behavior was updated.
**Spec:** `<spec-id>` (modified)
**What changed:**
> **Before:** <old rule or criterion, 1 line>
> **After:** <new rule or criterion, 1 line>
**Why:** <1-line explanation from ticket>
**Impact:** <N other specs affected: list them>

**Branch:** `feature/ticket-id`
**Preview:** https://tailscale-hostname
**Changes:** X files (Y backend, Z frontend, W specs)

**Files changed:**
<file list>

React with ✅ when approved, then I'll run `/open-pr`.
```

For **New Feature**:
```
<@DISCORD_USER_ID> — **TICKET-ID** is ready for review!

**What happened:** New feature — new spec created.
**Spec:** `<spec-id>` (new)
**What was added:**
> **Intent:** <spec intent, 1-2 lines>
> **Acceptance criteria:** <N criteria>
> - <criterion 1 name>
> - <criterion 2 name>

**Branch:** `feature/ticket-id`
**Preview:** https://tailscale-hostname
**Changes:** X files (Y backend, Z frontend, W specs)

**Files changed:**
<file list>

React with ✅ when approved, then I'll run `/open-pr`.
```

For **Rule Violation**:
```
<@DISCORD_USER_ID> — **TICKET-ID** is ready for review!

**What happened:** Rule enforcement — code refactored to follow project conventions.
**Rule:** <rule ID or description>
**What changed:** <1-line explanation>
**Why:** <what was wrong with the old pattern>

**Branch:** `feature/ticket-id`
**Preview:** https://tailscale-hostname
**Changes:** X files (Y backend, Z frontend)

**Files changed:**
<file list>

React with ✅ when approved, then I'll run `/open-pr`.
```

For **Standalone**:
```
<@DISCORD_USER_ID> — **TICKET-ID** is ready for review!

**What happened:** <Infrastructure/CI/dependency change — no spec involvement>

**Branch:** `feature/ticket-id`
**Preview:** https://tailscale-hostname
**Changes:** X files

**Files changed:**
<file list>

React with ✅ when approved, then I'll run `/open-pr`.
```

Send via webhook:
```bash
curl -H "Content-Type: application/json" -d '{"content":"<message>"}' "$DISCORD_WEBHOOK_URL"
```

## Rules

- **NEVER ask the user questions.** Work with what you have.
- **NEVER skip spec classification (Step 1).** If specs/ exists, classify first.
- **NEVER skip the E2E test.** Writing the test first is mandatory.
- **NEVER skip the plan.** Planning before coding is mandatory.
- **NEVER modify test assertions just to make them pass.** Fix the implementation.
- **Spec changes get their own commit** (handled by `/classify-ticket`).
- **If a regression fails, check for spec conflicts first** before touching code.
- If Discord webhook is not set, skip notification but still serve.
- If Tailscale is not available, skip serving but still notify Discord.
- If something is genuinely impossible, document it and stop.
- If no specs/ directory, run in legacy mode — log it and proceed with ticket description directly.