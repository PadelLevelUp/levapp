---
name: specflow-onboard-codebase
description: >
  Reverse-engineer a spec tree from an existing codebase, creating the full Specflow project structure so the codebase can be managed through specs going forward. Use this skill when the user says "onboard this codebase", "reverse engineer specs", "generate specs from code", "specflow existing project", "bring this under spec management", "analyze this codebase", "I have an existing project I want to manage with specs", or any request to retroactively create specifications from working code. Also triggers when the user wants to understand what an existing codebase actually does vs. what it should do, or when they want to start using spec-driven development on a project that wasn't built that way.
---

# Specflow: Onboard Existing Codebase

Turn an existing codebase into a spec-managed project. This is the reverse of specflow-new-project: instead of writing specs then code, you read code and extract what the specs *should have been*, then let the human correct your interpretation.

The key insight: code tells you what the system *does*, but not always what it *should do*. A missing null check might be a bug or a deliberate choice. An unused endpoint might be dead code or a feature in progress. The human correction layer is what turns a mechanical code reading into an accurate spec tree.

## The Six Phases

---

## Phase 1: Code Scan

Read the entire codebase systematically. The goal is to build a mental model of the system — not to generate specs yet, just to understand what's there.

### Scan order

Follow this order because each layer informs the next:

1. **Project structure** — Directory layout, package files (package.json, pyproject.toml, Cargo.toml, etc.), config files, monorepo structure. This tells you the tech stack and how the project is organized.

2. **Data layer** — Models, migrations, schemas, database config. Read every model file. This is the foundation — entities and their relationships define the system's core concepts. Note field types, constraints, indexes, and relationships carefully.

3. **Backend routes/services** — API endpoints, business logic, middleware, auth. For each endpoint, note: HTTP method, path, what it does, what entities it touches, what validation it performs, what errors it returns. For services, note the business rules encoded in the logic.

4. **Frontend** — Pages, components, state management, routing. Note what pages exist, how they map to API endpoints, what state they manage, and what user flows they support. Not every codebase has a frontend — adjust accordingly.

5. **Tests** — What's tested, what's not, testing framework, test patterns. Existing tests are gold — they often document intended behavior more clearly than the code itself. Note any tests that are skipped or failing.

6. **Infrastructure** — CI/CD, deployment config, env vars, Docker files. This tells you about the operational environment and constraints.

### What to capture for each area

For each area you scan, track:
- **Entities and fields** — What data does the system manage? What are the types, constraints, defaults?
- **Endpoints and behaviors** — What can the system do? What are the inputs and outputs?
- **Business rules** — What logic governs behavior? Validation, authorization, state machines, calculations.
- **Patterns** — What conventions does the codebase follow? Naming, error handling, response formats, file organization.
- **Anomalies** — What looks inconsistent, incomplete, or accidental? Dead code, unused imports, TODO comments, commented-out blocks.
- **Dependencies** — What external libraries/services are used and why?

### Recognizing project types

Adapt your scan based on what you find:
- **Full-stack web app**: Scan both backend and frontend, note API contract between them
- **API-only service**: No frontend to scan, focus on endpoints and data models
- **CLI tool**: Focus on command structure, input/output formats, processing logic
- **Library/SDK**: Focus on public API surface, internal architecture, documentation
- **Monorepo**: Identify service boundaries, scan each service as a sub-project

This phase produces an internal working document. The human does not review this — it's your scratch pad for Phase 2.

---

## Phase 2: Proposed Spec Generation

From your code scan, generate the full spec tree. This is the interpretive step — you're making judgment calls about what the code *intends* to do.

### The critical distinction

Write specs for what the code **appears to intend**, not just what it mechanically does. Code is full of accidents — copy-paste errors, half-finished features, workarounds that became permanent. Your job is to separate signal from noise.

