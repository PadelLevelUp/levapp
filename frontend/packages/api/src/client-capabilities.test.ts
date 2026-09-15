import { describe, it, expect } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";
import { createApiClient } from "./client";
import type { TokenStorage } from "./storage";

/**
 * PAD-352 (`eligibility.open-spot-visibility` rule 12): a shell tells the server
 * what it understands in one `X-LevApp-Capabilities` header. The server only
 * sends open-spot events to a client that lists `open-spots`, because the App
 * Store builds that predate them would draw an open spot as the student's own
 * booking. So the default here must be NONE: a shell declares explicitly, and
 * never inherits a promise it can't keep.
 */

const noToken: TokenStorage = {
  getToken: async () => null,
  setToken: async () => undefined,
  removeToken: async () => undefined,
};

function capture(client: ReturnType<typeof createApiClient>) {
  const seen: InternalAxiosRequestConfig[] = [];
  client.defaults.adapter = async (config) => {
    seen.push(config);
    return { data: {}, status: 200, statusText: "", headers: {}, config };
  };
  return seen;
}

describe("createApiClient capabilities (PAD-352)", () => {
  it("sends no X-LevApp-Capabilities header unless the shell declares one", async () => {
    const client = createApiClient({ baseURL: "http://api.test", storage: noToken });
    const seen = capture(client);
    await client.get("/app/calendar");
    expect(seen).toHaveLength(1);
    expect(seen[0].headers["X-LevApp-Capabilities"]).toBeUndefined();
  });

  it("sends what the shell declares, as one comma-separated header", async () => {
    const client = createApiClient({
      baseURL: "http://api.test",
      storage: noToken,
      capabilities: ["open-spots", "later-capability"],
    });
    const seen = capture(client);
    await client.get("/app/calendar");
    await client.post("/app/class_instance", {});
    expect(seen).toHaveLength(2);
    for (const config of seen) {
      expect(config.headers["X-LevApp-Capabilities"]).toBe("open-spots, later-capability");
    }
  });

  it("treats an empty declaration like no declaration", async () => {
    const client = createApiClient({ baseURL: "http://api.test", storage: noToken, capabilities: [] });
    const seen = capture(client);
    await client.get("/app/calendar");
    expect(seen[0].headers["X-LevApp-Capabilities"]).toBeUndefined();
  });
});
