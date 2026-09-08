# Summary — Privacy Policy, effective 6 September 2026

The reviewed Privacy Policy for Levapp, naming **Sucesso Fractal – Lda** (Rua
Doutor Eugénio da Cunha e Freitas, 141 H, 4250-004 Porto) as data controller and
`admin@levapp.app` as the single contact for rights requests, security reports and
questions. It replaces the July 14 2026 placeholder currently rendered by
`frontend/apps/web/src/pages/PrivacyPolicyPage.tsx` (which still says "LevelUp" and
`privacy@levelup.app`).

**Not yet published.** Publication is tracked by Linear PAD-219, blocked on
PAD-198 (parental consent): the policy describes a consent process the app does
not have. Full text: `document.md`.

## What it commits us to

- **Data collected** — account/profile (name, username, email, hashed password,
  optional phone and photo, coach/player role, coach–player links), coaching data
  entered by coaches about players, message content and metadata, safety/report
  data, parental-consent records, and technical logs (IP, timestamps, session and
  push-notification tokens). No advertising SDKs, IDFA, or cross-app tracking.
- **Purposes and GDPR bases** — contract (providing the service), legitimate
  interests (reliability, security, abuse prevention, enforcing the Terms,
  protecting minors), consent where required, legal obligation.
- **Minors (section 5)** — in Portugal, 13+ can use an account without the formal
  process; under-13 accounts stay **inactive until a parent or legal guardian
  consents** through "our parental consent process"; consent is verifiable and
  withdrawable; a guardian can request deletion. Higher local ages may apply.
- **Sharing** — other users as inherent to the product; hosting/email/push/support
  providers under contract; lawful requests; safety investigations; corporate
  transactions. No selling, no advertisers or data brokers.
- **Transfers outside the EEA** — adequacy decisions, SCCs, or another GDPR
  mechanism; users may ask which applies.
- **Moderation (section 9)** — no routine reading of private conversations;
  access only when needed for reports, abuse, security, enforcement, or law.
- **Retention (section 10)** — while the account is active; historical coaching
  and message records while needed; consent records as long as needed to prove
  consent; backups overwritten in the normal cycle.
- **Account deletion (section 11)** — `Settings → Account → Delete account`
  invalidates sessions, anonymises identifiers, removes the account from active
  coach/player relationships. Content that itself names a person is not
  automatically anonymous; further removal on request.
- **Rights (section 12)** — access, rectification, erasure, restriction,
  portability, objection, withdrawal of consent, complaint. Identity verification
  may be required; normally free.
- **Complaints (section 15)** — CNPD, Av. D. Carlos I, 134, 1.º, 1200-651 Lisboa.
- **Changes** — effective date bumps; reasonable notice for material changes;
  consent obtained first where law requires it for new processing.

## Assumptions about the product that must be true before publishing

| Claim in the policy | State of the app on 2026-09-06 |
|---|---|
| Under-13 accounts are inactive until a guardian consents through a Levapp process; consent is recorded, verifiable and withdrawable | Does not exist — PAD-198 (backlog). Registration collects no date of birth or country. |
| Guardian can request deletion of a child's account | Only the generic account-deletion flow exists; nothing guardian-specific. |
| Users can block other users | Exists — messaging block/unblock (`frontend/apps/web/src/api/messages.ts`). |
| Push-notification tokens are processed | Exists — `auth.push-subscription`. |
| Delete-account path `Settings → Account → Delete account` | Exists (web and iOS). |
| Contact `admin@levapp.app` | Exists as the company mailbox (atlas decision 2026-09-03), but the pages still show `privacy@levelup.app` and Support shows the old Gmail address. |
