---
id: B-703
title: "A coach could not set when invitations start from the phone: iOS Settings never had the Reminders panel"
type: missing-criterion
severity: medium
status: resolved
affects:
  - notifications.config
  - frontend/apps/mobile/src/features/settings/auto-invite-section.tsx
proposed_fix: "Port web's Reminders panel (first reminder, reminders per student, hours between, invitation start) to the iOS engine card, saving reminderTiming through the same config request, with rule 10c's and 10f's notes and the past-due question; rules 10c, 10d and 10f now state iOS parity."
opened: 2026-10-28T19:00:00Z
resolved: 2026-10-28T19:30:00Z
---

# B-703: iOS could not set the invitation start

**Source:** the coach behind PAD-776, reported by the owner on 2026-10-28 ("início dos convites"
missing from iOS Settings). The code was read by SessionB, and the reading was verified here.

**What happens:** web's engine card has a Reminders panel (`RemindersSection.tsx`, inside the
collapsible Lembretes section of `NotificationsEngineSection.tsx`) with the first reminder,
reminders per student, hours between them and the invitation start. The iOS engine card
(`auto-invite-section.tsx`) never ported it. Its header listed Reminders among the deferred
panels, and no mobile file read `reminderTiming`. A coach on the phone could not see or change when
invitations start.

**What should happen:** web and iOS ship together (repository rule). Config rule 10d recorded the
gap ("iOS has no control for these fields") and rule 10f relied on it ("web only ... iOS has no
control that saves a reminder timing"), with no reason for iOS lacking the panel. So no criterion
asked for the control on iOS (missing criterion).

**Fix:** the iOS engine card carries the Reminders panel with web's four controls, bounds,
defaults and labels. It holds the timing until the screen's Save, which sends `reminderTiming` in
the same request as web, so the server's re-arming and rule 11a's re-timing run from an iOS save.
Rule 10c's and 10f's notes sit outside the closed panel, and the past-due question is the same
dialog; closing it is "do not send". Rules 10c, 10d and 10f now state parity, with two new
criteria.

**Evidence:** `reminders-section.test.tsx` (9 tests): 8 fail against staging's iOS card, and all
pass with the port. Maestro flow 310 sets the invitation start on the simulator and reads it back
from the server.

**Still deferred on iOS** (not in this fix): Invitation Groups, Tiebreakers, Notify Groups,
Message Templates and Standing Waiting List.
