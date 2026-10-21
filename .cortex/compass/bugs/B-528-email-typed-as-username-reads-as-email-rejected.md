---
id: B-528
title: "Sign-up: an email typed into the username field got the generic characters message, read as 'my gmail was rejected'; a successful sign-up could be submitted again"
type: incomplete-rule
severity: medium
status: resolved
affects:
  - auth.register
  - frontend/apps/web/src/pages/SignUpPage.tsx
  - frontend/apps/mobile/app/signup.tsx
  - frontend/apps/mobile/src/features/auth/signup-form.ts
proposed_fix: "Pre-fill the username from the name or the email local part; name the '@' mistake; guard the submit synchronously and keep the form shut after the 201. One shared module (@levelup/config signup-username) for web and iOS."
opened: 2026-10-13T14:36:00Z
resolved: 2026-10-13T14:36:00Z
---

# B-528 — an email in the username field looked like a rejected email

**Source:** PAD-651, production on 2026-10-13.

**What happened:**
- At 07:25 UTC a new student opened a coach's join link in iPhone Safari. For an hour, no
  `POST /api/auth/register` reached the server: the form refused the sign-up on the device.
- At 08:32 UTC he signed up from the iOS app with username "JPT" and reported that the app "didn't
  accept his gmail".
- Likely cause (no client logs exist): he typed his email into the username field. The "@" failed
  `[A-Za-z0-9._-]`, and the message "Usa apenas letras, números, ponto, hífen ou underscore" reads
  like a verdict on the email. The email field itself accepts the address.
- The same morning another student got a 201 and then submitted twice more, earning 409s (username,
  then email taken), and went to password recovery.

**Root cause (incomplete rule):** `auth.register` only stated the username's character rule. No
rule covered:
- helping the user choose a username (no pre-fill);
- the most likely mistake (an email typed there), which got the generic message;
- a second submit. On web, `submitting` is React state, so a fast double click passes it. A failure
  in sign-in or `/auth/me` after the 201 also unlocked the form, so the next press could only
  earn a 409.

**Evidence (red first):**
- `packages/config/src/signup-username.test.ts` failed: the module did not exist.
- `apps/web/src/pages/SignUpPage.username.test.tsx`, 4/4 red on staging 000924ae9:
  - username `''` instead of `jorge.torres`;
  - `usernameChars` instead of `usernameIsEmail`;
  - `register` called 2 times, not 1;
  - the button was not disabled after the 201.
- `apps/mobile/src/features/auth/signup-username.test.tsx`, 4/4 red for the same reasons.
- All are green with the fix.

### Change Plan

- Spec: `auth.register` rule 21a–c and three criteria. The business spec's journey step 2 gets one
  sentence.
- Code:
  - `@levelup/config` `suggestUsername` and `usernameCharsIssue`, used by both schemas and both
    forms.
  - On both apps, a synchronous in-flight ref plus a `created` flag.
  - On web, `finishSignUp` failures send the user to `/auth` with "account created, sign in".
- Strings: `auth.signup.usernameIsEmail` and `auth.signup.createdSignIn` (pt and en), in the shared
  locale files.
- Maestro flows 33, 44 and 51 clear the pre-filled username before typing (`inputText` appends).

### Resolution

- Spec changes: `.specflow/specs/auth/register.spec.md` (rule 21 and criteria),
  `.specflow/specs-business/auth/newcomer-signs-up-on-their-own.business.md`.
- Tests added: the three unit files above, plus
  `apps/web/e2e/auth-onboarding/signup-username.spec.ts`.
- Not done (from the ticket's "consider" list): a privacy-safe count of which field blocked a
  submit. Capitals were already allowed.
- Resolved: 2026-10-13 (PAD-651).
