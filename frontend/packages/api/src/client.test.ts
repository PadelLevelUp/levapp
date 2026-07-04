import { describe, it, expect, vi } from "vitest";
import { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { createApiClient, initApi, getApi } from "./client";
import { buildEventsUrl } from "./sse";
import type { TokenStorage } from "./storage";

/** In-memory TokenStorage with spied methods. */
function memoryStorage(initial: string | null = null) {
  let token = initial;
  return {
    getToken: vi.fn(async () => token),
    setToken: vi.fn(async (t: string) => {
      token = t;
    }),
    removeToken: vi.fn(async () => {
      token = null;
    }),
  } satisfies TokenStorage & Record<string, ReturnType<typeof vi.fn>>;
}

interface CannedResponse {
  status?: number;
  data?: unknown;
  headers?: Record<string, string>;
}

/**
 * Installs a canned-response adapter on the client so requests never hit the
 * network but still flow through the real interceptor chain. Returns the
 * configs the adapter saw, for asserting on outgoing headers.
 */
function installAdapter(
  client: ReturnType<typeof createApiClient>,
  canned: CannedResponse = {}
) {
  const seen: InternalAxiosRequestConfig[] = [];
  client.defaults.adapter = async (config) => {
    seen.push(config);
    const { status = 200, data = {}, headers = {} } = canned;
    const response = { data, status, statusText: "", headers, config };
    if (status >= 400) {
      throw new AxiosError(
        `Request failed with status code ${status}`,
        String(status) === "401" ? AxiosError.ERR_BAD_REQUEST : undefined,
        config,
        {},
        response as never
      );
    }
    return response;
  };
  return seen;
}

describe("createApiClient", () => {
  it("attaches Authorization: Bearer <token> when storage has a token", async () => {
    const storage = memoryStorage("tok-123");
    const client = createApiClient({ baseURL: "http://api.test", storage });
    const seen = installAdapter(client);

    await client.get("/app/players");

    expect(storage.getToken).toHaveBeenCalled();
    expect(seen[0].headers.Authorization).toBe("Bearer tok-123");
    expect(seen[0].baseURL).toBe("http://api.test");
  });

  it("sends no Authorization header when storage is empty", async () => {
    const storage = memoryStorage(null);
    const client = createApiClient({ baseURL: "http://api.test", storage });
    const seen = installAdapter(client);

    await client.get("/app/players");

    expect(seen[0].headers.Authorization).toBeUndefined();
  });

  it("persists the rolling-refresh x-new-token response header", async () => {
    const storage = memoryStorage("old-token");
    const client = createApiClient({ baseURL: "http://api.test", storage });
    installAdapter(client, { headers: { "x-new-token": "fresh-token" } });

    await client.get("/app/dashboard");

    expect(storage.setToken).toHaveBeenCalledWith("fresh-token");
    await expect(storage.getToken()).resolves.toBe("fresh-token");
  });

  it("does not touch storage when no x-new-token header is present", async () => {
    const storage = memoryStorage("tok");
    const client = createApiClient({ baseURL: "http://api.test", storage });
    installAdapter(client);

    await client.get("/app/dashboard");

    expect(storage.setToken).not.toHaveBeenCalled();
    expect(storage.removeToken).not.toHaveBeenCalled();
  });

  it("on 401: removes the token, fires onUnauthorized, and rejects", async () => {
    const storage = memoryStorage("expired");
    const onUnauthorized = vi.fn();
    const client = createApiClient({
      baseURL: "http://api.test",
      storage,
      onUnauthorized,
    });
    installAdapter(client, { status: 401 });

    await expect(client.get("/app/players")).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(storage.removeToken).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    await expect(storage.getToken()).resolves.toBeNull();
  });

  it("survives a 401 without an onUnauthorized callback", async () => {
    const storage = memoryStorage("expired");
    const client = createApiClient({ baseURL: "http://api.test", storage });
    installAdapter(client, { status: 401 });

    await expect(client.get("/x")).rejects.toBeInstanceOf(AxiosError);
    expect(storage.removeToken).toHaveBeenCalledTimes(1);
  });

  it("does not clear the token on non-401 errors", async () => {
    const storage = memoryStorage("still-valid");
    const onUnauthorized = vi.fn();
    const client = createApiClient({
      baseURL: "http://api.test",
      storage,
      onUnauthorized,
    });
    installAdapter(client, { status: 500 });

    await expect(client.get("/app/players")).rejects.toMatchObject({
      response: { status: 500 },
    });
    expect(storage.removeToken).not.toHaveBeenCalled();
    expect(onUnauthorized).not.toHaveBeenCalled();
    await expect(storage.getToken()).resolves.toBe("still-valid");
  });
});

describe("initApi / getApi singleton", () => {
  it("getApi throws before initApi and returns the instance after", () => {
    // Module state is fresh per test file, so the singleton is unset here.
    expect(() => getApi()).toThrowError(/initApi\(\) must be called/);

    const client = initApi({
      baseURL: "http://api.test",
      storage: memoryStorage(),
    });
    expect(getApi()).toBe(client);
  });
});

describe("buildEventsUrl", () => {
  it("builds the SSE url from base url and token", () => {
    expect(buildEventsUrl("http://api.test", "tok-1")).toBe(
      "http://api.test/app/events?token=tok-1"
    );
  });
});
