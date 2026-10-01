/**
 * The visitor's cookie choice on the landing page (PAD-469, auth.landing-page
 * rules 11 and 13). Stored in localStorage as `{choice, at}`; a choice older
 * than 12 months counts as no choice, so the banner asks again (coordinator
 * decision 2026-10-01 — a conservative validity period, not a legal finding).
 */

import { isHubSpotCookie } from "./hubspotConfig";

export type ConsentChoice = "accepted" | "declined";

export const CONSENT_STORAGE_KEY = "levapp.cookieConsent";
export const CONSENT_MAX_AGE_MONTHS = 12;

interface StoredConsent {
  choice: ConsentChoice;
  at: string;
}

interface ReadResult {
  choice: ConsentChoice | null;
  /** A record was stored but is too old, so it no longer counts (rule 11). */
  expired: boolean;
}

function read(now: Date): ReadResult {
  let raw: string | null;
  try {
    raw = localStorage.getItem(CONSENT_STORAGE_KEY);
  } catch {
    return { choice: null, expired: false };
  }
  if (!raw) return { choice: null, expired: false };
  try {
    const stored = JSON.parse(raw) as Partial<StoredConsent>;
    if (stored.choice !== "accepted" && stored.choice !== "declined")
      return { choice: null, expired: false };
    const at = new Date(stored.at ?? "");
    if (Number.isNaN(at.getTime())) return { choice: null, expired: false };
    const expires = new Date(at);
    expires.setMonth(expires.getMonth() + CONSENT_MAX_AGE_MONTHS);
    return now < expires
      ? { choice: stored.choice, expired: false }
      : { choice: null, expired: true };
  } catch {
    return { choice: null, expired: false };
  }
}

/** The stored choice, or `null` when there is none, it is unreadable, or it has expired. */
export function readConsent(now: Date = new Date()): ConsentChoice | null {
  return read(now).choice;
}

/**
 * The choice the landing page acts on. An expired record is dropped and the
 * HubSpot cookies it allowed are expired with it, so a visitor whose consent
 * ran out carries no `hubspotutk` into the demo form (rule 11).
 */
export function loadConsent(
  now: Date = new Date(),
  doc: Document = document,
): ConsentChoice | null {
  const { choice, expired } = read(now);
  if (expired) {
    clearHubSpotCookies(doc);
    try {
      localStorage.removeItem(CONSENT_STORAGE_KEY);
    } catch {
      // Storage blocked: nothing stored to drop.
    }
  }
  return choice;
}

export function writeConsent(
  choice: ConsentChoice,
  now: Date = new Date(),
): void {
  const stored: StoredConsent = { choice, at: now.toISOString() };
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Storage blocked: the choice lasts for this page only, and the banner asks again next time.
  }
}


/** `levapp.app` and `staging.levapp.app` for `staging.levapp.app`; the host alone for `localhost`. */
function cookieDomains(hostname: string): string[] {
  const parts = hostname.split(".");
  const domains: string[] = [];
  for (let i = 0; i <= parts.length - 2; i++) {
    domains.push(parts.slice(i).join("."));
  }
  return domains.length ? domains : [hostname];
}

/**
 * Expire every HubSpot cookie this page can reach, on the host and each parent
 * domain (HubSpot sets its cookies on the top-level domain). Cookies HubSpot
 * keeps on its own domains are out of the page's reach.
 */
export function clearHubSpotCookies(doc: Document = document): void {
  const names = doc.cookie
    .split(";")
    .map((c) => c.split("=")[0].trim())
    .filter(isHubSpotCookie);
  const expired = "expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  for (const name of names) {
    doc.cookie = `${name}=; ${expired}`;
    for (const domain of cookieDomains(doc.location.hostname)) {
      doc.cookie = `${name}=; ${expired}; domain=${domain}`;
      doc.cookie = `${name}=; ${expired}; domain=.${domain}`;
    }
  }
}
