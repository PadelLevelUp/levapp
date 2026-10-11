import { COUNTRY_PROMPT_STORAGE_KEY, type CountryPromptStorage } from "@levelup/config";
import * as SecureStore from "expo-secure-store";

/**
 * PAD-630: the device's key-value store for the country prompt's dismissal. `expo-secure-store`
 * is async and the shared dismissal is synchronous, so the stored instant is read once up front
 * into a cache the shared store reads; a write updates the cache and goes to SecureStore best
 * effort (as `view-mode-store.ts` does — a UI preference needs no new native module).
 */
export async function loadCountryPromptStorage(): Promise<CountryPromptStorage> {
  const cache = new Map<string, string>();
  try {
    const stored = await SecureStore.getItemAsync(COUNTRY_PROMPT_STORAGE_KEY);
    if (stored !== null) cache.set(COUNTRY_PROMPT_STORAGE_KEY, stored);
  } catch {
    // Storage unavailable: not dismissed; a dismissal then lasts the session.
  }
  return {
    getItem: (key) => cache.get(key) ?? null,
    setItem: (key, value) => {
      cache.set(key, value);
      SecureStore.setItemAsync(key, value).catch(() => undefined);
    },
  };
}
