---
id: B-102
title: "Field-availability warnings render the backend's English message verbatim on a Portuguese app"
type: incomplete-rule
severity: low
status: open
affects:
  - backend/padel_app/modules/frontend_api.py
  - frontend/packages/api/src/resources/fields.ts
  - frontend/packages/hooks/src/useFieldAvailability.ts
  - frontend/apps/web/src/components/players/AddPlayerSheet.tsx
  - frontend/apps/mobile/src/features/players/PlayerForm.tsx
proposed_fix: "The client maps the known 409 reasons (username taken, email taken, duplicate player name) to locale keys in both shells; the backend's message stays a fallback, or the endpoint returns a reason code instead of prose."
opened: 2026-09-16T17:32:00Z
---

# B-102 — "This email is already taken" is English on every screen

Number from Session C's reserved range, unconfirmed (2026-09-16). Found during the E2E
rendered-text conversions, in `player-management/duplicate-username-warning.spec.ts:34`.

**Defect.** `POST /api/app/check_field_available` answers a taken username or email with
409 and `message = f"This {field} is already taken"`, and a duplicate player name with
`"You already have a player with this name"` (`WARN_DUPLICATE_CHECKS`,
`frontend_api.py`). `checkFieldAvailable` in `packages/api/src/resources/fields.ts` returns
`err.response.data.message` unchanged, and the add-player forms on web (`AddPlayerSheet`,
via `useFieldAvailability`) and mobile (`PlayerForm`) show it as the field's warning. A
Portuguese coach sees English under the field; the field name is interpolated raw
("This email", "This username").

**Why nothing caught it.** The E2E app renders Portuguese, and the spec asserts the English
literal — which passes precisely because the string is untranslated (the same failure mode
as PAD-320: an assertion that can only pass while the i18n is broken). The rendered-text
guard cannot see it: it classifies a literal by matching it against the web locale files,
and this copy lives in no locale file, so the guard files it as test data.

**Fix shape.** Map the three known reasons to locale keys in the client (both shells, per
R-024), keyed by `(model, field)` and the status, falling back to the server message only
for an unknown reason — or have the endpoint return a reason code the client translates.
Then the spec asserts a test id on the warning, not its text.
