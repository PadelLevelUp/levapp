---
id: P-PLAYERS-1
title: "Coach browses and reviews their roster"
status: implementing
---
# Coach browses and reviews their roster

## Outcome

A coach finds any student on their roster, by name or by missing setup (no level, no side), and opens their profile: current level, evaluation scores, and strength and weakness notes. On a wide screen the coach reviews a player without losing their place in the list. Nothing here is visible to another coach or the student.

- Search, sort and filter work only within the coach's own roster.
- (PAD-834) The roster and the profile show at a glance who is not configured yet (no level or no side) and who has not registered yet; each is one tap to filter, and the profile says what is missing and leads straight to completing it. A student who has an account is never shown as not registered. From the profile, the coach can copy a not-yet-registered student's invite link again, and the profile sends nothing itself (assumption Q6).
- (PAD-834) The profile reads in three blocks (until Q4 is answered, plus the strengths and weaknesses card), the same on web and the phone: the student's details, their evaluations (the last one and its evolution), and their attendance (presences and absences for one chosen period, listed in place).
- Finding a player works the same everywhere a coach types a name (PAD-665): accents and case do not matter, words can come in any order and middle names be skipped ("Rui Basto" finds "Rui Pedro Basto"), the start of each word is enough ("jo mor"), a small typo is forgiven, and the best match comes first wherever the coach has not chosen a sort; the Players tab keeps the coach's sort. Who can appear on each screen is unchanged.
- A note belongs to one coach-student relationship, is tagged strength or weakness, and holds at most 500 characters.
- Level history records each level a coach sets. The current level is the one on the roster, and clearing it writes no entry.
- The "add to a class" picker is not filtered by level: capacity limits selection, and a class that has started is not offered.
- Only a coach reaches these views and actions; a caller with no coach profile is refused outright.

It does not promise creating or inviting players, editing or removing them, the evaluation system, or scheduling classes.
