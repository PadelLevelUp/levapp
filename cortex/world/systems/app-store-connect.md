---
about: "App Store Connect: the store record and its API as we drive it (versions, builds, territories, review, release); expedited review is a web form"
permanence: changing
verified: "2026-11-23 (observed)"
origin:
  - session:1f2b6f85-3591-4547-8797-325a278a29e9
need:
  - frontend/apps/mobile/scripts/testflight-upload.sh
---

# App Store Connect

The iOS app is the one store listing `LevApp` (App Store id 6794271800, bundle `com.padellevelup.app`). Store state is read
and changed through the App Store Connect API with a team API key that lives outside the repository; the Python that signs
the token is the one `testflight-upload.sh` resolves (`ASC_PYTHON`, then the backend venv). Cite an API read, not a ticket,
for store state: tickets go stale (two did in November 2026).

**Facts as of 2026-11-23.**

- Availability: all 175 territories since 2026-11-20 (France was the one missing and was added by `PATCH
  /v1/territoryAvailabilities/<id>` with `{available: true}`; the id is the base64 of `{"s":"<app id>","t":"FRA"}`, and the
  read-back shows `PROCESSING_TO_AVAILABLE` while Apple processes). Territories are listed under
  `/v1/apps/<app>/appAvailabilityV2` → `/v2/appAvailabilities/<id>/territoryAvailabilities?limit=200`.
- Age rating 18+ with user-generated content declared (Apple's half of PAD-608; the Google Play half waits on a Play
  Console account).
- The app does not use phased release: `GET /v1/appStoreVersions/<id>/appStoreVersionPhasedRelease` returns `data: null`.
  Check it before shipping a fix on top of a bad version; a phased release would have to be paused.
- Store pages (`apps.apple.com/<country>/app/id6794271800`) lag the release: the night 1.3.5 went live they still showed
  1.3.4; both the Portuguese and the French page showed 1.3.5 three days later. The French page shows the Portuguese
  description and What's New because the listing has no other localisation.

**API traps.**

- `fields[appStoreVersions]`, `fields[builds]` and friends must name the relationship (`build`, `preReleaseVersion`,
  `territory`, `ageRatingDeclaration`) or the response carries no `relationships` at all.
- A new version: `POST /v1/appStoreVersions` with `releaseType` `MANUAL` or `AFTER_APPROVAL`; attach the build with `PATCH
  …/relationships/build`; What's New is `whatsNew` on each `appStoreVersionLocalizations` row (under 4000 characters). Submit
  with `POST /v1/reviewSubmissions`, one `reviewSubmissionItems` row for the version, then `PATCH` the submission with
  `submitted: true`. States: `WAITING_FOR_REVIEW` → `IN_REVIEW` → `COMPLETE`; the version ends `READY_FOR_DISTRIBUTION`.
- `AFTER_APPROVAL` goes live with no further call. A `MANUAL` version waits in `PENDING_DEVELOPER_RELEASE` until
  `POST /v1/appStoreVersionReleaseRequests` (relationship `appStoreVersion`), which flipped 1.3.4 to
  `READY_FOR_DISTRIBUTION` at once on 2026-11-20.
- The upload warning 90725 (2026-11-20) says uploads must be built with the iOS 27 SDK from April 2027; see the open item
  in `now/open-items.md`.

**Expedited review has no API.** It is the form at `developer.apple.com/contact/app-store/?topic=expedite`, filled in a
browser signed in to the developer account: app name (suggested from the account's apps), platform, Send. There is no
reason field, so a prepared justification has nowhere to go. Apple confirms on the page at once ("We'll expedite review
for …"), and a rejection followed by a resubmit keeps the expedited queue. Observed once (1.3.5, 2026-11-20): submitted
15:56Z, `IN_REVIEW` 20:57Z, approved 21:21Z, live at once under `AFTER_APPROVAL`. Watch a review with a background loop
reading the submission state and the version state every few minutes, not by hand.

Related: `code/mobile/ios-release-scripts-preflight.md` (building and uploading), `code/github/promotion-gate.md` (the
server-side promotion that an App Store build must survive).

Filing: App Store Connect as we drive it, with the expedited-review form and the API traps → world/systems/app-store-connect.md (origin: session:1f2b6f85-3591-4547-8797-325a278a29e9)
