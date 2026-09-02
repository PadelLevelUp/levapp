---
name: plan-implementation
description: Create a right-sized implementation plan for a ticket before writing any code. Use this skill after writing the E2E test and before starting implementation. Triggers when Claude needs to plan how to implement a bug fix or feature, or when the user says "plan this", "create a plan", or "how should we implement this".
---

# Plan Implementation

Create an implementation plan for the current ticket. Do NOT write any code — only produce a plan. **Invest planning effort proportional to the ticket's complexity.**

## Step 1: Quick Triage (always do this first, fast)

Classify the ticket along two dimensions:

**Type:**
- **Bug fix**: Something is broken
- **Feature**: Something new
- **Improvement**: Something exists but needs to change

**Complexity** (determines how much research you do):
- **Low** — Frontend-only: UI changes, new components, styling, copy changes, adding a page that uses existing API endpoints. No backend changes.
- **Medium** — Full-stack but additive: new endpoint + frontend, adding a column with migration, new service method. No changes to existing data relationships.
- **High** — Destructive or structural: deleting/modifying models, changing relationships (FK, M:N), altering cascades, modifying auth/permissions, anything that could break existing data or affect multiple roles.

## Step 2: Research (depth matches complexity)

### Low complexity (frontend-only)
- Use Glob/Grep to find the 1-3 frontend files involved
- Check if there's an existing similar component/page to follow as a pattern
- **That's it.** Skip domain analysis entirely. Go straight to writing the plan.

### Medium complexity
- Find the relevant backend files (route, service, model, serializer) with Glob/Grep
- Find the frontend files that will consume the API
- Check if a migration is needed
- **No Explore agent needed.** Direct file reads are sufficient.

### High complexity
- Do everything from Medium, plus:
- Spawn an Explore agent (subagent_type=Explore, thoroughness=medium) to assess domain impact:
  - Data model relationships around affected entities (FKs, joins, cascades, backrefs)
  - All consumers of the affected data (services, routes, serializers, frontend)
  - Scope check: is the ticket's proposed approach the right abstraction? Common pitfalls:
    - Deleting a record when the intent is removing a relationship
    - Adding a field to one entity when it belongs on a relationship or separate table
    - Building for one role without considering other roles
    - Assuming 1:1 when the data is 1:N or M:N
  - If the approach seems wrong, flag it prominently — it may change the strategy

## Step 3: Write the Plan

Scale the plan sections to complexity:

### Every frontend ticket also gets: the iOS half

If the ticket touches `apps/web`, the plan MUST include the matching
`apps/mobile` work as part of THIS ticket — screen, i18n wiring, role gating.
Web-only requires a very strong reason (a capability iOS lacks, or a surface
nobody would use on a phone), written into the plan and later the PR body.
"We'll follow up" is not a reason. See `levelup_frontend/CLAUDE.md`.

Budget for the two things that always bite: mobile i18n uses **static imports**
in `apps/mobile/src/lib/i18n.ts` (a new namespace renders raw key paths until
hand-added, in both pt and en), and there is no shadcn/Recharts on mobile.

### All tickets get:

**Classification**: Type + complexity level, one sentence why.

**Affected Files**: Files that need to change, grouped by backend/frontend/tests.

**Implementation Steps**: Numbered, ordered, specific steps.
- "Add `second_phone` column to `Player` model" not "update the model"
- One logical change per step
- Low: 2-4 steps. Medium: 3-7 steps. High: 5-10 steps.

### Medium and High also get:

**Migration / Data Concerns**: Does this need a migration? Does it affect existing data?

**Edge Cases**: What could go wrong, what inputs need handling.

### High only also gets:

**Domain Impact**: Key relationships, scope check, multi-role concerns.

**Root Cause** (bugs only): What's actually wrong and where.

## Step 4: Output the plan, then proceed to implementation.
