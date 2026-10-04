import { describe, it, expect, vi } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";
import { initApi } from "../client";
import * as api from "./evaluationSettings";
import type { TokenStorage } from "../storage";

// evaluations.reminders rule 8: the body is sent exactly as given. (PAD-473's keepalive send for a page
// going away went with the save-on-change model, PAD-506: the setting is sent by the tab's Save.)

const storage: TokenStorage = {
  getToken: vi.fn(async () => null),
  setToken: vi.fn(async () => {}),
  removeToken: vi.fn(async () => {}),
};

describe("putEvaluationSettings", () => {
  it("sends the body as given, as an ordinary request", async () => {
    const client = initApi({ baseURL: "http://api.test", storage });
    const configs: InternalAxiosRequestConfig[] = [];
    const stub = async (config: InternalAxiosRequestConfig) => ({ data: { reminder: "never" }, status: 200, statusText: "", headers: {}, config });
    client.defaults.adapter = stub;
    client.interceptors.request.use((config) => { configs.push({ ...config }); config.adapter = stub; return config; });

    await api.putEvaluationSettings({ reminder: "every_n_classes", everyN: 7 });

    expect(configs[0].data).toEqual({ reminder: "every_n_classes", everyN: 7 });
    expect(configs[0].fetchOptions).toBeUndefined();
  });
});
