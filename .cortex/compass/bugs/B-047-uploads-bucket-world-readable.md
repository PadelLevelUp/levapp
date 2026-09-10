---
id: B-047
title: "Uploads bucket was world-readable and anonymously enumerable"
type: missing-criterion
severity: critical
status: resolved
affects:
  - backend/terraform/main.tf
  - backend/padel_app/model.py
  - backend/padel_app/tools/input_tools.py
  - messaging.messages
  - settings.profile
proposed_fix: "Revoke the allUsers grant, default Image.is_public to False, serve V4 signed URLs, and add a random segment to object keys."
opened: 2026-09-06T10:00:00Z
resolved: 2026-09-06T12:00:00Z
---

# B-047 — Uploads bucket was world-readable and anonymously enumerable

`google_storage_bucket_iam_member.public_all` granted `roles/storage.objectViewer` to `allUsers` on the uploads bucket. Three facts compounded into a data exposure rather than a merely-public CDN:

1. That role carries `storage.objects.list`, so the bucket was anonymously **enumerable**, not just readable object-by-object.
2. `Image.is_public` defaulted to `True` and both upload paths in `input_tools.py` passed `is_public=True` explicitly, so `Image.url()` returned a permanent unauthenticated `storage.googleapis.com` link for everything.
3. Object keys were `images/<model>/<timestamp>_<original filename>` with no random segment — guessable even without listing.

This covered chat attachments (`Message.attachment`, `messaging.messages` rule 5) on the same terms as avatars and club logos. The repository is public, so the bucket layout was inferable from source.

**Resolved 2026-09-06:** the `allUsers` grant is removed; `is_public` defaults to `False` and neither upload path sets it; keys gain `secrets.token_urlsafe(16)`; migration `f1a2b3c4d5e6` flips existing rows so they stop pointing at a URL that no longer resolves. Reads now go through `Image.signed_url()` (V4, 60 min). Serving that way needs two IAM bindings the bucket did not have — `roles/storage.objectViewer` for the VM service account (`objectCreator` is write-only) and `roles/iam.serviceAccountTokenCreator` on itself, because `generate_signed_url` under ADC on GCE signs via the IAM API rather than a private key.

**Signing does not fall back on its own (verified on the VM, 2026-09-06).** Granting
`serviceAccountTokenCreator` is necessary but not sufficient: under compute-engine
credentials `generate_signed_url` raises
`AttributeError: you need a private key to sign credentials` rather than routing to the
IAM API by itself. It must be told to, by passing `service_account_email` and a live
`access_token`. Caught by testing signing inside the running container before the
production deploy — the original implementation would have returned 500 for every image.
`Image.signed_url` now tries the plain call and falls back to the IAM path.

**Staging cannot prove this path.** `GCS_UPLOADS_BUCKET` is unset in the
`padelapp_staging` container and staging holds no image rows, so image serving is inert
there. That gap is unrelated to this bug but means a staging deploy is not evidence that
image changes work; verify against production or fix the staging environment first.

*Found while auditing what the public repo discloses, 2026-09-06.*
