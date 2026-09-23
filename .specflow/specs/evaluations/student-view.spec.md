---
id: evaluations.student-view
status: implemented
depends_on: [evaluations.sharing, dashboard.blocks]
implements: ../../specs-business/evaluations/student-sees-their-evaluations.business.md
governed_by: []
provenance:
  - derives_from: archive/documents/sistema-de-avaliacoes-2026-09-21/extracted/requirements.md
  - derives_from: archive/documents/sistema-de-avaliacoes-explained-2026-09-21/extracted/summary.md
---

# evaluations.student-view

> **Owner-decided on 2026-09-22 (PAD-402, Q2):** a player sees only what a coach shares, as an
> "Avaliações" block on the student dashboard, web + iOS, behind the `evaluations` capability
> token — old App Store builds see nothing. The canvas never showed the player's side; a student
> has no profile page and no notifications inbox on web or iOS, which is why the dashboard.

### Intent
What a player sees of their evaluations, and where: only what a coach shared, exactly as the
coach previewed it.

### Entities
- **READS:** EvaluationShare (`card` snapshot, `evaluations.sharing`), Association_CoachPlayer.
- **WRITES:** nothing.

### Rules
1. **A player is served shared cards and nothing else.** No unshared record, no unchosen
   competency, no note that was not included, no figure computed from data they were not shown.
   The server serves the stored snapshot; a client never receives a hidden field and hides it.
   (Q2)
2. **The read.** `GET /api/app/my_evaluations` (JWT, **student**) → `{cards: [Card]}`, newest
   `sharedAt` first, across every coach of the player. `Card` is `evaluations.sharing` rule 3's
   shape, served from the snapshot and never recomputed at read time. A caller with no player
   profile → 403. The endpoint is new, so it needs no capability gate.
3. **(build default Q20) Each card names its coach.** A player with two coaches sees both
   coaches' cards in one list; each coach's sharing is independent.
4. **Where it lives: a block on the student dashboard plus a full list.** The student dashboard
   (web and iOS) gains a block of type `evaluations` holding the newest 3 cards and a way to the
   full list (web route `/evaluations`, student-only; iOS a pushed screen). A player with no
   shared card gets **no block at all** — omitted from the payload, not an empty state. (Q2)
5. **The capability token `evaluations` gates the dashboard block — its one job.** The dashboard
   payload is server-driven and already read by App Store 1.0/1.1.0, and how those builds render
   an unknown block type is unverified. So the server emits the `evaluations` block only to a
   client that declares the token in `X-LevApp-Capabilities` (PAD-352 mechanism,
   `utils/client_capabilities.py`: comma-separated, case-insensitive, **fails closed** — no
   header, an empty header or no token declares nothing). Web (`apps/web/src/api/client.ts`) and
   iOS (`apps/mobile/src/lib/api.ts`) declare it through `initApi({capabilities})`; the next App
   Store build must keep the line or the block silently vanishes. The token withholds **nothing
   else**: which competencies an old build can see or write is decided by endpoint
   (`evaluations.legacy-client-contract` rule 1), never by this token. Retirement: once no build
   predating the declaration is in use, emit the block unconditionally. (Q2)
6. **One card component.** The player's card is the component the coach's preview uses — same
   order, same rounding, same neutral zero — so the two cannot disagree.
7. **A player cannot act on an evaluation**: no rating, reply, acknowledgement or delete. The one
   action is opening the conversation with that coach.
8. **(build default Q23) Layout.** Web and iOS ship in the same ticket; the list is a page on
   web and a pushed screen on iOS.

### Touches
- `dashboard.blocks` — its block vocabulary gains `evaluations` (student only, capped at 3,
  omitted when empty, capability-gated) and the student block-order criterion changes.
- `dashboard.navigation` — `/evaluations` joins the student routes and the native route map.
- `eligibility.open-spot-visibility` — where the capabilities header is specified; its "one
  token exists" sentence becomes a list of two.
- `mobile.release-build-target` — the release bundle check should pin the `evaluations`
  declaration as it does `open-spots`.
- The privacy policy already names "coaching evaluations/notes entered by your coach" as held
  data; its wording is re-read before this ships, because the data gains a new recipient.

### Acceptance Criteria

#### A player sees only shared cards, and only what was chosen (rules 1, 2)
- **Given** coach Ana shared Rui's 2026-09-21 record (Técnica 4 of Técnica 4 and Tática 3; no
  note included, though the record has the note "Boa sessão") and did not share his 2026-09-14
  record
- **When** Rui calls `GET /api/app/my_evaluations`
- **Then** `cards` has one item: `evaluatedOn` `"2026-09-21"`, `coachName` Ana's, one rating
  (Técnica, `score` 4, `scaleMax` 5), `note: null`
- **And** the raw body contains neither "Tática" nor "Boa sessão" nor any `categoryId`

#### A coach cannot read the student endpoint (rule 2)
- **Given** coach Ana, who has no player profile
- **When** she calls `GET /api/app/my_evaluations`
- **Then** the response is 403

#### Both coaches' cards appear, each named (rule 3)
- **Given** Rui is coached by Ana and by Bruno, and each shared one record, Bruno's later
- **Then** `cards` has two items, Bruno's first, each with its own `coachName`

#### The dashboard block is gated by the token and omitted when empty (rules 4, 5)
- **Given** Rui has one shared card
- **When** his dashboard is fetched with `X-LevApp-Capabilities: evaluations`
- **Then** `blocks[]` holds one block of type `evaluations` with that card
- **When** it is fetched with no capabilities header, as App Store 1.0/1.1.0 do
- **Then** `blocks[]` holds no `evaluations` block and every other block is unchanged
- **Given** Sara has no shared card
- **Then** her dashboard holds no `evaluations` block with or without the header

#### The player's card survives the coach's later changes (rules 1, 6)
- **Given** Ana's preview showed Técnica 4 with a delta of +1.0
- **When** Ana later switches Técnica off and rates Rui again
- **Then** Rui's card still shows Técnica 4 and +1.0

### Notes
- Test trap: Playwright's raw `request` helpers send only the auth header, so a raw read of the
  dashboard gets the undeclared shape (no block). A spec asserting the block drives the browser
  or sets the header itself.
- Read before building (2026-09-22): both App Store trees skip an unknown block type — the
  mobile `DashboardBlocks.tsx` `renderBlock` switch ends in `default: return null` with the
  comment "Unknown block types from newer backends are skipped, not fatal" (1.0 `6f5d0c1ce`
  lines 321–323; 1.1.0 `6b48f79e3` lines 383–385) — and neither sets `X-LevApp-Capabilities`
  (`src/lib/api.ts` at both SHAs). The gate in rule 5 stays: it costs one line and is what the
  business rule promises ("not shown … and nothing breaks").
