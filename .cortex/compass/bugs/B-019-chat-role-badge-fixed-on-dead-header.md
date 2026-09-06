---
id: B-019
title: "The chat header's role badge fix landed on a headerTitle that headerShown:false never mounts"
type: test-defect
severity: high
status: resolved
affects:
  - messaging.conversation-detail
  - settings.language
  - frontend/apps/mobile/app/conversation/[id].tsx
related_specs:
  - .specflow/specs/messaging/conversation-detail.spec.md
  - .specflow/specs/settings/language.spec.md
proposed_fix: "Translate the badge in the custom navy header that is actually rendered, and delete the unreachable headerTitle/headerRight from the headerShown:false options object so no future fix can land there again — the durable guard is structural, since neither the Node-only vitest setup nor an id-only Maestro assertion can see which header rendered."
opened: 2026-09-06T00:00:00Z
closed: 2026-09-06T00:00:00Z
---

# B-019 — The chat header's role badge fix landed on a headerTitle that `headerShown: false` never mounts

`app/conversation/[id].tsx` carries **two** headers. The screen draws its own navy
header inside the view, and then passes `Stack.Screen options` whose first entry is
`headerShown: false` — deliberately, because iOS 26 renders `UIBarButtonItem`s inside a
translucent glass capsule the design does not want. Everything else in that options
object (`headerTitle`, `headerRight`, `headerStyle`, `headerTintColor`) is therefore
dead: react-navigation never mounts a header it has been told not to show.

PAD-158 set out to render the participant role through `roleLabelKey()` so a Portuguese
coach sees `Jogador` / `Treinador` instead of the raw backend enum. Commit `62903bf`
applied exactly that fix — to the dead `headerTitle`. The visible header kept rendering
`{conversation.participantRole}` with a CSS `capitalize`, so the badge still read
`Player` / `Coach` on a `pt` device. The PR body claimed the criterion was met; the
iOS simulator pass of 2026-09-06 (`AC-chat-header.png`, `H-reminder-buttons.png`)
showed it was not.

Two things made this invisible to the test suite:

- Mobile's vitest runs in a Node environment with `react-native` aliased to a stub, so
  **no screen is ever rendered** — a duplicated header cannot be caught there.
- `09-direct-messages.yaml` asserts `id: chat-header-role` only. Both headers used that
  same testID, so the assertion passed against either one and said nothing about the
  text inside it.

Fixed under PAD-158's follow-up: the role label is now computed once in the component
body and rendered by the custom header, and the unreachable `headerTitle` / `headerRight`
were deleted so the options object is just `headerShown: false` plus the comment saying
why. The general lesson is in the file: **when a screen sets `headerShown: false`, no
other `options` key on that screen can be trusted to render.**
