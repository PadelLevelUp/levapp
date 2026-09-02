---
name: plan-feature
description: Structured feature planning workflow with codebase exploration, gap analysis, web-grounded research, tree-of-thoughts ideation, and ranked approach selection.
argument-hint: <feature description>
disable-model-invocation: true
---

# Feature Planning Workflow

You are executing a structured 6-phase feature planning workflow for the following feature:

**Feature:** $ARGUMENTS

**Critical constraint:** This is a planning-only workflow. Do NOT begin implementation. Do NOT write or edit project source files. Your deliverable is a comprehensive plan.

Execute all 6 phases in order. Do not skip phases.

---

## Phase 1: Explore

Use Task agents (subagent_type: "Explore") to map the codebase areas relevant to the requested feature. Launch multiple exploration agents in parallel to cover different angles:

- **Architecture & structure:** Identify the project's directory layout, framework, language, and build system.
- **Related code:** Find existing modules, components, services, or utilities that relate to the feature.
- **Patterns & conventions:** Identify coding patterns (naming, error handling, dependency injection, state management, API design) already established in the codebase.
- **Tech stack & dependencies:** Catalog key libraries, frameworks, and tools in use.
- **Test approach:** Identify the testing framework, test directory structure, and testing patterns in use.

After exploration completes, synthesize results into an **Exploration Summary**:

```
### Exploration Summary
- **Project type:** [framework / language / build system]
- **Relevant modules:** [list of files/directories with brief purpose]
- **Established patterns:** [key conventions the feature must follow]
- **Tech stack highlights:** [libraries/tools relevant to the feature]
- **Test infrastructure:** [framework, location, patterns]
```

Then produce an **ASCII component diagram** showing where the feature fits within the existing architecture — which modules it touches, how data flows, and where new components slot in. This diagram grounds the rest of the planning phases and satisfies the project's requirement for visual mapping before complex work.

---

## Phase 2: Gap Analysis

Compare the desired feature against the current state discovered in Phase 1. Produce a structured analysis:

```
### Gap Analysis

**Can build on (reuse):**
- [Existing code/patterns that directly support the feature]

**Must create (new):**
- [New files, modules, components, or abstractions needed]

**Must modify (change):**
- [Existing files that need changes, and why]

**Open questions:**
- [Ambiguities in the feature request that affect planning]
- [Technical unknowns that need resolution]
```

If there are critical open questions that would fundamentally change the approach, note them but proceed with reasonable assumptions. State assumptions explicitly.

**Checkpoint:** Before proceeding, use `AskUserQuestion` to present the open questions, key assumptions, and the gap analysis summary to the user. Ask them to confirm the assumptions are correct and whether any open questions can be resolved now. Do not proceed to Phase 3 until the user confirms.

---

## Phase 3: Research

Evaluate whether the existing patterns and libraries in the codebase are sufficient, or if the feature benefits from external knowledge. Use **WebSearch** to ground your findings:

- Search for **best practices** for implementing this type of feature in the project's stack.
- Search for **library comparisons** if new dependencies might be needed.
- Search for **known pitfalls** or common mistakes with this feature type.
- Search for **ecosystem patterns** -- how similar projects solve this problem.

Synthesize research into:

```
### Research Findings
- **Best practices:** [key recommendations from the ecosystem]
- **Relevant libraries/tools:** [candidates with pros/cons, if applicable]
- **Known pitfalls:** [common mistakes to avoid]
- **Pattern references:** [links or descriptions of exemplary implementations]
```

You MUST invoke WebSearch at least once during this phase. Prefer 2-4 targeted searches over a single broad one.

---

## Phase 4: Tree of Thoughts

Generate **2-3 genuinely distinct** approaches using forced divergence frames. These must NOT be minor variations of each other -- they must differ in architecture, abstraction level, or implementation strategy. Generate 2 approaches when the right direction is clear and a third would be artificial padding; generate 3 when there are genuinely different architectural trade-offs worth exploring.

### Approach A -- Extend
Maximize reuse of existing abstractions and patterns in the codebase. Minimize new concepts. Build on what's already there.

### Approach B -- Introduce
Add a new abstraction, pattern, or architectural element that provides long-term clarity, extensibility, or separation of concerns -- even if it requires more upfront work.

### Approach C -- Minimal (omit if only 2 approaches)
Smallest possible change set. Optimize for speed to ship. Accept trade-offs in extensibility or elegance for pragmatism.

For **each** approach, provide:

| Aspect | Details |
|---|---|
| **Summary** | 1-2 sentence description of the approach |
| **Changes** | Table of files to modify/create with brief description of each change |
| **New abstractions** | Any new types, interfaces, modules, or patterns introduced |
| **New dependencies** | External packages needed (if any) |
| **Trade-offs** | Complexity / Maintainability / Performance / Risk / Pattern alignment |
| **Estimated effort** | Relative sizing (S/M/L) with brief justification |

All file paths in the Changes table must reference **real files** discovered in Phase 1, or clearly state the proposed location for new files with rationale based on the project's directory conventions.

---

## Phase 5: Rank & Select

Score each approach on a 1-5 scale across these criteria (adjust columns to match the number of approaches generated):

| Criteria | Approach A | Approach B | Approach C |
|---|---|---|---|
| **Complexity** (lower is better) | | | |
| **Maintainability** | | | |
| **Performance** | | | |
| **Risk** (lower is better) | | | |
| **Pattern alignment** | | | |
| **Total** | | | |

After scoring:

1. **Evaluate hybrid possibility:** Could elements from multiple approaches be combined for a better result? If so, describe the hybrid.
2. **Select winner:** Choose the recommended approach (or hybrid) with a clear justification explaining why it best serves this feature in this codebase.

---

## Phase 6: Present the Plan

Produce the final plan in this structure:

```
## Feature Plan: [Feature Name]

### Summary
[2-3 sentence overview of what will be built and the chosen approach]

### Prerequisites
- [Any setup, migrations, or dependencies needed before implementation starts]

### Implementation Steps
1. [Ordered steps, each with clear scope and deliverable]
2. [Steps should be small enough to be a single PR or commit]
3. [Include which files are touched in each step]

### Files to Modify
| File | Action | Description |
|---|---|---|
| path/to/file | modify/create/delete | What changes and why |

### New Dependencies
- [Package name + version constraint + justification, or "None"]

### Risk Assessment
- **High risk:** [Items that could block or derail implementation]
- **Medium risk:** [Items that need careful handling]
- **Low risk:** [Minor concerns]

### Testing Strategy
- [What types of tests to add: unit, integration, e2e]
- [Key scenarios to cover]
- [Edge cases to test]

### Out of Scope
- [Related work explicitly deferred]
- [Features that might seem related but are not part of this plan]
```

---

## Final Reminder

This workflow produces a **plan only**. Do not create, modify, or delete any project source files. The user will review the plan and decide when and how to begin implementation.
