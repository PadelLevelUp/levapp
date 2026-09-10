---
id: B-018
title: "A private image that cannot be signed turns every user/club/message payload into a 500 — and signing built a storage client per image"
type: layer-drift
severity: critical
status: resolved
affects:
  - backend/padel_app/model.py
  - backend/padel_app/models/users.py
  - backend/padel_app/models/clubs.py
  - backend/padel_app/models/messages.py
proposed_fix: "Image.url() degrades to None when there is no bucket or the signer fails; one storage client per process."
opened: 2026-09-06T15:40:00Z
resolved: 2026-09-06T16:00:00Z
---

# B-018 — A private image that cannot be signed breaks every payload that carries one

Surfaced within minutes of PAD-200's first run. Staging received a copy of production (185 users,
avatars and club logos included) and, on the restart, B-047's migration flipped every image row to
`is_public = False`. From then on `User.avatar`, `Club.logo_url` and `Message.attachment_url` all
went through `Image.signed_url()`, which

1. built a **new `storage.Client()` per image** — on GCE that resolves credentials against the
   metadata server every time, so a page of avatars paid that cost once per row; and
2. then **failed**: staging carries no `GCS_UPLOADS_BUCKET` at all, so `bucket(None)` cannot be
   signed against. The exception escaped `url()`, so any endpoint that serialized a user with an
   avatar answered 500. (Correction, later the same day: the IAM side is fine — the VM service
   account `levelup-vm-sa` already holds `roles/storage.objectViewer` on the bucket and
   `roles/iam.serviceAccountTokenCreator` on itself, verified with `gcloud … get-iam-policy`. The
   missing bucket on staging was the whole cause; prod, which has the bucket, can sign.)

Together: "staging is super slow and doesn't seem to be working". The local E2E seed has no
avatars, which is why nothing caught it before real data arrived.

**Resolved 2026-09-06:** `Image.url()` returns `None` when there is no bucket or the signer raises
(logged at warning level), so a client renders its fallback instead of the page failing; the
storage client is created once per process. Pinned by `test_image_privacy.py`
(`test_url_degrades_to_none_when_signing_fails`, `test_url_is_none_without_a_bucket`,
`test_storage_client_is_built_once`) and by `messaging.messages` rule 5b.

On staging, private images render as missing (no bucket) — the intended degraded state, not a
crash. Prod has the bucket and the IAM bindings, so once B-047's migration reaches `main` it
serves signed URLs; only PAD-197's step 3 (revoking `allUsers`, still pending) changes anything
there.

*Found by the owner trying staging after PAD-196 + PAD-200 landed, 2026-09-06.*
