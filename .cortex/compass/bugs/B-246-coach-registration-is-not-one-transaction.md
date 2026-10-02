---
id: B-246
title: "Coach self-registration is not one transaction: the default-levels helper commits mid-registration, and the atomicity test stubs that helper away"
type: test-defect
severity: low
status: triaged
affects:
  - backend/padel_app/services/coach_service.py
  - backend/padel_app/services/registration_service.py
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
