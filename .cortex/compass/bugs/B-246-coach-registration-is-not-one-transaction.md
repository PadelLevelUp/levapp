---
id: B-246
title: "Coach self-registration is not one transaction: the default-levels helper commits mid-registration, and the atomicity test stubs that helper away"
type: test-defect
severity: low
status: resolved
resolved: 2026-10-02T08:27:48Z
updated: 2026-10-02T08:27:48Z
affects:
  - backend/padel_app/services/coach_service.py
  - backend/padel_app/services/registration_service.py
  - backend/padel_app/services/club_service.py
  - auth.register
  - clubs.coach-invitation
  - backend/padel_app/tests/test_registration.py
proposed_fix: "Let create_default_levels_for_coach flush instead of commit when called inside a caller's transaction (a commit=False parameter, or the callers commit), and make test_registration_is_atomic fail inside the real helper after it adds the levels, not by replacing it."
opened: 2026-10-01T19:30:56Z
---

# B-246: coach registration commits twice, and the atomicity test cannot see it

**Source:** PAD-471 (#491). While proving that the HubSpot sync fires only after the sign-up commit, a
mutant placed *between* the two commits stayed green, because the account was already persisted there.
The coordinator asked for it to be filed (2026-10-01).

**What the code does** (`registration_service.register_user_service`, coach path):
1. Inside its `try`, it adds the `User` and flushes, then adds the `Coach` and flushes.
2. It calls `create_default_levels_for_coach(coach)`.
   - That helper (`coach_service.py:39-58`) adds three `CoachLevel` rows and **calls
     `db.session.commit()`** (line 57).
   - From that moment the User, the Coach (`approval_status` pending, or approved when the gate is
     off) and its three levels are committed.
3. Registration then calls `db.session.commit()` again. The `except` does `db.session.rollback()` and
   re-raises.

**What a failure between the two commits leaves behind:** a complete, committed account: a User
(`status` active, password set) with a Coach row and its three default levels. Yet the request answers
500 (the exception re-raises), and the rollback has nothing left to undo. The person was told sign-up
failed. If they try again they get `409` "username/email already registered", for an account they can
in fact log into.

Nothing after the helper's commit is lost, because nothing has run yet: no verification code was sent,
the admin was not notified, and no HubSpot sync happened. So the account exists, while the admin queue
and the email-verification step never heard of it.

Today the window holds only:
- the helper's own `return coach.levels`, a lazy load after the commit that could raise on a dropped
  connection;
- registration's second `commit()`.

So the defect is mostly latent. Any statement added later between the helper call and the final
commit would silently run outside the transaction.

**Why the test does not catch it:** `test_registration_is_atomic` (`test_registration.py:204`)
monkeypatches `create_default_levels_for_coach` with a function that raises *before* doing anything.
The real helper and its commit never run in that test, so "registration is atomic" is asserted against
a stub of the very thing that breaks it.

### Change Plan (Type 7, wrong test, plus the code)

- Test: patch only `db.session.commit` to fail on its *second* call within the request (or make
  `CoachLevel` insertion fail after the add). Then assert no User and no Coach exist. It goes red on
  today's code.
- Code: let the helper accept `commit=False` from the registration path (it has other callers that
  rely on its commit: coach invitation accept, `create_coach_service`), or move the commit to every
  caller.
- Re-check the coach-invitation accept path (`club_service.py:97`) for the same shape.

### Reproduced (PAD-476, Session-B, 2026-10-02)

Targeted pytest on staging `9fe5fefa9`, `test_pad476_registration_is_one_transaction.py`. The
failure is injected by wrapping the REAL `create_default_levels_for_coach`: it runs, including its
commit, and then raises. That is "a failure after the default levels were written".

- **Coach sign-up: RED.** The answer is 500 and `(User, Coach, CoachLevel) = (1, 1, 3)` are
  committed. The same payload again: `409 Username already taken`.
- **Invited-coach accept, new-user branch (`club_service.accept_coach_invitation_service`): RED,
  same shape.** It flushes the User and Coach, the helper commits, and only then come the club
  link, `invitation.status` and the final commit. This branch had no try/rollback either. The
  User is committed; a re-accept gets `409`. This entry covers the path (B-241 unused, coordinator
  2026-10-02).
- **Student sign-up: GREEN (control).** One commit; failing it leaves nothing.
- **Callers of the helper:** `registration_service`, `club_service`, `create_coach_service`. The
  last has no production caller; only `test_default_coach_levels.py` uses it.

**The old criterion tested a stub.** `auth.register` "Transaction is atomic" made default-ladder
creation fail *before* it did anything, so the helper's commit never ran in the test. Rule 12 is
amended and its criterion replaced: the failure now comes after the levels, and the criterion
includes the retry. `clubs.coach-invitation` rule 4 gains the same guarantee and a criterion.

### Resolution (PAD-476)

- **Code:** `create_default_levels_for_coach` calls `unit_of_work.commit_or_flush()`. Inside a
  unit of work it flushes; outside one it commits as before, so `create_coach_service` and direct
  callers are unchanged. It also expires `coach.levels`, so the return value and the idempotency
  check see the flushed rows. Coach and student sign-up (`register_user_service`) and the
  invited-coach new-user accept run their writes in `with unit_of_work():`.
- **Outside effects:** the verification code, admin notice and CRM sync run after the unit, never
  on rollback (tested). The invite accept has none.
- **Spec:** `auth.register` rule 12 is amended and its criterion replaced; `clubs.coach-invitation`
  rule 4 is amended and a criterion added.
- **Tests:** `test_pad476_registration_is_one_transaction.py`, 9 tests.
  - The 4 repro tests were red before the change.
  - Mutants, each red and restored: the helper commits again (4 red); the helper drops the expire
    (1 red); sign-up sends the code inside the unit (4 red); accept commits before the club link
    (1 red, after adding the club-link failure point).
- **Unchanged and green:** adults-only, activation and D142 tests, and PAD-471's file (unedited).
- **Review (specflow-request-review):** no load-bearing findings. Applied:
  - `test_registration_is_atomic` is renamed `test_a_failure_before_the_levels_exist_leaves_no_account`,
    with a docstring saying it covers the early case only;
  - a test that the helper still commits outside a unit (a rollback after the call keeps the
    levels). Mutant "the helper always flushes" turns it red.
