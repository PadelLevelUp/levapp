# Host nginx (the VM)

These are the VM's nginx files, versioned for B-182 (PAD-435). Before that they existed only on
the VM, so nobody reviewed them and no check covered them.

| Here | On the VM |
|---|---|
| `nginx.conf` | `/etc/nginx/nginx.conf` (Debian's stock file, unchanged; kept so the check runs the real http block) |
| `conf.d/levapp-log-redaction.conf` | `/etc/nginx/conf.d/levapp-log-redaction.conf` |
| `sites-available/{levapp,levapp-staging,padellevelup}` | `/etc/nginx/sites-available/`, linked from `sites-enabled/` |
| `sites-available/{levapp-admin,levapp-admin-staging}` | same; the staff console hosts (PAD-531), see below |

**The deploy does not install these files.** A change here is applied by hand on the VM:
copy the changed files over, run `sudo nginx -t`, then `sudo systemctl reload nginx`. After
editing on the VM (Certbot rewrites the `# managed by Certbot` lines when it renews or adds a
name), copy the file back here, or the next hand-apply will undo the VM's change.

## Log redaction (B-182, B-183)

The SSE endpoint takes the access token in the query string (`/api/app/events?token=<JWT>`,
R-009), because `EventSource` cannot set headers, and the activation link carries its secret the
same way (`/register/<id>?t=`, then `/api/app/register/user/<id>?token=`). These keep both out
of the logs:

- every `server` block logs with `access_log /var/log/nginx/access.log redacted;`, a
  combined-style format whose URI comes from a map that turns any `token=` query into
  `?[redacted]` (parameters `t`, `token`, `access_token`) and whose Referer has its query cut.
  That line replaces the http-level combined log for the server;
- the SSE location raises its `error_log` to `crit`, because an upstream error writes the full
  request line at level `error`, and no format can redact that.
- `/register/` and `/api/app/register/` do the same, and `/register/` answers with
  `Referrer-Policy: no-referrer`, because the error log also prints the Referer of the page's own
  requests.

`check-log-redaction.sh` proves both in Docker: it fails if the token reaches either log. CI runs
it (`.github/workflows/nginx-log-redaction.yaml`), along with the same check on the web image's
`frontend/apps/web/nginx.conf`. To run it locally: `bash infra/nginx/check-log-redaction.sh`.

## The staff console hosts (PAD-531, admin.foundation rule 12)

`levapp-admin` (admin.levapp.app → console container on 127.0.0.1:3200, `/admin/api/` → prod
backend on 5000) and `levapp-admin-staging` (admin.staging.levapp.app → 3300, `/admin/api/` →
staging backend on 5100). The deploy workflows build and run the two console containers; these
two files are hand-applied like the others, and only AFTER the certificates exist — `nginx -t`
refuses a server block whose `ssl_certificate` files are missing, and a refused test leaves the
running config untouched.

Order, once the DNS records (`admin`, `admin.staging`, with the same Cloudflare proxy setting as
`staging`; either setting works with these blocks) resolve:

```bash
# 1. certificates (certbot writes a temporary block of its own and removes it)
sudo certbot certonly --nginx -d admin.levapp.app
sudo certbot certonly --nginx -d admin.staging.levapp.app
# 2. the tracked blocks
sudo cp infra/nginx/sites-available/levapp-admin /etc/nginx/sites-available/levapp-admin
sudo cp infra/nginx/sites-available/levapp-admin-staging /etc/nginx/sites-available/levapp-admin-staging
sudo ln -sfn /etc/nginx/sites-available/levapp-admin /etc/nginx/sites-enabled/levapp-admin
sudo ln -sfn /etc/nginx/sites-available/levapp-admin-staging /etc/nginx/sites-enabled/levapp-admin-staging
sudo nginx -t && sudo systemctl reload nginx
# 3. check
curl -sS https://admin.staging.levapp.app/admin/api/auth/config
```

Rollback: remove the two `sites-enabled` links, `nginx -t`, reload. The product vhosts are not
touched by any of this; until the blocks are applied the admin hosts simply do not answer.
