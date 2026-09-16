---
id: decision.2026-09-10-vm-ingress-nginx-only-ssh-stays-open
title: The VM takes internet traffic only through nginx; SSH stays open for the deploys
date: 2026-09-10T17:00:00Z
sources:
  - ../../../.github/workflows/deploy-prod.yaml
  - ../../../.github/workflows/deploy-staging.yaml
  - ../../../backend/terraform/main.tf
---

# The VM takes internet traffic only through nginx; SSH stays open for the deploys

PAD-229 (coordinator decisions, 2026-09-10). A read-only sweep of `levelup-instance`
found the prod Flask API answering `/api/app/healthz` with 200 from gunicorn on
`34.78.247.45:5000`: the hand-made firewall rule `backend` (tcp:5000 from 0.0.0.0/0) let
anyone skip nginx and TLS. `default-allow-rdp` (tcp:3389 from anywhere) opened a port
nothing listens on.

## Decisions

1. **Only nginx faces the internet.** The host nginx serves 80 and 443 and proxies to
   `127.0.0.1` on 5000 and 5100 (prod and staging API) and on 3000 and 3100 (prod and
   staging web). The deploy workflows publish those containers on `127.0.0.1` only, so no
   firewall rule can expose them again by accident.
2. **The `backend` and `default-allow-rdp` rules go.** Nothing outside the VM needs port
   5000: nginx reaches it locally and the deploys use SSH. Nothing listens on 3389.
   Deleting them is an owner action (see the PAD-229 PR notes).
3. **SSH (tcp:22) stays open to the internet.** Both deploy workflows scp and ssh into the
   VM from GitHub-hosted runners, whose addresses change, so IAP-only SSH would break every
   deploy. The VM accepts keys only. Revisit when deploys move to an IAP tunnel or a
   self-hosted runner.

   **Reaffirmed by the coordinator on 2026-09-16 (PAD-229 close-out): SSH stays on 22 for
   now, because the deploy pipeline depends on it.** Every production and staging deploy is
   an `appleboy/scp-action` + `appleboy/ssh-action` from a GitHub-hosted runner to the VM's
   public address over tcp:22; the runner pool has no fixed egress range, so the alternatives
   each move the deploy first: an IAP tunnel needs `gcloud` on the runner with a service
   account allowed `roles/iap.tunnelResourceAccessor` and a rewrite of both workflows; a
   self-hosted runner needs a machine to host it; a source-range allowlist needs an egress
   range GitHub does not publish as stable. None of that is in the deploy pipeline's scope
   this wave. What limits the exposure today: the VM accepts keys only (no password auth),
   the deploy key is a GitHub secret, and `default-allow-ssh` is the only rule reaching 22.
   No new ticket: the condition for revisiting is written here — the day the deploys stop
   using SSH from GitHub-hosted runners, `default-allow-ssh` narrows or goes.
4. **Postgres stays closed** (PAD-197); workstations reach it over an SSH tunnel.

## Status of the sweep (2026-09-16)

- `backend` (tcp:5000) deleted 2026-09-11 (audit log, Session H's read of 2026-09-15).
- `default-allow-rdp` (tcp:3389) deleted 2026-09-15 ~17:25 UTC by the coordinator,
  owner-approved; 3389 times out from outside afterwards.
- The four surviving rules — `default-allow-icmp`, `default-allow-internal` (10.128.0.0/9),
  `default-allow-ssh` (tcp:22), `levelup-allow-http-https` (tcp:80,443) — are defined in
  `backend/terraform/main.tf` and present in the GCS state (PAD-230). Verified 2026-09-16 by
  Session A with `terraform plan -lock=false` against the live project: **"No changes. Your
  infrastructure matches the configuration."** — the instance included. Nothing was imported
  and nothing applied; the plan wrote nothing, not even the state lock.

## Related

- PAD-230 brought the surviving firewall rules into Terraform, with state in the versioned
  bucket `padel-levelup-2026-tfstate`; PAD-229 verified the match above.
