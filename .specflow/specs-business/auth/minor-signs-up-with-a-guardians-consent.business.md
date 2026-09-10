---
id: auth.minor-signs-up-with-a-guardians-consent
status: implemented
implemented_by:
  - ../../specs/auth/parental-consent.spec.md
---

# Minor signs up with a guardian's consent

## Outcome

A young player can create their own LevApp account, but if they are under the age at which their
country lets them consent to data processing on their own, the account stays closed until a parent or
legal guardian says yes. The guardian gets an email, reads what they are agreeing to, confirms the
child's details, and accepts the terms; only then can the child sign in. The guardian can withdraw
that consent at any time from a link in their confirmation email, which removes the child's account
and data. LevApp keeps a record of every consent — who gave it, their relationship to the child, when,
and which version of the terms — as the privacy policy and terms of service (2026-09-06) promise.

## Who This Is For

A student (or, rarely, a coach) under their country's age of digital consent who signs up on their
own, and the parent or legal guardian who answers for them. Players a coach creates are not part of
this journey: the coach enrolled them and nobody asks them for a birth date.

## User Journey

1. On the sign-up form, everyone now gives a date of birth and their country (Portugal is
   pre-selected).
2. If the person is old enough for their country — 13 in Portugal, 16 where the country is not listed —
   sign-up works exactly as before.
3. If they are younger, the form also asks for a parent's or guardian's email. The account is
   created, but instead of opening the app the screen says that an email went to that address and
   that they can sign in once the guardian has agreed. They can send the email again after a minute,
   or correct the guardian's address.
4. The guardian opens the link (valid for 7 days; the child can ask for a new one) and sees a page
   explaining what LevApp is and what they are consenting to, with links to the privacy policy and
   terms. They type their name, say how they are related to the child, confirm the child's name, date
   of birth and country, and accept. Opening the link alone never activates anything.
5. Once the guardian accepts, the child's own email gets the usual 6-digit code; after typing it they
   are in the app like any other newcomer. The guardian receives a confirmation email with a
   permanent link to withdraw consent.
6. From that link — or, before accepting, from the consent page itself with "I do not consent" — the
   guardian can withdraw. A confirmation step says plainly that the child's account and data will be
   removed and that this cannot be undone. After confirming, the child can no longer sign in.
7. Until a guardian accepts, trying to sign in shows the same "waiting for your guardian" message
   with the option to resend.

## Business Rules

- Date of birth and country are required at self-sign-up for both roles; a coach-created player is
  never asked and is never held.
- The age of digital consent is set per country in a table LevApp can change without releasing the
  app. Portugal 13, Spain 14, Italy 14, France 15, Belgium 13, United Kingdom 13, United States 13,
  Germany 16, Ireland 16, the Netherlands 16; any other country 16.
- A minor's account cannot be used in any way until consent is given; withdrawn consent removes the
  account and its personal data, reusing the "delete account" behaviour.
- The guardian's email must be different from the child's.
- Every consent is recorded with the guardian's name, email, relationship, the child's details as
  confirmed, the date and time, and the terms version accepted.

## Success Metrics

- Not yet measured. Candidates: share of minor sign-ups whose guardian consents within 7 days; number
  of withdrawals.

## Out of Scope

- Verifying that the adult really holds parental responsibility beyond their own declaration.
- Automatically deleting a minor account whose guardian never answers (OPEN).
- Asking existing accounts for a birth date.

## Notes

- Linear: PAD-198. Owner decisions relayed by the coordinator session on 2026-09-10 (all eight
  defaults, plus: the age table is editable without a deploy; the withdrawal step states plainly that
  the removal is irreversible).
- Legal source: `.cortex/archive/documents/terms-of-service-2026-09-06` section 2 and
  `privacy-policy-2026-09-06` "Parental consent information".
