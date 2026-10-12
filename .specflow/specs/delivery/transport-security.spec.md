---
id: delivery.transport-security
status: implementing
depends_on: [delivery.api-host]
implements: ../../specs-business/delivery/connections-are-always-encrypted.business.md
governed_by: [R-036]
---

# delivery.transport-security

> Linear: PAD-643 (privacy review PAD-602, D10).

### Intent
The VM's nginx terminates TLS for every product host (all DNS-only records at 2026-10-12, so no
Cloudflare edge sits in front). It allowed TLS 1.0 and 1.1 (Debian's stock `ssl_protocols`) and
sent no HSTS. This makes the tracked files under `infra/nginx/` say TLS 1.2+ and HSTS, and gives
the owner the steps to apply them (the deploy does not install nginx files).

### Entities
- **READS / WRITES:** none (configuration).

### Rules
1. **Protocols.** `infra/nginx/nginx.conf` (the VM's `/etc/nginx/nginx.conf`) sets
   `ssl_protocols TLSv1.2 TLSv1.3;` at http level. It must be there, not only in a server block:
   nginx agrees the protocol for a listening socket before it picks a server by name, so a
   server-level value for a non-default host is not reliably applied.
2. **HSTS.** Every HTTPS server of the product and API hosts (`levapp`, `levapp-staging`,
   `padellevelup`, `levapp-api`, `levapp-api-staging`) sends
   `Strict-Transport-Security: max-age=31536000` (`always`, so error answers carry it too).
3. **Locations.** A location that sets its own `add_header` loses the server's headers in nginx,
   so it repeats the HSTS line (today: `/register/`).
4. **The console.** The staff console's hosts are left as they are: its container already sends
   HSTS with `includeSubDomains` (`frontend/apps/admin/security-headers.conf`).
5. **Applying.** The owner applies the files by hand (`infra/nginx/README.md`, "TLS hardening"):
   back up, compare with what the VM runs, install, `nginx -t`, reload, check.

### Acceptance Criteria

#### Only TLS 1.2 and 1.3 (rule 1)
- **Given** the tracked `infra/nginx/nginx.conf`
- **When** its `ssl_protocols` lines are read
- **Then** there is exactly one, `TLSv1.2 TLSv1.3`
- **And** after the owner applies it, SSL Labs reports TLS 1.0 and 1.1 as not offered

#### HSTS on every HTTPS answer (rules 2–3)
- **Given** the five product and API site files
- **When** each HTTPS server block is read
- **Then** it sends `Strict-Transport-Security "max-age=31536000" always`
- **And** every location in it that has an `add_header` repeats that line
- **And** after applying, `curl -sI https://levapp.app` and `curl -sI https://levapp.app/register/1`
  both show the header

### Notes
- `includeSubDomains` and preload are out of scope (see the business spec).
- Test: `backend/padel_app/tests/test_pad643_tls_hardening.py` reads the tracked files.
