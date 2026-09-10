---
id: decision.2026-09-10-account-deletion-keeps-coach-records
title: Account deletion removes the person from the future and keeps the coach's records, anonymised
date: 2026-09-10T11:00:00Z
---

# Account deletion removes the person from the future and keeps the coach's records, anonymised

PAD-268 (audit M10). `DELETE /api/auth/me` only disabled the user and scrubbed contact fields; the
username and password hash survived, a deleted student stayed enrolled in every future class and kept
getting reminders, waiting-list credits kept being spent, pushes kept flowing, and the legacy session
login still let a disabled user in. The in-app copy promised the opposite ("permanently delete … your
profile, classes, evaluations, and messages").

**Decided (owner, via the coordinator levapp-41, 2026-09-10):**

1. **Delete the account itself**: username → unguessable `deleted-…`, password → unusable hash,
   contact fields null, every session and push registration gone, their blocks and calendar blocks
   deleted, legacy login refused.
2. **Keep the coach's records and sent messages** — past attendance, evaluations, notes, level
   history, and messages in the counterpart's conversation — shown as "Deleted user". They are the
   coach's and the counterpart's records, not the deleted person's account.
3. **Rewrite the copy** on web and iOS to say exactly what is deleted, what is kept and why.
4. **Freed seats are silent**: the student leaves every future class, no vacancy is opened and nobody is
   invited because of it; the coach's needs-you queue shows the empty seat. Alternative recorded as an
   open item in `auth.account-deletion`: run each seat through the student cancellation path.
5. **The invitation engine never picks a deleted account**, whatever the coach's "Exclude inactive
   accounts" setting says.
6. **A deleting coach** gets the account-level parts only; their classes, roster and club are untouched
   (open item).
7. **AI import**: document the data flow, no behaviour change.

Specs: `auth.account-deletion` (dev) and `auth.user-deletes-their-account` (business);
`import.analyze` rule 6.

## Privacy-policy checklist

Facts the published legal copy must match. Checked against the archived policy
`.cortex/archive/documents/privacy-policy-2026-09-06` (version 2026-09-06, publication tracked in PAD-219).

| # | What the product does | Policy section | Status |
|---|---|---|---|
| 1 | **Student names go to OpenRouter during import.** The AI import sends the coach's spreadsheet headers, up to 3 sample rows per sheet, up to 15 sample values per column, the student names found in the file and class names to the OpenRouter model provider (default model `inception/mercury-2`), per `import.analyze` rule 6. | §7 (providers), §8 (transfers) | **Check.** §7's provider list does not name AI or LLM processing, and OpenRouter is likely a transfer outside the EEA under §8. |
| 2 | Deletion signs the person out everywhere and removes name, email, phone, photo, username and password. | §11 | Matches. |
| 3 | Deletion keeps past attendance, evaluations, notes, level history and sent messages, anonymised as "Deleted user". | §10, §11 ("preserve records that another user is legally entitled to retain"; content may still contain personal information) | Matches. |
| 4 | Deletion takes a student out of every future class and waiting list. | §11 ("removes your account from active coach/player relationships") | Matches. |
| 5 | The coach's roster row for a deleted student (`coach_in_player`, carrying level and notes). | §11 ("removes your account from active coach/player relationships so that it can no longer be used as an active Levapp account") | **Pending decision** (asked 2026-09-10). Today the coach's player list still shows the row as "Deleted user". |
