---
id: P-DELIVERY-1
title: "A release never drops a request"
status: draft
---
# A release never drops a request

## Outcome

Shipping a new version no longer interrupts people using the app: the new version starts beside the old one and takes over only once it is ready, and reminders are never sent twice while both run (PAD-571).

- A release never answers a request with a server error because the server is restarting.
- Only one running version sends scheduled reminders at any moment.
- A database change the previous version cannot work with is released with a short, announced stop instead, chosen by hand.
- A slow database change does not take the app down: it runs while the current version keeps serving, and a version whose database is not up to date never starts taking requests (PAD-691, PAD-696).

It does not promise running more than one copy of the server permanently.
