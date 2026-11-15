---
id: P-IMPORT-1
title: "Coach imports a roster spreadsheet"
status: implemented
---
# Coach imports a roster spreadsheet

## Outcome

A coach moving from a spreadsheet uploads it instead of retyping the roster: an AI proposes what is players, classes, attendance and evaluation history, the coach reviews and adjusts it, confirms, and everything lands as real records, with the option to undo the whole import.

- The coach confirms every imported student is 18 or over before the import runs (PAD-642).
- The AI only proposes a structure and mapping; nothing is created until the coach confirms.
- The coach can select or deselect individual rows before confirming.
- Records are created in dependency order (levels and categories, then players, classes, then attendance and evaluations), so nothing points at something missing.
- Every record an import creates is tracked against it, so the import can be undone completely without touching anything else.
- The spreadsheet goes only to a model provider that neither trains on it nor keeps it; with none available, the analysis fails (PAD-636).
- A player imported without an email has no email; LevApp never invents a contact address, and the player chooses their own username on activation (PAD-633).
- A reverted import stays in the history, marked as reverted.

It does not promise adding a single player or class, or any file format other than the supported Excel structure.
