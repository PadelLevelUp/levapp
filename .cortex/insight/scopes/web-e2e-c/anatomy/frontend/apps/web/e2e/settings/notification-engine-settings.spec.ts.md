---
path: frontend/apps/web/e2e/settings/notification-engine-settings.spec.ts
extracted_at: 2026-09-03T14:18:15Z
extraction_level: 3
size_lines: 456
size_tokens: 4926
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "ffa9f51a1c86e0fc24fb53570d3537463cf19db580a9da7e9382e1d172c66db7"
---

## Purpose

Exhaustive functional coverage of Settings > Notifications' "Auto-Invite
Engine" card (US-53, US-71..US-75, US-56) — the largest and most stateful UI
in the settings surface. Covers: the master "Automatic notifications" toggle
and the disabled/dimmed state it locks the other sections into when off;
Reminders (timing-mode selector, days-before mode revealing a time input, the
hours-between-reminders field appearing only once reminder count > 1, and the
"start invitations" timing selector); Invitation Groups (default groups
init'd only on an OFF→ON master-toggle flip, add-rule/add-group, the level
attribute's operator set — same/one-above/one-below/all-above/all-below — and
the "last group with rules" hint); Tiebreakers (default items, toggling
enabled state, drag handles); Restrictions (new \`maxInactiveTime\` row,
excluded-players toggle revealing a search field, exclude-unpaid-subscriptions
toggle); and Message Templates (three subheadings, new reminder/waiting-list
templates, variable chips that insert \`{name}\`/\`{time}\` at cursor, and the
Save button's disabled/enabled gating on unsaved changes).

## Main players

- \`openNotificationsTab(page)\` (lines 9-19) — critical: logs in, opens Settings,
  clicks the \`settings-nav-notifications\` testid (not a role+name locator,
  which PAD-112's "My notifications" tab made ambiguous), waits for the
  Auto-Invite Engine card.
- \`autoNotifySwitch(page)\` (lines 27-33) — critical: locates the master toggle
  by proximity to its heading text so it doesn't collide with the several
  other \`[role="switch"]\` elements on the tab.
- \`enableAutoNotify(page)\` (lines 44-55) — critical: flips the master toggle on
  if currently off, then waits for the Reminders section trigger to become
  enabled as a proxy for \`config.autoNotifyEnabled\` having propagated through
  React state (flipping it can take ~700ms when it also has to initialize
  default invitation groups).
- \`ensureDefaultInvitationGroups(page)\` (lines 64-75) — supporting: the UI only
  seeds \`DEFAULT_INVITATION_GROUPS\` (Group 1/2/3) on an OFF→ON transition of
  the master toggle with an empty groups array; if a prior test left
  auto-notify ON with empty groups, this forces an OFF→ON flip to re-trigger
  initialization.
- \`openSection(page, label)\` (lines 77-89) — critical: generic collapsible-section
  opener used by every section-specific test; auto-enables auto-notify first
  if the target trigger is disabled, then waits for \`aria-expanded="true"\`
  plus a fixed animation buffer before yielding.

## Insights

- The four gated sections (Reminders, Invitation Groups, Tiebreakers,
  Restrictions) are only interactive once the master toggle is ON — every test
  that opens one of them either calls \`openSection\` (which self-enables) or
  \`enableAutoNotify\`/\`ensureDefaultInvitationGroups\` explicitly first.
- Invitation-group initialization is edge-triggered (OFF→ON with empty
  groups), not idempotent — a naive "just check the toggle is on" pattern
  would intermittently see zero groups depending on what the previous test in
  the file left behind, which is exactly what \`ensureDefaultInvitationGroups\`
  exists to route around.
- Many locators are scoped by walking up from text content via
  \`xpath=ancestor::div[contains(@class, '...')]\` (e.g. the reminders-per-student
  stepper, the excluded-players row) rather than by testid — this file predates
  the testid convention used in \`student-notification-blocks.spec.ts\` and
  \`student-settings-scope.spec.ts\`, so it is more brittle to class-name churn.
- No test writes real config changes to the shared seed DB persistently — the
  file never calls a final "Save" that would leak into other specs' auto-invite
  behavior, aside from toggling and reading in-session UI state (the master
  toggle test explicitly clicks it twice to leave it as found).

## Connections

Uses:
- ../helpers/auth: \`loginAsCoach\`
- ../helpers/navigation: \`openSettings\`

Used by: —

Semantically related (not imports): configures the same \`NotificationConfig\`
model / notification/invitation engine that
\`schedule-calendar/guest-list-dedupe.spec.ts\` and
\`schedule-calendar/participant-count-effective.spec.ts\` exercise at the
class-instance level, and that \`settings/student-notification-blocks.spec.ts\`'s
suppression half checks against (a student block must skip that student
regardless of how these engine settings are configured).

## Query pointers

If you need to change the Auto-Invite Engine's section-gating behavior, also
read: \`openSection\`/\`enableAutoNotify\` (this file) and the
\`NotificationConfig\` model referenced in \`scripts/seed.py\`.
If you need to touch invitation-group default initialization, read first:
\`ensureDefaultInvitationGroups\` (this file, lines 64-75), then: the
\`DEFAULT_INVITATION_GROUPS\` component logic it exercises.
