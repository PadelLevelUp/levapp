---
name: specflow-new-project
description: >
  Generate a complete spec tree, tooling manifest, agents, skills, rules, and build order from a project description. Use this skill whenever the user wants to start a new project from scratch, describes a product idea, says things like "new project", "build me an app", "I want to create", "start a new", "specflow new", "start from scratch", "help me spec this out", "write specs for this", or presents any product concept that needs structured planning before implementation. Even if the user just describes what they want to build without explicitly asking for specs, this skill should trigger — the goal is to plan before coding.
---

# Specflow: New Project

Turn a product idea into a complete, buildable spec tree that Claude Code can implement autonomously. The output is a directory of markdown files — specs, skills, agents, rules, and a build order — that serve as the single source of truth for the project.

## Why this matters

Without specs, Claude Code tends to make ad-hoc architectural decisions, skip edge cases, and produce inconsistent code. Specflow front-loads the thinking: every behavior is defined once in a spec, every spec has acceptance criteria, and Claude implements them one vertical slice at a time. The spec tree is the product — code is just an artifact of it.

## The Six Phases

Work through these phases sequentially. Each phase produces a concrete artifact that the user approves before moving on. Don't rush — the quality of the specs determines the quality of everything built from them.

---

## Phase 1: Discovery Conversation

The goal is to extract enough understanding to write a project brief. Ask open-ended questions, listen carefully, and reflect back what you hear.

### What to uncover

1. **Product vision** — What does this thing do? Who is it for? (Aim for 1 clear paragraph)
2. **Core domains** — The 3-7 functional areas (e.g., Auth, Scheduling, Billing, Notifications). These become top-level spec directories.
3. **Key entities** — The nouns: User, Booking, Invoice, Court, etc. What data does the system manage?
4. **Key flows** — The verbs: "coach schedules a class", "student books a court", "system sends reminder". What does the system *do*?
5. **Constraints** — Hard requirements: "must be a PWA", "must use Stripe", "must support offline", "PostgreSQL only", etc.
6. **Stack preferences** — Does the user have opinions on framework, language, hosting? If not, recommend based on the project type.

### How to run the conversation

- Start broad: "Tell me about what you want to build." Let them talk.
- Then probe each domain: "You mentioned scheduling — walk me through what happens when a coach creates a class."
- Reflect back: "Here's what I'm hearing..." and let them correct.
- Do 2-3 rounds. The first round captures the shape; subsequent rounds fill gaps and resolve ambiguities.
- Pay attention to what they *don't* say — if they describe a multi-user app but never mention auth, ask about it.

### Recognizing project type

Not everything is a web app. Adjust your domain structure based on what the user describes:
- **Web app / PWA**: Auth, data models, API, frontend, notifications are typical domains
- **CLI tool**: Input parsing, processing pipeline, output formatting — no auth or frontend domains
- **Data pipeline**: Ingestion, transformation, storage, reporting
- **Mobile app**: Similar to web but with offline/sync considerations
- **Library/SDK**: Public API surface, internals, documentation, examples

### Output: project-brief.md

Write a `project-brief.md` that captures everything discovered. Structure it as:

```markdown
# [Project Name] — Project Brief

## Vision
[1 paragraph: what it does, who it's for]

## Domains
[List each domain with a 1-2 sentence description]

## Key Entities
[Entity list with brief descriptions and key fields]

## Key Flows
[Numbered list of the main user flows]

## Constraints
[Hard requirements, non-negotiables]

## Stack
[Chosen tech stack with rationale]

## Open Questions
[Anything unresolved — prefix each with OPEN:]
```

Present this to the user and get explicit approval before continuing. If they want changes, update and re-present.

---

## Phase 2: Tooling Selection

Based on the approved brief, determine what Claude Code infrastructure the project needs — skills, agents, and rules.

### Evaluate the project needs

1. **Tech stack** — What frameworks and tools does the project use? This drives which skills are relevant.
2. **Existing skills** — Check what skills are already installed (look in `.claude/skills/`). Which ones apply to this project?
3. **Skill gaps** — What domain knowledge does the project need that no existing skill covers? Flag these for creation.
4. **Project rules** — What coding conventions, architectural patterns, or hard constraints should be enforced? These go in RULES.md.
5. **Specialized agents** — Does the project benefit from delegating specific tasks to focused agents? Common patterns:
   - A **test-writer** agent that writes tests from specs
   - A **code-reviewer** agent that checks implementations against specs
   - A **migration** agent for database schema changes
   - Domain-specific agents (e.g., a **notification-engine** agent for complex notification logic)

