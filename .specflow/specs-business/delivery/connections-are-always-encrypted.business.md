---
id: delivery.connections-are-always-encrypted
status: draft
implemented_by:
  - ../../specs/delivery/transport-security.spec.md
---

# Connections are always encrypted

## Outcome

Every visit to LevApp's website and server is encrypted with a current protocol, and a browser that
has been to LevApp once never tries an unencrypted address again for a year. Old, broken protocol
versions are refused. This is one of the privacy review's findings (PAD-602, D10).

## Who This Is For

Every coach and student using the website or the app; the owner, who answers for how personal
data travels.

## User Journey

1. Someone opens levapp.app; the server answers over TLS 1.2 or 1.3 and tells the browser to use
   HTTPS only, for a year.
2. Later, a typed `http://` address or a link without `https` goes straight to HTTPS in that
   browser, without an unencrypted first request.

## Business Rules

1. The website, staging and the API answer only over TLS 1.2 or 1.3.
2. Every HTTPS answer tells the browser to keep to HTTPS for a year (HSTS).
3. The server's settings are changed by the owner on the server; the repository holds the exact
   files and the steps.

## Success Metrics

- An SSL Labs scan of levapp.app shows TLS 1.2 and 1.3 only and HSTS present.

## Out of Scope

- Sub-domains in HSTS and the browsers' preload list: a later decision, because every sub-domain
  must serve HTTPS first.
