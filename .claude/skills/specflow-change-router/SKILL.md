---
name: specflow-change-router
description: >
  Classify every incoming user request against the project's spec tree and route it to the correct action before any work begins. This skill is the mandatory entry point for ALL user interactions in a Specflow-managed project (any project with a specs/ directory containing spec files). PROACTIVELY use this skill whenever the user says anything in a project under spec management — whether they're reporting a bug, asking for a feature, requesting a change, asking a question, or describing desired behavior. Also triggers on "add a feature", "fix this bug", "change this behavior", "what does X do", or any request that might touch the spec tree. If the project has specs, this skill runs first — no exceptions.
---

# Specflow: Change Router

Every request in a spec-managed project must be classified before any work begins. This prevents ad-hoc code changes that bypass the spec tree and ensures all changes flow through specs first.

The core principle: **specs are the source of truth**. Code is an artifact of specs. Humans review specs, not code. Every change starts at the spec level.

## How to Use This Skill

When a user says something in a project that has a `specs/` directory:

1. **Read the spec tree** — Scan `specs/_index.md` for the domain list and dependency graph. You don't need to read every spec file upfront, but you need to know what domains and capabilities exist.
2. **Classify the request** — Match it against the categories below. Evaluate in order; first match wins.
3. **Output your classification** — Tell the user what category you identified, which specs are relevant, and what action you propose.
4. **Get confirmation** — Wait for the user to approve before executing.

## Classification Categories

Evaluate these in order. First match wins.

### Category 1: Standalone

The request has nothing to do with the project's spec tree.

**Signals:**
- Doesn't reference any entity, domain, flow, or behavior in the spec tree
- General programming question ("how do I center a div?")
- Request about a different project or tool
- Question about Specflow itself (methodology, not project-specific)

**Action:** Answer directly. No spec involvement.

**Boundary heuristic:** If the request mentions any entity name from the spec tree (User, Booking, Class, etc.) or any behavior described in any spec, it's a project request, not standalone. If it could apply to literally any project, it's standalone. When genuinely ambiguous, ask.

### Category 2: Bug Report

Something is broken — behavior contradicts an existing spec's acceptance criteria.

**Signals:**
- "X is broken", "X returns wrong result", "X crashes"
- User describes behavior that contradicts a spec's Given/When/Then
- Error messages, 500s, wrong data, missing responses

**Action flow:**
1. Identify which spec defines the correct behavior
2. Find the acceptance criterion that covers this case
3. If criterion exists and code violates it → **this is a bug**. Fix the code. No spec changes needed.
4. If no criterion covers this case → **this is actually a Spec Gap** (Category 5). Reclassify.
5. Check if a test exists for this criterion. If not, write the test first.
6. Fix the code to make the test pass
7. Run the regression suite for all specs in the same domain
8. Update `bugs.md` with the fix

**Key distinction:** A bug means the spec already defines the correct behavior but code doesn't match. If the spec doesn't address the scenario, that's a gap, not a bug.

### Category 3: Spec Change

The user wants existing behavior to work differently. Nothing is broken — they want it changed.

**Signals:**
- "Change X from A to B"
- "I want X to work like Y instead"
- "Can we increase/decrease/modify the [parameter]?"
- References a specific behavior that exists and works, but should be different

**Action flow:**
1. Read the affected spec(s)
2. Show the current rules and acceptance criteria
3. Draft the proposed modification (changed rules and/or criteria)
4. **Impact analysis** — This is critical. Compute:
   - **Direct changes**: The spec(s) being modified
   - **Transitive dependents**: Follow `depends_on` — any spec that depends on the changed spec
   - **Entity-sharing specs**: Any spec that references an entity whose definition changes
5. Present impact: "This change affects N specs: [list with why each is affected]"
6. After human approval:
   - Run coherence check (no circular deps, no contradictory rules)
   - Regenerate affected slices (rewrite tests + code for changed specs)
   - Run tests for ALL affected specs, not just the changed one
7. If conflicts found (rule conflict, entity conflict, circular dependency): present to human before building

### Category 4: New Feature

The user wants something that doesn't exist — no spec covers it.

**Signals:**
- "Add a waitlist", "We need X", "Can we add Y?"
- Describes a capability that has no matching spec in the tree
- References a flow or entity that doesn't exist in specs

**Action flow:**
1. Determine where in the spec tree the new feature belongs (which domain, which capability — or does it need a new domain?)
2. Draft new leaf spec(s) following the schema in `references/spec-schema.md`:
   - id, status (draft), depends_on
   - Intent, Entities (if new), Rules, Acceptance Criteria (Given/When/Then)
3. Set dependencies: what existing specs must this depend on?
4. Run coherence check on the updated tree
5. Present the new spec(s) for human approval
6. After approval: insert into build order, implement (tests first), run regression

### Category 5: Spec Gap

A scenario that should be handled but no acceptance criteria address it. The behavior might work "by accident" or might not work at all — but either way, the spec doesn't define what should happen.

