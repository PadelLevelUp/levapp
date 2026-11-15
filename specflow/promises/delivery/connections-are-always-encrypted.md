---
id: P-DELIVERY-2
title: "Connections are always encrypted"
status: draft
---
# Connections are always encrypted

## Outcome

Every visit to LevApp's website and server is encrypted with a current protocol, and a browser that has visited once never tries an unencrypted address again for a year (PAD-602, D10).

- The website, staging and the API answer only over TLS 1.2 or 1.3.
- Every HTTPS answer tells the browser to keep to HTTPS for a year (HSTS).
- The owner changes the server's settings on the server; the repository holds the exact files and steps.

It does not promise sub-domains in HSTS or the browsers' preload list.