Guidelines:
- **If a feature works but has edge case gaps** — spec the intended behavior, note gaps as `OPEN:` items. Example: login works but has no rate limiting → spec login, add `OPEN: No rate limiting implemented`
- **If there's dead code** — don't spec it. Note it in `proposed-notes.md` under "Dead Code"
- **If behavior is inconsistent** — pick the version that seems intentional (usually the more recent or more complete one), spec that, and note the inconsistency
- **If something looks like a bug** — spec the *correct* behavior you think was intended, note in `OPEN:` that current implementation diverges
- **If you genuinely can't tell what's intended** — spec what the code does literally, mark the whole spec as `OPEN: Intent unclear — needs human review`

### Spec format

Use the same schema as specflow-new-project. Read `references/spec-schema.md` for the exact format (it's the same file used by the new-project skill). Every spec has: id, status (always `draft`), depends_on, Intent, Entities (if applicable), Rules, Acceptance Criteria (Given/When/Then with concrete values), and Notes.

For onboarding, acceptance criteria should reflect the *current behavior* of working code. If login requires email + password and returns a JWT, write:

```markdown
### Successful login
- **Given** a user with email 'alice@example.com' and password 'SecurePass1!'
- **When** they POST to /api/auth/login with those credentials
- **Then** the response status is 200
- **And** the response body contains a valid JWT token
```

These criteria become calibration tests in Phase 6 — they should pass against the current codebase.

### Generate proposed-notes.md

This file captures your interpretive decisions:

```markdown
# Proposed Notes

## Interpretive Decisions
[For each judgment call, explain what you saw and why you interpreted it the way you did]

- `auth.login.jwt-login`: Login endpoint has no rate limiting. Specced login without it, flagged as OPEN.
- `billing.invoices.generate-invoice`: Two code paths for invoice generation — one in services/billing.py (newer, more complete) and one in utils/legacy_billing.py (older, referenced by 2 endpoints). Specced the newer version.

## Dead Code
[Code that exists but appears unused or deprecated]

- `utils/legacy_billing.py` — Old billing logic, partially duplicated in services/billing.py
- `components/OldDashboard.tsx` — Replaced by Dashboard.tsx, no imports reference it

## Inconsistencies
[Places where the code contradicts itself]

- Error responses: /api/users returns `{error: "message"}`, /api/billing returns `{detail: "message"}`
- Auth middleware: applied on most routes but missing from /api/webhooks and /api/health
```

---

## Phase 3: Human Correction Layer

This is the most important phase. Present your proposed specs to the human domain by domain and let them correct your interpretation.

### How to present

For each domain:
1. Show a summary: "I found X capabilities with Y leaf specs in the [domain] domain. Here's what I think it does..."
2. Walk through each capability briefly
3. Ask: "Does this match what this part of the system should do? Anything wrong, missing, or that shouldn't be there?"

### Processing corrections

Every correction gets logged. The correction type determines what happens next:

| Human says | Correction type | What it means |
|-----------|----------------|---------------|
| "That's right" | `approved` | Spec matches intent — no changes |
| "That's wrong, it should be X" | `bug` | Code diverges from intent → add to bugs.md |
| "That exists but shouldn't" | `dead-feature` | Feature is deprecated → add to dead-features.md |
| "That's missing entirely" | `missing-spec` | Behavior exists but you missed it, OR behavior should exist but doesn't |
| "Those shouldn't be connected" | `coupling-issue` | Accidental coupling → revise dependency graph |
| "Actually that's intentional" | `clarification` | Your OPEN: question is answered |

### Log format (corrections.md)

```markdown
# Corrections Log

## auth.login.jwt-login
- **Type:** bug
- **Proposed:** Login accepts any non-empty password string
- **Corrected:** Login should validate password meets minimum 8 chars, 1 uppercase, 1 number
- **Implication:** Bug — password validation is missing from the login endpoint

## billing.invoices.generate-invoice
- **Type:** dead-feature
- **Proposed:** Two invoice generation paths exist (legacy + current)
- **Corrected:** Legacy path should be removed entirely
- **Implication:** Dead feature — utils/legacy_billing.py should be deleted

## notifications.email.welcome-email
- **Type:** missing-spec
- **Proposed:** [not in proposed specs]
- **Corrected:** System should send a welcome email on registration
- **Implication:** Missing spec — behavior needs to be added
```

### Handling large codebases

For codebases with many domains, don't dump everything at once. Present one domain at a time, get corrections, move on. If the human seems fatigued, offer to batch the remaining domains: "Want me to present the rest, or should I generate the remaining specs and you can review the final output?"

---

## Phase 4: Delta Analysis

Process the corrections log and generate three deliverables:

### bugs.md

```markdown
# Bug Report

## Major (data integrity, security, core flow breakage)
1. **[spec-id]**: [description]
   - **Current behavior:** [what the code does]
   - **Expected behavior:** [what the human said it should do]
   - **Location:** [file:line or endpoint]

## Normal (incorrect behavior, non-critical)
...

## Minor (cosmetic, edge cases)
...
```

Severity heuristic:
- **Major**: Affects data integrity, security, authentication, or core business flows
- **Normal**: Incorrect behavior that doesn't risk data loss or security
- **Minor**: Cosmetic issues, edge cases that rarely trigger, inconsistent but harmless patterns

### implicit-behaviors.md

```markdown
# Implicit Behaviors

Undocumented behaviors discovered during onboarding. Each needs a keep/remove decision.

| Behavior | Location | Recommendation | Rationale |
|----------|----------|---------------|-----------|
| Soft-delete cascades to child records | models/user.py:45 | Keep | Prevents orphan records |
| API returns 200 for empty results | routes/search.py:12 | Keep | Frontend expects this |
| Cron job runs at 3am to clean temp files | scheduler.py:8 | Review | May not be needed anymore |
```

### dead-features.md

```markdown
# Dead Features

Code implementing deprecated or unreferenced functionality.

| Feature | Files | Evidence | Safe to remove? |
|---------|-------|----------|----------------|
| Legacy billing | utils/legacy_billing.py | Duplicated in services/billing.py, old endpoints deprecated | Yes |
| Old dashboard | components/OldDashboard.tsx | No imports, replaced by Dashboard.tsx | Yes |
| CSV export v1 | utils/csv_export.py | Referenced only by commented-out route | Likely yes |
```

---

## Phase 5: Claude Code Tooling Generation

Generate the Claude Code infrastructure that matches the existing codebase's patterns.

### Skills

Read the codebase's actual conventions and extract them into skills. These are not generic "how to use React" skills — they're specific to *this* codebase.

For example, if the codebase uses Flask with a specific pattern for route blueprints:
```yaml
---
name: flask-routes
description: >
  Patterns for adding Flask route blueprints in this project. Use when creating new API endpoints.
---
# Flask Route Patterns

Routes in this project follow this structure:
[extract the actual pattern from the codebase, with real examples from the code]
```

Look for patterns in:
- **API response format** — How errors are returned, pagination, envelope structure
- **Component structure** — How frontend components are organized, prop patterns, state management
- **Testing patterns** — How tests are structured, fixtures, helpers, mocking conventions
- **Error handling** — How exceptions propagate, logging patterns, error response shapes
- **Naming conventions** — File naming, variable naming, endpoint naming

### Agents

Create agents appropriate for the project's actual tech stack:
- A **test-writer** agent that knows the project's testing patterns
- A **code-reviewer** agent that checks against the extracted rules
- Domain-specific agents if the codebase has clearly separated domains

Agent format:
```yaml
---
name: agent-name
description: >
  When to use this agent. Be specific.
tools: Read, Write, Edit, Bash, Glob, Grep
model: sonnet
skills:
  - relevant-extracted-skill
---

System prompt with project-specific context.
```

### RULES.md

Extract hard rules from the code — things that are consistent across the codebase and should remain so:

```markdown
# Project Rules

1. **API responses use envelope format** — All endpoints return `{data: ..., error: ...}`. Why: frontend client expects this shape.
2. **Models use soft delete** — Never hard-delete records, use `deleted_at` timestamp. Why: audit trail requirement.
[etc.]
```

### CLAUDE.md

Generate a CLAUDE.md that covers:
- What the project is
- How Specflow works (specs are source of truth going forward)
- Commands (dev server, tests, migrations — extracted from package.json/Makefile/etc.)
- The build loop for implementing new specs
- Conventions extracted from the codebase
- What NOT to do

Read `references/claude-md-template.md` for the template structure.

---

## Phase 6: Test Generation and Calibration

This phase validates that specs and code are in sync.

### Generate tests

For every leaf spec's acceptance criteria, generate a test. Use the project's existing testing framework and patterns (discovered in Phase 1).

- If the project uses pytest, generate pytest tests
- If it uses Jest/Vitest, generate those
- If it uses Playwright for E2E, generate Playwright tests for UI specs
- Match the project's existing test style (imports, fixtures, naming conventions)

### Calibration run

Run the generated tests against the current codebase. Three outcomes:

| Result | Meaning | Action |
|--------|---------|--------|
| Test passes | Code matches corrected spec | Spec-code alignment confirmed |
| Test fails, code is wrong | Known bug from Phase 4 | Already in bugs.md — expected failure |
| Test fails, test is wrong | Spec or test has an error | Fix the test to match actual behavior, update spec if needed |

After calibration, the test suite should be clean:
- Every passing test confirms a spec
- Every failing test corresponds to a documented bug
- No test failures from bad test code

Report the calibration results:
```
Calibration Results:
- X tests generated
- Y passed (spec-code alignment confirmed)
- Z failed — W are known bugs, V were test errors (fixed)
```

---

## Output Structure

All files go into the project root (or a `specflow/` subdirectory if the user prefers):

```
project-root/
├── CLAUDE.md                          # Master instructions for Claude Code
├── RULES.md                           # Hard constraints extracted from codebase
├── build-order.md                     # Dependency-sorted spec sequence
├── corrections.md                     # Human correction log from Phase 3
├── bugs.md                            # Bugs found through spec-code delta
├── implicit-behaviors.md              # Undocumented behaviors catalog
├── dead-features.md                   # Deprecated code inventory
├── proposed-notes.md                  # Interpretive decisions from Phase 2
├── .claude/
│   ├── skills/{name}/SKILL.md         # Skills extracted from codebase patterns
│   └── agents/{name}.md               # Agents for the project's stack
└── specs/
    ├── _index.md                      # Tooling manifest + dependency graph
    └── {domain}/{capability}/spec.md  # Spec files
```

### Status conventions for onboarded specs

Unlike new-project specs (which all start as `draft`), onboarded specs use status to reflect reality:
- `implemented` — Code exists, tests pass, human approved
- `draft` — Spec exists but code has a known bug (needs reimplementation)
- `draft` with `OPEN:` — Intent unclear, needs human decision before implementation

---

## Tips for better onboarding

- **Read tests first if they exist.** Tests often express intent more clearly than implementation code. A test named `test_user_cannot_book_past_slots` tells you a business rule that might be buried in a complex service method.
- **Check git blame for context.** Recent changes might indicate features in progress. Commit messages often explain *why* something was done.
- **Look at the API from the frontend's perspective.** The frontend's API calls show you which endpoints are actually used and how. Dead endpoints often have no frontend callers.
- **Don't over-spec.** If the codebase has 200 endpoints, not all need individual leaf specs. Group trivial CRUD into capability-level specs and only break out leaf specs for complex behaviors.
- **Respect the codebase's vocabulary.** If the code calls it "session" not "class", use "session" in specs. The spec tree should speak the same language as the code.
