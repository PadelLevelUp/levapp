import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
let failing = false;
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (k: string) => {
    if (failing) throw new Error("unavailable");
    return store.get(k) ?? null;
  },
  setItemAsync: async (k: string, v: string) => {
    if (failing) throw new Error("unavailable");
    store.set(k, v);
  },
}));

import { dismissSameDayDefaultNote, loadSameDayDefaultNoteDismissed } from "./same-day-default-note-storage";

describe("same-day default note storage (PAD-685)", () => {
  beforeEach(() => {
    store.clear();
    failing = false;
  });

  it("reads null until dismissed, then the stored mark", async () => {
    expect(await loadSameDayDefaultNoteDismissed()).toBeNull();
    dismissSameDayDefaultNote();
    await Promise.resolve();
    expect(store.get("levapp.sameDayDefaultNote.dismissed")).toBe("1");
    expect(await loadSameDayDefaultNoteDismissed()).toBe("1");
  });

  it("never throws when storage is unavailable", async () => {
    failing = true;
    expect(await loadSameDayDefaultNoteDismissed()).toBeNull();
    expect(() => dismissSameDayDefaultNote()).not.toThrow();
  });
});
