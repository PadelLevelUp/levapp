import { afterEach, describe, expect, it, vi } from "vitest";
import { sendDemoRequest, type DemoRequestBody } from "./demoRequest";

const body: DemoRequestBody = {
  fullname: "Rita Lopes",
  email: "rita@academia.pt",
  phone: "912345678",
  company: "Academia Norte",
  city: "Porto",
  alunos: 30,
  horas: 20,
  message: "",
  consent: true,
  pedido: "demonstracao",
  pageUri: "http://localhost/",
  pageName: "LevApp",
  website: "",
  elapsedMs: 12000,
};

const reply = (status: number, json?: unknown) =>
  vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: async () => {
      if (json === undefined) throw new Error("no body");
      return json;
    },
  });

describe("sendDemoRequest", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts JSON to the public endpoint and maps 200 to ok", async () => {
    const f = reply(200, { ok: true });
    vi.stubGlobal("fetch", f);
    expect(await sendDemoRequest(body)).toEqual({ ok: true });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("/api/public/demo-request");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual(body);
  });

  it("maps 400 to the server's field and code", async () => {
    vi.stubGlobal("fetch", reply(400, { field: "email", code: "INVALID_FIELD" }));
    expect(await sendDemoRequest(body)).toEqual({
      ok: false,
      status: 400,
      field: "email",
      code: "INVALID_FIELD",
    });
  });

  it.each([429, 502, 503])("maps %i to a failure with that status", async (status) => {
    vi.stubGlobal("fetch", reply(status, { code: "X" }));
    const r = await sendDemoRequest(body);
    expect(r).toMatchObject({ ok: false, status });
  });

  it("survives a non-JSON error body", async () => {
    vi.stubGlobal("fetch", reply(502));
    expect(await sendDemoRequest(body)).toEqual({ ok: false, status: 502 });
  });

  it("maps a network error to status 0", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    expect(await sendDemoRequest(body)).toEqual({ ok: false, status: 0 });
  });
});
