import { STUDENT_FILTER_DEFAULT, studentFilterStorageKey } from "@levelup/config";
import { describe, expect, it, vi } from "vitest";

vi.mock("expo-secure-store", () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn() }));

import { readStudentFilter, writeStudentFilter, type FilterKeyValueStore } from "./student-filter-store";

function memoryStore(initial: Record<string, string> = {}): FilterKeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: async (k) => data[k] ?? null,
    setItem: async (k, v) => {
      data[k] = v;
    },
  };
}

describe("student calendar filter persistence (PAD-664)", () => {
  it("defaults to eligible when nothing is stored", async () => {
    expect(await readStudentFilter(7, memoryStore())).toBe(STUDENT_FILTER_DEFAULT);
  });

  it("round-trips per student under the shared key", async () => {
    const store = memoryStore();
    await writeStudentFilter(7, "mine", store);
    expect(store.data[studentFilterStorageKey(7)]).toBe("mine");
    expect(await readStudentFilter(7, store)).toBe("mine");
    expect(await readStudentFilter(8, store)).toBe("eligible");
  });

  it("ignores garbage and swallows storage errors", async () => {
    expect(await readStudentFilter(7, memoryStore({ [studentFilterStorageKey(7)]: "nope" }))).toBe("eligible");
    const broken: FilterKeyValueStore = {
      getItem: async () => {
        throw new Error("x");
      },
      setItem: async () => {
        throw new Error("x");
      },
    };
    expect(await readStudentFilter(7, broken)).toBe("eligible");
    await expect(writeStudentFilter(7, "mine", broken)).resolves.toBeUndefined();
  });
});
