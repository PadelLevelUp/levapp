import {
  SAME_DAY_DEFAULT_NOTE_DISMISSED,
  SAME_DAY_DEFAULT_NOTE_STORAGE_KEY,
} from "@levelup/config";
import * as SecureStore from "expo-secure-store";

/**
 * PAD-685: the device's memory of the one-time "same-day class now on by default" note. Async
 * read, best-effort write, on `expo-secure-store` as `country-prompt-storage.ts` does — a UI
 * preference needs no new native module. Storage that throws reads as "not dismissed".
 */
export async function loadSameDayDefaultNoteDismissed(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SAME_DAY_DEFAULT_NOTE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function dismissSameDayDefaultNote(): void {
  SecureStore.setItemAsync(SAME_DAY_DEFAULT_NOTE_STORAGE_KEY, SAME_DAY_DEFAULT_NOTE_DISMISSED).catch(
    () => undefined,
  );
}
