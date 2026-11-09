---
id: P-PLAYERS-3
title: "Coach edits player details"
status: implemented
---
# Coach edits player details

## Outcome

A coach keeps a student's details current (level, side, contact) and can take a student off their roster without losing that person's account or history.

- Only the coach associated with a player may edit or remove them.
- Every level change makes a level-history entry.
- A coach never deletes a student who has an account. Taking them off the roster is a disconnect: it deletes the association and that coach's own notes and evaluations only; the account, attendance and level history survive and may still belong to other coaches. There is no exception for a student's only coach.
- A coach may delete a placeholder (never activated, no password), and only if no other coach has it.
- Every disconnect and delete is recorded: who, to whom, and what went with it.

It does not promise creating players, viewing profiles, or a coach changing a username, which is never possible.
