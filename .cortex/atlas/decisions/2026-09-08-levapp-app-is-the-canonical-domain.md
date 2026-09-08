---
id: decision.2026-09-08-levapp-app-is-the-canonical-domain
title: levapp.app is the canonical domain; padellevelup.com stays live as legacy
date: 2026-09-08T16:00:00Z
---

# levapp.app is the canonical domain; padellevelup.com stays live as legacy

The product is **LevApp**, so from 2026-09-08 `levapp.app` is the canonical domain and
every new reference points there. The mobile app's `PRODUCTION_API_URL` and
`WEB_APP_URL` defaults moved to it, verified serving `/privacy`, `/terms` and
`/.well-known/apple-app-site-association` (200, `application/json`, no redirect).

`padellevelup.com` is **not** retired and must not be. Binaries already in the App Store
hardcode it as their API host, so switching it off would break every installed copy until
users update. It continues to serve prod, stays claimed in `ios.associatedDomains`
alongside `levapp.app`, and — per the 2026-09-03 staging-gated-release-flow decision — can
never become the staging hostname.

The distinction is direction, not deletion: nothing new points at padellevelup.com;
everything already pointing at it keeps working. Actually retiring it is a separate piece
of work needing an iOS release and a deprecation window measured in App Store update
adoption, not a config change.
