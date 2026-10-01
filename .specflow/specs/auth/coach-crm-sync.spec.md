---
id: auth.coach-crm-sync
status: implemented
depends_on: [auth.register, auth.coach-approval]
implements: ../../specs-business/auth/newcomer-signs-up-on-their-own.business.md
governed_by: []
---

# auth.coach-crm-sync

### Intent
A coach who creates their own LevApp account shows up in the sales CRM (HubSpot) without anyone
copying it there, and the CRM keeps their account status true as the LevApp admin decides on
them (PAD-471). Only the coach's own data leaves LevApp.

### Entities
- **READS:** User (name, email, phone), Coach (`approval_status`)
- **WRITES:** nothing in LevApp. In HubSpot: a contact, and the stage of the contact's open deals.

### Rules
1. **Triggers.** Four, all after the database commit that causes them:
   - a self-registered coach's account is created (`POST /api/auth/register`, `role=coach`,
     `auth.register`) — upsert (rule 4) plus the deal move (rule 5);
   - an admin approves, or rejects, a pending coach; a rejected coach re-applies
     (`auth.coach-approval`) — upsert only, no deal move.
   Nothing else syncs in this ticket: not students, not coaches created through a club
   invitation or by an admin, not a later profile edit (a phone added later is not a trigger).
2. **Coach data only (RGPD, binding).** The payload is built by one function from an explicit
   allow-list: first name, last name (the account name split at its first space), email, phone
   when the User has one, and the account status. No other attribute of the User or Coach, and
   nothing about students, classes, messages, evaluations or notes, is ever sent.
3. **Account status** goes into the contact property named by `HUBSPOT_ACCOUNT_STATUS_PROPERTY`
   (`levapp_estado_conta`), mapped from `Coach.approval_status`: `pending` → `pendente`,
   `approved` → `aprovado`, `rejected` → `rejeitado`. With the variable unset, no status is sent.
   If HubSpot answers 400 naming a property (e.g. `PROPERTY_DOESNT_EXIST` — the property was not
   created), the write is retried once without the status and a warning names the property, so a
   misconfiguration degrades to "contact without status", never "no contact".
4. **Upsert, on every trigger. LevApp fills what the CRM lacks and owns only the status.**
   - Look the contact up by email, or by phone when the User has one (`OR`). A self-registered
     coach gives no phone, so in practice the lookup is by email alone.
   - **No contact:** create one with the allow-listed fields plus `levapp_tipo_origem` = `Inbound`
     and `levapp_canal_origem` = `App LevApp`. On a transition this heals a contact the sign-up
     sync never made (it failed, the process restarted, or the token was installed later).
   - **A contact exists:** the status is always written; first name, last name and phone only
     where HubSpot has none; the two source fields are never touched. A rejected coach's contact
     is updated, never deleted.
5. **Deal move, on sign-up only.** After the upsert, every deal associated with the contact that
   is open (`hs_is_closed` false), sits in a pipeline that contains the configured "Em teste" stage
   (`HUBSPOT_DEAL_STAGE_EM_TESTE`, a stage ID), and whose stage comes before it in that pipeline's
   order, is moved to "Em teste". A deal at or past "Em teste", closed, or in another pipeline is
   left alone. With the variable unset, no deal is read or moved. Transitions never move a deal.
6. **Never in the way.** Every trigger hands a plain dict to a background thread and returns at
   once; the function that does the HTTP work takes only that dict and the config, so it can move
   to a real queue later without touching the callers. Any HubSpot failure (network error,
   timeout, 4xx, 5xx) is caught and logged as a warning that names the step and the HTTP status,
   never the coach's data. A 429 or 5xx is retried once; each call times out after 10 s. Sign-up,
   approval, rejection and re-application answer exactly as they would without this feature. A
   sync lost to a process restart is accepted only because the next transition's upsert heals it.
7. **Off without a token.** `HUBSPOT_PRIVATE_APP_TOKEN` (a secret, read per call) switches the
   feature on. Absent or empty, all four triggers are silent no-ops: no request, no log line.
