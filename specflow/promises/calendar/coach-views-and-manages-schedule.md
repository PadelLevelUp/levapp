---
id: P-CALENDAR-3
title: "Coach views and manages the schedule"
status: implemented
---
# Coach views and manages the schedule

## Outcome

The coach has one weekly calendar with every class and personal block, opens any event for detail and actions, drags events to a new day or time, and clicks or drags across empty slots to create a class pre-filled with that date and time. Students see a read-only version scoped to their own classes.

- A class's "X/Y" counts seats actually filled: a student who declined no longer counts; one who has not answered still does.
- A class is completed once its end time has passed.
- Dragging a recurring event asks whether the change is for that occurrence or every future one.
- Creating from an empty slot is for coaches only, on desktop only; touch has no dragging.
- A student with several invitations to one class appears once in the guest list.
- Each invitee reads as accepted, declined, no answer yet, withdrawn, spot filled or expired. The coach can record an answer given another way: the student's chat then shows it answered "by the coach", with no buttons, and a later tap changes nothing (PAD-563). A withdrawn invitation shows "spot filled", cannot be taken, is not asked again for that class, and the next candidate is asked.
- A class's participants fit one laptop screen (PAD-659): up to 16 compact rows grouped "Vão", "Por responder" and "Não vão", ordered by side (both, right, left, none) then name, under a header counting enrolled over capacity. Tapping a player opens their profile over the class, and closing it returns the coach where they were. Answers move players between groups live.
- A plan reads "Vai" / "Não vai" until the class ends, whoever recorded it; "Presente" / "Faltou" are the record's words after the class (PAD-663).
- On a busy day, overlapping classes sit side by side only as far as they overlap, and what does not fit gathers behind a "+N" that lists them, so every class can be read and opened (PAD-625).
- A class's chosen colour identifies the class and nothing else. State is shown by treatment: filled upcoming, outlined when next, faded when finished, red when canceled, dashed for a personal block. Amber appears only on the seat count of a class with empty seats, and the pickable colours include no amber, red or green.
- iOS shows the same colour legend as web, and the phone calendar has day, week and month views for coaches and students alike.

It does not promise creating or editing classes as data, personal blocks, or marking attendance.
