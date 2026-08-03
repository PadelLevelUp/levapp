/**
 * API base URL.
 *
 * Production builds must ALWAYS default to the hosted production API,
 * regardless of how the app was archived (raw `xcodebuild archive`,
 * `expo run:ios --configuration Release`, or a future EAS build) and
 * regardless of whether EXPO_PUBLIC_API_URL happened to be exported in
 * whatever ad-hoc shell ran that build. This previously defaulted to the
 * local E2E backend (http://localhost:5001/api) whenever the env var was
 * unset — unreachable from a real device, which caused a silent "Could not
 * sign in" failure on the App Store review build (Guideline 2.1(a) rejection,
 * 2026-07-24).
 *
 * __DEV__ is set by Metro/react-native-xcode.sh at bundle time based on the
 * Xcode CONFIGURATION (Debug vs Release), which archive/release builds
 * always set to Release — so this is reliable independent of the exact
 * command used to invoke the build, unlike relying solely on an env var.
 *
 * The iOS simulator shares the Mac's network, so localhost reaches the Flask
 * dev server directly in dev builds. EXPO_PUBLIC_API_URL remains available
 * purely as a local-dev override (e.g. pointing a dev-client build at the
 * dev backend on :5000, or a LAN IP for a physical device) — it must never
 * be the sole source of truth for what a production build talks to.
 */
const PRODUCTION_API_URL = "https://padellevelup.com/api";
const DEV_API_URL = "http://localhost:5001/api";

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? (__DEV__ ? DEV_API_URL : PRODUCTION_API_URL);

/**
 * Hosted legal pages (web app's /privacy and /terms routes), linked from
 * Settings for App Store 5.1.1 compliance.
 *
 * FLAG: no confirmed public DNS domain was found anywhere in this repo (no
 * nginx/deploy config, app.json, or README references one — prod currently
 * serves from the GCE VM's bare external IP, 34.78.247.45). "levelup.app" is
 * a placeholder guess, NOT a verified/owned domain. The orchestrator/user
 * MUST confirm (or replace with) the real public domain — ideally via
 * EXPO_PUBLIC_WEB_URL — before App Store submission, since Apple requires a
 * working, publicly reachable privacy policy URL.
 */
// Public domain confirmed by product owner (2026-07): padellevelup.com.
// Resolves only if apps/web (owner of /privacy + /terms) is served here with
// SPA fallback; override via EXPO_PUBLIC_WEB_URL for a different subdomain.
const WEB_APP_URL = process.env.EXPO_PUBLIC_WEB_URL ?? "https://www.padellevelup.com";
export const PRIVACY_POLICY_URL = `${WEB_APP_URL}/privacy`;
export const TERMS_URL = `${WEB_APP_URL}/terms`;
