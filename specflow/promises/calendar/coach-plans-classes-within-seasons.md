---
id: P-CALENDAR-2
title: "Coach plans classes within seasons"
status: implemented
---
# Coach plans classes within seasons

## Outcome

A coach defines their season once, such as 1 September to 31 July, and it repeats every year. A recurring class can run until the season ends instead of carrying a typed end date, and attendance and absences can be read "for this season" without picking dates.

- A coach has at most one season, and it repeats every year.
- A class set to recur until season end ends with the season occurrence it starts in; if no season covers the start date, the class is not created.
- Changing the season moves the end of every class that runs until it; removing the season leaves scheduled classes as they are.
- Seasons a coach had before this model are carried over silently: the most recent becomes the recurring definition, and the originals are kept aside for support (PAD-82).

It does not promise the recurrence mechanics themselves, or a season preset on a student's own history.
