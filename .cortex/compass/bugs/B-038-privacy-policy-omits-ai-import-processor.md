---
id: B-038
title: "Privacy policy does not name the AI import processor or the transfer it implies"
type: layer-drift
severity: medium
status: open
affects:
  - import.analyze
  - .cortex/archive/documents/privacy-policy-2026-09-06
proposed_fix: "Owner/legal: name the AI-assisted import provider (OpenRouter and the model provider behind it) in §7 'Service providers', and cover the transfer outside the EEA in §8, or stop sending student data to the model."
opened: 2026-09-10T11:30:00Z
---

# B-038 — Privacy policy does not name the AI import processor or the transfer it implies

**Source:** PAD-268 privacy-policy checklist (decision
`2026-09-10-account-deletion-keeps-coach-records`), 2026-09-10. Filed in the ledger instead of Linear
because the workspace hit its free issue limit; the owner will open the Linear ticket
("Privacy policy: name the AI import processor and the EEA transfer", Medium) when there is room.

**What happens:** the AI import (`import.analyze` rule 6) sends the coach's spreadsheet content to
OpenRouter (default model `inception/mercury-2`): sheet headers, up to 3 sample rows per sheet, up
to 15 sample values per column, the student names found in the file and class names — personal data
of the coach's students.

**What the published copy says:** the archived policy (version 2026-09-06, publication tracked in
PAD-219):
- **§7 Service providers** lists cloud hosting and databases, data storage, email delivery, push
  notifications, security and infrastructure, technical operations and customer support. It does
  not name AI or LLM processing.
- **§8 International data transfers** covers transfers outside the EEA in general terms; the
  OpenRouter flow is likely such a transfer and is not identified.

**Root cause:** Type 6 — layer drift between product behaviour (the import feature) and the
stakeholder-facing legal layer, which was written without the import's data flow in view.

**Change plan (owner action, no code):**
1. Legal review of §7 and §8 against `import.analyze` rule 6.
2. Either add the AI-assisted import provider to §7 and the transfer basis to §8, or change the
   import so no student data leaves (e.g. headers only).
3. Re-check the checklist in the decision record and close this entry.

### Resolution

_Open — owner action._
