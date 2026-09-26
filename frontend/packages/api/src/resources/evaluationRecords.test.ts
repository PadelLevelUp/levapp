import { describe, it, expect, vi, beforeEach } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";
import { initApi } from "../client";
import * as api from "./evaluationRecords";
import type { TokenStorage } from "../storage";

// PAD-364: the v2 evaluation API. The contract depends on falsy values reaching
// the server as sent (B-136 is a server-side layer that dropped them): this file
// pins that the client module never strips `false`, `0`, `""` or `null`, and
// never invents a key the caller left out.

const storage: TokenStorage = {
  getToken: vi.fn(async () => null),
  setToken: vi.fn(async () => {}),
  removeToken: vi.fn(async () => {}),
};

function install(data: unknown = {}) {
  const client = initApi({ baseURL: "http://api.test", storage });
  const seen: InternalAxiosRequestConfig[] = [];
  client.defaults.adapter = async (config) => {
    seen.push(config);
    return { data, status: 200, statusText: "", headers: {}, config };
  };
  return seen;
}

const body = (config: InternalAxiosRequestConfig) => JSON.parse(String(config.data));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("competencies", () => {
  it("switching off and ordering first send false and 0 as they are", async () => {
    const seen = install({});
    await api.updateEvaluationCompetency(7, { isActive: false, sortOrder: 0 });
    expect(seen[0].method).toBe("patch");
    expect(seen[0].url).toBe("/app/evaluation_competency/7");
    expect(body(seen[0])).toEqual({ isActive: false, sortOrder: 0 });
  });

  it("a patch carries only the keys it was given", async () => {
    const seen = install({});
    await api.updateEvaluationCompetency(7, { name: "Grit" });
    expect(Object.keys(body(seen[0]))).toEqual(["name"]);
  });

  it("a built-in is switched on by key and a custom one created by name", async () => {
    const seen = install({});
    await api.switchOnCatalogueCompetency("bandeja");
    await api.createCustomCompetency("Grit");
    expect(seen.map((c) => [c.method, c.url, body(c)])).toEqual([
      ["post", "/app/evaluation_competency", { catalogueKey: "bandeja" }],
      ["post", "/app/evaluation_competency", { name: "Grit" }],
    ]);
  });

  it("a sub-category is created under its category by parentId (PAD-431, rule 15)", async () => {
    const seen = install({});
    await api.createCustomCompetency("Recuperação", 5);
    expect(seen.map((c) => [c.method, c.url, body(c)])).toEqual([
      ["post", "/app/evaluation_competency", { name: "Recuperação", parentId: 5 }],
    ]);
  });

  it("impact and delete address the competency by id", async () => {
    const seen = install({ name: "Grit", scores: 0, players: 0 });
    await api.getEvaluationCompetencyImpact(7);
    await api.deleteEvaluationCompetency(7);
    expect(seen.map((c) => [c.method, c.url])).toEqual([
      ["get", "/app/evaluation_competency/7/impact"],
      ["delete", "/app/evaluation_competency/7"],
    ]);
  });
});

describe("records", () => {
  it("a null rating, a 0 rating and an empty note are sent as they are", async () => {
    const seen = install({ deleted: true });
    const result = await api.putEvaluationRecord({ playerId: 9, ratings: { "3": null, "4": 0 }, note: "" });
    expect(seen[0].method).toBe("put");
    expect(seen[0].url).toBe("/app/evaluation_record");
    expect(body(seen[0])).toEqual({ playerId: 9, ratings: { "3": null, "4": 0 }, note: "" });
    expect(api.isDeletedRecord(result)).toBe(true);
  });

  it("an absent note and an absent classRef are not sent at all", async () => {
    const seen = install({ id: 1 });
    await api.putEvaluationRecord({ playerId: 9, ratings: { "3": 4 } });
    expect(Object.keys(body(seen[0])).sort()).toEqual(["playerId", "ratings"]);
  });

  it("reads the history and the evolution of one competency", async () => {
    const seen = install({});
    await api.getPlayerEvaluations(9);
    await api.getEvaluationEvolution(9, 3);
    expect(seen[0].url).toBe("/app/player/9/evaluations");
    expect(seen[1].url).toBe("/app/player/9/evaluations/evolution");
    expect(seen[1].params).toEqual({ categoryId: 3 });
  });

  it("the class read is a POST with the occurrence in the query and no body", async () => {
    const seen = install({});
    await api.getClassEvaluations({ model: "Lesson", id: 12, date: "2026-09-21" });
    expect(seen[0].method).toBe("post");
    expect(seen[0].url).toBe("/app/class_instance/evaluations");
    expect(seen[0].params).toEqual({ model: "Lesson", id: 12, date: "2026-09-21" });
    expect(seen[0].data).toBeUndefined();
  });

  it("deletes a record by id", async () => {
    const seen = install({ status: "ok" });
    await api.deleteEvaluationRecord(5);
    expect([seen[0].method, seen[0].url]).toEqual(["delete", "/app/evaluation_record/5"]);
  });
});

describe("a flush from a page that is going away (PAD-396, review)", () => {
  it("putEvaluationRecord(input, { keepalive: true }) asks axios for the fetch adapter with keepalive on that one call — an ordinary PUT does not", async () => {
    const client = initApi({ baseURL: "http://api.test", storage });
    const configs: InternalAxiosRequestConfig[] = [];
    const stub = async (config: InternalAxiosRequestConfig) => ({ data: { id: 1, deleted: false }, status: 200, statusText: "", headers: {}, config });
    client.defaults.adapter = stub;
    // Record what the call asked for, then send it through the stub — the per-call "fetch" adapter would otherwise reach the network.
    client.interceptors.request.use((config) => { configs.push({ ...config }); config.adapter = stub; return config; });
    await api.putEvaluationRecord({ playerId: 1, ratings: { "2": 6 } }, { keepalive: true });
    await api.putEvaluationRecord({ playerId: 1, ratings: { "2": 7 } });
    expect(configs[0].adapter).toBe("fetch");
    expect((configs[0].fetchOptions as { keepalive?: boolean }).keepalive).toBe(true);
    expect(configs[1].fetchOptions).toBeUndefined();
    expect(configs[1].adapter).not.toBe("fetch");
  });
});
