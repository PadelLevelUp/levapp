---
path: frontend/apps/mobile/src/lib/config.ts
extracted_at: 2026-09-03T14:11:46Z
extraction_level: 3
size_lines: 49
size_tokens: 649
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "ad3824dcc2a70d7c5a9cdfcb95cee9916eb57ba56b17be277b4a0f01ed127ae0"
---

## Purpose

The single source of truth for the app's production API URL and public web-app URL, plus the derived legal-page URLs (privacy/terms) linked from Settings for App Store 5.1.1 compliance. Deliberately hardcodes production defaults rather than relying solely on environment variables, after a real App Store rejection traced to the opposite design.

## Main players

- `API_URL` (lines 25–29) — critical. `EXPO_PUBLIC_API_URL` env override, else `__DEV__ ? DEV_API_URL : PRODUCTION_API_URL` (`http://localhost:5001/api` vs `https://padellevelup.com/api`).
- `WEB_APP_URL` (line 46) — critical. `EXPO_PUBLIC_WEB_URL` env override, else the hardcoded `https://www.padellevelup.com`.
- `PRIVACY_POLICY_URL`, `TERMS_URL` (lines 47–48) — supporting. Derived from `WEB_APP_URL` + `/privacy` / `/terms`.

## Insights

- The extensive comment block on `API_URL` documents a real production incident: this previously defaulted to the local E2E backend (`localhost:5001/api`) whenever `EXPO_PUBLIC_API_URL` was unset, which is unreachable from a real device — this caused a silent "Could not sign in" failure on the App Store review build and a Guideline 2.1(a) rejection on 2026-07-24. The fix relies on `__DEV__`, which Metro/`react-native-xcode.sh` sets from the Xcode CONFIGURATION (Debug vs Release) at bundle time — archive/release builds always set Release — rather than trusting an env var alone to be exported correctly in whatever ad-hoc shell invoked the build.
- A now-resolved comment flag in the source history questioned whether `padellevelup.com` was a confirmed public domain; the file's current comment records it as product-owner-confirmed (2026-07) and notes it resolves only because `apps/web` (owner of `/privacy` and `/terms`) is served there with SPA fallback — `EXPO_PUBLIC_WEB_URL` remains the override point for a different subdomain.
- `EXPO_PUBLIC_API_URL` is explicitly documented as a LOCAL-DEV-ONLY override (pointing a dev-client build at `:5000`, or a LAN IP for a physical device) — it must never be treated as the sole source of truth for what a production build talks to, since env vars can leak into or be absent from an ad-hoc build shell unpredictably.

## Connections

Uses: none (no imports; pure constants derived from `process.env` and `__DEV__`).

Used by: no in-scope file is captured in L1's structural edges (only `frontend/apps/mobile/src/lib/api.ts` → this file is a genuine L1-resolved structural edge), but by direct reading `API_URL` is also consumed by `frontend/apps/mobile/src/lib/sse.ts`, and `WEB_APP_URL` by `frontend/apps/mobile/app/player/new.tsx` (both via the unresolved `@/lib/config` alias).

## Query pointers

If a build talks to the wrong backend, read the `API_URL` comment block first — it explains exactly why `__DEV__` (not an env var) is the primary switch, and cites the specific rejection this design prevents.
If the privacy/terms links 404, check whether `apps/web`'s `/privacy` and `/terms` routes (outside this scope) are actually served at whatever `WEB_APP_URL` currently resolves to.
