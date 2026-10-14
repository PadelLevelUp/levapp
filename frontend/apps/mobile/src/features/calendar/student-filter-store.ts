import {
  parseStudentFilter,
  STUDENT_FILTER_DEFAULT,
  studentFilterStorageKey,
  type StudentCalendarFilter,
} from "@levelup/config";
import * as SecureStore from "expo-secure-store";

/**
 * PAD-664 (calendar.view rule 23): the student's calendar filter is remembered per student on
 * the device. `expo-secure-store` is what the app already uses for UI preferences
 * (`view-mode-store.ts`); the read/write logic takes the store as an argument so it stays pure.
 */
export interface FilterKeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

const secureStore: FilterKeyValueStore = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
};

export async function readStudentFilter(
  userId: string | number,
  store: FilterKeyValueStore = secureStore
): Promise<StudentCalendarFilter> {
  try {
    return parseStudentFilter(await store.getItem(studentFilterStorageKey(userId)));
  } catch {
    return STUDENT_FILTER_DEFAULT;
  }
}

export async function writeStudentFilter(
  userId: string | number,
  filter: StudentCalendarFilter,
  store: FilterKeyValueStore = secureStore
): Promise<void> {
  try {
    await store.setItem(studentFilterStorageKey(userId), filter);
  } catch {
    // Best effort — the choice still applies for this session.
  }
}
