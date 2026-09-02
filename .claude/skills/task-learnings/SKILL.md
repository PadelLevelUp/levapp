---
name: task-learnings
description: Capture session learnings that should have been in the context from the start. Use this skill at the end of any ticket implementation, debugging session, or substantial task where you encountered surprises — things you had to figure out, debug, or work around that weren't documented in CLAUDE.md, existing skills, or the codebase. Trigger this whenever the user says "/task-learnings", "save learnings", "what did you learn", or at the end of an implement-ticket workflow. Even if the user doesn't ask, consider suggesting it after any session where you spent significant time debugging something that better documentation would have prevented.
---

# Task Learnings — Capture What Should Have Been in Context

After completing a task, reflect on what you learned during the session that **should have been available from the start**. The goal is to build a knowledge base that prevents future sessions from wasting time rediscovering the same things.

## What to capture

Focus on things that were **surprising, non-obvious, or cost you time** — not things that are easily discoverable from reading the code. Good learnings fall into these categories:

### 1. CLAUDE.md gaps
- Missing or incorrect documentation (wrong ports, missing env vars, outdated paths)
- Undocumented conventions or patterns that you had to discover by trial and error
- Prerequisites or setup steps that aren't mentioned

### 2. Skill improvements
- Steps that existing skills should include but don't (e.g., port cleanup before E2E tests)
- Wrong assumptions baked into skill instructions (e.g., incorrect directory names)
- Missing context that would have saved debugging time

### 3. UI/API patterns
- Component behavior that's non-obvious and matters for testing or implementation
- API endpoint patterns that don't follow expected conventions
- Caching, state management, or data flow quirks

### 4. Infrastructure gotchas
- Port conflicts, server reuse issues, environment variable requirements
- Test infrastructure quirks (Playwright config, database setup, etc.)
- Build/deploy surprises

### 5. New skill candidates
- Repeated workflows that could be automated with a new skill
- Complex multi-step processes you had to figure out from scratch

## What NOT to capture

- Things easily found by reading existing code or docs
- One-off bugs specific to a single ticket with no broader lesson
- Implementation details that are already in the commit history
- Anything already documented in CLAUDE.md or existing skills

## Where learnings belong — CLAUDE.md vs. learnings file

CLAUDE.md is loaded into every session's context. It should only contain **generic, broadly applicable** knowledge — things that are relevant across many different tasks and tickets. Think: conventions, environment setup, infrastructure patterns, testing commands.

Do **not** suggest adding task-specific details to CLAUDE.md. If a learning only applies to a narrow feature area (e.g., "the PlayerDetailPage has two Edit buttons"), it belongs in the learnings file or in the relevant skill — not in CLAUDE.md. Future sessions working on unrelated features don't need that in their context.

**Rule of thumb**: If the learning would help fewer than ~30% of future sessions, keep it in `.claude/learnings/` or in a specific skill. Only suggest CLAUDE.md additions for things like:
- Environment variables, ports, or setup steps that affect all workflows
- Conventions that apply project-wide (API patterns, testing patterns, commit format)
- Corrections to existing CLAUDE.md content that is wrong or outdated
- Infrastructure gotchas that any session could hit (port conflicts, server reuse, etc.)

## How to write the learnings file

### Step 1: Determine the task name

Use the ticket ID if available (e.g., `PAD-19`, `LVL-42`). If there's no ticket, use a short descriptive slug (e.g., `fix-calendar-crash`, `setup-redis-cache`).

### Step 2: Reflect on the session

Think through the session chronologically and identify:
- Where did you get stuck or waste time?
- What assumptions turned out to be wrong?
- What did you have to discover through debugging that docs should have told you?
- Did any existing skill lead you astray with incorrect instructions?
- Are there patterns you discovered that future tasks will need?

### Step 3: Write the file

Save to `.claude/learnings/<task-name>.md` with this structure:

```markdown
# <TASK-NAME> — Learnings

## Things that should be in CLAUDE.md, skills, or environment

### <Category: e.g., "Environment Variables", "UI Patterns", "E2E Infrastructure">

- **What happened**: Brief description of the issue or surprise
- **What should be documented**: The specific knowledge that would have helped
- **Where it belongs**: Specific skill name, "new skill", or CLAUDE.md (only if generic and broadly applicable — see "Where learnings belong" section above)

(Repeat for each learning)

## Suggestions for Skills / Workflow Improvements

### <Skill name or "New skill: name">
- Specific, actionable suggestion
- Include the exact text or step that should be added/changed where possible
```

### Step 4: Be specific and actionable

Bad: "The database setup was confusing"
Good: "`POSTGRES_PORT` in playwright.config.ts defaults to `5432`, not `5433` as CLAUDE.md says — this caused E2E tests to connect to the wrong database for 10 minutes of debugging"

Bad: "Skills need better docs"
Good: "The `/run-e2e-iterate` skill should start with `kill $(lsof -ti :5001,:8080) 2>/dev/null` to prevent reusing stale dev servers"

Each learning should contain enough context that a future session can understand the issue and apply the fix without having to rediscover anything.

### Step 5: Confirm with the user

After writing the file, briefly summarize the learnings to the user. Ask if there's anything else from the session they think should be captured. The user may remember friction points you didn't notice.

## Output

The file goes in: `.claude/learnings/<task-name>.md`

After saving, tell the user:
- How many learnings were captured
- A one-line summary of each
- Whether any seem urgent enough to apply to CLAUDE.md or skills right now (offer to do it if so)
