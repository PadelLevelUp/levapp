---
id: business.notifications.people-hear-about-requests
status: implemented
implemented_by:
  - ../../specs/notifications/request-alerts.spec.md
---

# People hear about requests that wait for them

### Outcome
Nobody's request sits unanswered because the person who can act on it never looked at the
badge. When a coach asks to join a club, a coach asks a student to link a placeholder account,
or a self-registered coach waits for LevApp approval, the people who can decide are told
right away — on their phone, in the browser and by email — and the requester is told the
moment a decision lands.

### Journeys
- A club coach gets "Rui asked to join Padel Norte" as a push and an email, opens Settings →
  Club and approves; Rui gets "Padel Norte accepted your request".
- A student gets "Coach Ana wants to link the account 'Rui Placeholder' to yours" and accepts
  from the claim banner; Ana hears the account was linked.
- The LevApp admin gets a push (and the existing email) the moment a coach signs up; the coach
  gets a push (and the existing email) once approved.

### Business rules
- Alerts go only to the people who can act (club members for a join request, the invited
  account for a claim, superadmins for a coach approval) and, on a decision, only to the
  requester.
- Anyone can switch these alerts off for their own account in Settings; the in-app badges and
  banners stay regardless.
- Alerts are best-effort: a failed push or email never fails the request itself.

### Success signals
- Median time from request to decision drops; the Settings badges stop being the only signal.