### Define each agent

For each proposed agent, specify:

```yaml
---
name: agent-name
description: >
  When to invoke this agent. Be specific and include trigger words.
  PROACTIVELY use this agent when [specific conditions].
tools: Read, Write, Edit, Bash, Glob, Grep
model: sonnet
skills:
  - relevant-skill-name
---

You are a [role]. Your job is to [specific task].

[System prompt with domain expertise, decision-making guidance, and patterns to follow]
```

**Model selection guidance:**
- `haiku` — Fast, cheap. Good for mechanical tasks: formatting, simple transforms, boilerplate generation.
- `sonnet` — Balanced. Good for most implementation work: writing code, tests, reviews.
- `opus` — Most capable. Reserve for complex architectural decisions, ambiguous specs, or tasks requiring deep reasoning.

**Tool selection:** Give agents the minimum tools they need. A code-reviewer only needs Read, Glob, Grep. An implementer needs Write and Edit too. Only give Bash if the agent needs to run commands.

### Define each skill

For each proposed skill:

```yaml
---
name: skill-name
description: >
  What this skill provides and when to use it. Include trigger words.
---

# Skill Title

[Reference knowledge: patterns, conventions, code snippets, domain facts]
[The goal is to give Claude the context it needs to make good decisions in this domain]
```

Skills are reference knowledge, not workflows. They answer "how should I do X in this project?" — coding conventions, API patterns, database schema conventions, testing patterns, etc.

### Define rules (RULES.md)

Rules are hard constraints that apply project-wide. They go in RULES.md at the project root. Good rules are:
- Specific and actionable (not vague aspirations)
- Justified (explain *why* the rule exists)
- Few in number (10-20 max — too many rules get ignored)

### Output: specs/_index.md

Write the tooling manifest as `specs/_index.md`:

```markdown
# [Project Name] — Tooling Manifest

## Stack
[Tech stack summary]

## Skills
[List each skill with name and purpose]

## Agents
[List each agent with name, model, and purpose]

## Rules Summary
[Key rules with brief rationale]

## Dependency Graph
[Visual or textual representation of spec domain dependencies]
```

Present this to the user for approval before generating specs.

---

## Phase 3: Spec Generation

This is the core of the skill. Read the approved brief and generate the full spec tree.

### Spec hierarchy

Specs form a three-level tree:

1. **Domain specs** — Top-level boundaries (e.g., `auth/`, `scheduling/`, `billing/`). These define the scope of a functional area but are NOT directly implementable.
2. **Capability specs** — What the system can do within a domain (e.g., `auth/registration/`, `auth/login/`). These group related behaviors but are NOT directly implementable.
3. **Leaf specs** — Atomic, implementable units (e.g., `auth/registration/email-signup.spec.md`). Each leaf maps to exactly one vertical slice: data model + backend + frontend + test.

### Writing specs

Read `references/spec-schema.md` for the exact format of a spec file.

Key principles:
- **One behavior per leaf spec.** If you're writing "and also..." in a spec, split it.
- **Acceptance criteria are the definition of done.** Use Given/When/Then with concrete values, not abstractions. "Given a user with email 'test@example.com'" not "Given a valid user".
- **Entities are defined once.** The first spec that introduces an entity defines its fields. Later specs reference it by name.
- **Dependencies are explicit.** If spec B needs spec A's entity or API, list A in `depends_on`.
- **Flag uncertainty.** If something wasn't in the brief and you're making a judgment call, prefix it with `OPEN:` in the Notes section.
- **All statuses start as `draft`.** They move to `implementing` and then `implemented` during the build phase.

### Spec naming conventions

- Domain directories: lowercase, hyphenated (`user-management/`, `court-booking/`)
- Capability directories: lowercase, hyphenated (`email-auth/`, `schedule-management/`)
- Leaf spec files: lowercase, hyphenated, ending in `.spec.md` (`email-signup.spec.md`)
- IDs follow the path: `auth.registration.email-signup`

### Common domain patterns

Recognize these patterns and adapt them to the project:

