---
id: P-NOTIFICATIONS-3
title: "Coach tunes the invitation engine"
status: implemented
---
# Coach tunes the invitation engine

## Outcome

A coach shapes the invitation engine for their academy from one settings surface: when it starts inviting, how many it contacts at once, quiet hours and daily limits, who it asks first, and what invitations and reminders say. They switch it on or off, off for one class, and read back what it sent.

- The configuration is one per coach, created the first time they touch it.
- The engine is off, fully automatic or semi-automatic; switching modes changes no other setting.
- Quiet hours (22:00–07:00 by default, may cross midnight) and the daily per-student cap use the coach's club-local clock. An invitation inside quiet hours is held and goes out when they end.
- Changing timing reschedules every future engine job at once.
- Reminder and invitation-start timing can be set from the phone and the web with the same choices and effects, and either asks before reminders now past due go out (PAD-776).
- Notification groups are ordered, and the coach controls the order.
- Every template resolves to real, non-blank text in the coach's locale (Portuguese weekdays and dates, never "Wednesday" in a Portuguese message), with sensible defaults.
- Turning notifications off for one class affects that class alone, and silences both its reminders and its invitations.
- Automatic invitations are a per-class setting of their own (PAD-429): off, the engine never fills that class's spots by itself, while reminders, manual invitations and waiting-list offers continue. Private classes default to off and academy classes to on, worked out from the class type every time and never written onto classes, so existing private classes are covered; a coach's explicit choice for a series or date wins.
- The activity feed is read-only history.

It does not promise the sending itself, the approval step, or who may join a class.
