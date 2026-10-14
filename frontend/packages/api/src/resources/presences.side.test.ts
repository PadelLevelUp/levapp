import { describe, it, expect, vi } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";
import { initApi } from "../client";
import { setPresenceSide } from "./presences";
import type { TokenStorage } from "../storage";

const storage: TokenStorage = {
  getToken: vi.fn(async () => null),
  setToken: vi.fn(async () => {}),
  removeToken: vi.fn(async () => {}),
};

// classes.instance-enrollment rule 13 (PAD-551).
describe("setPresenceSide", () => {
  it("PUTs the side (or null) for one player in one occurrence", async () => {
    const client = initApi({ baseURL: "http://api.test", storage });
    const seen: InternalAxiosRequestConfig[] = [];
    client.defaults.adapter = async (config) => {
      seen.push(config);
      return { data: { playerId: 7, side: "right", sideOverride: true }, status: 200, statusText: "", headers: {}, config };
    };
    const occurrence = { id: "lesson-3-2026-10-22", originalId: "3", date: "2026-10-22" };
    const row = await setPresenceSide(occurrence, "7", "right");
    await setPresenceSide(occurrence, "7", null);
    expect(seen[0].method).toBe("put");
    expect(seen[0].url).toBe("/app/class_instance/presences/side");
    expect(JSON.parse(seen[0].data)).toEqual({
      classInstance: { id: "lesson-3-2026-10-22", originalId: "3", date: "2026-10-22", parentClassId: null },
      playerId: "7",
      side: "right",
    });
    expect(JSON.parse(seen[1].data).side).toBeNull();
    expect(row).toMatchObject({ side: "right", sideOverride: true });
  });
});
