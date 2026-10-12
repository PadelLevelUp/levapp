---
id: auth.delete-account-page
status: implemented
depends_on: [auth.account-deletion, auth.legal-pages]
implements: ../../specs-business/auth/user-deletes-their-account.business.md
governs:
  - frontend/apps/web/src/pages/DeleteAccountPage.tsx
---

# Delete-account page: /delete-account

### Intent
Google Play requires an app that creates accounts to give a **web URL** where a person can ask for
their account to be deleted without the app installed (Play Console → Data safety → Data
deletion). `levapp.app/delete-account` is that URL (PAD-603). It explains both ways to delete and
what deletion does, in line with the privacy policy §10 and `auth.account-deletion`.

### Rules
1. **Public.** `/delete-account` is served by the web app like `/privacy` and `/terms`: no account,
   no session, nothing written, and no request to the API.
2. **Two ways, in this order.**
   - **In the app:** Settings → Account → Delete account. Immediate, signs out every device, cannot
     be undone (`auth.account-deletion` rules 1–3).
   - **Without the app:** an email to the contact address (`CONTACT_EMAIL` in `@levelup/config`,
     admin@levapp.app), from the account's email address or naming the account's username. The
     request is handled by hand: LevApp confirms by email and deletes the account within 30 days
     (default, owner to confirm the handler and the delay; one month is the RGPD ceiling).
3. **What is deleted and what is kept**, the same as `auth.account-deletion`:
   - deleted: name, email, phone, username and password; birth date, country and profile photo
     (rules 2, 2a); sign-in on every device and the notification registrations (rules 3, 4); the
     place in every upcoming class and waiting list (rule 6); for a coach, the sales-CRM contact
     (rule 11);
   - kept: the coach's record of classes already taken (attendance, evaluations, notes) and the
     messages sent, shown as "Deleted user" (rule 8); backup copies for a limited period; what the
     law requires or security and legal claims need (privacy policy §10).
   A link to `/privacy` closes the page.
4. **Language.** English and Portuguese, both complete. The page follows the UI language, and
   `?lang=en|pt` overrides it, like the legal pages (`auth.legal-pages` rule 2). An EN | PT switch
   is in the header.
5. **Web only, by design.** The page exists for people *without* the app; inside the app the
   deletion is the Settings action itself (`auth.account-deletion`, on web and iOS). Nothing is
   added to iOS. The reason is recorded here and in the PR (hard rule: web and iOS ship together).

### Acceptance Criteria

#### Anyone can open the page
- **Given** no session
- **When** someone opens `/delete-account`
- **Then** the page shows the in-app steps, the email path with a `mailto:` link to
  admin@levapp.app, what is deleted, what is kept, and a link to `/privacy`

#### The page speaks the visitor's language
- **Given** the page at `/delete-account?lang=en` (or `?lang=pt`)
- **Then** every text on it is English (or Portuguese), and the EN | PT switch marks the current one

### Notes
- PAD-603, 2026-10-11. Declaring the URL in the Play Console, the D-U-N-S number and the developer
  accounts in the company's name stay with the owner.
- Tests: `frontend/apps/web/src/pages/DeleteAccountPage.test.tsx`,
  `frontend/apps/web/e2e/legal/delete-account.spec.ts`.
