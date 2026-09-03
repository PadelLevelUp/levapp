---
path: frontend/apps/mobile/src/features/settings/auto-invite-section.tsx
extracted_at: 2026-09-03T14:12:18Z
extraction_level: 2
size_lines: 167
size_tokens: 1498
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "eff581801a228a84d8882b312d332500c412802f822ec829980f44ea82d7470a"
---

## Purpose

`AutoInviteSection` ports the top-level portion of web's `NotificationsEngineSection.tsx`: the auto-invite engine's master on/off toggle and its automatic/semi-automatic invitation-mode choice. Per the doc comment, this is a deliberately partial port — the seven sub-panels web has (Reminders, Invitation Groups, Tiebreakers, Restrictions, Notify Groups, Message Templates, Standing Waiting List) are deferred entirely (tracked in `found_issues.md`). It also documents a real simplification versus web: web's master toggle special-cases turning the engine on with zero `invitationGroups` configured by auto-seeding `DEFAULT_INVITATION_GROUPS`; since the groups panel isn't ported here, this toggle just persists `autoNotifyEnabled` directly, so a coach enabling the engine from mobile with no groups yet will still need to configure them on web. The automatic/semi-automatic choice is a two-option Pressable-based segmented control rather than a ported `RadioGroup`, since no `@rn-primitives/radio-group` is installed.

## Connections

Uses (external, not in this scope): `@levelup/api`'s `notificationEngineApi` (`getNotificationConfig`/`updateNotificationConfig`) for reading and optimistically patching the config; `@levelup/types` for `InvitationMode`/`NotificationConfig`.

Used by: no in-scope file imports this section (no in-edges in this scope's L1 data); presumably composed into the Settings screen's `"notifications"` section, per `settings-sections.ts`'s coach-only `notifications` entry.
