---
path: frontend/apps/web/e2e/schedule-calendar/class-delete-confirm.spec.ts
extracted_at: 2026-09-03T15:30:00Z
extraction_level: 2
size_lines: 89
size_tokens: 948
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "5c243bc1506ff22e471e4fe7b1343cdfcffebbd7e6e98736c3946e2bdad711ac"
---

## Purpose

E2E for PAD-58, with two unrelated assertions bundled in one file. Test 1
(the ticket's core behaviour): deleting a class requires confirmation — the
"Delete class" button opens an `alertdialog` ("delete this class?"), Cancel
closes it with the class still present and no "Class deleted" toast, and only
a second Delete-then-confirm sequence actually removes it (success toast,
class gone from `page.getByRole("main")`). Test 2 (a separately-numbered
PAD-58 regression, sharing this file for no documented reason beyond the
ticket number): at a 375px mobile viewport the calendar header's week-range
label (e.g. "6–13 Jul") must render on ONE line, contain no stray Portuguese
"de" literal leaking into the English UI, and be no longer than 16 characters
— checked both by text content and by a `boundingBox().height < 40` layout
assertion.

## Connections

- Uses: `helpers/auth` (`loginAsCoach`); `helpers/navigation` (`openCalendar`).
  (Scope `web-e2e-a`.) Defines a local `findClass`/`createClass` pair
  duplicated (not imported) from the identical helpers in
  `class-deletion.spec.ts` in this same directory.
- Used by: — (Playwright entry point)
- Semantically related (not imports): exercises `ClassDetailSheet.tsx`'s
  delete confirmation `alertdialog` and the calendar header's compact-label
  i18n formatting; covers `.specflow/specs/classes/delete.spec.md` and
  `.specflow/specs/calendar/view.spec.md`. See the project's
  `responsive-bugs-need-pt-locale-and-main-element` convention for why the
  "de" leak specifically was worth pinning.
