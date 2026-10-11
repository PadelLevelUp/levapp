---
id: delivery.staging-stays-realistic-without-slowing-production
status: draft
implemented_by:
  - ../../specs/delivery/staging-data-sync.spec.md
---

# Staging keeps realistic data without slowing production

## Outcome

Staging keeps testing against real-shaped data, and refreshing it no longer slows the live app.
Today every change that reaches staging copies the live database inside the same database server
that answers coaches and students, around thirty times on a busy evening (PAD-571 speed study,
cause 5). After this, staging is refreshed from the nightly backup at most once a day, and only
when there is a newer backup; the live database is never read for it.

## Who This Is For

Coaches and students, whose app stops slowing down while changes are being shipped; the owner and
the sessions that test on staging, who keep realistic data.

## User Journey

1. A change reaches staging. If last night's backup has already been loaded, staging keeps its
   data and only deploys the code.
2. The first change after a new nightly backup loads that backup into staging, once.
3. When staging needs a fresh copy now (a migration was rebased, or today's data matters), the
   owner starts the staging deploy by hand and asks for a reload from the latest backup, or, as a
   last resort, from the live database.

## Business Rules

1. Staging data is at most about a day old: it comes from the most recent nightly backup.
2. The same backup is loaded into staging at most once, however many changes reach staging.
3. Routine deploys never read the live database to refresh staging.
4. A copy from the live database happens only when the owner asks for it by hand.
5. Nothing on staging identifies a real person: names, usernames, emails, phones, birth dates,
   messages, notes, evaluations, guardian contacts and push tokens are rewritten on every load
   (PAD-606). Testers sign in with known staging accounts and a shared password kept in the
   staging secrets.
6. Refreshing staging never fails a deploy.

## Success Metrics

- Zero copies of the live database on staging pushes (deploy logs).
- At most one staging reload per nightly backup.

## Out of Scope

- Moving staging off the shared server (decided against on 2026-10-10, PAD-613).
- Anonymising names or classes on staging (unchanged from PAD-200).
