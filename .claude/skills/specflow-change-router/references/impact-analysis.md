# Impact Analysis Reference

## How to trace impact

When a spec changes, impact propagates through three channels:

### 1. Direct dependency (depends_on)

Grep all spec files for the changed spec's ID in their `depends_on` field:
```
grep -r "depends_on:.*changed.spec.id" specs/
```

These specs explicitly depend on the changed spec. If the change alters an entity definition, API contract, or behavioral rule that dependents rely on, they need review.

### 2. Entity sharing

If the change modifies an entity definition (adds/removes/changes a field), find all specs that reference that entity name:
```
grep -r "EntityName" specs/
```

Any spec that uses the entity in its Rules or Acceptance Criteria may be affected.

### 3. Transitive closure

Dependencies chain: if A depends on B, and B depends on C, changing C affects both B and A. Walk the full dependency graph, not just immediate dependents.

## Risk levels

**Low risk** — Change is isolated to one leaf spec, no dependents, no entity changes.
Example: Changing a validation threshold in a spec with no dependents.

**Medium risk** — Change affects a spec with dependents, or modifies an entity field that other specs reference.
Example: Adding a field to User entity, which is referenced by 5+ specs.

**High risk** — Change modifies a core entity definition, affects a spec at the root of a deep dependency chain, or changes a rule that multiple domains rely on.
Example: Changing the auth token format, which propagates to every authenticated endpoint.

## Execution order for changes

Always execute in this order:
1. Update the spec(s) — rules, criteria, entities
2. Coherence check — verify no circular deps, contradictions, or orphans
3. Human reviews updated spec(s)
4. Regenerate affected slices — tests first, then implementation
5. Run tests for changed specs
6. Run regression suite for all dependent specs
7. Update build-order.md if dependency graph changed
