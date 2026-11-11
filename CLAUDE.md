When a step doesn't need the user input, keep going. Put status notes in the
same message as your next action.
Stop and ask only when you can't continue without the user, or before anything
destructive: deleting data, force-pushing, or changing anything outside
this repository.

<!-- cortex:start v4.0 -->
## Cortex
This project keeps its knowledge in `cortex/` (plain files, one subject each). Start from the map:
@cortex/MAP.md

## Specs

`specflow/` holds the specs. `specflow/promises/<area>/` has short promises (`P-…` ids) on what the product guarantees.
`specflow/impl/<area>/` has implementation specs: their rules are numbered under a Rules heading, and their acceptance
criteria carry stable ids (`PAY-REFUND-3`). Spec text that points at `.specflow/specs/<a>/<b>.spec.md` or
`.specflow/specs-business/…` means the same file under `specflow/impl/` or `specflow/promises/`. A value more than one
spec uses is a constant in a `constants.md`; a spec sees its own folder's and its ancestors' constants, no others.
A test cites a criterion by its id: vitest `it('[PAY-REFUND-3] …')`, pytest `@pytest.mark.criterion("PAY-REFUND-3")`.
`specflow/INDEX.md` (criteria, their tests, `unverified` marks, constants) is generated; never edit it.

A finished change updates or adds the criterion for every behaviour it changes or adds, and a test that cites it.

If `core.hooksPath` is `.githooks`, a git hook checks every commit. It runs no tests. It refuses:

- a commit that changes code or config (anything outside `specflow/`, `cortex/`, tests, `.githooks/` and `.md` files) without changing a test;
- a commit that changes a spec's rules or criteria together with code or config. Commit the spec change on its own,
  before or after the code;
- a commit that changes the text of an existing rule or criterion without a trailer
  `Specflow-Amends: <spec-id>#<rule-7 or criterion id> — <reason>`, one per item. A new rule or criterion needs none.

Merge commits are checked the same way on what the merge itself changes.

Specs say what should hold; code says what does. Before changing code, find what produces the behaviour today and what depends on it. If a criterion describes what you change, change the criterion in the same change.

An unverified criterion is a claim about the code, not a fact; check the code.

If the request contradicts a rule, a 'Not this spec' line or a recorded decision the owner made, do not build it: write the spec with the conflict as an open question and stop.

If the request creates a behaviour no criterion covers, or touches more than one spec, do not write code: run specflow-spec first and stop for review.

If you were told the user can't answer during this run, don't wait: decide, write the decision and its reason under Open questions in the spec, and continue. This never applies to a conflict with a recorded owner decision; that always stops.
<!-- cortex:end -->
