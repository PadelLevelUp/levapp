import { describe, it, expect, vi, beforeEach } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";
import { initApi } from "../client";
import * as calendarApi from "./calendar";
import type { TokenStorage } from "../storage";

const storage: TokenStorage = {
  getToken: vi.fn(async () => null),
  setToken: vi.fn(async () => {}),
  removeToken: vi.fn(async () => {}),
};

/**
 * Registers the singleton `getApi()` resolves to and hands back the configs its
 * adapter saw, so each test can assert on the outgoing method/URL/body without
 * touching the network. Mirrors `seasons.test.ts`.
 */
function installSingleton(data: unknown = {}) {
  const client = initApi({ baseURL: "http://api.test", storage });
  const seen: InternalAxiosRequestConfig[] = [];
  client.defaults.adapter = async (config) => {
    seen.push(config);
    return {
      data,
      status: 204,
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

describe("calendarApi.deleteCalendarBlock", () => {
  it("sends an empty JSON body when no scope is given (one-off event)", async () => {
    const seen = installSingleton();

    // PAD-160 / bug B-021: with `{ data: undefined }` axios sends no body and
    // strips `Content-Type`, and Flask's `request.get_json()` answers 415 — the
    // block survived and the app showed "failed to delete". A one-off delete
    // must carry a JSON body even though it has nothing to say.
    await calendarApi.deleteCalendarBlock(7);

    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("delete");
    expect(seen[0].url).toBe("/app/calendar_block/7");
    expect(seen[0].data).toBeDefined();
    expect(JSON.parse(seen[0].data as string)).toEqual({});
    expect(
      String(seen[0].headers?.["Content-Type"] ?? seen[0].headers?.["content-type"])
    ).toContain("application/json");
  });

  it("still sends { occDate, scope } for a recurring occurrence", async () => {
    const seen = installSingleton();

    await calendarApi.deleteCalendarBlock(9, {
      occDate: "2026-09-08",
      scope: "single",
    });

    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("delete");
    expect(seen[0].url).toBe("/app/calendar_block/9");
    expect(JSON.parse(seen[0].data as string)).toEqual({
      occDate: "2026-09-08",
      scope: "single",
    });
  });
});
