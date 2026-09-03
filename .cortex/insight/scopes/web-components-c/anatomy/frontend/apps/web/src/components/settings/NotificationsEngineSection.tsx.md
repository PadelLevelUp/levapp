---
path: frontend/apps/web/src/components/settings/NotificationsEngineSection.tsx
extracted_at: 2026-09-03T14:16:04Z
extraction_level: 3
size_lines: 377
size_tokens: 3745
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "37a7e4955650f05c386a76c18c6878dbec856205fe2bedf88f3419a619cc7d41"
---

## Purpose

`NotificationsEngineSection` is the orchestrator card for the entire automatic-invitation/notification system in Settings: it owns the single `NotificationConfig` object, fetches and normalizes it on mount, and composes eight independently-collapsible sub-sections (Reminders, Eligibility, Invitation Groups, Tiebreakers, Restrictions, Notify Groups, Standing Waiting List, Message Templates) around one master `autoNotifyEnabled` switch and an `invitationMode` (`automatic` | `semi_automatic`) radio choice. It is the highest-centrality file in this scope — every other `settings/*Section.tsx` component that composes the notification engine is imported and rendered here, and it is this file's own inline comments that record several of the load-bearing product decisions (eligibility-vs-groups ordering, why message templates and notify-groups stay active while disabled).

## Main players

- `NotificationsEngineSection` (lines 26–376) — critical. The entire file is this one component. Fetches `NotificationConfig` via `getNotificationConfig` on mount, normalizing `invitationMode` to a concrete default (`"automatic"`) so the `RadioGroup` stays fully controlled. Owns `openSection` (only one collapsible open at a time — an accordion, not independent collapsibles) and `groupsInitializing` (a synthetic loading state during the first-time default-groups seed).
- `save(patch)` (lines 43–53) — critical. The shared optimistic-update-with-revert-on-failure helper used by every child section except `MessageTemplatesSection` (which persists itself directly — see that file's Insights) and `NotificationGroupsSection`/`StandingWaitingListSection` (which have no `save` call routed through here at all): applies the patch to local state immediately, calls `updateNotificationConfig(patch)`, and on failure reverts `config` to its pre-patch value with no user-facing error toast.
- `SectionHeader` (lines 73–93) — supporting. A local component (not exported, defined inside the parent) rendering one `CollapsibleTrigger` row; computes `isDisabled` per-section, since Notify Groups and Message Templates are excluded from the master-switch disable rule that the other five internally-composed sections respect.
- Master toggle handler (lines 115–128) — critical. On enabling `autoNotifyEnabled` for a coach with zero invitation groups configured, it forces the Invitation Groups panel open, shows a synthetic ~700ms loading delay (`groupsInitializing`), then saves both `autoNotifyEnabled: true` and `invitationGroups: DEFAULT_INVITATION_GROUPS` in one patch — first-time setup is baked into the toggle itself, not a separate onboarding flow.

## Insights

The `disabled` prop passed down to Reminders/Eligibility/Invitation Groups/Tiebreakers/Restrictions is `!config.autoNotifyEnabled` — but Notify Groups and Message Templates are explicitly excluded from this rule (see `SectionHeader`'s `isDisabled` computation and the fact neither `<NotificationGroupsSection>` nor `<MessageTemplatesSection>` receives a `disabled` prop at all), because both apply to *manual*-mode messaging too, which stays available even with the automatic engine off. This is easy to miss when scanning the render tree since all eight sections look identically wrapped in `Collapsible`/`SectionHeader`. The inline comment above the Eligibility collapsible is the canonical statement of the eligibility-vs-invitation-groups relationship: eligibility is the floor (who can join at all), invitation groups are the ordering layered on top (who gets asked first) — the two are not layers of the same permission system despite sharing a rule-builder UI shape (see `EligibilitySection.tsx` Insights). `RadioGroup`'s `onValueChange` guards against re-saving an unchanged value, because the payload sent is `{invitationMode}` only — a minimal patch relying on the backend only touching provided keys, so a spurious call here would be harmless but wasteful, not corrupting.

## Connections

Uses:
- `frontend/apps/web/src/components/settings/EligibilitySection.tsx`, `InvitationGroupsSection.tsx` (also imports `DEFAULT_INVITATION_GROUPS`), `MessageTemplatesSection.tsx`, `NotificationGroupsSection.tsx`, `RemindersSection.tsx`, `RestrictionsPanel.tsx`, `StandingWaitingListSection.tsx`, `TiebreakersSection.tsx` (also imports `DEFAULT_TIEBREAKERS`): every child section this file composes into the accordion.
- `@/api/notificationEngine` (`getNotificationConfig`, `updateNotificationConfig`): load and patch-save the whole `NotificationConfig`.
- `@/types` (`InvitationMode`, `NotificationConfig`).
- `@/components/ui/{card,switch,separator,collapsible,radio-group,label}`.

Used by: not observed within this scope (rendered as a top-level card on the Settings page's notification-engine tab).

## Query pointers

If you need to add a new sub-section to the notification engine, follow the existing pattern: a `Collapsible`/`SectionHeader` block here, a new `SectionKey` union member, and decide explicitly whether it should be gated by `disabled={!config.autoNotifyEnabled}` (most are) or exempt like Notify Groups/Message Templates (manual-mode-relevant sections aren't).
If a child section's edits aren't persisting, first check whether it goes through this file's `save(patch)` helper (most do) or persists itself directly like `MessageTemplatesSection` — the two paths have different failure behavior (silent revert here vs. an explicit toast there).
If you need the full picture of the eligibility/invitation-groups/tiebreakers relationship, read this file's inline comments together with `EligibilitySection.tsx` and `InvitationGroupsSection.tsx`'s `## Insights`.
