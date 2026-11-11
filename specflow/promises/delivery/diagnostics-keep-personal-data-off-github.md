---
id: P-DELIVERY-3
title: "Diagnostics keep personal data off GitHub"
status: draft
---
# Diagnostics keep personal data off GitHub

## Outcome

The server's repair and diagnostics job reports on GitHub what is wrong (errors by kind and count, stuck database work, backup state, memory and disk) without copying any person's name, email or message there. The detail stays on LevApp's server, readable only by the owner (PAD-602, D8; PAD-641). The server's own logs say what kind of failure happened, never whose it was (B-254; widened by owner decision 2026-11-10).

- The report on GitHub never contains application log lines or database query text.
- The full log excerpt is kept on the server, readable by the owner only; one older than two weeks is deleted the next time the repair job runs.
- When a mail, a push or a model's answer fails, the server's log names the kind of failure and never the person's address, a token, a device or the text involved.

It does not promise anything about the deploy workflows' own output.
