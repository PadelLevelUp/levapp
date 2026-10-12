/**
 * PAD-630 — auth.login rule 13: an account with no country is asked once after sign-in, on web and
 * iOS. The pure half: when to ask, and how long "Agora não" lasts on the device. Modelled on
 * `installSuggestionDismissal`; nothing here touches `window`.
 */

/** "Agora não" hides the prompt for this long on the device. */
export const COUNTRY_PROMPT_DISMISS_DAYS = 30;
export const COUNTRY_PROMPT_STORAGE_KEY = "levapp.countryPrompt.dismissedAt";

/** The slice of `Storage` the dismissal needs; `localStorage` on web, a cached adapter on iOS. */
export type CountryPromptStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

/**
 * The dismissal instant lives in the device's storage; a missing, malformed or future value counts
 * as not dismissed. Storage that throws never breaks the page: reads say "not dismissed", and a
 * dismissal is then remembered for the page's lifetime.
 */
export function countryPromptDismissal(storage: CountryPromptStorage | null | undefined) {
  const windowMs = COUNTRY_PROMPT_DISMISS_DAYS * 24 * 60 * 60 * 1000;
  let inMemory: number | null = null;

  const read = (): number | null => {
    if (inMemory !== null) return inMemory;
    try {
      const raw = storage?.getItem(COUNTRY_PROMPT_STORAGE_KEY);
      if (raw === null || raw === undefined || raw.trim() === "") return null;
      const at = Number(raw);
      return Number.isFinite(at) && at > 0 ? at : null;
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
        storage?.setItem(COUNTRY_PROMPT_STORAGE_KEY, String(now));
      } catch {
        // private mode / quota: the in-memory copy carries the page
      }
    },
  };
}

/**
 * Rule 13: ask a signed-in user whose `/auth/me` country is null or empty, unless they said
 * "Agora não" lately or the app is holding them on another screen (the email-code screen, a
 * pending coach's waiting screen).
 */
export function shouldAskCountry(
  me: { country?: string | null } | null | undefined,
  state: { dismissed: boolean; gated: boolean }
): boolean {
  if (!me || state.dismissed || state.gated) return false;
  return (me.country ?? "").trim() === "";
}
