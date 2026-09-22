The automatic invitation/reminder system's coach-facing configuration surface, composed in `NotificationsEngineSection.tsx`: one `NotificationConfig` object, one master `autoNotifyEnabled` switch, and eight sub-sections (Reminders, Eligibility, Invitation Groups, Tiebreakers, Restrictions, Notify Groups, Standing Waiting List, Message Templates). `EligibilitySection` and `InvitationGroupsSection` share an attribute/operation/value rule-builder UI shape but answer different questions on purpose: eligibility is a class-relative floor (who can join at all, evaluated with no vacancy open), invitation groups are a vacancy-relative ordered sequence (who gets asked first). Most sections persist through the parent's shared optimistic-update-with-silent-revert helper; `MessageTemplatesSection` is the one exception that saves itself directly. Two sections (Notify Groups, Message Templates) stay active even when `autoNotifyEnabled` is off, because they also serve manual-mode messaging.

## Implemented by
`frontend/apps/web/src/components/settings/EligibilitySection.tsx`
`frontend/apps/web/src/components/settings/InvitationGroupsSection.tsx`
`frontend/apps/web/src/components/settings/MessageTemplatesSection.tsx`
`frontend/apps/web/src/components/settings/NotificationGroupsSection.tsx`
`frontend/apps/web/src/components/settings/NotificationsEngineSection.tsx`
`frontend/apps/web/src/components/settings/RemindersSection.tsx`
`frontend/apps/web/src/components/settings/RestrictionsPanel.tsx`
`frontend/apps/web/src/components/settings/StandingWaitingListSection.tsx`
`frontend/apps/web/src/components/settings/TiebreakersSection.tsx`

## Related concepts
[[editable-ordered-list-sections]]
[[invitation-engine]]
[[eligibility-bar]]