8. **Sign-up rules are unchanged.** Adults-only (PAD-445), the retired guardian flow (PAD-457) and
   activation are untouched: a refused registration creates no account and so triggers nothing.

### Acceptance Criteria

#### A new coach becomes a HubSpot contact with the app as the source
- **Given** a token, no HubSpot contact with email `ana@example.com`
- **When** Ana Lima registers as a coach
- **Then** the response is 201, HubSpot is searched by that email, and a contact is created with
  exactly `firstname` Ana, `lastname` Lima, `email` ana@example.com, the status `pendente`,
  `levapp_tipo_origem` Inbound and `levapp_canal_origem` App LevApp

#### An existing contact is updated, not duplicated
- **Given** a HubSpot contact for `ana@example.com` with a first name and no status
- **When** Ana registers as a coach
- **Then** the contact is updated with the status only (its name kept, its source fields untouched)
  and no contact is created

#### An open deal before "Em teste" moves to "Em teste"
- **Given** the contact has an open deal at "Treinador identificado", an open deal already past
  "Em teste", and a closed deal
- **When** Ana registers as a coach
- **Then** only the first deal is moved to the "Em teste" stage

#### The payload carries the allow-list and nothing else
- **Given** a coach whose User row also has a username, birth date, country and password hash, and
  who has students
- **When** the sync payload is built
- **Then** its keys are exactly first name, last name, email, phone (only when present) and status

#### Admin decisions update the status and never move a deal
- **Given** a coach with a HubSpot contact
- **When** the admin approves them / rejects them / they re-apply
- **Then** the contact's status becomes `aprovado` / `rejeitado` / `pendente`, nothing is created,
  and no deal is read or moved

#### A transition heals a missing contact
- **Given** a pending coach with no HubSpot contact (the sign-up sync never made one)
- **When** the admin approves them
- **Then** a contact is created with the allow-listed fields, status `aprovado` and the two source
  fields

#### A missing status property does not lose the contact
- **Given** HubSpot answers 400 `PROPERTY_DOESNT_EXIST` for `levapp_estado_conta`
- **When** a coach registers
- **Then** the contact is created on a second write without the status, and a warning names the
  property

#### A deal in another pipeline is left alone
- **Given** an open deal in a pipeline that has no "Em teste" stage
- **When** the coach registers
- **Then** that deal is not moved

#### HubSpot failing never blocks LevApp
- **Given** a token and HubSpot answering 500 (or the connection failing)
- **When** a coach registers, or the admin approves or rejects them, or they re-apply
- **Then** each answers as it would without the feature (201 / 200), a warning is logged, and the
  account state is the same

#### No token, no traffic
- **Given** no `HUBSPOT_PRIVATE_APP_TOKEN`
- **When** a coach registers, is approved, rejected, or re-applies
- **Then** no request is made to HubSpot

#### Students and refused sign-ups never sync
- **Given** a token
- **When** a student registers, or a 16-year-old's coach registration is refused
- **Then** no request is made to HubSpot

### Notes
- PAD-471, 2026-10-01. Decisions by the coordinator (levapp-67) the same day: email-only lookup
  at self-sign-up (a phone added later is not a trigger here); the status follows approve / reject
  / re-apply as an upsert that heals a missing contact; the deal move happens on account creation
  only, forward only, within the pipeline that has the stage; a missing status property degrades
  to a contact without status; the allow-list in one function with a test is the form the RGPD
  section takes; an in-process thread is accepted at this volume, behind one call site.
- The token is shared with the Discord leads bot's HubSpot private app (PAD-470). Scopes:
  `crm.objects.contacts.read`, `crm.objects.contacts.write`, `crm.objects.deals.read`,
  `crm.objects.deals.write`.
- Web and iOS: no client change — the sync is server-side, behind the endpoints both apps already
  call.
- Tests: `backend/padel_app/tests/test_pad471_hubspot_coach_sync.py`.
