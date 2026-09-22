import { describe, it, expect } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";
import { api } from "./client";

/**
 * PAD-352 (`eligibility.open-spot-visibility` rule 12): the web shell renders
 * open spots (rule 11), so it declares `open-spots`. Without the declaration the
 * server sends no open-spot events and refuses to open one by id, and a web
 * student would silently lose the feature. Nothing would crash, which is why
 * this is tested rather than assumed.
 */
describe("web API client declares its capabilities (PAD-352)", () => {
  it("sends X-LevApp-Capabilities with open-spots through the real client", async () => {
    const seen: InternalAxiosRequestConfig[] = [];
    const original = api.defaults.adapter;
    api.defaults.adapter = async (config) => {
      seen.push(config);
      return { data: [], status: 200, statusText: "", headers: {}, config };
    };
    try {
      await api.get("/app/calendar");
    } finally {
      api.defaults.adapter = original;
    }
    expect(seen).toHaveLength(1);
    const declared = String(seen[0].headers["X-LevApp-Capabilities"] ?? "")
      .split(",")
      .map((token) => token.trim().toLowerCase());
    expect(declared).toContain("open-spots");
    expect(declared).toContain("evaluations"); // PAD-364: declared, consumed by nothing yet
  });
});
