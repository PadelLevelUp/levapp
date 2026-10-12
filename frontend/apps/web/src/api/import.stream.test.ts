import { afterEach, describe, expect, it, vi } from "vitest";

/** PAD-642 (import.confirm rule 5): the streamed import's raw fetch bypasses the axios client, so it
 * must declare the shell's capabilities itself and carry the coach's confirmation — otherwise the server
 * sees a legacy client and never asks. */
vi.mock("@/api/client", () => ({
  api: { defaults: { baseURL: "/api" } },
  WEB_CAPABILITIES: ["open-spots", "adult-roster-confirmation"],
}));

import { confirmImportStream } from "./import";

afterEach(() => vi.unstubAllGlobals());

const tables = [{ name: "Players", rows: [{ selected: true, cells: { name: "Ana" } }], columns: ["name"] }];

function stubFetch() {
  const done = 'data: {"type":"done","results":{}}\n\n';
  const fetchMock = vi.fn().mockResolvedValue(new Response(done, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("confirmImportStream", () => {
  it("declares the shell's capabilities and sends confirmsAdults", async () => {
    const fetchMock = stubFetch();
    await confirmImportStream(tables as never, undefined, { confirmsAdults: true });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["X-LevApp-Capabilities"]).toContain("adult-roster-confirmation");
    expect(JSON.parse(init.body)).toMatchObject({ confirmsAdults: true, Players: [{ name: "Ana" }] });
  });

  it("sends no confirmation when the coach gave none", async () => {
    const fetchMock = stubFetch();
    await confirmImportStream(tables as never);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty("confirmsAdults");
  });
});
