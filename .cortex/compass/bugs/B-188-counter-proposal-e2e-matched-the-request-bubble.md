---
id: B-188
title: "E2E PAD-281 counter-proposal: its bubble locator also matched the student's request bubble added by rule 10a"
type: test-defect
severity: medium
status: resolved
affects:
  - classes.class-requests
  - frontend/apps/web/e2e/class-requests/class-request-counter-proposal.spec.ts
  - frontend/apps/web/src/components/messages/MessageBubble.tsx
proposed_fix: "The class-request slot carries data-kind (request | proposal); the spec picks proposals by kind and asserts the request bubble's own state separately."
opened: 2026-09-26T09:42:07Z
resolved: 2026-09-26T09:42:07Z
---

# B-188: the counter-proposal E2E matched the request bubble (was reported as B-192)

**Source:** E's wave-8 promotion gate (05:56Z); fails alone on staging. Taken over from Session-C, who had it as B-192 but pushed nothing; the id here is from Session-B's range.

**What happens:** `class-request-counter-proposal.spec.ts` fails at its first bubble assertion: `[data-testid="class-request-proposal-actions"][data-request-id="1"]` resolves to 2 elements, a `superseded` one ("Replaced by a newer proposal") and the `actions` one.

**Root cause (reproduced, isolated stack):** Type 7, the test. Since PAD-461's rule 10a, the request message itself (kind `requested`) renders the same slot, deliberately ("Same component, same testids: it is the same bubble either way", `MessageBubble.tsx`). On the student's side it shows where the request ended up, here superseded by the coach's proposal, which is rule 10a's "the bubble shows the outcome". The spec assumed only proposals carry the test id. The app is right on both shells: iOS mirrors web, and no Maestro flow reads the slot.

### Change plan and resolution
- `MessageBubble.tsx`: `data-kind="request" | "proposal"` on the slot (additive).
- The spec picks proposals by `data-kind="proposal"` and asserts the request bubble's own state (`superseded`), and that there is exactly one.
- Evidence: red on staging (the strict-mode violation above); green 2/2 after the change. A mutant labelling every slot "proposal" (what a duplicated proposal bubble would look like) fails the spec, so it still catches a real duplicate.
- Resolved: 2026-09-26T09:42:07Z
