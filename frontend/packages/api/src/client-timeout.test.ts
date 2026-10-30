import { readdirSync, readFileSync, statSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { createApiClient, LONG_REQUEST_TIMEOUT_MS, REQUEST_TIMEOUT_MS } from "./client";
import type { TokenStorage } from "./storage";

/**
 * PAD-786 — client.request-timeout. Rule 1 on the real axios adapter: a canned adapter would skip
 * axios's own timeout, so the request goes to a local socket that accepts and never answers.
 */

const storage: TokenStorage = {
  getToken: async () => null,
  setToken: async () => {},
  removeToken: async () => {},
};

let server: Server | null = null;
const sockets: Socket[] = [];

afterEach(async () => {
  sockets.splice(0).forEach((socket) => socket.destroy());
  await new Promise<void>((done) => (server ? server.close(() => done()) : done()));
  server = null;
});

/** A server that takes the connection and never writes a byte back. */
async function silentServer(): Promise<string> {
  server = createServer((socket) => {
    sockets.push(socket);
  });
  await new Promise<void>((done) => server!.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  return `http://127.0.0.1:${address.port}`;
}

describe("client.request-timeout", () => {
  it("builds every client with the 20 s timeout (rule 1)", () => {
    expect(REQUEST_TIMEOUT_MS).toBe(20_000);
    expect(LONG_REQUEST_TIMEOUT_MS).toBe(120_000);
    expect(createApiClient({ baseURL: "/api", storage }).defaults.timeout).toBe(REQUEST_TIMEOUT_MS);
  });

  it("fails a request that gets no answer, with no response (rules 1, 3)", async () => {
    const api = createApiClient({ baseURL: await silentServer(), storage });
    // The default, shortened for the test; the path through axios is the same.
    api.defaults.timeout = 50;
    const error = await api.get("/app/coach_players").then(
      () => null,
      (err: unknown) => err as { code?: string; response?: unknown }
    );
    expect(error?.code).toBe("ECONNABORTED");
    expect(error?.response).toBeUndefined();
  });

  it("is overridden only by the import's confirm and revert (rule 2)", () => {
    const frontend = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
    const roots = ["packages/api/src", "apps/web/src", "apps/mobile/src", "apps/mobile/app"];
    const overrides: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (name === "node_modules") continue;
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
          readFileSync(path, "utf8")
            .split("\n")
            .forEach((line) => {
              if (/^\s*timeout:\s/.test(line)) overrides.push(`${relative(frontend, path)}: ${line.trim()}`);
            });
        }
      }
    };
    roots.forEach((root) => walk(join(frontend, root)));
    expect(overrides.sort()).toEqual([
      "apps/mobile/src/features/settings/settings-api.ts: timeout: LONG_REQUEST_TIMEOUT_MS,",
      "apps/web/src/api/import.ts: timeout: LONG_REQUEST_TIMEOUT_MS,",
      "apps/web/src/api/import.ts: timeout: LONG_REQUEST_TIMEOUT_MS,",
    ]);
  });
});
