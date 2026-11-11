---
about: An E2E spec removes what it wrote to the shared database, and asserts on its own rows
permanence: changing
verified: "2026-09-16 (told)"
origin:
  - migrated:compass/rules/R-040-e2e-specs-put-the-shared-database-back.md@ef7a5f3
aliases:
  - R-040
  - R-040-e2e-specs-put-the-shared-database-back
applies_when: "When the agent does work this rule governs: an E2E spec removes what it wrote to the shared database, and asserts on its own rows"
scope:
  - action
match: { commands: [], paths: ["frontend/apps/web/e2e/**/*.spec.ts"] }
source: user@2026-09-16
---

# R-040 — An E2E spec removes what it wrote to the shared database, and asserts on its own rows

Number from Session C's reserved range; content confirmed by the coordinator (2026-09-16), number unconfirmed.

Every spec in a Playwright run shares one seeded database, and `--shard=N/M` cuts the sorted
file list into slices, so which specs share a database changes whenever a release adds or
removes a spec file. A spec that leaves state behind is harmless in today's grouping and
breaks a neighbour in tomorrow's, in a file nobody touched (B-101).

1. **What a spec creates, it removes in `finally`** (or `afterAll` in a serial file), through
   `e2e/helpers/cleanup.ts`. Cleanup is by the ids or titles the spec itself created — never
   a sweep over rows it did not create (e.g. every accepted request, every class titled X),
   which would clean up after a neighbour and hide the neighbour's leak.
2. **Removing a class is not removing what hangs off it.** An accepted class request outlives
   its class (`deleteClassRequests`); a materialised one-off class re-projects its Lesson
   (`removeClassesOnDay` re-reads until empty). Check the database after the spec, not the
   response of the delete.
3. **Assert on your own rows.** Address what the test created by id; a count over a shared
   table (`toHaveCount(1)` on every accepted row) is a claim about every other spec.
4. **A victim is diagnosed before it is fixed.** Passes alone, fails in the shard at the same
   line: it is pollution until bisected. Never pin the sharding and never loosen the victim's
   assertion to absorb a leak you have not found.

<!-- 3.x fields of compass/rules/R-040-e2e-specs-put-the-shared-database-back.md, carried verbatim by cortex migrate -->
```yaml
source:
  - ../bugs/B-101-e2e-specs-left-shared-state-for-their-shard-mates.md
confidence: MEASURED
status: active
```
