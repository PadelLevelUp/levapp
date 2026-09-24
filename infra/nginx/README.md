# Host nginx (the VM)

These are the VM's nginx files, versioned for B-182 (PAD-435). Before that they existed only on
the VM, so nobody reviewed them and no check covered them.

| Here | On the VM |
|---|---|
| `nginx.conf` | `/etc/nginx/nginx.conf` (Debian's stock file, unchanged; kept so the check runs the real http block) |
| `conf.d/levapp-log-redaction.conf` | `/etc/nginx/conf.d/levapp-log-redaction.conf` |
| `sites-available/{levapp,levapp-staging,padellevelup}` | `/etc/nginx/sites-available/`, linked from `sites-enabled/` |

**The deploy does not install these files.** A change here is applied by hand on the VM:
copy the changed files over, run `sudo nginx -t`, then `sudo systemctl reload nginx`. After
editing on the VM (Certbot rewrites the `# managed by Certbot` lines when it renews or adds a
name), copy the file back here, or the next hand-apply will undo the VM's change.

## Log redaction (B-182)

The SSE endpoint takes the access token in the query string (`/api/app/events?token=<JWT>`,
R-009), because `EventSource` cannot set headers. Two things keep it out of the logs:

- every `server` block logs with `access_log /var/log/nginx/access.log redacted;`, a
  combined-style format whose URI comes from a map that turns any `token=` query into
  `?[redacted]`. That line replaces the http-level combined log for the server;
- the SSE location raises its `error_log` to `crit`, because an upstream error writes the full
  request line at level `error`, and no format can redact that.

`check-log-redaction.sh` proves both in Docker: it fails if the token reaches either log. CI runs
it (`.github/workflows/nginx-log-redaction.yaml`), along with the same check on the web image's
`frontend/apps/web/nginx.conf`. To run it locally: `bash infra/nginx/check-log-redaction.sh`.
