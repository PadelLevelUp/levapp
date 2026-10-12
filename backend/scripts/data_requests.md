# Data-subject requests: access, portability, correction, erasure

`admin.data-export` (PAD-640). For admin@levapp.app. GDPR articles 12, 15–17 and 20; the Privacy
Policy's "your rights" section.

## 1. Receive and record

- Requests arrive at admin@levapp.app, or anywhere else a person writes to LevApp. Any wording counts:
  "send me my data", "what do you have on me", "correct my date of birth", "delete me".
- Record the request in the admin@ mailbox with a `DSR` label: who, what they asked, and the date
  received. **The answer is due within 30 days of that date.** It can be extended once, by up to 60
  more days, for a complex request. Tell the person within the first 30 days, and say why.

## 2. Verify it is them

Never send data to an address the account does not already have.

- If the request comes **from the account's own email**, that is enough.
- Otherwise, reply **to the account's email** ("we received a request for your LevApp data; reply
  to confirm"), and wait for the reply from that address.
- An account with no email (a student added by a coach who never signed in): ask the coach to put
  the person in touch, then verify by a reply from an email the person controls *and* one detail
  only they and their coach know (the club and coach name). If in doubt, ask the owner.
- Find the user id in the staff console: Utilizadores, search by name or email, open the user. The id
  is in the page's address.

## 3. Access and portability: export the data

On the VM (see the `vm-and-terraform-access` notes), inside the backend container:

```bash
docker exec -i <backend container> python scripts/export_user_data.py <user_id> > user-<id>.json
```

- The script is **read-only**: one read-only transaction, always rolled back. It prints JSON with the
  person's account, their player and coach records, and every row that points at them (classes,
  attendance, evaluations, notes about them, requests, reports they filed, devices), plus the
  messages they sent.
- It never prints another person's messages, any password, code or token (`"[withheld]"`), or the
  staff audit logs.
- Read the file before sending. Remove anything that names a third party beyond what the person
  already sees in the app.
- Exit code 2 with "no user <id>" means the id is wrong. Nothing is printed.

Send the JSON **to the account's email**, as an attachment (zip it if large), with a short note that
it is their LevApp data in a machine-readable format (JSON). Then delete the local copy.

## 4. Correction

- A date of birth or a country: the person can change it themselves in Definições → Perfil, on web
  and iPhone (`settings.profile` rules 10–11). A date that makes them under 18 is refused. Point them
  there first.
- Name, email, phone: also in Definições → Perfil.
- Anything else (for example an evaluation they dispute): ask the coach. Ask the owner if the coach
  disagrees.

## 5. Erasure

- The person deletes their account themselves: Definições → Conta → Eliminar conta, on web or
  iPhone. The public delete-account page explains the steps (`auth.account-deletion`).
- If they cannot sign in, verify as in step 2 and help them reset the password ("Esqueceste-te da
  palavra-passe?" on the sign-in page), then they delete it themselves.
- If even that is impossible (no email on the account), ask the owner. The staff console has no
  delete for users, so this needs a decision and a database change by the owner.

## 6. Close

Reply on the same thread saying what was done and on which date. Keep the thread under the `DSR`
label for 3 years. That record is the proof that the request was answered in time.
