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
 * touching the network. The resource modules call `getApi()` per request, so
 * re-running `initApi` between tests is enough to isolate them.
 */
function installSingleton(data: unknown = {}) {
  const client = initApi({ baseURL: "http://api.test", storage });
  const seen: InternalAxiosRequestConfig[] = [];
  client.defaults.adapter = async (config) => {
    seen.push(config);
    return {
      data,
      status: 200,
      statusText: "",
      headers: {},
      config,
    };
  };
  return seen;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("seasonsApi.getSeasons", () => {
  it("GETs /app/seasons and returns the rows unchanged", async () => {
    // The backend really does send `id` as a number even though `Season`
    // declares a string — the resource must round-trip it, not coerce it.
    const rows = [
      { id: 1, name: "Autumn 2026", startDate: "2026-08-08", endDate: "2026-11-08" },
    ];
    const seen = installSingleton(rows);

    const result = await seasonsApi.getSeasons();

    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("get");
    expect(seen[0].url).toBe("/app/seasons");
    expect(result).toEqual(rows);
  });
});

describe("seasonsApi.addSeasons", () => {
  it("POSTs the upsert array verbatim to /app/add_seasons", async () => {
    const seen = installSingleton([]);

    // PAD-89 / spec `calendar.seasons` rule 3: an entry carrying `id` updates
    // that season in place, one without it creates a new season. The array
    // must reach the backend unwrapped — no envelope, no reordering.
    const payload = [
      { id: 1, name: "Autumn 2026", startDate: "2026-08-08", endDate: "2026-11-08" },
      { name: "Spring 2027", startDate: "2027-03-01", endDate: "2027-05-31" },
    ];
    await seasonsApi.addSeasons(payload);

    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("post");
    expect(seen[0].url).toBe("/app/add_seasons");
    expect(JSON.parse(seen[0].data)).toEqual(payload);
  });

  it("returns the season list the backend echoes back", async () => {
    const updated = [
      { id: 7, name: "Autumn 2026", startDate: "2026-08-08", endDate: "2026-11-08" },
    ];
    installSingleton(updated);

    await expect(
      seasonsApi.addSeasons([
        { name: "Autumn 2026", startDate: "2026-08-08", endDate: "2026-11-08" },
      ])
    ).resolves.toEqual(updated);
  });
});

describe("seasonsApi.deleteSeason", () => {
  it("POSTs { id } to /app/delete/season", async () => {
    const seen = installSingleton({});

    // Spec rule 4: removal is explicit and only ever happens here — a batch
    // save never deletes.
    await seasonsApi.deleteSeason(12);

    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("post");
    expect(seen[0].url).toBe("/app/delete/season");
    expect(JSON.parse(seen[0].data)).toEqual({ id: 12 });
  });

  it("accepts a string id, as the web shell passes", async () => {
    const seen = installSingleton({});

    await seasonsApi.deleteSeason("12");

    expect(JSON.parse(seen[0].data)).toEqual({ id: "12" });
  });
});
