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
    const row = await setPresenceSide("12", "7", "right");
    await setPresenceSide("12", "7", null);
    expect(seen[0].method).toBe("put");
    expect(seen[0].url).toBe("/app/lesson_instance/12/presences/7/side");
    expect(JSON.parse(seen[0].data)).toEqual({ side: "right" });
    expect(JSON.parse(seen[1].data)).toEqual({ side: null });
    expect(row).toMatchObject({ side: "right", sideOverride: true });
  });
});
