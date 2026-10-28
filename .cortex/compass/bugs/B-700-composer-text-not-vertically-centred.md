---
id: B-700
title: "The phone app's message field drew its text high in the box instead of on its vertical centre"
type: missing-criterion
severity: low
status: resolved
affects:
  - messaging.conversation-detail
  - frontend/apps/mobile/app/conversation/[id].tsx
proposed_fix: "conversation-detail rule 18: the compose and edit fields grow from a 48 px minimum with equal top and bottom padding (COMPOSER_INPUT_CLASS) and textAlignVertical centre for Android."
opened: 2026-10-28T16:00:00Z
resolved: 2026-10-28T16:30:00Z
---

# B-700: the composer's text was not vertically centred

**Source:** the owner's iPhone screenshot, 2026-10-27 (Linear PAD-767): the placeholder and caret
sat above the centre of the message field, out of line with the send button.

**What happens:** both fields use the shared `Input`, a fixed `h-12` box with horizontal padding
only, and are `multiline`. A multiline TextInput lays its text out from the top on iOS
(`textAlignVertical` is Android-only), so one line sits near the top of the 48 px box. Evidence: the
code on staging 9379f46f4 and the screenshot. Not re-measured on the simulator (the slot was queued
for other sessions); the fix's layout on a device is still to be seen.

**What should happen:** text, placeholder and caret on the box's vertical centre; longer messages
grow the box.

**Root cause:** `messaging.conversation-detail` said nothing about the field's layout (missing
criterion); the shared Input's single-line box was used for a multiline field.

**Fix:** rule 18. `COMPOSER_INPUT_CLASS` (`h-auto min-h-12 py-3.5`, merged over the Input's `h-12`)
and `COMPOSER_INPUT_STYLE` on both fields. Wiring test
`src/features/messages/composer-centring.test.ts`, red on staging, green with the fix.
