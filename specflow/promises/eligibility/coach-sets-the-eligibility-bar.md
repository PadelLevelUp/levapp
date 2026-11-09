---
id: P-ELIGIBILITY-2
title: "Coach sets the eligibility bar"
status: implemented
---
# Coach sets the eligibility bar

## Outcome

A coach defines the minimum a student must clear to join their classes, by level, by attendance history or both, separate from the order in which the invitation engine asks. One standard bar covers the academy, and it can be loosened or tightened for a recurring class or a single occurrence.

- The bar is optional; unset, every student is eligible for every class.
- "Up to N levels away" looks above the class, below it, or both, always including the class's own level (PAD-481). A bar set before this option keeps meaning both.
- The most specific bar wins outright: occurrence over series over the coach's standard. They never combine.
- Setting a class's bar to "everyone" is a deliberate choice that opens one class inside a restricted series, distinct from leaving it unset.
- A bar nobody can satisfy (such as a level condition on a class with no level) excludes everybody, unlike an unset bar, which excludes nobody.
- Conditions are level and attendance history (unjustified and justified absences, attendance rate) only. Playing side and payment status are not eligibility conditions.
- Changing the bar for "this and future" splits the series there; earlier classes keep the old bar.
- Existing coaches start with no bar.

It does not promise what the bar causes, students discovering spots, or the engine's ordering.
