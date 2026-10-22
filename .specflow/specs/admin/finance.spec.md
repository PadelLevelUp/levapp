---
id: admin.finance
status: draft
depends_on: [admin.foundation, admin.engine-health, admin.phone-console]
implements: ../../specs-business/admin/the-owner-knows-what-levapp-has-cost.business.md
governed_by: [R-005, R-010, R-022, R-023, R-024, R-036]
---

# admin.finance

> Linear: PAD-742 (owner request 2026-10-22). Draft: no code exists. Four questions are open on the
> ticket (currency, start date, the initial manual list, who enters); the rules marked
> **(assumption Qn)** are this draft's answer until the owner's, and each is one constant or one
> rule to change. Plan: `docs/plans/2026-10-22-pad-742-plan.md` (gitignored).

### Intent
A "Financeiro" page in the staff console listing every cost LevApp has had: manual entries for
what no API reports (subscriptions, store accounts, domains, paid tools, Google Cloud invoices from
before the export), and a daily read-only import of Google Cloud's billing export. Shown by month
and category, with month totals and the running total since the start.

### Entities
- **CREATES:** `finance_costs` — one manual cost, one-off or recurring. `id`, `category`
  (`infrastructure`|`ai_tools`|`stores`|`domains_dns`|`email_crm`|`other`), `vendor` (String(80)),
  `description` (String(200)), `currency` (ISO 4217, 3 upper-case letters), `amount`
  (`Numeric(12,2)`, in `currency`, > 0), `amount_eur` (`Numeric(12,2)`, > 0), `recurrence`
  (`once`|`monthly`|`annual`), `starts_on` (date: the charge date, or the first charge of a
  recurring cost), `ends_on` (date, nullable: the last charge of a recurring cost; null = still
  running), `gcp_invoice` (bool, default false: the row is a Google Cloud invoice total entered by
  hand), `notes` (Text, nullable), `created_by_email`, `updated_by_email`, `deleted_at`,
  `deleted_by_email` (nullable), `created_at`, `updated_at`.
- **CREATES:** `finance_cost_revisions` — the owner-only history of each manual cost (rule 5b).
- **CREATES:** `finance_gcp_costs` — one imported line per invoice month, project and service.
  `id`, `invoice_month` (date, always the 1st), `project_id` (String(64)), `service`
  (String(120)), `currency` (3 letters), `cost` (`Numeric(16,6)`, before credits), `credits`
  (`Numeric(16,6)`, ≤ 0), `run_id` (FK → `finance_import_runs`), `created_at`, `updated_at`.
  Unique (`invoice_month`, `project_id`, `service`).
- **CREATES:** `finance_import_runs` — one row per import attempt. `id`, `trigger`
  (`schedule`|`manual`), `actor_email` (nullable; set for `manual`), `started_at`, `finished_at`
  (nullable), `outcome` (`running`|`ok`|`error`|`not_configured`), `months` (JSON list of
  `YYYY-MM`), `rows` (int), `error_code`, `error_message` (String(500), nullable), `created_at`,
  `updated_at`.
- **READS:** `admin_roles`, `admin_audit_log` (`admin.foundation`); Google Cloud's standard usage
  cost export table in BigQuery (read-only, outside the app database).
- Money columns here are **costs** LevApp pays. They are not the plan prices that
  `admin.commercial-groundwork` keeps out of the schema until PAD-536.

### Rules
1. **Who.** Every finance route requires the role in one constant, `FINANCE_ROLE = "owner"`, for
   reads as well as writes **(assumption Q4)**. This is a deliberate exception to
   `admin.foundation` rule 5 (`support` reads every `GET`): cost data is the owner's. A lower role
   gets 403 `ADMIN_ROLE_TOO_LOW` with a denied audit row, as everywhere. The nav item and the route
   are hidden from lower roles. Finance writes appear in the console audit log without their
   values (rule 5a), so `support`, who can read that log, never sees money.
