---
id: B-521
title: "Semi-automatic approval prompt said \"X confirmou que não vai comparecer\" for a spot nobody ever held (a never-filled vacancy)"
type: incomplete-rule
severity: medium
status: resolved
resolved: 2026-10-10T01:55:00Z
affects:
  - notifications.semi-auto-approval
  - backend/padel_app/services/replacement_approval_service.py
  - frontend/apps/web/src/components/notifications/ReplacementApprovalCard.tsx
  - frontend/apps/mobile/src/features/notifications/replacement-approval-card.tsx
proposed_fix: "The payload says openSpot (and the side); both cards and the persisted Assistant text split the reason: a freed spot names the student, a never-filled spot reads \"Vaga por preencher. Convites sugeridos\"."
opened: 2026-10-10T01:40:00Z
---

# B-521: the approval prompt called a never-filled spot a decline (id unconfirmed, wave-14 range)

**Source:** PAD-574 problem 1 (owner report, 2026-10-09).

**What happens:** `replacement_approval_service` builds one vacancy entry per open spot with
`declinedPlayerId = vacancy.original_player_id` and `declinedPlayerName = _player_name(...)`
(lines 216–219 and 548–551 on staging c0d345720). A structural vacancy (`original_player_id`
NULL, created by `_create_structural_vacancies` for places the class never filled) gets `null`
for both, and both cards render `{declinedPlayerName} confirmedWontAttend` unconditionally
(`ReplacementApprovalCard.tsx:138-141`, `replacement-approval-card.tsx:160-166`), so the coach
reads "confirmou que não vai comparecer" with no name, or with a stale name, for a spot nobody
held. The persisted Assistant text (`_build_prompt_text`, line 133) says "A player dropped out."
for the same spot.

**What should happen:** rule 4 (as PAD-574 rewrites it): a freed spot names the student; a
never-filled spot reads "Vaga por preencher. Convites sugeridos".

**Root cause:** type 2 (incomplete rule) — rule 4 described "which student(s) declined" and never
said what a structural vacancy's block reads; the payload had no field telling the two apart.

**Evidence (code reading, staging c0d345720; not reproduced in a browser):** the builders and
renderers cited above; `Vacancy.original_player_id` is "None for structurally open spots"
(`models/vacancy.py:48`).

### Change Plan
Rule 4 + 7a (PAD-574); payload `openSpot` + `side`; `_build_prompt_text` split; both cards render
the reason from the shared helper; backend test on the payload and the text; card tests; Playwright
unchanged (card-level ids only).

### Resolution
- Spec: semi-auto-approval rule 4 rewritten (two reasons; `openSpot` + `side` in the payload; the Assistant text splits too), rule 7a added.
- Code: `_vacancy_payload` in `replacement_approval_service.py` (both builders), `_build_prompt_text`; both cards render the reason from `@levelup/config` `approvalDisplayGroups`.
- Tests: `test_pad574_approval_reasons.py` (payload + persisted text, 1 test; `test_semi_auto_approval.py` 17 still green), web `ReplacementApprovalCard.test.tsx` (+4), iOS `replacement-approval-card-display.test.ts` (4), `approval-display.test.ts` (6).
- Resolved: 2026-10-10 (PAD-574).
