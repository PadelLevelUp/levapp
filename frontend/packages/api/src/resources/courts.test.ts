import { describe, it, expect, vi, beforeEach } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";
import { initApi } from "../client";
import * as courtsApi from "./courts";
import type { TokenStorage } from "../storage";

const storage: TokenStorage = {
  getToken: vi.fn(async () => null),
  setToken: vi.fn(async () => {}),
  removeToken: vi.fn(async () => {}),
};

function installSingleton(data: unknown = {}, status = 200) {
  const client = initApi({ baseURL: "http://api.test", storage });
  const seen: InternalAxiosRequestConfig[] = [];
  client.defaults.adapter = async (config) => {
    seen.push(config);
    return { data, status, statusText: "", headers: {}, config };
  };
  return seen;
}

beforeEach(() => {
  vi.clearAllMocks();
});

const COURT = { id: 3, clubId: 1, name: "Campo 1", position: 0 };

describe("courtsApi", () => {
  it("lists a club's courts", async () => {
    const seen = installSingleton([COURT]);
    expect(await courtsApi.listCourts(1)).toEqual([COURT]);
    expect(seen[0].method?.toUpperCase()).toBe("GET");
    expect(seen[0].url).toBe("/app/club/1/courts");
  });

  it("creates a court with its name", async () => {
    const seen = installSingleton(COURT, 201);
    expect(await courtsApi.createCourt(1, "Campo 1")).toEqual(COURT);
    expect(seen[0].method?.toUpperCase()).toBe("POST");
    expect(seen[0].url).toBe("/app/club/1/courts");
    expect(JSON.parse(String(seen[0].data))).toEqual({ name: "Campo 1" });
  });

  it("renames and deletes by court id", async () => {
    let seen = installSingleton({ ...COURT, name: "Central" });
    expect((await courtsApi.renameCourt(3, "Central")).name).toBe("Central");
    expect(seen[0].method?.toUpperCase()).toBe("PATCH");
    expect(seen[0].url).toBe("/app/courts/3");
    seen = installSingleton("", 204);
    await courtsApi.deleteCourt(3);
    expect(seen[0].method?.toUpperCase()).toBe("DELETE");
    expect(seen[0].url).toBe("/app/courts/3");
  });

  it("reorders with the full id list", async () => {
    const seen = installSingleton([COURT]);
    await courtsApi.reorderCourts(1, [3, 2]);
    expect(seen[0].method?.toUpperCase()).toBe("PUT");
    expect(seen[0].url).toBe("/app/club/1/courts/order");
    expect(JSON.parse(String(seen[0].data))).toEqual({ ids: [3, 2] });
  });
});
