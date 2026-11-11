---
id: P-TRAINING-2
title: "Coach plans training for a class"
status: implemented
---
# Coach plans training for a class

## Outcome

A coach picks exercises from their library for a specific upcoming class, and the plan shows on that class's detail.

- A coach plans training only for a class they own.
- Every exercise must be one the coach owns or follows; one inaccessible exercise rejects the whole request, with nothing partly applied.
- A refused request changes nothing: the plan stays as it was, and an occurrence that did not exist yet is not created.

It does not promise building the library.
