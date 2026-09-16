---
id: settings.admin-editor
status: implemented
depends_on: [auth.login, settings.role-scope]
implements: ../../specs-business/settings/coach-configures-preferences-and-access.business.md
governed_by: []
---

# settings.admin-editor

### Intent
The LevApp superadmin's generic data browser — the web `/editor` page — and the two legacy
surfaces behind the old Jinja editor. Before PAD-175/PAD-267 no spec described them (B-010), all
three were registered unconditionally in production, they returned every column raw (password
hashes, reset codes, device tokens, push keys, invitation tokens), the legacy edit route ran any
method named in the request body, and CSV export wrote whole tables under the Flask-served static
directory (audit M9).

### Surfaces
- `/api/editor/*` (`modules/editor_api.py`) — the JSON API behind the web `/editor` page
  (`apps/web/src/pages/EditorPage.tsx`, client `@levelup/api` `editorApi`).
- `/editor/*` (`modules/editor.py`) — the legacy Jinja editor, signed in through the legacy session
  `/auth/login`.
- `/api/*` (`modules/api.py`) — the legacy generic CRUD the Jinja pages call (`create`, `edit`,
  `delete`, `query`, `remove_relationship`, `modal_create_page`, `image`).

### Rules
1. **Switched on only where `EDITOR_ENABLED` is set.** The flag is read from the environment; it
   defaults to on in the development config (local and E2E) and off in the production config.
   Staging sets `EDITOR_ENABLED=1` in `backend/.env.staging`; production leaves it unset (owner
   decision 2026-09-10). When it is off none of the three blueprints is registered and every path
   answers 404. An app built from a test config has it on unless the test config says otherwise.
2. **Superadmin only, whatever the flag says.** On the API surfaces a request without credentials
   gets 401, and any signed-in user who is not `is_superadmin` — a coach, a student, or a legacy
   `is_admin` — gets 403, with nothing read or written. On the Jinja pages a visitor who is not
   signed in is sent to the legacy login and a signed-in non-superadmin gets 403. (Until PAD-267 the
   legacy surfaces also let `is_admin` in.)
3. **Secrets never leave and never change.** Redacted columns: `users.password`,
   `users.generated_code`, `users.email_verification_code_hash`, `users.password_reset_code_hash` (PAD-139), `device_tokens.token`,
   `push_subscriptions.subscription_json`, `coach_invitations.token`, `player_invitations.token`,
   `coach_join_tokens.token`. They are omitted from every read (list, record, the legacy query, the
   Jinja display pages) and ignored on every write (create, update, the legacy create and edit). A
   guard test fails when a column that looks like a secret (`token`, `password`, `secret`, `hash`,
   `subscription`) is added without being listed or explicitly cleared.
4. **No method invocation by name.** A legacy edit whose body carries `methods` answers 400 and calls
   nothing; the Jinja editor's JavaScript never sent it.
5. **No CSV export or import.** `/api/download_csv/<model>` and `/api/upload_csv_to_db/<model>` are
   removed with their editor menu items: they had no caller and wrote whole tables, password hashes
   included, under the Flask-served static directory.
6. **Web client through `@levelup/api`.** `packages/api/src/resources/editor.ts` (`editorApi`);
   `apps/web/src/api/editor.ts` re-exports it.
7. **Web-only by design.** A superadmin data browser is not a phone tool; iOS has no editor. Recorded
   here as the hard-rule exception.
8. Production already refuses to start with development signing secrets (`assert_production_secrets`,
   B-003); unchanged, listed because audit M9 raised it.

### Acceptance Criteria

#### The flag switches every surface off
- **Given** an app with `EDITOR_ENABLED` off
- **When** anyone requests `/api/editor/models`, `/editor/` or `/api/query/user`
- **Then** each answers 404

#### Only the superadmin gets in
- **Given** the flag on
- **When** a coach or a student calls `/api/editor/models`, `/api/editor/user` or `/api/query/user`,
  or opens `/editor/` signed in
- **Then** each gets 403 and nothing is written
- **And** a legacy `is_admin` who is not superadmin gets 403 too, and an anonymous API call gets 401

#### Secrets are redacted both ways
- **Given** the superadmin
- **When** they list or open users, device tokens or invitations
- **Then** no password hash, code, token or push subscription appears
- **And** an update that sends `password` leaves the stored password unchanged

#### No method runs by name
- **Given** the superadmin
- **When** they post a legacy edit with `methods: ["delete"]`
- **Then** it answers 400 and the record still exists

#### CSV routes are gone
- **When** anyone requests `/api/download_csv/user` or `/api/upload_csv_to_db/user`
- **Then** it answers 404

### Open items
- `/api/editor/<model>/options` and the legacy `/api/query/<model>` still load whole tables.
- Writes use the generic `update_with_dict`, bypassing each domain's service invariants; accepted
  for a superadmin-only tool.
- The Jinja editor's device-token pages have always failed (pre-existing, found in PAD-267): the
  model's form declares an unsupported `"String"` field type, so `/editor/display/devicetoken/<id>`
  raises, and it defines no list columns, so `/editor/display/devicetoken` raises too. Neither page
  ever rendered a token; `/api/editor/devicetoken` (the web data browser) works and redacts it.
