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
   lower-cased, every character that is neither a Unicode letter, a digit nor a space dropped
   (PAD-516: "Ana-Rita O'Neil" folds to "anarita oneil"), spaces collapsed. Letters of any script are kept — "Łukasz" folds to "lukasz", never "ukasz".
3. **Words.** The query is split into words. A blank query matches everyone and keeps the screen's
   own order; a query with text but no letter or digit ("%", "!!") matches nobody.
4. **Fields.** A player is searched across a list of fields: `name`, then `nickname` when the screen
   has one (null is skipped), then `email` and `phone` **only on screens whose payload already
   carries them** — the rule never adds a field to a payload. **An email is searched by its local
   part only, never its domain** (decision 2026-10-14 (b): every address on a roster shares the
   domain, so "a" would match "example.com"). A digits-only query word of three or
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
6. **Order — an explicit sort wins** (decision 2026-10-14 (a)). Where a list has a sort of its
   own, the rule only filters and that sort stands: the **Players tab** (always by name or level;
   PAD-521's "a search keeps the level order" holds) and the **presences table** (its column sort).
   Where a list has no sort of its own, non-blank queries order by tier, then name (folded, then as
   written), then id: the type-ahead `notify/player_search` (applied **before** its limit of 20),
   the claim candidates (a same-name candidate still first, then tier), the class pickers, the
   walk-in and waiting-list pickers, the notify modal and the messaging pickers.
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
10. **Feedback while typing (slice 2, ticket point 7).** On every surface of rule 8, web and iOS:
    - **Debounce.** A surface that asks the server waits **200 ms** after the last keystroke
      (`PLAYER_SEARCH_DEBOUNCE_MS` in `@levelup/config`); a local filter answers on each keystroke.
    - **Searching.** While a server search for the current text is in flight, the surface shows
      "A pesquisar…" (`players.search.searching`, test id `player-search-searching`) in place of the
      empty message; earlier results stay on screen until the new ones arrive.
    - **Nothing found.** When a non-blank query matches nobody, the surface shows
      "Nenhum jogador encontrado para «{query}»" (`players.search.noResults`, test id
      `player-search-empty`, the query as typed, trimmed). A blank query never shows it. A surface that
      already had its own empty line for a non-blank query uses this one instead.

### Acceptance Criteria

#### The ticket's examples find their player on every surface's rule
- **Given** players "Rui Pedro Basto", "André Nunes", "João Moreira" and "Ricardo Marinho"
- **When** the shared rule ranks them for `Rui Basto`, `basto rui`, `andre nunes`, `joao`, `jo mor`,
  `Ricrdo` and `Marinoh`
- **Then** each query finds its player, by the twins alike (the shared cases file)

#### An explicit sort stands; elsewhere the best match is first (rule 6)
- **Given** a coach with "Ana Rita" and "Rita Zé"
- **When** they search `rita` on the Players tab sorted by name, and on the type-ahead with a limit of 1
- **Then** the Players tab lists "Ana Rita" then "Rita Zé" (the rule only filters)
- **And** the type-ahead returns "Rita Zé" (tier 0) before its limit

#### An email domain never matches (rule 4)
- **Given** players whose emails are all `@test.com`
- **When** the coach searches `test` on the Players tab
- **Then** nobody is returned, while the local part (`ritaze`) finds its player

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

#### A search that finds nobody says so, with the query (rule 10)
- **Given** a coach's roster without any "Xavier"
- **When** they type `  xavier ` on any surface of rule 8 and the search settles
- **Then** "Nenhum jogador encontrado para «xavier»" is shown (`player-search-empty`)
- **And** clearing the box removes it and shows the list again

#### A server search waits for the typing to stop and says it is searching (rule 10)
- **Given** the Players tab
- **When** the coach types `rui` letter by letter, faster than 200 ms apart
- **Then** one request is made, for `rui`, 200 ms after the last letter
- **And** while it is in flight `player-search-searching` is shown and the previous rows stay

### Notes
- Prod Postgres is the official `postgres:15` image; `unaccent`/`pg_trgm` are not installed by any
  migration, so the rule runs in Python after the SQL scope, as PAD-516's did (decision 2026-10-14:
  no extension, no migration).
- Nickname hook agreed with la-1410-SessionC (PAD-660): the field is `nickname`, read from the
  requesting coach's own `Association_CoachPlayer` row; this rule lands first with `name` alone.
