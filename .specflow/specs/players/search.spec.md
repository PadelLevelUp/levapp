---
id: players.search
status: draft
depends_on: [players.list]
implements: ../../specs-business/players/coach-browses-and-reviews-roster.business.md
governed_by: []
---

# players.search

### Intent
A coach finds a player the same way on every screen where they type a player's name: "Rui Basto"
finds "Rui Pedro Basto", "andre nunes" finds "André Nunes", "jo mor" finds "João Moreira" while they
type, and the best match is first. The search changes **only how the text is compared** — never
who can appear (PAD-665; inventory and technique confirmed by the owner, 2026-10-14).

### Entities
- **READS:** User (`name`, and where the screen's payload already carries them, `email`, `phone`),
  Association_CoachPlayer (`nickname`, PAD-660 — a field the rule accepts once it exists).
- **WRITES:** nothing.

### Rules
1. **One rule, two twins.** The rule lives in `@levelup/config` (`name-search.ts`: `rankPlayerMatch`,
   `searchPlayers`; `nameMatchesQuery` stays as "has a rank") and in the backend
   (`player_service`: `rank_player_match`, `search_players`; `name_matches_query` the same). One
   cases file, `frontend/packages/config/src/name-search.cases.json`, is run by both vitest and
   pytest, so the twins cannot drift.
2. **Folding (B-531).** Text and query are folded the same way: special letters mapped first
   (`ł→l`, `ø→o`, `ß→ss`, `đ→d`, `æ→ae`, `œ→oe`, `ı→i`), then NFKD with combining marks dropped,
   lower-cased, every character that is not a Unicode letter or digit turned into a space, spaces
   collapsed. Letters of any script are kept — "Łukasz" folds to "lukasz", never "ukasz".
3. **Words.** The query is split into words. A blank query matches everyone and keeps the screen's
   own order; a query with text but no letter or digit ("%", "!!") matches nobody.
4. **Fields.** A player is searched across a list of fields: `name`, then `nickname` when the screen
   has one (null is skipped), then `email` and `phone` **only on screens whose payload already
   carries them** — the rule never adds a field to a payload. A digits-only query word of three or
   more digits matches the phone's digits anywhere (e.g. its last digits).
5. **Tiers, best first.** A player matches at the best tier any field reaches:
   - 0 — a field starts with the whole folded query ("rui ped" → "Rui Pedro Basto");
   - 1 — every query word is the start of a word in the fields, in any order ("jo mor",
     "basto rui");
   - 2 — every query word appears inside the fields, in any order (PAD-516's rule, kept: "ana"
     still finds "Mariana");
   - 3 — every query word of 4+ letters is within a small typo distance (Damerau: 1 for 4–6 letters,
     2 for 7+) of a word, or of a word's start, in the fields; shorter words must still meet tier 2.
   Tiers only add: anyone PAD-516 found is still found.
6. **Order.** Non-blank queries sort by tier, then name (folded, then as written), then id. On the
   server the order is applied **before** the limit (`notify/player_search`, 20) and before
   pagination (`coach_players_paginated`), so page 1 holds the best matches.
7. **Scope never changes.** Every surface keeps exactly its current filters and permissions: the
   rule runs only on rows the surface already selected (the coach's roster, minus the rows that
   surface already excludes). No surface gains a player, a field or a coach it did not have.
8. **Surfaces (inventory, owner-confirmed 2026-10-14; web and iOS):** Players tab (server);
   add players to a class; class waiting list "add student"; validate-presences walk-in; link a
   duplicate account (claim candidates, server — moved from its own single-substring fold to this
   rule); excluded students, standing waiting list and the invites tutorial (server,
   `notify/player_search`); notify/invite modal; presences table filter; new conversation (coach
   side); conversation list filter (coach side, the counterpart's name). Not touched: the same
   messaging screens used by a student, the admin console, club search, exact username/email
   lookups, exercises/groups/competencies.
9. **No raw comparison returns.** A guard test fails if any surface in rule 8 compares a player name
   with `toLowerCase().includes(` instead of the shared rule.
10. **Slice 2 (separate PR):** a debounce of ~200 ms where a surface asks the server, a "searching"
    state, and "Nenhum jogador encontrado para «…»" when nothing matches — ticket point 7.

### Acceptance Criteria

#### The ticket's examples find their player on every surface's rule
- **Given** players "Rui Pedro Basto", "André Nunes", "João Moreira" and "Ricardo Marinho"
- **When** the shared rule ranks them for `Rui Basto`, `basto rui`, `andre nunes`, `joao`, `jo mor`,
  `Ricrdo` and `Marinoh`
- **Then** each query finds its player, by the twins alike (the shared cases file)

#### The best match is first, before the limit and the page
- **Given** a coach with "Ana Rita", "Mariana Costa" and "Joana Anacleto"
- **When** they search `ana` on `coach_players_paginated` with `per_page=1`
- **Then** page 1 holds "Ana Rita" (tier 0), and all three are counted in the total (tier 1 and 2 kept)

#### Letters without a decomposable accent are kept (B-531)
- **Given** a player "Łukasz Ørsted Weiß"
- **When** the coach searches `lukasz`, `orsted` or `weiss`
- **Then** the player is found each time, on the server and in the apps

#### Searching never widens who appears
- **Given** coach A with player "Rui Pedro Basto", and coach B with a player "Rui Basto" not on A's roster
- **When** A searches `rui basto` on the Players tab, the excluded-students search and the claim candidates
- **Then** only A's player is returned on each

#### No surface compares a name the raw way
- **Given** the twelve surfaces of rule 8
- **When** the guard scans their files
- **Then** none contains `.toLowerCase().includes(` on a player name

### Notes
- Prod Postgres is the official `postgres:15` image; `unaccent`/`pg_trgm` are not installed by any
  migration, so the rule runs in Python after the SQL scope, as PAD-516's did (decision 2026-10-14:
  no extension, no migration).
- Nickname hook agreed with la-1410-SessionC (PAD-660): the field is `nickname`, read from the
  requesting coach's own `Association_CoachPlayer` row; this rule lands first with `name` alone.
