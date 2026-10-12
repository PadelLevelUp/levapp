---
id: delivery.diagnostics-keep-personal-data-off-github
status: draft
implemented_by:
  - ../../specs/delivery/repair-diagnostics.spec.md
---

# Diagnostics keep personal data off GitHub

## Outcome

When the owner runs the server's repair and diagnostics job, its report on GitHub says what is
wrong (errors by kind and count, which database work is stuck, backup state, memory and disk)
without copying any coach's or student's name, e-mail or message into GitHub's logs. The detail
stays on LevApp's own server, readable only by the owner.

## Who This Is For

The owner, who runs the job when the server misbehaves; and every coach and student, whose
personal data must not end up with a third party for diagnostics (PAD-602 privacy review, D8).

## User Journey

1. The owner starts "VM Repair and Diagnostics" from GitHub.
2. The report shows counts of errors by level and the names of the error kinds, and lists the
   database work in progress by its identifier and what it waits on.
3. When the owner needs the actual log lines, they read the saved file on the server.

## Business Rules

1. The diagnostics report on GitHub never contains application log lines or database query text.
2. The full log excerpt is kept on the server, readable by the owner only, and deleted after two
   weeks.

## Success Metrics

- A run of the job leaves no name, e-mail or message text in its GitHub log.

## Out of Scope

- The deploy workflows' own output, and the server's logs themselves (B-254 covers what the app
  writes to them).

## Notes

- Linear: PAD-641.
