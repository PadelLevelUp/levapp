---
id: players.duplicate-name-check
status: implemented
depends_on: [players.create, import.confirm]
implements: ../../specs-business/players/coach-builds-roster.business.md
governed_by: []
---

# players.duplicate-name-check


### Intent
Warn coaches when a player they are about to create (manually or via Excel import) has the same
name as a player already on their roster, so they can avoid accidentally creating duplicate
records — without blocking them from proceeding if the duplicate is intentional (e.g. two real
students genuinely share a name).

### Rules
1. Matching is on the player **name**, compared **exactly** but **case-insensitively**
   (`"john doe"` matches `"John Doe"`; `"John Doe Jr"` does NOT match `"John Doe"`).
2. Behavior is **WARN, not BLOCK**: the duplicate is surfaced to the coach, but they may still
   proceed with creation/import.
3. Manual creation (`AddPlayerSheet`) surfaces a non-blocking warning under the Name field when
   the typed name matches an existing player of the coach. The "Create player" button remains
   enabled.
4. The name check reuses the PAD-7 field-validation infrastructure
   (`/api/app/check_field_available` + `useFieldAvailability`) via a warn-only variant so the
   duplicate name does not disable the submit button.
5. `POST /api/app/check_field_available` accepts `("user", "name")` and matches
   case-insensitively; unique fields (`username`, `email`) keep their existing exact match.
6. Excel import preview flags each Players row whose name matches an existing player, showing a
   clear "Possible duplicate" indicator. Flagged rows can still be imported.

7. **(B-102; number self-assigned) Field warnings render in the app's language.** The backend's
   409 `message` for `check_field_available` is English prose ("This email is already taken", "You
   already have a player with this name"). The shared API layer (`@levelup/api` `fields.ts`) maps
   the known `(model, field)` pairs to a reason:
   - `("user", "username")` → `username_taken`
   - `("user", "email")` → `email_taken`
   - `("user", "name")` → `duplicate_name`

   Both shells render the locale key `common.fieldConflict.<reason>` (en and pt), falling back to
   the server's text only for a pair with no reason. The warning element carries its reason:
   `data-reason` on web, `testID field-conflict-<reason>` on iOS. The iOS name warning's follow-up
   sentence uses `players.nameWarningSuffix`, as web does. The backend response is unchanged.

### Acceptance Criteria

#### Manual creation warns on duplicate name (case-insensitive)
- **Given** a coach who already has a player named "John Doe"
- **When** they open the new-player form and type "john doe" in the Name field
- **Then** a non-blocking duplicate warning is shown under the Name field
- **And** the "Create player" button stays enabled so they can proceed anyway

#### No warning for a genuinely new name
- **Given** a coach who has a player named "John Doe"
- **When** they type "Jane Smith" in the Name field
- **Then** no duplicate warning is shown

#### Backend name check is case-insensitive
- **Given** an existing user named "John Doe"
- **When** POST `/api/app/check_field_available` with `{"model": "user", "field": "name", "value": "JOHN DOE"}`
- **Then** the response is 409 with a duplicate message

#### Import preview flags duplicate names
- **Given** a coach with an existing player "John Doe"
- **And** an analyzed Excel import whose Players table contains a row named "john doe"
- **When** the coach views the import preview
- **Then** that row is marked as a possible duplicate
- **And** the coach can still select and import it

#### Field warnings are localised, not the backend's English (B-102)
- **Given** a coach using the app in Portuguese, adding a player with an email that is already taken
- **When** the availability check answers 409 with `message: "This email is already taken"`
- **Then** the email field shows `common.fieldConflict.email_taken` in Portuguese, and the warning carries reason `email_taken`
