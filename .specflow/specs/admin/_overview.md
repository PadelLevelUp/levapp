# admin — The staff console (admin.levapp.app)

## What this is

The admin domain: a separate staff console (`frontend/apps/admin`, served at `admin.levapp.app`
and `admin.staging.levapp.app`) and its backend blueprint `/admin/api/*`, deployed on the same
VM and pipeline as the product. Staff sign in with Google restricted to the company Workspace,
hold a role, and every write is audited. Epic PAD-530, owner decisions 2026-10-06.

## What it covers

- `admin.foundation` — draft (PAD-531: Google SSO restricted to `levapp.app`, the `levapp-admin`
  token audience, `admin_roles` owner/operator/support replacing `is_superadmin` for new code,
  `admin_audit_log` with a route-coverage guard, deploy topology, no admin code in the product apps)
- `admin.approvals-and-users` — draft (PAD-532: coach approvals through the existing services, user
  directory, disable/enable, resend verification, read-only "view as"; removes Settings → Admin
  from web and iOS)
- `admin.clubs-and-switches` — draft (PAD-533: clubs, courts, coach↔club links, capability
  kill-switches; the coach-approval gate ships early with PAD-532)
- `admin.engine-health` — draft (PAD-534: read-only engine counts, recorded delivery incidents,
  deployed SHA and migration head per environment, per-coach engine settings)
- `admin.commercial-groundwork` — draft, **blocked** (PAD-535, by PAD-536 and PAD-472: `plans`,
  `coach_plans`, entitlements through capabilities, no payment provider)

## Why it's grouped this way

The console serves LevApp's own staff, not coaches or students, and its code must never reach
the product apps. A separate domain keeps that boundary visible: product specs do not depend on
`admin.*` leaves; `admin.*` leaves depend on product leaves and reuse their services.

## Related groups

- `auth/` — `auth.coach-approval` keeps the approval rules; only the approving screen moves here.
- `settings/` — `settings.admin-editor` (`/editor`) is retired (owner, 2026-10-07; PAD-532 removes it with the Settings → Admin tab);
  `settings.role-scope`'s `superadmin` audience loses its Admin section.
- `eligibility/` — `eligibility.open-spot-visibility` rule 12 defines the capability header the
  kill-switches act on.
- `delivery/` — the deploy pipeline the console's image joins.
