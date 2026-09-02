# Spec File Schema

Every spec node is a markdown file. The schema varies slightly by level (domain, capability, leaf), but all share the same structure. Only leaf specs are directly implementable.

## Leaf Spec Template

This is the most important template — leaf specs are what Claude actually implements.

```markdown
# [Spec Title]

- **id:** [domain].[capability].[leaf]
- **status:** draft
- **depends_on:** [comma-separated spec IDs, or "none"]

## Intent

[1-2 sentences: why this spec exists, what user need it serves]

## Entities

[Only include if this spec INTRODUCES new data entities. If it reuses entities defined elsewhere, just reference them by name in the Rules or Acceptance Criteria.]

### EntityName

> [One-line description of what this entity represents]

| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| field_name | type | What this field stores |
| created_at | datetime | Record creation timestamp |
| updated_at | datetime | Last modification timestamp |

## Rules

[Numbered behavioral rules that govern this spec. These are the business logic constraints.]

1. [Rule in plain language — e.g., "A class cannot have more participants than its capacity"]
2. [Another rule — e.g., "Only the coach who created a class can delete it"]

## Acceptance Criteria

[Given/When/Then format. Use concrete values. Each criterion gets a descriptive name.]

### [Criterion Name — e.g., "Successful class creation"]

- **Given** [precondition with concrete values — e.g., "a coach with username 'coach1' is logged in"]
- **When** [action — e.g., "the coach creates a class with title 'Morning Padel', capacity 4, date '2025-01-15 10:00'"]
- **Then** [expected outcome — e.g., "the class appears in the coach's calendar on January 15th at 10:00"]
- **And** [additional outcomes if needed — e.g., "the class shows '0/4 participants'"]

### [Another Criterion — e.g., "Capacity validation"]

- **Given** [different precondition]
- **When** [action that tests an edge case]
- **Then** [expected outcome]

## Notes

[Optional section. Use for context, implementation hints, or open questions.]

- OPEN: [Any decision not covered in the brief that needs user input]
- [Any other relevant notes for the implementer]
```

## Domain Spec Template

Domain specs define boundaries. They're short — just enough to explain what the domain covers.

```markdown
# [Domain Name]

- **id:** [domain]
- **status:** draft

## Scope

[2-3 sentences: what this domain covers and what it does NOT cover]

## Capabilities

[List the capability specs within this domain]

- `[domain].[capability]` — [one-line description]
```

## Capability Spec Template

Capability specs group related leaf specs. They provide context but are not implementable.

```markdown
# [Capability Name]

- **id:** [domain].[capability]
- **status:** draft
- **depends_on:** [domain-level dependencies, if any]

## Intent

[1-2 sentences: what this capability enables]

## Leaf Specs

[List the leaf specs within this capability]

- `[domain].[capability].[leaf]` — [one-line description]
```

## Schema Rules

1. **IDs follow the directory path.** `auth/registration/email-signup.spec.md` has ID `auth.registration.email-signup`.
2. **`depends_on` lists spec IDs, not file paths.** Use the dot-notation ID.
3. **Entities are defined exactly once.** The first leaf spec that introduces an entity includes the full Entity section. All subsequent specs just reference the entity by name.
4. **Status values:** `draft` → `implementing` → `implemented`. All specs start as `draft`.
5. **Acceptance criteria use concrete values.** Not "a valid email" but "email 'alice@example.com'". Not "a future date" but "date '2025-03-15 14:00'".
6. **One behavior per leaf spec.** If a spec has acceptance criteria testing fundamentally different behaviors, split it into separate specs.
7. **Rules are numbered.** This makes them easy to reference in code comments and tests.
