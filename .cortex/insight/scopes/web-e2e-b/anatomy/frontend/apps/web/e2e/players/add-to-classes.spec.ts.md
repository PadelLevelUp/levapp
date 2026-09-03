---
path: frontend/apps/web/e2e/players/add-to-classes.spec.ts
extracted_at: 2026-09-03T15:30:00Z
extraction_level: 2
size_lines: 40
size_tokens: 468
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "1a7490968cf3ec4f2051e1e7cd483ff8b6eae46510e72a5943f38ca1419b0d1f"
---

## Purpose

E2E regression for PAD-80: the "Add to Classes" dialog on a player's profile
showed no classes at all, even with a compatible class with free spots in the
week. Root cause (documented in the file's header comment): the shared API
client POSTed to `/api/app/lesson_instances`, a GET-only route — the request
405'd, the dialog's loader swallowed the rejection in a try/finally with no
catch, and silently rendered the "no classes" empty state. Single test:
navigates to E2E Student's profile, opens "Add to classes", steps the
picker forward one week (the seeded class always lands on the FOLLOWING
Monday), and asserts the seeded "E2E Academy Class" IS listed and the "no
classes this week" empty state is gone. Deliberately NOT level-filtered — a
coach may add any player to any class.

## Connections

- Uses: `helpers/auth` (`loginAsCoach`); `helpers/navigation` (`openPlayers`).
  (Scope `web-e2e-a`.)
- Used by: — (Playwright entry point)
- Semantically related (not imports): exercises the "Add to classes" dialog
  (a player-profile component) and the class-listing route fix in
  `lesson_service.py` / `frontend_api.py` (GET, not POST); covers
  `.specflow/specs/classes/enrollment.spec.md`.
