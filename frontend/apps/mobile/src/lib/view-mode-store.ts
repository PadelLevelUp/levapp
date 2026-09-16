import type { CalendarViewMode } from "@levelup/hooks";
import * as SecureStore from "expo-secure-store";

/**
 * PAD-246 (calendar.mobile-views rule 1): the phone calendar's view mode is
 * remembered on the device. `expo-secure-store` is used because it is already
 * a dependency — a UI preference does not need a new native module, and
 * AsyncStorage would have meant a dev-client rebuild.
 */
const KEY = "levapp.calendar.viewMode";

export async function readViewMode(
  enabled: CalendarViewMode[]
): Promise<CalendarViewMode> {
  try {
    const stored = await SecureStore.getItemAsync(KEY);
    if (stored && enabled.includes(stored as CalendarViewMode)) {
      return stored as CalendarViewMode;
    }
  } catch {
    // Storage unavailable — fall through to the default.
  }
  return "day";
}

export function writeViewMode(mode: CalendarViewMode): void {
  SecureStore.setItemAsync(KEY, mode).catch(() => {
    // Best effort — the mode still applies for this session.
  });
}
