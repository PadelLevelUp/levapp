---
id: B-220
title: "The verify screen's 60-second resend countdown was read as the code's validity (the email says 15 minutes)"
type: incomplete-rule
severity: medium
status: resolved
affects:
  - auth.email-verification
  - frontend/src/locales/pt/auth.json
  - frontend/src/locales/en/auth.json
proposed_fix: "The hint states the 15-minute validity; the countdown reads 'Novo código disponível em Ns'; copy pinned to CODE_TTL."
opened: 2026-09-26T14:13:50Z
resolved: 2026-09-26T14:13:50Z
---

# B-220: resend countdown read as the code's validity (PAD-458)

**Source:** PAD-458, reported by a founder via Discord: the email says the code is valid for 15 minutes, but the app "shows about 1 minute".

**What happens:** The Verify your email screen (web and iOS) showed no validity at all. The hint read "Escreve o código do email…", and the only number on the screen was the resend button, "Enviar novo código (54s)", counting down from 60. It reads as the time left to type the code.

**What should happen:** The screen states the same validity as the email, and the countdown reads as when a new code can be asked for.

**Phase 1 evidence (the code, not the report):**
- The server TTL is 15 minutes: `email_verification_service.CODE_TTL = timedelta(minutes=15)` (spec rule 3).
- The 60 s is `RESEND_COOLDOWN` (rule 4), rendered by `verifyEmail.resendIn` on both shells (web `VerifyEmailPage.tsx:271`, iOS `verify-email.tsx:383`).
- The email copy (`email_templates._VERIFY.valid`) says 15 minutes, which is correct.
- So no timer is wrong. Rule 8 never required the screen to state the validity, which makes it an incomplete rule.

**Root cause:** `auth.email-verification` rule 8 listed the countdown but not the validity. Clients showed only the cooldown number.

### Change Plan (executed)
- Spec rule 8c and the criterion "The screen states the code's validity, and the countdown is not it".
- pt/en `auth.verifyEmail.hint` states 15 minutes. `resendIn` becomes "Novo código disponível em {{seconds}}s" / "New code available in {{seconds}}s", shared with the recovery screen with the same meaning. The E2E `\d+s` matcher still holds.
- `test_pad458_code_validity_copy.py` pins both locales and the email to `CODE_TTL`: red on the old copy (2 failed / 1 passed), green on the fix (3 passed).

### Resolution
- Spec: `.specflow/specs/auth/email-verification.spec.md` (8c + criterion).
- Tests: `backend/padel_app/tests/test_pad458_code_validity_copy.py`.
- Code: copy only. The backend, the email and the TTL are unchanged because they were right.
