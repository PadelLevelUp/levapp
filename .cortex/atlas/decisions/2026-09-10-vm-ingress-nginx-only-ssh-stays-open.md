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
4. **Postgres stays closed** (PAD-197); workstations reach it over an SSH tunnel.

## Related

- PAD-230 brings the surviving firewall rules into Terraform, with state in the versioned
  bucket `padel-levelup-2026-tfstate`.
