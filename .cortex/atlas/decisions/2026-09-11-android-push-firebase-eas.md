---
id: decision.2026-09-11-android-push-firebase-eas
title: "Owner runbook: Android push (Firebase/FCM through the Expo push service) and the EAS steps — wave C"
date: 2026-09-11T23:30:00Z
compass_rules: []
related_specs:
  - ../../../.specflow/specs/messaging/push-notifications.spec.md
supersedes: []
sources:
  - ../../../backend/padel_app/utils/expo_push.py
  - ../../../backend/padel_app/modules/notifications_api.py
  - ../../../frontend/apps/mobile/src/lib/push/expoPushRegistrar.ts
  - ../../../frontend/apps/mobile/app.json
  - ../../../frontend/apps/mobile/eas.json
  - ../../../.github/workflows/deploy-prod.yaml
---

# Android push — what the code already does, what only the owner can do (PAD-307)

**Status: DRAFT for the owner — no console step below has been run.** Written during Android
wave C prep (PAD-290 → PAD-297 lane → PAD-306 flows → this). Everything in the repo that Android
push needs is in place after PAD-307; the rest is accounts and keys.

## Where things stand (verified in the repo)

- The app registers Expo push tokens (`ExponentPushToken[...]`), which are platform-neutral: the
  Expo push service turns them into APNs on iOS and FCM on Android. The backend never talks to
  FCM itself, so no Firebase SDK or service-account key ever enters this repo's code.
- After PAD-307 every Expo message carries `channelId: "default"` and `priority: "high"`; the
  device route stores `platform` as `ios`/`android` and rejects anything else; the Android client
  creates the `default` channel (HIGH, "Messages") and asks the Android 13+ permission.
- `EXPO_ACCESS_TOKEN` is optional. Unset or blank (today), the backend posts to
  `https://exp.host/--/api/v2/push/send` unauthenticated exactly as it has since Phase 5. Set, it
  adds `Authorization: Bearer …`. `deploy-prod.yaml` already passes the GitHub secret of the same
  name; an absent secret arrives as an empty string, which the code treats as unset.
- EAS project: `dc8bbf5f-3e08-4c97-a912-00bb9b1b43e0`, owner `levapps-team` (app.json);
  `eas.json` has `preview` (APK) and `production` (AAB, submit to the Play internal track as a
  draft). The Android package is `com.padellevelup.app`.
- The Android CI lane (PAD-297/#219, #220) builds a debug-signed APK without Firebase; it does not
  need any of the steps below and must keep working without them.

## What the owner has to do — paste in order

```bash
# 1. Firebase project (browser, console.firebase.google.com, as the Google account that owns the
#    GCP project padel-levelup-2026 — a Firebase project IS a GCP project; reuse it rather than
#    creating a second billing surface): Add project → select existing "padel-levelup-2026"
#    → disable Analytics (not needed) → Create.
# 2. Android app in Firebase: Project settings → Your apps → Add app → Android
#    → package name com.padellevelup.app → register → download google-services.json.
#    Keep the file OUT of git (add google-services.json to apps/mobile/.gitignore; store the file in
#    the password manager). Give it to EAS builds as a file-typed environment variable:
cd frontend/apps/mobile
eas env:create --scope project --environment production --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json
eas env:create --scope project --environment preview    --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json
#    and point app.json at it: "android": { ..., "googleServicesFile": "./google-services.json" }
#    — on EAS the variable materialises the file at that path; locally the downloaded copy sits
#    there. (Expo's documented pattern; nothing in the repo reads it until then.)
# 3. FCM V1 credentials for the Expo push service: Firebase → Project settings → Service accounts
#    → Generate new private key (JSON). Then:
eas credentials --platform android
#    → production → Google Service Account → "Set up a Google Service Account Key for Push
#    Notifications (FCM V1)" → upload that JSON. Delete the local copy afterwards.
# 4. (Optional, recommended before Play release) Expo access token so only this backend can send
#    to the project's tokens: expo.dev → Account settings → Access tokens → create (name
#    "levapp-backend-prod"), then:
gh secret set EXPO_ACCESS_TOKEN --repo PadelLevelUp/levapp      # paste the token when prompted
#    and enable "Enhanced Security for Push Notifications" on the Expo project page. Next prod
#    deploy picks it up (deploy-prod.yaml already passes the secret). Staging is NOT given the
#    token on purpose: its DB is a prod copy with real device tokens, and it should keep sending
#    nothing once enhanced security is on (the same reasoning as staging's unset VAPID keys).
# 5. Build and try it on one Android phone (not the emulator: no push token there):
eas build --platform android --profile preview        # APK, installable by link
#    install → log in → Settings → verify a device_tokens row with platform=android appears
#    (backend: SELECT platform, count(*) FROM device_tokens GROUP BY 1;) → have another account
#    send a message → a heads-up "Messages" notification must show; tapping opens the thread
#    (messaging.push-notifications rule 7).
# 6. Play Console (separate Google Play developer account, one-off fee): create the app
#    com.padellevelup.app, complete the store listing/data-safety forms, then
eas build --platform android --profile production && eas submit --platform android
#    (eas.json submits to the internal track as a draft — nothing goes public by itself).
```

## Decisions for the owner

- **Reuse the GCP project for Firebase** (recommended, step 1) versus a separate Firebase project.
  Reusing keeps one billing account and one IAM surface; FCM itself is free either way.
- **Enhanced push security / `EXPO_ACCESS_TOKEN`** (step 4): on before Play release is recommended;
  without it anyone who learns an Expo token can send that device a notification via the public
  API. Turning it on with the secret unset would silently break iOS push too — set the secret
  first, deploy, then flip the switch.
- **Play developer account** (step 6) is a paid, identity-verified account; nothing in the repo
  depends on it until release.

## What this needs from the owner (not discoverable from the repo)
- Access to the Google account owning `padel-levelup-2026`, the `levapps-team` Expo organisation
  and the `PadelLevelUp/levapp` GitHub secrets.
- One physical Android phone (Android 13+ ideally, to see the permission prompt).
- Whether the Play listing reuses the App Store copy and screenshots (marketing constraint: no
  real names in screenshots).
