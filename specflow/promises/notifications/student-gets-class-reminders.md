---
id: P-NOTIFICATIONS-7
title: "Student gets class reminders"
status: implemented
---
# Student gets class reminders

## Outcome

Ahead of every class a student gets a reminder, on the coach's schedule or when the coach sends one by hand, with a Yes/No to confirm or cancel. Answering is safe to repeat, an old reminder never stays live once a newer one is sent or the class has happened, and a real "no" frees the spot.

- Every enrolled student gets a reminder; a decline can hand the spot to the engine at once, unless semi-automatic approval is on.
- Answering twice the same way sends no second confirmation and opens no second round. Changing the answer (no, then yes) always goes through.
- Once a class has started, been canceled or completed, no reminder can change anything.
- A newer reminder makes earlier unanswered ones for that student and class unanswerable: one live prompt per student per class.
- A manual reminder uses the same delivery and answer flow as an automatic one.
- A student's answer is always saved, including their very first.
- A class created after its reminder time counts the students the coach put on it as coming without asking; they are told so and can say no. A student added later to an existing class is still asked (PAD-489).

It does not promise what happens after a "no", the reminder's wording and timing settings, or muting reminders.