**Web app with auth:**
- `auth/` — registration, login, password reset, session management
- `[core-domain]/` — the main business logic (varies by app)
- `notifications/` — email, push, in-app
- `settings/` — user preferences, account management

**CLI tool:**
- `input/` — argument parsing, file reading, validation
- `processing/` — the core transformation logic
- `output/` — formatting, file writing, display

**API service:**
- `api/` — endpoints, request/response schemas, middleware
- `data/` — models, migrations, repositories
- `integration/` — external service connections

---

## Phase 4: Coherence Check

Before presenting specs to the user, validate the entire tree:

1. **No circular dependencies** — If A depends on B and B depends on A, something is wrong. Restructure.
2. **No missing references** — Every ID in `depends_on` must exist as an actual spec.
3. **No orphan specs** — Every leaf spec should be reachable from the build order.
4. **No contradictory rules** — If spec A says "users must verify email" and spec B says "users can skip verification", resolve it.
5. **Every leaf has acceptance criteria** — No exceptions. If you can't write acceptance criteria, the spec isn't specific enough.
6. **No undefined entity references** — If a spec references `Booking`, some earlier spec must define it.
7. **Domain boundaries are clean** — Specs shouldn't reach deep into other domains. If they do, consider adding an API boundary or shared entity spec.

Report any issues found. Present a summary:

```
Coherence Check Results:
- X leaf specs across Y domains
- Z dependencies validated
- Issues found: [list or "none"]
```

---

## Phase 5: Build Order

Topologically sort the leaf specs by their dependency graph to produce a build sequence.

### Sorting priorities

When multiple specs have no unresolved dependencies (i.e., they could be built next), prefer this order:
1. **Data model / entity specs** — These define the schema everything else depends on
2. **Backend / API specs** — Business logic and endpoints
3. **Frontend / UI specs** — Views and interactions (these consume the API)
4. **Integration specs** — External service connections
5. **Polish specs** — Notifications, settings, error handling

### Output: build-order.md

```markdown
# Build Order

## Phase 1: Foundation
1. `auth.models.user-entity` — User data model
2. `auth.registration.email-signup` — Basic registration flow
...

## Phase 2: Core Features
3. `scheduling.models.class-entity` — Class data model
...

## Phase 3: Integration
...

[Group into logical phases for readability, but preserve the strict dependency order within each phase]
```

---

## Phase 6: File Output

Generate all files into the project directory. The complete structure:

```
project-root/
├── CLAUDE.md
├── RULES.md
├── project-brief.md
├── build-order.md
├── .claude/
│   ├── skills/{name}/SKILL.md
│   └── agents/{name}.md
└── specs/
    ├── _index.md
    └── {domain}/{capability}/{leaf}.spec.md
```

### CLAUDE.md template

Read `references/claude-md-template.md` for the full template. The CLAUDE.md must cover:
- What the project is (1 paragraph)
- How Specflow works (specs are source of truth, code is artifact)
- The build loop (the exact sequence Claude follows to implement each spec)
- Key decisions already made (stack, architecture, conventions)
- What NOT to do (critical anti-patterns to avoid)

### Final checklist

Before presenting the output to the user:
- [ ] `project-brief.md` matches approved brief
- [ ] All spec files follow the schema in `references/spec-schema.md`
- [ ] `build-order.md` respects all dependencies
- [ ] `CLAUDE.md` references the correct file paths
- [ ] `RULES.md` has justified, actionable rules
- [ ] All agents have proper frontmatter (name, description, tools, model)
- [ ] All skills have proper frontmatter (name, description)
- [ ] `specs/_index.md` lists all domains and their spec counts
- [ ] No OPEN: questions left unresolved (or user has acknowledged them)

---

## Tips for better specs

- **Start concrete, generalize later.** Write specs for the specific app, not for a generic version. "Coach can create a padel class for 4 players" is better than "Admin can create a configurable event".
- **Acceptance criteria drive tests.** Every Given/When/Then becomes a test case. If the criteria are vague, the tests will be vague.
- **Entities are your data model.** The entity definitions in specs become your database schema. Be precise about types and constraints.
- **Dependencies reveal architecture.** The dependency graph shows you the natural layering of the system. If everything depends on everything, the domains are wrong.
- **Fewer, better specs beat many shallow ones.** 30 well-defined leaf specs are more valuable than 100 vague ones.
