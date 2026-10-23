---
id: admin.the-owner-knows-what-levapp-has-cost
status: draft
implemented_by:
  - ../../specs/admin/finance.spec.md
---

# The owner knows what LevApp has cost

## Outcome

The owner opens one page in the staff console and sees every cost LevApp has had since it started:
Google Cloud, the two Claude Max subscriptions, the Apple and Google developer accounts, domains and
the paid tools, month by month and by category, with each month's total and the running total since
the start. Google Cloud's figures arrive by themselves once a day; everything else is entered by
hand once and repeats on its own when it is a subscription (PAD-742, owner request 2026-10-22).

## Who This Is For

The owner, who pays the bills and wants the real cost of running LevApp in one place instead of in
card statements, invoices and the Google Cloud console.

## User Journey

1. The owner turns on Google Cloud's billing export once, following a short checklist; from the
   next day the console fills in Google Cloud's cost by itself, project by project and service by
   service.
2. The owner enters the costs Google Cloud does not know about: each subscription once, with its
   price and the month it started, and each one-off payment with its date. A subscription keeps
   counting every month (or every year) until the owner marks the month it stopped.
3. For the months before the export was on, the owner enters Google Cloud's invoice totals by hand.
3a. A whole list (the first load, or a year of statements) can be pasted from a spreadsheet or
   picked as a CSV file: the page checks every line first, shows which ones have a problem and why,
   and creates them all at once only when every line is right. The owner sends the initial list to
   the coordinator, who prepares the table; whoever has a console account loads it.
4. The page shows a table of months against categories, each month's total, the running total, a
   simple chart, and a CSV download for the accountant.
5. If the daily Google Cloud import fails or stops, the page says so at the top, with the date of
   the last good import; it never just goes quiet.

## Business Rules

- Every amount is shown in euros. A cost charged in another currency keeps what was charged, in
  that currency, next to the euro amount the card was actually debited. *(Owner's answer 1,
  2026-10-23.)*
- The history starts at the month of the first cost entered; nothing before it is shown.
  *(Owner's answer 2.)*
- Every staff console account sees and changes the finance page: the console's accounts are the
  founders'. *(Owner's answer 4, 2026-10-23; it replaced the owner-only assumption.)*
- Every change to a cost is recorded with who made it and when, and the old value is kept in the
  finance history. The console's general activity log notes that a cost changed and which fields,
  never the amounts.
- Google Cloud figures are read, never changed: the console only reads the billing data.
- Google Cloud costs are counted once: a month has either the owner's invoice total or the
  imported figures, never both.
- Google Cloud credits (free-trial or promotional) are shown and taken off, so the month's figure
  matches the invoice.

## Success Metrics

- The running total matches the sum of the invoices and statements the owner holds, to the cent,
  for every month since the start.
- A failed import is visible on the page the same day it fails.

## Out of Scope

- Revenue, coach plans and prices (PAD-535/PAD-536).
- Paying anything, budgets or spending alerts.
- A phone app: the console is web only (R-024 exception, as for the rest of the console); it works
  in a phone browser like every console page.
- Automatic import from Anthropic, Apple, Google Play, the domain registrar or other suppliers.

## Notes

- The owner's answers on PAD-742 (2026-10-23): (1) euro totals, keeping the charged amount;
  (2) the history starts at the earliest charge; (3) the owner sends the initial list to the
  coordinator instead of typing it, and it is loaded through the list import; (4) every console
  account sees and changes finance, and the audit records who did what.
