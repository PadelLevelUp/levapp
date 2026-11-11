---
id: P-DELIVERY-9
title: "A developer's machine or a default setting never reaches production data"
status: draft
---
# A developer's machine or a default setting never reaches production data

## Outcome

Running the server or its database tools on a developer's machine can never touch production data by accident: an unset setting points at the machine itself, a database change aimed at production from anywhere else stops before it connects, and production refuses to start with development secrets (PAD-95, PAD-292; owner decision 2026-11-10).

- With no database address set, the server points at the developer's own machine, never at production.
- A database change aimed at production runs only on production, or when the developer says so explicitly for that run.
- Production refuses to start with a development signing secret.

It does not promise protection against a developer who names the production database on purpose.
