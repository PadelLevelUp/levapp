# Host nginx (the VM)

These are the VM's nginx files, versioned for B-182 (PAD-435). Before that they existed only on
the VM, so nobody reviewed them and no check covered them.

| Here | On the VM |
|---|---|
| `nginx.conf` | `/etc/nginx/nginx.conf` (Debian's stock file, unchanged; kept so the check runs the real http block) |
| `conf.d/levapp-log-redaction.conf` | `/etc/nginx/conf.d/levapp-log-redaction.conf` |
| `sites-available/{levapp,levapp-staging,padellevelup}` | `/etc/nginx/sites-available/`, linked from `sites-enabled/` |
| `sites-available/levapp-admin{,-staging}{,-http}` | same; the staff console hosts (PAD-531), see below |

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
staging backend on 5100). The deploy workflows build and run the two console containers; the nginx
files are hand-applied like the others.

Each host has two files (B-383):

- `<name>-http`, port 80: answers Let's Encrypt's http-01 challenge from `/var/www/letsencrypt`
  and sends everything else to https. It names no certificate, so it is valid before one exists,
  and it is what answers every renewal.
- `<name>`, port 443: the console. `nginx -t` refuses it until its certificate exists.

Certificates use certbot's **webroot** authenticator, never `--nginx`. The VM has no
`default_server` on port 80, so an unknown host lands on the first port-80 block, levapp.app's.
That block ends in a certbot-written server-level `return 404`, which nginx runs before choosing a
location, so the nginx authenticator's challenge for a host without its own block got a 404
(2026-10-09, admin.staging). For the same reason the `-http` files carry no server-level `return`
or `if`, and neither file says `default_server`: levapp.app stays the port-80 default, and the
product hosts answer exactly as before. certbot never edits these files, so what is here is what
runs.

Order, once the DNS records (`admin`, `admin.staging`) resolve. Staging first; for production
substitute `levapp-admin` and `admin.levapp.app`. Every step is safe to re-run.

```bash
# 1. port 80 (sudo nginx -T shows it; the product hosts are unchanged)
sudo install -d -m 755 /var/www/letsencrypt/.well-known/acme-challenge
sudo install -m 644 levapp-admin-staging-http /etc/nginx/sites-available/
sudo ln -sfn /etc/nginx/sites-available/levapp-admin-staging-http /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx && sleep 3   # reload returns before the new workers answer
#    probe from outside before spending a Let's Encrypt attempt (5 failures/hour/host):
echo ok | sudo tee /var/www/letsencrypt/.well-known/acme-challenge/probe
curl -sS http://admin.staging.levapp.app/.well-known/acme-challenge/probe     # → ok
sudo rm /var/www/letsencrypt/.well-known/acme-challenge/probe
# 2. the certificate; the deploy hook is stored in the renewal config, so renewals reload nginx
sudo certbot certonly --webroot -w /var/www/letsencrypt -d admin.staging.levapp.app \
  --non-interactive --keep-until-expiring --deploy-hook 'systemctl reload nginx'
# 3. port 443
sudo install -m 644 levapp-admin-staging /etc/nginx/sites-available/
sudo ln -sfn /etc/nginx/sites-available/levapp-admin-staging /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx && sleep 3   # reload returns before the new workers answer
curl -sS https://admin.staging.levapp.app/admin/api/auth/config
sudo certbot renew --cert-name admin.staging.levapp.app --dry-run     # renewal works
```

Until the deploy has started the console container, `https://<host>/` is a 502; `/admin/api/`
answers as soon as step 3 is applied.

Rollback, per host: `sudo rm /etc/nginx/sites-enabled/levapp-admin-staging{,-http}`, then
`sudo nginx -t && sudo systemctl reload nginx`. The certificate can stay; certbot keeps renewing it
only while the `-http` block answers, so delete it with `sudo certbot delete --cert-name
admin.staging.levapp.app` if the host is retired.