2. **Euros, with the original kept (assumption Q1).** Every total is in euros. A cost charged in
   another currency stores the charged `amount` and `currency` and the euro `amount_eur` the owner
   was debited (from the card statement); there is no exchange-rate service. When `currency` is
   `EUR`, `amount_eur` must equal `amount` (an omitted `amountEur` is copied from `amount`).
   Imported Google Cloud lines must be in `EUR` (the billing account's currency); a run that reads
   any other currency stores nothing for that run and ends `error` / `BILLING_CURRENCY_NOT_EUR`.
3. **Charges.** A cost's charges are derived, never stored: `once` charges `amount_eur` in the
   month of `starts_on`; `monthly` charges it in every month from `starts_on`'s month to
   `ends_on`'s month (inclusive), or to the current UTC month when `ends_on` is null; `annual`
   charges it in `starts_on`'s month and the same month of each later year, under the same end.
   No charge falls after the current UTC month. A price change is an end on the old row and a new
   row. A soft-deleted row (`deleted_at` set) charges nothing.
4. **Start (assumption Q2).** The history starts at the month of the earliest charge, manual or
   imported. There is no configured start date.
5. **Manual entries.** `POST /admin/api/finance/costs`, `PUT …/costs/<id>`,
   `DELETE …/costs/<id>`, each `@audited` (`finance.cost.create` / `.update` / `.delete`), redacted
   as rule 5a says; each write also appends the row's full state to `finance_cost_revisions`.
   Delete is soft: `deleted_at`/`deleted_by_email` are set and the row is
   listed with `includeDeleted=true`. `created_by_email`/`updated_by_email` are the caller's.
   Validation (400 `{"error": "INVALID_COST", "field": <name>}`): `amount`, `amountEur` > 0 with at
   most 2 decimals; `currency` 3 upper-case letters; `category` and `recurrence` from the lists;
   `endsOn` ≥ `startsOn` and only on a recurring cost; `gcpInvoice` only with `recurrence = once`
   and `category = infrastructure`; `vendor` and `description` non-empty.
5a. **The console audit log carries no money (coordinator decision 2026-10-22).** A finance audit
   row (`finance.*`) names the target (`finance_cost` / `finance_import_run` and its id), who and
   when, as every audit row does; its `before` is null and its `after` is only
   `{"changedFields": [<camelCase field names>]}` (for a create, every field set; for a delete,
   `["deletedAt"]`; for `finance.gcp.import`, `{"changedFields": [], "runId": <id>}`). No amount,
   currency, vendor, description or note is written to `admin_audit_log`. A guard test fails if a
   `finance.*` audit row's JSON holds any key other than `changedFields` and `runId`.
5b. **History is kept in finance, owner-only.** `finance_cost_revisions` (`id`, `cost_id` FK →
   `finance_costs` CASCADE, `revision` (int, 1-based per cost), `action` (`create`|`update`|`delete`),
   `snapshot` (JSON: the row's camelCase state after the write), `actor_email`, `created_at`,
   `updated_at`; append-only like the audit log: the model refuses an update or delete) is written
   in the same transaction as the cost. `GET /admin/api/finance/costs/<id>/revisions`
   (`FINANCE_ROLE`) lists them newest first.
6. **Google Cloud is counted once.** A month is *imported* when `finance_gcp_costs` holds any row
   for it. A manual `gcpInvoice` cost in an imported month is refused on create or update (409
   `GCP_MONTH_IMPORTED`). A manual `gcpInvoice` cost whose month became imported later charges
   nothing and is listed as `superseded` in the summary, so the month counts the imported figure
   only.
7. **The import.** One daily scheduler job, `finance_gcp_import`, at 04:07 UTC on the scheduler
   leader, a fixed id (R-010) with a `CronTrigger`, 6 h misfire grace and the boot catch-up of
   `delivery.worker-role` rule 4. Each run inserts a `finance_import_runs` row (`running`), then:
   - when `FINANCE_GCP_BILLING_TABLE` is empty it ends `not_configured` and reads nothing;
   - otherwise it runs one parameterised query over that table, filtered to
     `_PARTITIONTIME >= ` the 1st of the previous UTC month and `invoice.month IN (previous,
     current)`, grouped by `invoice.month`, `project.id`, `service.description` and `currency`,
     summing `cost` and the `credits` amounts, with `maximum_bytes_billed = FINANCE_GCP_MAX_BYTES`
     (default 1 GiB);
   - in one transaction it deletes the stored rows of those two months and inserts the result
     (a re-run on the same day gives the same rows; an older month is never touched again);
   - it ends `ok` with `rows`, or `error` with a code (`BIGQUERY_ERROR`, `PERMISSION_DENIED`,
     `TABLE_NOT_FOUND`, `BILLING_CURRENCY_NOT_EUR`) and the message cut to 500 characters, keeping
     the previous rows. An `error` logs at error level.
   Rows written by the import are attributed by `run_id`; they are not console writes and do not go
   through `@audited`. A run that is still `running` 30 minutes after it started is reported as
   `error` / `STUCK` by the status below.
8. **Run now.** `POST /admin/api/finance/gcp/import` (`@audited("finance.gcp.import")`) runs the
   same import synchronously with `trigger = manual`, and answers 409 `IMPORT_RUNNING` while
   another run is `running` and under 30 minutes old.
9. **A failure is visible.** Every finance response that the page loads first (`summary`) carries
   `importStatus`: `{configured, lastRun: {outcome, startedAt, finishedAt, errorCode}, lastOkAt,
   stale}`, where `stale` is true when configured and the last `ok` run is more than 36 hours old
   (or there is none). The page shows a red banner for `error` or `stale` with the last good
   import's date, and a neutral "Google Cloud import not set up" notice when not configured.
   `finance_gcp_import` joins `admin.engine-health`'s fixed singletons (rule 2), so a missing or
   overdue job shows there too.
10. **Read routes** (all `FINANCE_ROLE`, camelCase, amounts as decimal strings with 2 places in
    euros, months as `YYYY-MM`):
    - `GET /admin/api/finance/summary?from&to` — for each month from `from` (default: the start,
      rule 4) to `to` (default: the current month): the euro total per category (Google Cloud's
      imported net in `infrastructure`), the month total, and the cumulative total since the start
      (not since `from`); plus `categories`, `start`, `superseded` (rule 6) and `importStatus`.
      Month figures are rounded to cents once, after summing.
    - `GET /admin/api/finance/costs?category&vendor&includeDeleted` — the manual rows.
    - `GET /admin/api/finance/gcp?month` — one month's imported lines by project and service, with
      cost, credits and net.
    - `GET /admin/api/finance/import-runs` — the 30 latest runs.
    - `GET /admin/api/finance/export.csv?from&to` — one line per charge (manual charges as derived
      by rule 3, imported lines per project and service): month, category, vendor or project,
      description or service, original amount and currency, euros. UTF-8 with a BOM, comma
      separated, dot decimals.
11. **Configuration and identifiers (R-036).** `FINANCE_GCP_BILLING_TABLE` (the export table's
    full id) and `FINANCE_GCP_MAX_BYTES` are read from the environment. The tracked env templates
    carry the names with empty values; the table id, the project ids it contains, the billing
    account and the dataset never appear in tracked files, specs or test fixtures (tests use
    invented ids). The backend reads BigQuery with the backend's own Google credentials, which the
    owner grants BigQuery Data Viewer on the export dataset and BigQuery Job User on the project
    that runs the query; no key file is stored. The query goes to BigQuery's REST `jobs.query`
    through `google-auth`'s authorised session (already a dependency); no BigQuery client library
    is added. The job runs in the project named by the table id.
12. **The page.** Nav item "Financeiro" / "Finance" for `FINANCE_ROLE` only, route `/finance`, three
    tabs: **Resumo** (months × categories table, month totals, cumulative, a stacked bar chart drawn
    with inline SVG — no chart dependency — and the CSV download), **Custos** (the manual list with
    create, edit and delete in a dialog), **Google Cloud** (a month picker, the month's lines, the
    latest runs and "Importar agora"). Strings in `pt` and `en` (`admin.foundation` rule 16).
    Usable at 375 px (`admin.phone-console`): tables scroll in their own container, the dialog fits
    the screen.
13. **Web only (R-024 exception).** As `admin.foundation` rule 15: a staff page with no coach or
    student user; no iOS or Android counterpart.

### Acceptance Criteria

#### Only the owner reaches finance (rule 1)
- **Given** active roles `ana@levapp.app` = `operator` and `owner@levapp.app` = `owner`
- **When** each calls `GET /admin/api/finance/summary`
- **Then** Ana gets 403 `ADMIN_ROLE_TOO_LOW` and a denied audit row exists, and the owner gets 200

#### A manual cost is created and audited (rules 2, 5)
- **Given** the owner
- **When** they post `{category: "ai_tools", vendor: "Anthropic", description: "Claude Max", currency: "USD", amount: "200.00", amountEur: "184.37", recurrence: "monthly", startsOn: "2026-07-03"}`
- **Then** the response is 201 with the row, `createdByEmail = "owner@levapp.app"`, one audit row `finance.cost.create` with `outcome = ok` whose `after` holds only `changedFields`, and one revision (`create`) with the row

#### A euro cost with a different euro amount is refused (rule 2)
- **Given** the owner
- **When** they post a cost with `currency: "EUR"`, `amount: "10.00"`, `amountEur: "9.00"`
- **Then** the response is 400 `INVALID_COST` with `field = "amountEur"` and no row is stored

#### An edit keeps the old value in finance, not in the audit log (rules 5, 5a, 5b)
- **Given** a `once` cost of `amountEur = "99.00"`
- **When** the owner puts `amountEur: "119.00"`, `notes: "renewal"`
- **Then** the row has 119.00, `updatedByEmail` is the owner; `GET …/costs/<id>/revisions` lists revision 2 (`update`, 119.00) and revision 1 (`create`, 99.00); the audit row `finance.cost.update` has `before` null and `after` = `{"changedFields": ["amountEur", "notes"]}`, and no `99`, `119` or `renewal` appears anywhere in it

#### A deleted cost stops counting but stays listed (rules 3, 5)
- **Given** a `once` cost of 50.00 on 2026-08-10
- **When** the owner deletes it
- **Then** August's total drops by 50.00, the row is absent from `GET …/costs` and present with `deletedAt` in `GET …/costs?includeDeleted=true`

#### Recurring costs charge every period until they end (rule 3)
- **Given** the current month is 2026-10 (pinned clock), a `monthly` cost of 184.37 from 2026-07-03 with no end, an `annual` cost of 99.00 from 2025-11-20, and a `monthly` cost of 10.00 from 2026-05-01 ending 2026-08-31
- **When** the owner reads the summary
- **Then** `ai_tools` has 184.37 in each of 2026-07, -08, -09 and -10 and nothing earlier; the annual cost charges 2025-11 only (not 2026-11, which is in the future); the 10.00 cost charges 2026-05 through 2026-08 only

#### The cumulative total runs from the start, whatever the window (rules 4, 10)
- **Given** charges of 100.00 in 2026-01, 50.00 in 2026-02 and 25.00 in 2026-03
- **When** the owner reads `summary?from=2026-02&to=2026-03`
- **Then** `start` is `2026-01`, the months are 2026-02 (total 50.00, cumulative 150.00) and 2026-03 (total 25.00, cumulative 175.00)

#### The import replaces the two open months and leaves older ones (rule 7)
- **Given** `FINANCE_GCP_BILLING_TABLE` set to an invented id, a fake BigQuery session returning, for 2026-09, project `demo-project` service `Compute Engine` cost 40.123456 credits -5.000000 in EUR, and stored rows for 2026-08 and an outdated 2026-09 row
- **When** `finance_gcp_import` runs on 2026-10-05
- **Then** the run is `ok` with `months = ["2026-09", "2026-10"]`; 2026-09 holds only the new line; 2026-08 is unchanged; the summary's 2026-09 `infrastructure` includes 35.12; a second run the same day leaves the same rows

#### The query is bounded and read-only (rule 7)
- **Given** a configured table
- **When** the import runs
- **Then** the fake session receives exactly one `jobs.query` request, with `maximumBytesBilled` = `FINANCE_GCP_MAX_BYTES`, a `_PARTITIONTIME` lower bound of the 1st of the previous month, the two months as query parameters, and no DML statement

#### An unconfigured import says so (rules 7, 9)
- **Given** `FINANCE_GCP_BILLING_TABLE` empty
- **When** the job runs and the owner reads the summary
- **Then** a run with `outcome = not_configured` exists, no BigQuery request was sent, and `importStatus.configured` is false

#### A failing import is visible and keeps the old figures (rules 7, 9)
- **Given** stored rows for 2026-09 and a fake session that answers 403
- **When** the job runs
- **Then** the run is `error` / `PERMISSION_DENIED`, the 2026-09 rows are unchanged, an error is logged, and the summary's `importStatus.lastRun.outcome` is `error`

#### A stale import is visible (rule 9)
- **Given** a configured table and a last `ok` run 37 hours ago (pinned clock)
- **When** the owner reads the summary
- **Then** `importStatus.stale` is true

#### A non-euro billing account is refused (rule 2)
- **Given** the fake session returns a line in `USD`
- **When** the job runs
- **Then** the run is `error` / `BILLING_CURRENCY_NOT_EUR` and nothing is stored for that run

#### Google Cloud is counted once (rule 6)
- **Given** imported rows for 2026-09
- **When** the owner posts a `gcpInvoice` cost dated 2026-09-30
- **Then** the response is 409 `GCP_MONTH_IMPORTED`
- **And Given** a manual `gcpInvoice` cost of 31.00 for 2026-08 entered before 2026-08 was imported, and then an import that stores 2026-08 lines summing 30.50
- **Then** 2026-08's `infrastructure` counts 30.50 only and `superseded` lists the manual row

#### Run now is audited and refuses a parallel run (rule 8)
- **Given** a run that started 5 minutes ago and is still `running`
- **When** the owner posts `gcp/import`
- **Then** the response is 409 `IMPORT_RUNNING`; once it has finished, the same post runs an import with `trigger = manual`, `actorEmail` = the owner, and an audit row `finance.gcp.import`

#### The job is a fixed daily singleton (rule 7)
- **Given** a fresh boot
- **When** the scheduler registers its jobs
- **Then** `finance_gcp_import` exists with a `CronTrigger` at 04:07 UTC and a 6 h misfire grace, and engine-health lists it among the singletons

#### The CSV matches the summary (rule 10)
- **Given** the charges of the recurring-costs criterion and one imported line
- **When** the owner downloads `export.csv?from=2026-07&to=2026-10`
- **Then** the file starts with a UTF-8 BOM, has one line per charge, and its euro column sums to the summary's totals for those months

#### The page shows the months and the banner (rules 9, 12)
- **Given** the owner signed in, a summary with two months and `importStatus.lastRun.outcome = error`
- **When** `/finance` renders
- **Then** the table shows both months with their totals and cumulative, the red banner names the last good import's date, and the nav shows "Financeiro"; for an `operator` there is no nav item and `/finance` shows the not-allowed page

#### Usable from a phone (rule 12)
- **Given** a 375 px viewport
- **When** the owner opens each tab and the cost dialog
- **Then** the page has no horizontal scroll and the tables scroll in their own container

#### No identifiers in tracked files (rule 11)
- **Given** the repository
- **When** the R-036 guard scans tracked files
- **Then** `FINANCE_GCP_BILLING_TABLE` has an empty value in every tracked env template and no fixture holds a real project, dataset or billing-account id

### Notes
- Billing export to BigQuery, not the Cloud Billing API: the Cloud Billing API manages billing
  accounts, project links and the public price catalogue; it has no endpoint that returns what was
  spent. Cost amounts come only from the export (or the console's reports). Detail and the owner's
  enable checklist are in the plan.
- The export starts when it is enabled. A multi-region (EU) dataset also loads data from the 1st of
  the previous month (Google's documentation for the detailed export; to confirm on enabling for
  the standard export). Every earlier month is a manual `gcpInvoice` entry from the invoices.
- OPEN Q3: the initial manual list (both Claude Max subscriptions, Apple Developer, Google Play,
  domains, other tools) is entered by the owner through the page; no amount is seeded in a
  migration.
- Implementation also edits `delivery.worker-role` rule 4 and `admin.engine-health` rule 2 to list
  `finance_gcp_import`.
