/**
 * PAD-573 — mobile.install-suggestion, the pure half (rule 8): who is offered the iOS app, on
 * which browsers, and how long a dismissal lasts. The web banner (`InstallAppBanner`) wires
 * these to the DOM; nothing here touches `window`.
 */

/** The App Store Connect app id (TestFlight upload notes); the repo had no store configuration before. */
export const APP_STORE_ID = "6794271800";
export const APP_STORE_URL = `https://apps.apple.com/app/id${APP_STORE_ID}`;

/** Rule 3: a dismissal hides the card for this long on the device. */
export const INSTALL_SUGGESTION_DISMISS_DAYS = 30;
export const INSTALL_SUGGESTION_STORAGE_KEY = "levapp.installSuggestion.dismissedAt";

/**
 * Rule 1: iPhone-class only. iPadOS Safari presents a Macintosh user agent and is a tablet, so
 * it is out by construction; Android and desktop never match.
 */
export function isIphoneClassUserAgent(userAgent: string | null | undefined): boolean {
  return /\b(iPhone|iPod)\b/.test(userAgent ?? "");
}

/** Rule 1: a signed-in student (no `coach` role) on an iPhone-class browser. */
export function suggestsIosApp(
  user: { roles?: string[] | null } | null | undefined,
  userAgent: string | null | undefined
): boolean {
  if (!user) return false;
  if ((user.roles ?? []).includes("coach")) return false;
  return isIphoneClassUserAgent(userAgent);
}

/** The slice of `Storage` the dismissal needs; `localStorage` on web. */
export type InstallSuggestionStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

/**
 * Rule 3: the dismissal instant lives in the device's storage; a missing, malformed or future
 * value counts as not dismissed. Storage that throws (private mode, quota) never breaks the
 * page: reads say "not dismissed", and a dismissal is then remembered for the page's lifetime.
 */
export function installSuggestionDismissal(storage: InstallSuggestionStorage | null | undefined) {
  const windowMs = INSTALL_SUGGESTION_DISMISS_DAYS * 24 * 60 * 60 * 1000;
  let inMemory: number | null = null;

  const read = (): number | null => {
    if (inMemory !== null) return inMemory;
    try {
      const raw = storage?.getItem(INSTALL_SUGGESTION_STORAGE_KEY);
      if (raw === null || raw === undefined) return null;
      const at = Number(raw);
      return Number.isFinite(at) ? at : null;
    } catch {
      return null;
    }
  };

  return {
    isDismissed(now: number = Date.now()): boolean {
      const at = read();
      if (at === null || at > now) return false;
      return now - at < windowMs;
    },
    dismiss(now: number = Date.now()): void {
      inMemory = now;
      try {
        storage?.setItem(INSTALL_SUGGESTION_STORAGE_KEY, String(now));
      } catch {
        // private mode / quota: the in-memory copy carries the page
      }
    },
  };
}
