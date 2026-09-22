The JSON-configuration-driven automatic/semi-automatic invitation system that fills open class spots, at the persistence layer: `NotificationConfig` holds the coach's rules (rounds, restrictions, eligibility, message templates); a `Vacancy` is one open spot on a `LessonInstance` moving through round/batch state; a `NotificationEvent` is one invite sent for that vacancy; a `ReplacementApprovalPrompt` is the semi-automatic-mode coach approval gate before an invite goes out; `WaitingListEntry`/`StandingWaitingListEntry` are the overflow queue when no vacancy exists yet. The engine logic itself (round progression, eligibility evaluation, message dispatch) lives in the services layer — this concept covers only its persistent state and configuration, which `invitation-engine` and `eligibility-bar` build on.

## Implemented by
`backend/padel_app/models/notification_config.py`
`backend/padel_app/models/vacancy.py`
`backend/padel_app/models/notification_event.py`
`backend/padel_app/models/replacement_approval_prompt.py`
`backend/padel_app/models/waiting_list_entry.py`
`backend/padel_app/models/standing_waiting_list_entry.py`

## Related concepts
[[invitation-engine]]
[[eligibility-bar]]
[[coach-scoped-data]]
