---
name: onboard-coach
description: Set up a new coach's account for them — students, weekly classes and who is in which class — from whatever they sent (usually screenshots of a timetable spreadsheet), using the `flask onboarding` runner. Use this whenever the owner says a new coach joined and we will do their setup, sends screenshots or a spreadsheet of a coach's timetable or roster, or says "onboard this coach", "add these students/classes to coach X", "do the setup for the new coach", "load this timetable". Also use it to revert or list onboardings. Do NOT use it for a coach importing their own spreadsheet in the app (that is the in-app import) or for changing an existing roster by hand.
---

# Onboard a coach

A new coach sends their timetable; we turn it into an onboarding file and load it with the
`flask onboarding` command. The command is the safe part: it refuses the wrong coach, runs once,
records itself in the coach's import history and can be reverted (spec `import.onboarding-runner`).
The part that needs care is everything before it: reading the source correctly and not putting
personal data where it does not belong.

## Standing decisions (owner, 2026-11-05)

These were decided once so they are not asked again. Follow them unless the owner says otherwise.

- **Do not ask about ages.** An onboarding creates roster players, not people who can log in. The
  app judges a birth date if a student ever activates an account. The runner has no age field.
- **Nobody is contacted.** Students are not invited and classes are created with notifications off.
  The coach switches them on when ready.
- **Do not load the coach with questions.** Decide with sensible defaults, write each default into
  the file's `notes`, and ask the owner (who talks to the coach) only what changes the import and
  cannot be defaulted. One short list, the blocking question first.
- **The onboarding file never goes in the repository.** The repository is public and the file is a
  list of real people. The same holds for specs, tests, commit messages and PR bodies: invented
  names only. Working files live in the local, gitignored `docs/onboardings/`.
- **Each production run needs the owner's explicit go for that run.** A general "go on" is not it.

## Reading the source

Transcribe first, decide second. Put the raw reading in a small script or table (cell by cell, with
its colour and any annotation) so a decision can be changed without re-reading the screenshots.

Defaults that the first onboarding settled, and the reasoning to reuse when a sheet differs:

- **One class per day-and-time block**, with as many places as the block has rows.
- **Annotations beside a name are not part of the name.** Words such as "fixo", "nao fixo" or "EXP"
  are the coach's own bookkeeping; drop them.
- **Cell colours are that week's attendance, not membership.** Everyone named is on the roster.
- **A cell with two names is two students.** Enrol both and raise that class's places by one.
- **The same name in several classes is one student.** Compare without accents or case, and keep
  the accented spelling. Abbreviated names stay separate people unless someone confirms otherwise.
- **Classes**: weekly, titled by day and time, ending when the next block starts, until the coach's
  season ends, starting on the next occurrence of that weekday.
- **Levels and contacts** are usually absent. Leave them out; do not invent them.

Tell the owner what could not be read (cut-off cells, uncertain spellings) and what was held out.
A cut-off name cannot be guessed; ask for it.

## Steps

1. **Find the coach on production, read-only**: coach id, user name, current club (id and name),
   level codes, season, and how many players and classes they already have. These fill `coach` and
   `expects`. If the coach already has data, say so before going further.
2. **Build the file** `docs/onboardings/<YYYY_MM_DD>_<slug>.json` (shape below; the full rules are
   in the spec, rule 2 and rule 3). Generate it from the transcription with a script kept beside
   it, so a correction is a re-run and not a hand edit.
3. **Rehearse locally** on a throwaway database seeded with a coach and club of the same ids:
   dry run, apply, check the counts and that no message or notification event exists, revert.
4. **Show the owner** the totals, the decisions taken, and anything held out. Get corrections.
5. **Rehearse on the staging copy.** Staging is scrubbed: user names are rewritten and it has a
   shared login. So set `coach.name` to the scrubbed name for that run, and replace the students'
   names with placeholders — the structure is what is being rehearsed.
6. **Production**, after the owner looked at staging and gave the go for this run: dry run, then
   apply with the file as written. Then `flask onboarding list` and the coach's own import history.
7. **Keep the file** wherever the owner decided onboarding files are kept, and note the run in the
   ticket.

The commands, with the environment's own names, are in the local `docs/onboardings/README.md` and
`run_onboarding.sh`. In general form, inside the API container:

```
python -m flask --app app.py onboarding apply - --dry-run < file.json
python -m flask --app app.py onboarding apply - --database <connected database name> < file.json
python -m flask --app app.py onboarding list
python -m flask --app app.py onboarding revert <onboarding-id> --database <connected database name>
```

## File shape

```json
{
  "id": "2026_11_05_rui_exemplo",
  "coach": {"id": 12, "name": "Rui Exemplo", "club": {"id": 4, "name": "Clube Exemplo"}},
  "expects": {"players": 0, "classes": 0},
  "notes": ["Source: two screenshots received 2026-11-05.", "Annotations beside names were dropped."],
  "players": [{"name": "Júlia Inventada"}, {"name": "Marco Fictício", "level_code": "3"}],
  "classes": [
    {"title": "Segunda 07:00", "date": "2026-11-09", "start_time": "07:00", "end_time": "08:30",
     "max_players": 16, "until": "season_end", "players": ["Júlia Inventada", "Marco Fictício"]}
  ]
}
```

`notifications` defaults to off and `weekly` to on. A player with an `email` that already belongs
to an account is refused unless that row says `"link_existing": true`.

## When something refuses

The runner's refusals are the guards working; read them rather than editing around them.

- **Coach name or club mismatch**: re-read the coach on that environment. On staging it is the
  scrubbed name.
- **"expects … found …"**: the coach added something since the file was built. Re-read the counts,
  and check the new names and class titles do not collide with the file's.
- **"already applied"**: the id is spent, even after a revert. A correction is a new file with a
  new id.
- **A run that failed part-way** has already removed what it created; fix the cause and apply again.

## After the run

Tell the owner what landed (students, classes, enrolments), what was held out, and that the coach
can undo it from their import history. Remind them that classes have notifications off.
