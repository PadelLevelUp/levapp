# concept:web-mobile-parity-port

Nearly every file in this scope is an explicit, comment-documented React Native
port of a specific `apps/web` component or hook, chosen so the two platforms
cannot silently diverge on business logic, payload shape, or (for visual
components) colour/contrast rules. Examples: `ClassFillBar.tsx` ports
`apps/web/src/components/calendar/ClassFillBar.tsx`; `EventCard.tsx` ports the
web `CalendarEventCard` row variant; `WeekStrip.tsx` ports the top half of web's
`MobileCalendarView`; `class-scope-dialog.tsx` and `edit-class-diff.ts` port
`ClassDetailSheet.tsx`; `notify-modal.tsx` ports `ManualNotificationModal.tsx`;
`planning-section.tsx` ports `ClassPlanningSection.tsx`; `CoachDashboard.tsx`
and `DashboardBlocks.tsx` share the exact backend block payload and
`@levelup/config` formatters with web's dashboard; `players/LevelLabel.tsx`,
`PlayerForm.tsx`, `StrengthsWeaknesses.tsx`, and `add-evaluation-form.tsx` port
their respective web player-management pieces; `message-bubble.tsx` ports
`apps/web/src/components/messages/MessageBubble.tsx` almost line-for-line
(including its `StatusIcon` sub-component and one-off hardcoded colours).

Where mobile deviates, the deviation is called out explicitly in a comment
rather than left implicit — e.g. `EventCard.tsx` dropped the "spots to fill"
outline at the user's request; `WeekStrip.tsx` can't replicate web's
internally-scrolling day columns and caps chips at `MAX_CHIPS` instead;
`add-evaluation-form.tsx` deliberately submits empty strengths/weaknesses
because mobile already has a dedicated card for that. A change to any ported
web file's business logic or payload shape should prompt checking this
concept's member list for the matching mobile file.

Members: `frontend/apps/mobile/src/features/calendar/ClassFillBar.tsx`,
`frontend/apps/mobile/src/features/calendar/EventCard.tsx`,
`frontend/apps/mobile/src/features/calendar/WeekStrip.tsx`,
`frontend/apps/mobile/src/features/calendar/class-scope-dialog.tsx`,
`frontend/apps/mobile/src/features/calendar/edit-class-diff.ts`,
`frontend/apps/mobile/src/features/calendar/notify-modal.tsx`,
`frontend/apps/mobile/src/features/calendar/planning-section.tsx`,
`frontend/apps/mobile/src/features/dashboard/CoachDashboard.tsx`,
`frontend/apps/mobile/src/features/dashboard/DashboardBlocks.tsx`,
`frontend/apps/mobile/src/features/players/LevelLabel.tsx`,
`frontend/apps/mobile/src/features/players/PlayerForm.tsx`,
`frontend/apps/mobile/src/features/players/StrengthsWeaknesses.tsx`,
`frontend/apps/mobile/src/features/players/add-evaluation-form.tsx`,
`frontend/apps/mobile/src/features/messages/components/message-bubble.tsx`.
