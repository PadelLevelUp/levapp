# "Sistema de Avaliações" explained — the canvas against what ships (2026-09-21)

**Source:** `source.md` (English explainer, ~490 lines; full text also at
`docs/reference/sistema-de-avaliacoes-explained.md`, local-only). **Kind:** technical-reference.
It explains `archive.sistema-de-avaliacoes-2026-09-21` section by section and compares each
piece with shipped behaviour. The canvas-side content is extracted in that document's
`extracted/`; this summary keeps what is unique to the explainer: **the comparison**.

**Provenance of the "today" facts.** A static code read by Claude Code session "Session-E" at
`origin/staging` `00e53375f` (which reported an empty diff against `origin/main` `71ea3fc7b` for
every evaluation file, so prod = staging), with App Store clients read at `6f5d0c1ce` (1.0,
build 3) and `6b48f79e3` (1.1.0, build 4). Session-B re-checked three claims by `git grep` at
`00e53375f`: `GET /player_profile/<id>` calls `require_coach()`; nothing in `coach_service.py`
or `import_service.py` writes `comment`; web has a theme selector and iOS none. Nothing was run.
Production row counts and scales were **not checked** at ingestion.

**Audit.** An independent reader checked the explainer against the canvas: every line citation
and Portuguese quotation exact, the worked example re-derived identically, 29 omissions and 4
wrong statements found and folded in.

## The comparison

| Canvas | Shipped at `00e53375f` |
|---|---|
| An evaluation is one record: ratings + one note + date + optional class + share state. | One row = (coach–player link, category, timestamp, float score). No grouping, no class link. `comment varchar(500)` exists with no writer in the app API or the import. |
| A day's record is edited in place. | Every save appends a row at `utcnow`; a value equal to the latest is skipped; `null` is skipped. No date, comment or class id accepted. |
| 1–5 stars everywhere. | Per-category integer `scale_min`/`scale_max` (model default 1–10; both settings editors default to 0–10); web slider, iOS stepper, step 1; the server checks no range; imports write any float. |
| Evaluate from the class or from the player. | One entry point: the coach's player detail page (web and iOS). No per-class surface. |
| Catalogue of 17, grouped, on/off, custom additions. | No catalogue, nothing seeded, no group, no active flag, no order column. Hard delete cascading to scores behind impact + typed name + audit (PAD-274). Settings save is keyed on **name**, so a rename creates a new category. Unique `(coach_id, name)` (PAD-273). |
| History cards and per-competency evolution with monthly averages and deltas. | History rows exist (append-only) but are never served: the only read is latest-per-category. No chart, averages or deltas on either client — the chart in `evaluations.player-view` was never built. |
| Private by default; the coach shares chosen parts with the player. | The player sees **nothing**: every evaluation endpoint is coach-only, no student screen mentions evaluations, no shared/published concept, no notification. The business spec's "(and the player) sees" was never built. Sharing is a new disclosure, not a restriction. |
| A reminder-frequency setting. | No setting, job, template or event type concerns evaluations. |
| "Pontos fortes e fracos" marked out of scope. | Ships as `coach_player_notes`, saved through the same `POST /app/add_evaluation_entry` call as scores; the web form edits them inline, iOS on a separate card. |
| Dark-mode switch. | Web has a theme selector (PAD-57); iOS has no dark mode. |

## What shipped clients pin

App Store 1.0 and 1.1.0 call production and (a) parse `evaluations[]` from
`GET /app/player_profile/<id>` with `categoryId`, `categoryName`, `score`, `scaleMax` and an
unguarded `parseISO(evaluatedAt)`; (b) offer **every** category `GET /app/evaluation_categories`
returns and post a value for each, unrated ones at the scale midpoint, matching by category
name; (c) rely on the server's "equal to latest → skip" rule to stay harmless. Consequences:
switched-off or catalogue competencies must be withheld server-side from clients that do not
declare a capability (`X-LevApp-Capabilities`, PAD-352); the five response keys and the skip
rule must outlive those builds; a category's `scaleMax` cannot change under them.

## Spec drift the comparison exposed

`evaluations.entries` and `evaluations.categories` name routes that do not exist
(`/api/app/coach/evaluation/{id}`, `/api/app/coach/evaluation_category/{id}`); the range rule is
unenforced; `comment` is unwritable; the chart and the player's view are unbuilt;
`evaluations.player-view` and `evaluations.bulk-import` have no acceptance criteria; no backend
test covers `bulk_create_evaluation_entries` or the `/player_profile` evaluation shape.
