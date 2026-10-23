// admin.engine-health rule 8d (PAD-746): a failed push save reaches the server as one report with
// closed fields, through fetch (never the API client, whose 401 handler signs the user out).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { REGISTRATION_FAILURE_PATH, startPushFailureReport } from "./pushFailureReport";
import { subscribeToPush } from "./pushNotifications";

const SAVE = /\/notifications\/save-subscription$/;
const REPORT = new RegExp(`${REGISTRATION_FAILURE_PATH}$`);

describe("startPushFailureReport (rule 8d)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let stop: () => void;
  const reports = () =>
    fetchMock.mock.calls.filter(([url]) => REPORT.test(String(url))).map(([, init]) => JSON.parse((init as RequestInit).body as string));

  beforeEach(() => {
    localStorage.setItem("accessToken", "jwt-746");
    vi.stubGlobal("Notification", { permission: "granted", requestPermission: vi.fn() });
    const registration = { pushManager: { subscribe: vi.fn().mockResolvedValue({ endpoint: "https://push.example.com/ep" }) } };
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistration: vi.fn().mockResolvedValue(registration), register: vi.fn().mockResolvedValue(registration), ready: Promise.resolve(registration) },
    });
    fetchMock = vi.fn(async (url: string) => {
      if (/vapid-public-key$/.test(url)) return new Response(JSON.stringify({ publicKey: "AAAA" }), { status: 200 });
      if (SAVE.test(url)) return new Response("{}", { status: 503 });
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal("fetch", fetchMock);
    stop = startPushFailureReport();
  });

  afterEach(() => {
    stop();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("a save answered 503 sends one report with the closed fields and the user's token", async () => {
    await subscribeToPush("jwt-746").catch(() => undefined);
    await vi.waitFor(() => expect(reports()).toHaveLength(1));
    expect(reports()[0]).toEqual({ platform: "web", phase: "post", permission: "granted", build: "web", errorClass: "http_503" });
    const [, init] = fetchMock.mock.calls.find(([url]) => REPORT.test(String(url)))!;
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer jwt-746" });
  });

  it("nothing is reported once stopped", async () => {
    stop();
    await subscribeToPush("jwt-746").catch(() => undefined);
    await new Promise((r) => setTimeout(r, 20));
    expect(reports()).toHaveLength(0);
  });
});
