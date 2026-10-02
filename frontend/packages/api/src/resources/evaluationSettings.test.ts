import { describe, it, expect, vi } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";
import { initApi } from "../client";
import * as api from "./evaluationSettings";
import type { TokenStorage } from "../storage";

// evaluations.reminders rule 8: the body is sent exactly as given. PAD-473 adds a keepalive send for a
// page that is going away (B-242, settings.save-on-change) — the flag rides the request config, never
// the body.

const storage: TokenStorage = {
  getToken: vi.fn(async () => null),
  setToken: vi.fn(async () => {}),
  removeToken: vi.fn(async () => {}),
};

describe("putEvaluationSettings", () => {
  it("sends the body as given; { keepalive: true } asks for the fetch adapter with keepalive on that call only", async () => {
    const client = initApi({ baseURL: "http://api.test", storage });
    const configs: InternalAxiosRequestConfig[] = [];
    const stub = async (config: InternalAxiosRequestConfig) => ({ data: { reminder: "every_n_classes", everyN: 7 }, status: 200, statusText: "", headers: {}, config });
    client.defaults.adapter = stub;
    client.interceptors.request.use((config) => { configs.push({ ...config }); config.adapter = stub; return config; });

    await api.putEvaluationSettings({ reminder: "every_n_classes", everyN: 7 }, { keepalive: true });
    await api.putEvaluationSettings({ reminder: "never" });

    expect(configs[0].adapter).toBe("fetch");
    expect((configs[0].fetchOptions as { keepalive?: boolean }).keepalive).toBe(true);
    expect(configs[0].data).toEqual({ reminder: "every_n_classes", everyN: 7 });
    expect(configs[1].fetchOptions).toBeUndefined();
    expect(configs[1].adapter).not.toBe("fetch");
    expect(configs[1].data).toEqual({ reminder: "never" });
  });
});
