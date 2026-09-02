---
name: classify-ticket
description: >
  Classifies a ticket against the spec tree before any code is written. Use this skill BEFORE
  implementing any ticket in a Specflow-managed project. Determines whether the ticket is a bug,
  spec gap, spec change, new feature, rule violation, or standalone task. Updates specs and rules
  if needed and commits them separately. Triggers on "classify this ticket", "what kind of change
  is this", or when implement-ticket invokes it as Step 1.
---

# Classify Ticket Against Spec Tree

Given a ticket (Title, Type, Description), determine what kind of change it represents and
update specs/rules if needed before any code is written.

## Quick Check

```bash
ls specs/ 2>/dev/null
```

If no `specs/` directory exists, return immediately with:
```
[SPECFLOW] No spec tree found. Classification: LEGACY_MODE
```
The calling skill should proceed using the ticket description directly.

## Classification

Read the ticket and search the spec tree for related specs:

```bash
# Search for entity names, endpoint paths, or behaviors mentioned in the ticket
grep -rl "<keyword from ticket>" specs/ 2>/dev/null
```

Then classify into exactly one category:

### Bug
The ticket describes broken behavior that contradicts an existing spec's acceptance criteria.
- Signal: Type is "Bug", or "X should do Y but does Z" where Y matches a spec
- Verify: the spec's acceptance criteria define the correct behavior
- Action: No spec change. Return the spec ID as the reference for what "correct" means.

### Spec Gap
A scenario that should be handled but no acceptance criteria address it.
- Signal: a related spec exists but its criteria don't cover this scenario
- Action: add the missing Given/When/Then and any new rules to the existing spec.

### Spec Change
The ticket wants existing behavior to work differently. Current behavior matches current spec.
- Signal: the described behavior contradicts a spec not because of a bug but because requirements changed
- Action: modify the spec's rules and/or criteria. Compute impact set (specs with `depends_on`
  referencing this spec, specs sharing modified entities). Check impacted specs still make sense.

### New Feature
No spec covers this behavior at all.
- Signal: no spec references the entities or behaviors in the ticket
- Action: create a new leaf spec in the appropriate domain following the schema:

```markdown
# [Feature Title]

id: {domain}.{feature}
status: draft
depends_on: [spec IDs this depends on]

## Intent
[Derived from ticket Description]

## Entities
[If new data entities are needed]

## Rules
[Derived from ticket requirements]

## Acceptance Criteria

### [Criterion name]
- **Given** [precondition]
- **When** [action]
- **Then** [expected outcome]

## Notes
- Source: ticket <TICKET-ID>
```

### Rule Violation
The code works as the spec says but violates a project rule (patterns, conventions, quality).
- Signal: Type is "Improvement" or "Refactor", issue is about HOW code is written not WHAT it does
- Action: add or update the rule in RULES.md if it doesn't exist yet.

### Standalone
Infrastructure, CI/CD, dependencies, or anything outside the spec tree.
- Signal: no behavioral change to the application
- Action: no spec involvement.

## Commit Spec/Rule Changes

If any specs or rules were modified:

```bash
git add specs/ RULES.md
git diff --cached --name-only | grep -q . && \
  git commit -m "spec(<TICKET-ID>): <what changed and why>" || \
  echo "[SPECFLOW] No spec changes to commit"
```

## Output

Return a structured classification result:

```
[SPECFLOW] Ticket: <TICKET-ID>
[SPECFLOW] Classification: <Bug|Spec Gap|Spec Change|New Feature|Rule Violation|Standalone|LEGACY_MODE>
[SPECFLOW] Related spec: <spec-id or "none">
[SPECFLOW] Spec changes: <list of files changed, or "none">
[SPECFLOW] Rule changes: <list of rules added/modified, or "none">
[SPECFLOW] Impact set: <list of specs affected by the change, or "none">
[SPECFLOW] Test source: <the Given/When/Then criteria the E2E test should verify>
```

The calling skill uses `Test source` to write the E2E test and `Classification` to frame
the commit message and Discord notification.