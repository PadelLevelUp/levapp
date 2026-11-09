---
id: P-DELIVERY-3
title: "Diagnostics keep personal data off GitHub"
status: draft
---
# Diagnostics keep personal data off GitHub

## Outcome

The server's repair and diagnostics job reports on GitHub what is wrong (errors by kind and count, stuck database work, backup state, memory and disk) without copying any person's name, email or message there. The detail stays on LevApp's server, readable only by the owner (PAD-602, D8; PAD-641).

- The report on GitHub never contains application log lines or database query text.
- The full log excerpt is kept on the server, readable by the owner only, and deleted after two weeks.

It does not promise anything about the deploy workflows' own output or the server's logs themselves.
