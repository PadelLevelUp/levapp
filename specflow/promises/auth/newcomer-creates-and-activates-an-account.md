---
id: P-AUTH-4
title: "Newcomer creates and activates an account"
status: implemented
---
# Newcomer creates and activates an account

## Outcome

A person whose account was created for them, by a coach, a teammate or an invite flow, gets a working account: it starts inactive and becomes usable only once the person sets a password and, where relevant, chooses their username. Creating one's own account is a separate promise and is active from the start.

- Every way of completing an account (signing up, accepting a coach or player invitation, or activating an account a coach created) asks the person to accept the Privacy Policy and the Terms, and records when and which versions (PAD-637).
- Someone whose account predates that record, or who never gave a date of birth, is asked once per login for what is missing, on one screen they may skip; the 18+ rule applies to the date (PAD-637).
- An account created on someone's behalf starts inactive; nobody signs in with it until it is activated.
- Only an inactive account can be activated. The activation link is for that one account and carries a secret that only the server can produce and only that person's coach is shown: knowing or guessing an account's number is never enough, and a link without its secret does not work.
- The username is unique across the app once activation completes.
- The form never shows a system-generated placeholder username: it shows a blank field, or the real username the person chose earlier.
- Completing an account, by activation or by accepting an invitation, asks for date of birth and country, as sign-up does (PAD-457, PAD-604). An app version from before the country question still completes the account; those accounts are asked later (PAD-630).

It does not promise self sign-up, signing in afterwards, the player invite-and-complete flow, or accepting a club invitation between coaches.
