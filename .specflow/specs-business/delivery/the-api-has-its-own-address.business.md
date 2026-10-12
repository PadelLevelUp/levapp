---
id: delivery.the-api-has-its-own-address
status: draft
implemented_by:
  - ../../specs/delivery/api-host.spec.md
---

# The API has its own address

## Outcome

The apps can reach LevApp's server at its own address, `api.levapp.app`, instead of only through
the website's address. That lets the website move to a faster host later (PAD-615, Cloudflare)
without the apps losing the server, and gives the server its own logs and limits. Until the owner
switches a build over, everything keeps working exactly as today; installed iPhone apps keep using
the old address for as long as they exist.

## Who This Is For

The owner, who decided on 2026-10-10 to give the API a subdomain (PAD-613); indirectly every
coach and student, who get a website that can later be served from a CDN.

## User Journey

1. The owner points `api.levapp.app` and `api.staging.levapp.app` at the server and issues their
   certificates (steps on PAD-614).
2. The owner sets one setting per environment; the next website build calls the API at its own
   address. Nothing else changes for users.
3. A new iPhone build can point at the new address too; older installs keep using the old one.

## Business Rules

1. The old address (`levapp.app/api`) keeps working for as long as any installed app uses it.
2. Only LevApp's own websites may call the API from a browser on another address.
3. Live updates, account activation links and the logs' token protection behave the same on the
   new address.
4. Nothing changes for users until the owner switches a build.

## Success Metrics

- The API answers on `api.levapp.app` with the same responses as on `levapp.app/api`.
- A web build switched to the new address shows no failed requests.

## Out of Scope

- Moving the website off the server (PAD-615).
- Retiring the old address (a later ticket, after the App Store client audit).
