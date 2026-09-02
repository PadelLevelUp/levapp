---
name: decompose-feature-request
description: Pick up a "feature request" Linear ticket (created by the issue bot with requirements gathered from Discord), explore the codebase, produce an implementation plan, and decompose it into child Linear tickets that each carry a standard Claude Code prompt. Use this skill whenever a prompt starts with "Decompose the following feature request", whenever the user says "decompose PAD-XX", "break down this feature request", "plan and split this feature", "turn this feature request into tickets", or references a feature-request ticket that needs to be split into implementable tasks. Do NOT use implement-ticket for feature-request tickets — they are too big for one task and must be decomposed first.
---

# Decompose Feature Request

Turn a context-rich feature-request ticket into an implementation plan plus a set of right-sized child tickets that the existing autonomous workflow (`run-linear-ticket` → `implement-ticket`) can execute one by one.

**Why this exists:** The Discord issue bot gathers requirements for new features (goal, audience, expected behavior, constraints) but has no codebase context, so it cannot break a feature down sensibly. You do have codebase context. Your job is the second half: plan with full knowledge of the code, then decompose. Do NOT implement the feature in this workflow — implementation happens later, one child ticket at a time.

## Step 1: Fetch the parent ticket

If you were given a full prompt (starting "Decompose the following feature request"), the context is already in it — but still call `mcp__linear-server__get_issue` with the ticket ID to get the current description, state, and priority (the ticket may have been edited since the prompt was generated).

If you were given only a reference ("decompose PAD-38"), fetch it the same way. If the ticket has no gathered context (no goal / expected behavior — i.e., it wasn't created through the bot's feature-request flow), work with whatever the description holds, and note in your final report that context was thin.

Extract and keep at hand:
- **Goal** — what the requester wants to achieve and why
- **Users/audience** — who this is for (coach, student, both)
- **Expected behavior** — the concrete flows described
- **Constraints & answers** — anything from the bot's clarifying Q&A
- **Priority** — children inherit it unless a child is clearly less urgent

## Step 2: Explore the codebase

Launch parallel `Explore` agents to map the areas the feature touches. Cover:

- **Related code:** existing models, services, routes, components, pages that the feature builds on or changes
- **Patterns:** how similar features are structured (backend: model → service → module/route → serializer; frontend: api module → hook → page/component)
- **Data model:** which tables/relationships are affected, whether migrations are needed
- **Test surface:** which E2E specs and pytest files cover the neighboring behavior

This is the levelup project: Flask backend (`levelup_backend/padel_app/`), React + TypeScript frontend (`levelup_frontend/src/`), Playwright E2E (`levelup_frontend/e2e/`). Scale exploration to the feature — a small feature needs one agent, a cross-cutting one needs three or four.

## Step 3: Plan

Produce a plan grounded in what you found. This workflow runs autonomously — do not ask the user questions; make reasonable assumptions and state them explicitly in the plan.

```
## Feature Plan: [name]

### Summary
[2-3 sentences: what will be built and the chosen approach]

### Gap Analysis
- **Reuse:** [existing code/patterns that support the feature]
- **Create:** [new files/modules/components]
- **Modify:** [existing files that change, and why]

### Assumptions
- [Every assumption you made where the request was ambiguous]

### Implementation Order
1. [Ordered steps — these become the child tickets]

### Out of Scope
- [Related work explicitly deferred]
```

## Step 4: Decompose into child tickets

Slice the plan into child tickets. Rules of thumb:

- **One PR each.** A child ticket should be implementable and reviewable as a single feature branch — if a step needs two unrelated test suites or touches every layer for two different reasons, split it.
- **Independently testable.** Each child must have its own acceptance criteria that an E2E or backend test can verify. "Part 1 of 3" with no observable behavior is not a valid ticket.
- **Foundation first.** Order children so each builds on merged predecessors: data model/migrations → backend endpoints/services → frontend UI → notifications/polish. Express hard orderings with `blockedBy` relations.
- **Typical count is 2–6.** If you end up with one child, the ticket wasn't a real feature request — say so and produce the single ticket anyway. If you exceed ~8, group related slices; over-fragmentation creates coordination overhead that outweighs the smaller diffs.
- **If substantial parts already exist, scope children as extensions.** Requesters often don't know a flow already shipped. When exploration shows the feature is partly or mostly built, do not decompose into fresh full-stack slices — scope each child to extend the existing path, and put an explicit "IMPORTANT: X already exists at <location> — do not rebuild it" note in the child's prompt so the implementing agent doesn't duplicate it. If the feature is essentially complete, say so in the plan and on the parent instead of manufacturing children.

## Step 5: Create the child tickets in Linear

For each child, call `mcp__linear-server__save_issue` with:

- `team`: same team as the parent
- `parentId`: the parent ticket ID (e.g., `PAD-38`)
- `title`: imperative and specific ("Add availability model and migration", not "Backend part")
- `labels`: `["Feature"]`
- `priority`: inherited from the parent unless clearly different (labels for the prompt: 1=Urgent, 2=High, 3=Medium, 4=Low)
- `blockedBy`: identifiers of earlier siblings it depends on (only hard dependencies)
- `description`: use this exact template — the embedded Claude Code prompt is the contract that lets `run-linear-ticket` and `implement-ticket` pick the child up later, so match the bot's format precisely:

````markdown
**Parent feature:** <PARENT-ID> — <parent title>

**Summary:**
<what this child delivers>

**Scope:**
<files/areas touched, key decisions from the plan that constrain this child>

**Acceptance criteria:**

* <observable, testable criteria>

**Depends on:** <sibling IDs or "none">

---

*Decomposed from <PARENT-ID> by Claude Code*

---

## Claude Code Prompt

```
Implement the following ticket.

## Ticket: PLACEHOLDER_ID
**Title:** <child title>
**Type:** feature
**Priority:** <priority label>
**URL:** PLACEHOLDER_URL

## Description
<summary + scope + acceptance criteria, plain text>

## Parent Feature
- <PARENT-ID>: <parent title> — <parent URL>

## Instructions
Implement this feature. Read the codebase to understand the architecture before making changes. Follow existing patterns and conventions.
```
````

After each `save_issue` returns, immediately call `save_issue` again for that child with the same description, replacing `PLACEHOLDER_ID` with the real identifier and `PLACEHOLDER_URL` with the real URL from the response (the ID doesn't exist until creation — this two-pass update is the same trick the bot uses). The placeholders only occur inside the `## Claude Code Prompt` block; nothing else in the description changes between the two passes.

Create children **in dependency order** so `blockedBy` can reference siblings that already exist.

## Step 6: Report back on the parent ticket

1. Post the full plan from Step 3 as a comment on the parent ticket with `mcp__linear-server__save_comment`, followed by the child list (`- PAD-39: <title>` per child, with dependency notes).
2. Update the parent with `save_issue`: move `state` to `"Todo"` (it's now refined and actionable through its children).
3. Tell the user: one-paragraph plan summary, the list of created child IDs/titles in order, and any assumptions that deserve a human look before implementation starts.

## Edge cases

- **Ticket is not a feature request** (it's a bug or a small improvement): don't decompose — say it should go through the normal `implement-ticket` flow instead, and stop.
- **Children already exist** (`get_issue` shows sub-issues): a previous run may have decomposed it. List the existing children and stop rather than duplicating them.
- **Feature conflicts with existing behavior:** flag the conflict prominently in the plan comment and in your report — the requester may not know the current behavior exists.
