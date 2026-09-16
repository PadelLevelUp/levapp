import { describe, it, expect, vi, beforeEach } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";
import { initApi } from "../client";
import * as seasonsApi from "./seasons";
import type { TokenStorage } from "../storage";

const storage: TokenStorage = {
  getToken: vi.fn(async () => null),
  setToken: vi.fn(async () => {}),
  removeToken: vi.fn(async () => {}),
};

/**
 * Registers the singleton `getApi()` resolves to and hands back the configs its
 * adapter saw, so each test can assert on the outgoing method/URL/body without
 * touching the network.
 */
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

const DEFINITION = {
  label: "Época",
  startDay: 1,
  startMonth: 9,
  endDay: 31,
  endMonth: 7,
  wrapsYear: true,
  needsReview: false,
  current: { startDate: "2026-09-01", endDate: "2027-07-31", label: "Época" },
  upcoming: { startDate: "2027-09-01", endDate: "2028-07-31", label: "Época" },
};

describe("seasonsApi.getSeason", () => {
  it("GETs /app/season and returns the definition unchanged", async () => {
    const seen = installSingleton(DEFINITION);
    const result = await seasonsApi.getSeason();
    expect(seen[0].method?.toUpperCase()).toBe("GET");
    expect(seen[0].url).toBe("/app/season");
    expect(result).toEqual(DEFINITION);
  });

  it("returns null when the coach has no season", async () => {
    installSingleton(null);
    expect(await seasonsApi.getSeason()).toBeNull();
  });
});

describe("seasonsApi.saveSeason", () => {
  it("PUTs the day/month fields verbatim to /app/season", async () => {
    const seen = installSingleton(DEFINITION);
    const body = { label: "Época", startDay: 1, startMonth: 9, endDay: 31, endMonth: 7 };
    const result = await seasonsApi.saveSeason(body);
    expect(seen[0].method?.toUpperCase()).toBe("PUT");
    expect(seen[0].url).toBe("/app/season");
    expect(JSON.parse(String(seen[0].data))).toEqual(body);
    expect(result).toEqual(DEFINITION);
  });
});

describe("seasonsApi.deleteSeason", () => {
  it("DELETEs /app/season", async () => {
    const seen = installSingleton("", 204);
    await seasonsApi.deleteSeason();
    expect(seen[0].method?.toUpperCase()).toBe("DELETE");
    expect(seen[0].url).toBe("/app/season");
  });
});
