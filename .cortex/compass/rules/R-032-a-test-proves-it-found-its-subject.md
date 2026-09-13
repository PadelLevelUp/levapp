---
id: R-032
title: "A test proves it found its subject before asserting anything about it"
source:
  - ../bugs/B-073-a-cancellation-was-reported-as-a-confirmation.md
governs:
  - "backend/padel_app/tests/**/*.py"
  - "frontend/apps/*/src/**/*.test.ts"
  - "frontend/apps/*/src/**/*.test.tsx"
  - "frontend/packages/*/src/**/*.test.ts"
  - "frontend/apps/web/e2e/**/*.spec.ts"
  - ".github/workflows/*.yaml"
confidence: EXTRACTED
status: active
---

# R-032 — A test proves it found its subject before asserting anything about it

Number self-assigned, unconfirmed (2026-09-13).

A test that reads files, walks a directory, greps a source, resolves a commit or drives a page
must **first assert that it found what it came for**, naming what it looked for when it did not.
Otherwise it asserts over an empty set and passes — and **a vacuous pass is indistinguishable
from a real one in CI**. The strongest checks are the likeliest to fail this way, because
strength here usually means "reaches across a boundary to compare two real sources", and
reaching is exactly what can come back empty.

**Existence is not identification.** Asserting the file is there is weaker than asserting it is
the right file: a rename that splits a module satisfies `is_file()` and still leaves the test
reading text that cannot contain what it is checking for. Prove the subject by something only
the real subject has — the symbol, the marker, a non-empty match count — not by its container.

## Why this one is different from the rest of the family

This is the fourth shape of *a claim that asserts more than it knows* recorded in one week
(after `Presence.confirmed` meaning "answered" in [[B-073]], which is this rule's `source`; a
label claiming a justification its state did not carry; and an English text assertion that
passed only while the string was untranslated, recorded as B-086. The family's full list lives
in B-074, which arrives with #250 — this rule deliberately cites B-073, the instance already on
staging, rather than a link that does not yet resolve). It is the only one where **the false claim is made by a test about
its own coverage** rather than by code about its data — which makes it the one nobody catches
by reading the diff. The assertion looks right, the run looks green, and the thing it was
supposed to protect is unprotected.

## The three instances that produced this rule

Three sessions reached for the same defence in one evening, independently:

1. **G's rules guard** — fails when the rules directory cannot be found, instead of iterating an
   empty directory and reporting every file compliant.
2. **I's weekly-QA run** — aborts when it cannot determine the commit it is testing, instead of
   reporting a result that belongs to no revision.
3. **The PAD-327 client-source test** (`backend/padel_app/tests/test_pad327_push_destinations.py`)
   — asserts the client's `push-routing.ts` exists **and defines `routeForPushData`** before
   checking which payload types it routes.

## A worked example: the rule applied to its own enforcement

`test_pad327_push_destinations.py` exists to prove that no push writer invents a payload type
the routing contract does not define. It finds the writers by walking every
`send_expo_push_to_user` call site with an AST — which is what makes it total, and also exactly
what can come back empty. A renamed helper, a moved `services/` directory, or a payload built in
a shape the walk does not recognise, and the parse yields nothing; the loop over "offenders" then
finds none and **the guard reports every writer compliant while checking none of them.**

So before it checks anything, it asserts the walk found at least five payload types, naming the
directory it searched when it did not:

```python
seen = sum(len(_expo_payload_types(p.read_text())) for p in SERVICES.glob("*.py"))
assert seen >= 5, (
    f"found only {seen} literal push payload types under {SERVICES}; this guard is not "
    "reading the writers it exists to check"
)
```

Two properties worth copying. The floor is a **count of real findings**, not a boolean — "the
directory exists" would have passed while the parser matched nothing. And the failure names
**where it looked**, so the next person fixes the guard's aim instead of deleting the assertion.

The same file carries the other half of the rule at a boundary: its client-source test asserts
`push-routing.ts` exists **and defines `routeForPushData`** before checking which types the app
routes, because existence is not identification — a rename that split the module would satisfy
the first and quietly fail the second.

## How to satisfy it

- Reading a file: assert it exists, and assert it contains the symbol you are about to reason
  about. Put the path you looked for in the failure message.
- Walking a directory or a glob: assert the collection is non-empty before looping.
- Parsing sources: assert the parse found at least one call site of the thing you are guarding.
- Resolving a revision, a fixture or an environment: fail when it is absent rather than
  defaulting — a default here is a claim you did not verify.
- Never "skip when missing" for the subject itself. Skipping is honest about the run; passing
  is not, and a skip that becomes permanent is its own defect.
