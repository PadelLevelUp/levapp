---
about: The standing waiting list gives no priority in a class whose eligibility bar the student fails
permanence: changing
verified: "2026-11-14 (told)"
origin:
  - commit:e5b37bfd8
aliases:
  - pad-844-standing-list-and-the-bar
---

## Answer

A student on the coach's standing waiting list (the list in Settings that queues them for every
upcoming class) is asked from it only in classes whose eligibility bar they pass. In a class whose bar
they fail they are treated as if they were not on the list: neither asked nor placed from it. This
holds even when the coach confirmed the eligibility warning on adding them. The warning at add time
stays; confirming it adds the student, it is not a way past the bar.

A coach's add to the waiting list of **one class** ("this class") is the coach's choice for that
class and skips the bar **on the new engine** (the coach's list, `notifications.engine-tiers` rule 4).
The old engine applies the bar to every waiting-list row, the coach's one-class adds included
(`notifications.waiting-list` rule 4a), until the coach switches to the new engine.

Rule: `notifications.waiting-list` rule 2a; criteria NOTIFICATIONS-WAITING-LIST-45, 46, 47.

## Why

The owner's decision of 2026-11-14 on PAD-844 reverses PAD-724 for the standing list. PAD-724 had
made the bar a warning the coach confirms when adding to the standing list, and the ticket reported
that the standing list then put the student ahead in every class, eligible or not. The standing list
is a general priority, filtered by the bar. A one-class add is an explicit choice by the coach, and it
wins over the bar.

How it was read:

- **Old engine (D1, the stream lead).** The ticket's third example says a one-class coach add below
  the bar is asked, "current behaviour, keep". That was true on the new engine only. The lead read
  "keep" as keeping what each engine does today, so the old engine, which is being retired, was not
  changed. Example 3 holds on the new engine; the old engine applies the bar to every waiting-list row
  until the coach switches.
- **Series and period adds (D2, the stream lead).** A coach can add a student from a class's
  dialog for the whole series or for a period (`notifications.waiting-list` rule 19). These are
  standing entries scoped to a series, and they reach many classes. They count as the standing list,
  so the bar applies in each class. This is the lead's reading of the owner's decision, and the owner
  can overturn it.

When the decision was taken, both engines already matched it for the standing list: the bar is
checked when a spot opens, never at fan-out (rule 3a), and a fanned-out row is a students'-list row on
the new engine. PAD-844 pinned the three examples with tests instead of changing engine code.

## Rejected

- **Keeping PAD-724's reading for the standing list** (confirming the warning lets the student be
  asked everywhere): reversed by the owner on 2026-11-14.
- **Changing the old engine so a one-class coach add skips the bar** (D1, option b): a behaviour change
  on the engine most coaches still ran, for an engine being retired. Not done.
- **Treating series and period adds as one-class adds** (D2): they reach many classes, like the
  standing list. Not done; the owner can overturn this.
