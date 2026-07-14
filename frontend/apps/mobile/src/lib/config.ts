/**
 * API base URL. The iOS simulator shares the Mac's network, so localhost
 * reaches the Flask dev server directly. Override per environment with
 * EXPO_PUBLIC_API_URL (e.g. a LAN IP for physical devices).
 */
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:5001/api";

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
const WEB_APP_URL = process.env.EXPO_PUBLIC_WEB_URL ?? "https://levelup.app";
export const PRIVACY_POLICY_URL = `${WEB_APP_URL}/privacy`;
export const TERMS_URL = `${WEB_APP_URL}/terms`;
