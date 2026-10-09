---
id: B-383
title: "certbot's nginx authenticator could not issue the admin hosts' certificates: levapp.app's server-level return 404 answered their challenge"
type: wrong-rule
severity: medium
status: open
affects:
  - admin.foundation
  - infra/nginx/sites-available/levapp-admin
  - infra/nginx/sites-available/levapp-admin-staging
  - infra/nginx/README.md
proposed_fix: "Each admin host gets a port-80 file (-http) that serves /.well-known/acme-challenge/ from /var/www/letsencrypt with no server-level return; certificates are issued and renewed with certbot --webroot and a reload deploy hook."
opened: 2026-10-09T14:09:16Z
---

# B-383: the admin certificates failed under certbot's nginx authenticator

**Source:** the owner's first run of the PAD-531 procedure (2026-10-09, 14:01Z):
`certbot certonly --nginx -d admin.staging.levapp.app` failed the http-01 challenge with a 404.
Nothing on the VM changed; the run stopped before any file was installed.

**What the procedure assumed:** that the nginx authenticator works for a host with no server
block yet. Every existing certificate was issued while its own vhost already existed. The VM has no
`default_server` on port 80, so an unknown host lands on the first port-80 block, levapp.app's,
whose certbot-written `return 404` sits at server level. nginx runs a server-level `return` in the
rewrite phase, before choosing a location, so the challenge location certbot adds never answers.
`curl -H 'Host: admin.staging.levapp.app' http://127.0.0.1/.well-known/acme-challenge/x` gave 404.

**Fix:** `<name>-http` per admin host: port 80, the challenge served from the webroot, everything
else 301 to https, and no server-level `return` or `if` (the PAD-531 deploy-shape test pins all
three). It is valid without a certificate, so it goes in first; `certbot certonly --webroot` then
issues, `--deploy-hook 'systemctl reload nginx'` makes renewals reload, and the same block answers
every renewal (`certbot renew --dry-run` proves it). levapp.app stays the port-80 default: a Docker
run of nginx 1.18 (the VM's) over the tracked files answers levapp.app, www, staging,
padellevelup.com and an unknown host identically before and after.
