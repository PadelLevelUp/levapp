---
id: P-AUTH-5
title: "Newcomer signs up on their own"
status: implemented
---
# Newcomer signs up on their own

## Outcome

A coach or a student creates their own account from the login screen, on web or iPhone, without an invitation. A student lands in an empty app whose next step is to connect with a coach. A coach waits for the LevApp admin's approval while that gate is on, then creates a club or asks to join one.

- Both roles can self-register; the role is chosen at sign-up and the form cannot change it later.
- Adults only (PAD-445): anyone under 18 on the day is refused with "Data de nascimento inválida. Esta app só aceita maiores de 18 anos." and no account is created, on every path (web, iPhone, a coach's QR code, an invite link). Someone who turns 18 today can sign up.
- A self-registered account is active at once.
- Username and email are each unique across the app; a username that looks like a system placeholder is never accepted.
- Email is mandatory at self sign-up and verified with a code before the person goes on; it stays optional, and unverified, for players a coach creates.
- Every self-registered coach needs the admin's approval before creating or joining a club or touching a roster, while the gate is on; a coach who arrives through a club's invitation link needs none. Switching the gate off changes nobody's account.
- An approved coach ends onboarding with a club of their own or a pending request to join one; while pending they have no working club.
- Joining an existing club always needs a current member's approval.
- The form links to the Privacy Policy and Terms on both platforms, and the newcomer must accept them to create the account; when and which version is kept (PAD-485). Older accounts are not asked.
- A self-registered coach appears in the sales CRM within a minute as an inbound app lead, with their account status kept current, and an open deal moves to "Em teste". Only the coach's own name, email, phone and status are shared, never anything about their students. A CRM outage changes nothing for sign-up or approvals (PAD-471).
- The account's email recovers both password and username, and a recovery request never confirms whether an email has an account.
- A coach with no email is asked for one by a banner on the home screen, web and iPhone, which never blocks; "Agora não" hides it until the app is next opened. An account with no email is never shown as verified (PAD-482).

It does not promise how a student joins a coach's roster, or parental consent for minors.