**Signals:**
- "What happens when X?" (and no spec answers this)
- User discovers an edge case: "If a coach creates a class in the past..."
- Implicit behavior that was never explicitly specified

**Action flow:**
1. Identify which existing spec should cover this scenario
2. Add the missing Given/When/Then acceptance criterion
3. Add rules if the new criterion implies business logic not yet captured
4. Present the updated spec for approval
5. After approval: write the test, check if code passes
   - If code already handles it correctly → just document it (the gap was in the spec, not the code)
   - If code doesn't handle it → fix code to match the new criterion
6. Run regression for the domain

**Key distinction from Bug:** A bug means the spec is right and code is wrong. A gap means the spec doesn't address the scenario at all — there's nothing to be "wrong" against.

### Category 6: Exploration

The user wants to understand, not change.

**Signals:**
- "How does X work?", "What specs depend on Y?", "Show me the build order"
- "What entities does the booking domain use?"
- "Walk me through the invitation flow"

**Action:** Query the spec tree and respond. Read the relevant specs, trace dependencies, and explain. No changes to specs or code.

### Category 7: Ambiguous

The request could reasonably be multiple categories.

**Signals:**
- "Reminders should go out earlier" — could be spec change (change timing), bug (reminders are late), or new feature (add early reminder)
- "The dashboard is slow" — could be bug (performance regression), new feature (caching/optimization), or exploration (what's causing it?)

**Action:** Present the possible interpretations with concrete spec references:

```
I see a few possibilities here:

1. **Bug** — If reminders are supposed to go out at [time from spec] but they're going out later, 
   that's a bug in `notifications.reminders.attendance-reminder` (spec says Given...When...Then...)

2. **Spec Change** — If you want to change the reminder window from [current] to something earlier, 
   that's a spec change to the same spec's Rule #3

3. **New Feature** — If you want to add a second, earlier reminder in addition to the existing one, 
   that's a new spec under `notifications.reminders`

Which is it?
```

## Rules This Skill Enforces

These are non-negotiable in a spec-managed project:

1. **Never generate code without a spec.** Even "just add a button" gets a leaf spec first. The spec might be tiny, but it must exist. This is because specs are the source of truth — if behavior isn't in a spec, it doesn't officially exist, and the next person (or AI) to touch the code has no way to know it was intentional.

2. **All changes start at the spec level.** The human reviews and approves specs. Code flows from approved specs. The human never directly modifies code — they modify specs, and code follows.

3. **After any spec change, run coherence check before building.** A seemingly simple change ("increase lockout from 5 to 10") could conflict with another rule, create a circular dependency, or affect shared entities. Always check.

4. **Spec changes propagate.** When a spec changes, identify all downstream slices (via `depends_on` and entity sharing) and mark them for regeneration. Don't just fix the one spec — trace the impact.

5. **Frame all review requests in spec terms.** Don't say "I changed the if-statement on line 42". Say "I updated the acceptance criterion in `auth.login.lockout` to use 10 attempts instead of 5, and regenerated the auth middleware."

## Impact Analysis Template

When presenting impact for Categories 3-5, use this structure:

```markdown
## Impact Analysis

### Direct Changes
- `spec.id.here` — [what changes and why]

### Transitive Dependents
[Specs that depend_on the changed spec]
- `other.spec.id` — depends on `spec.id.here` via [field/entity]

### Entity-Sharing Specs  
[Specs that reference the same entities being modified]
- `another.spec` — uses [EntityName] which gains/loses/changes [field]

### Risk Assessment
- **Low risk**: [changes are isolated, no downstream impact]
- **Medium risk**: [some dependent specs may need criterion updates]
- **High risk**: [entity schema change affects N specs across M domains]

### Proposed Execution Order
1. Update spec(s): [list]
2. Coherence check
3. Regenerate: [list of affected slices]
4. Test: [list of test suites to run]
```

## Reading the Spec Tree Efficiently

You don't need to read every spec file for every request. Use this strategy:

1. **Always start with `specs/_index.md`** — This has the domain list, dependency graph, and tooling manifest. It tells you the shape of the tree.
2. **For entity references** — Grep for entity names across spec files to find where they're defined and used.
3. **For specific behavior** — Read the domain spec, then the capability spec, then the leaf spec. Follow the hierarchy.
4. **For impact analysis** — Grep for the changed spec's ID in `depends_on` fields across all specs. Then check for shared entity names.

## When Classification Is Obvious

For clear-cut requests, don't over-explain. If the user says "Login is returning 500 errors", you don't need to walk through all 7 categories. Just say:

> **Bug in `auth.login.jwt-login`** — The spec says login with valid credentials should return 200 + JWT token. I'll check the acceptance criteria, write a failing test, fix the issue, and run the auth regression suite. Sound good?

The full classification dance is for ambiguous cases. For obvious ones, be direct.
