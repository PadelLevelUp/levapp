import { describe, it, expect, vi, beforeEach } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";
import { initApi } from "../client";
import * as playersApi from "./players";
import * as evaluationApi from "./evaluation";
import type { TokenStorage } from "../storage";

// PAD-274: players.remove rules 1, 4, 7 and evaluations.categories rule 7.

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

describe("removing a player", () => {
  it("sends the chosen action", async () => {
    const seen = installSingleton({ status: "ok" });
    await playersApi.removePlayer("4", "9", "disconnect");
    expect(seen[0].url).toBe("/app/remove_player");
    expect(JSON.parse(String(seen[0].data))).toEqual({ coachId: "4", playerId: "9", action: "disconnect" });
  });

  it("sends no action when none is given, as clients before PAD-274 did", async () => {
    const seen = installSingleton({ status: "ok" });
    await playersApi.removePlayer("4", "9");
    expect(JSON.parse(String(seen[0].data))).toEqual({ coachId: "4", playerId: "9" });
  });

  it("reads the removal impact for the player", async () => {
    const impact = { action: "delete", notes: 0, evaluations: 0, presences: 2 };
    const seen = installSingleton(impact);
    expect(await playersApi.getPlayerRemovalImpact("9")).toEqual(impact);
    expect(seen[0].method?.toUpperCase()).toBe("GET");
    expect(seen[0].url).toBe("/app/player/9/removal_impact");
  });

  it("names the refusal code of a refused removal and nothing else", () => {
    const refused = (code: unknown) => ({ response: { status: 409, data: { code } } });
    expect(playersApi.removePlayerErrorCode(refused("PLAYER_HAS_ACCOUNT"))).toBe("PLAYER_HAS_ACCOUNT");
    expect(playersApi.removePlayerErrorCode(refused("PLAYER_HAS_OTHER_COACHES"))).toBe("PLAYER_HAS_OTHER_COACHES");
    expect(playersApi.removePlayerErrorCode(refused("SOMETHING_ELSE"))).toBeNull();
    expect(playersApi.removePlayerErrorCode(new Error("network"))).toBeNull();
    expect(playersApi.removePlayerErrorCode(null)).toBeNull();
  });
});

describe("deleting an evaluation category", () => {
  it("reads the category's impact", async () => {
    const impact = { name: "Serve", scores: 3, players: 2 };
    const seen = installSingleton(impact);
    expect(await evaluationApi.getEvaluationCategoryImpact("12")).toEqual(impact);
    expect(seen[0].method?.toUpperCase()).toBe("GET");
    expect(seen[0].url).toBe("/app/evaluation_category/12/impact");
  });
});
