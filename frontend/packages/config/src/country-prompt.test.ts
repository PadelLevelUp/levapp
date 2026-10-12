/**
 * PAD-630 — auth.login rule 13: the country is asked once after sign-in when /auth/me says null.
 * The dismissal mirrors the install suggestion's (30 days on the device); the ask itself is pure.
 */
import { describe, expect, it } from "vitest";
import {
  COUNTRY_PROMPT_DISMISS_DAYS,
  COUNTRY_PROMPT_STORAGE_KEY,
  countryPromptDismissal,
  shouldAskCountry,
} from "./country-prompt";

const DAY = 24 * 60 * 60 * 1000;
function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), map };
}

describe("the 30-day dismissal on the device", () => {
  it("is 30 days under the documented key", () => {
    expect(COUNTRY_PROMPT_DISMISS_DAYS).toBe(30);
    expect(COUNTRY_PROMPT_STORAGE_KEY).toBe("levapp.countryPrompt.dismissedAt");
  });

  it("not dismissed until dismissed; then hidden for 30 days, back on the 31st", () => {
    const storage = memoryStorage();
    const d = countryPromptDismissal(storage);
    const t0 = Date.UTC(2026, 9, 11, 12);
    expect(d.isDismissed(t0)).toBe(false);
    d.dismiss(t0);
    expect(storage.map.get(COUNTRY_PROMPT_STORAGE_KEY)).toBe(String(t0));
    expect(d.isDismissed(t0 + 29 * DAY)).toBe(true);
    expect(d.isDismissed(t0 + 30 * DAY - 1)).toBe(true);
    expect(d.isDismissed(t0 + 31 * DAY)).toBe(false);
  });

  it("a malformed, empty or future value counts as not dismissed", () => {
    const now = Date.UTC(2026, 9, 11);
    for (const raw of ["soon", "", "  ", String(now + DAY)]) {
      expect(countryPromptDismissal(memoryStorage({ [COUNTRY_PROMPT_STORAGE_KEY]: raw })).isDismissed(now)).toBe(false);
    }
  });

  it("storage that throws never breaks the page: not dismissed, and the dismissal lasts the page only", () => {
    const d = countryPromptDismissal({
      getItem: () => { throw new Error("SecurityError"); },
      setItem: () => { throw new Error("QuotaExceededError"); },
    });
    const now = Date.UTC(2026, 9, 11);
    expect(d.isDismissed(now)).toBe(false);
    expect(() => d.dismiss(now)).not.toThrow();
    expect(d.isDismissed(now + 1)).toBe(true);
  });

  it("no storage at all behaves the same", () => {
    const d = countryPromptDismissal(null);
    expect(d.isDismissed()).toBe(false);
    d.dismiss();
    expect(d.isDismissed()).toBe(true);
  });

  it("does not share state with the install suggestion's key", () => {
    expect(COUNTRY_PROMPT_STORAGE_KEY).not.toBe("levapp.installSuggestion.dismissedAt");
  });
});

describe("shouldAskCountry", () => {
  const open = { dismissed: false, gated: false };
  it("asks a signed-in user whose country is null, empty or missing", () => {
    expect(shouldAskCountry({ country: null }, open)).toBe(true);
    expect(shouldAskCountry({ country: "" }, open)).toBe(true);
    expect(shouldAskCountry({ country: "  " }, open)).toBe(true);
    expect(shouldAskCountry({}, open)).toBe(true);
  });
  it("never asks a user whose country is set", () => {
    expect(shouldAskCountry({ country: "PT" }, open)).toBe(false);
  });
  it("never asks nobody", () => {
    expect(shouldAskCountry(null, open)).toBe(false);
    expect(shouldAskCountry(undefined, open)).toBe(false);
  });
  it("not when dismissed, not when gated", () => {
    expect(shouldAskCountry({ country: null }, { dismissed: true, gated: false })).toBe(false);
    expect(shouldAskCountry({ country: null }, { dismissed: false, gated: true })).toBe(false);
  });
});
