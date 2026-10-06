---
id: admin.staff-act-under-the-company-identity-and-leave-a-trail
status: draft
implemented_by:
  - ../../specs/admin/foundation.spec.md
---

# Staff act under the company's identity, and every action leaves a trail

## Outcome

Only people with a LevApp company Google account can get into the staff console, each with a role
that says what they may do, and every change they make is recorded: who did it, what they changed,
what it was before and after, and when. Leaving the company means losing access the moment the
Google account is closed, with no separate password to revoke. The coach and student apps carry no
staff screens, staff actions or console code, so a staff power can never leak into the product.

## Who This Is For

The owner, who needs to know who did what and to grant or remove access; staff, who sign in once
with the account they already have; and coaches and students, whose accounts are only ever changed
by an identifiable person.

## User Journey

1. A staff member opens the console and chooses "Sign in with Google".
2. A company account with a staff role gets in; any other Google account, including a personal
   one, is turned away with a clear message.
3. The console shows only the actions the staff member's role allows.
4. Every change they make appears in the audit log with their name, the target, the before and
   after, and the time.
5. The owner opens the audit log to answer "who changed this?" and finds the answer in one search.
6. When someone leaves, the owner removes their role (or the company closes their Google account)
   and they cannot get in again.

## Business Rules

1. Staff sign in only with a company Google account; there are no console passwords.
2. Three roles: the owner (everything, including giving and removing roles), operators (every
   operation except giving or removing roles), and support (read-only).
3. There is always at least one owner.
4. Every change made from the console is recorded, and the record cannot be edited or deleted from
   the console.
5. A staff sign-in never works in the coach or student apps, and a coach or student sign-in never
   works in the console.
6. The coach and student apps, on the web and on the iPhone, contain no staff screens, no staff
   actions and no code that talks to the console. The one visible exception is a read-only
   "viewing as" banner on the web app, shown only while a staff member looks at a user's app
   (and changing nothing).
7. The console runs alongside the product, with its own test copy beside the product's test copy.

## Success Metrics

- Every change made from the console can be traced to one named person.
- No staff screen, staff action or console code is found in the coach or student apps (the
  read-only "viewing as" banner aside).
- No shared or personal account has console access.

## Out of Scope

- Signing coaches or students in with Google (a separate, draft decision).
- Staff access from a phone.

## Notes

- Linear: PAD-530 (epic), PAD-531 (this foundation).
- Owner decisions 2026-10-06.
