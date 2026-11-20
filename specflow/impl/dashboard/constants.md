---
constants:
  SETUP_GUIDE_STEPS: "request_alerts, device_push, unavailability, coach_link, profile"
  SETUP_GUIDE_STEP_WEIGHT: 20
  SETUP_GUIDE_SNOOZE_CLUB_DAYS: 1
  SCHEDULE_GRID_FIRST_HOUR: 6
  SCHEDULE_GRID_LAST_HOUR: 23
  SCHEDULE_GRID_COLUMNS: 6
  SCHEDULE_STEP_MINUTES: 30
  SCHEDULE_DAY_END: "23:59"
  SCHEDULE_ALL_DAY: "00:00 to SCHEDULE_DAY_END"
  SCHEDULE_PRESETS: "work_weekdays: label Trabalho em dias úteis, title Trabalho, Mon–Fri 09:00–18:00; school_weekdays: label Aulas ou escola, title Escola, Mon–Fri 08:00–17:00; weekends: label Fins de semana, title Fins de semana, Sat Sun SCHEDULE_ALL_DAY"
  SCHEDULE_NAME_SUGGESTIONS: "Trabalho, Escola, Ginásio, Família, Rotina"
---

# dashboard constants

Facts both shells of the student setup guide and its schedule editor must agree on (PAD-839,
`dashboard.student-setup-guide`). In code they live once, in `@levelup/config`
(`student-setup-guide.ts`, `availability-schedule.ts`). Only the clients use them. The server
stores the snooze instant and never applies a day count.

- `SETUP_GUIDE_STEPS`: the five steps, in the order the guide shows and walks them.
- `SETUP_GUIDE_STEP_WEIGHT`: the percent each finished step is worth. Five steps make 100.
- `SETUP_GUIDE_SNOOZE_CLUB_DAYS`: how many Lisbon calendar days after the day of the dismissal the
  sheet stays shut ("the next day").
- `SCHEDULE_GRID_FIRST_HOUR`, `SCHEDULE_GRID_LAST_HOUR`, `SCHEDULE_GRID_COLUMNS`: the editor's hour
  grid, 06 to 23 in six columns.
- `SCHEDULE_STEP_MINUTES`: the − / + step on a period's start and end, and the editor's slot size.
- `SCHEDULE_DAY_END`: the stored end of a period that ends at 24:00, because a row must start and
  end on one date (OQ-F). The editor reads it back as 24:00.
- `SCHEDULE_ALL_DAY`: the window "todo o dia" is stored as.
- `SCHEDULE_PRESETS`: step 3's one-tap schedules. Each has a key, the label shown on the step, the
  title saved on its rows, its days and its hours.
- `SCHEDULE_NAME_SUGGESTIONS`: the editor's name chips.
