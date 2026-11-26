// auth.push-subscription rule 13 (PAD-789 item 3): a refused notification permission is reported
// as a state, once per change into denied, by one reporter, through fetch with the user's token.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PUSH_REFUSAL_RESEND_DAYS, REFUSAL_PATH, startPushRefusalReport } from "./pushRefusalReport";

const REPORT = new RegExp(`${REFUSAL_PATH}$`);
const DAY = 86_400_000;

describe("startPushRefusalReport (rule 13)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let stops: Array<() => void>;
  let permission: string;
  const reports = () =>
    fetchMock.mock.calls.filter(([url]) => REPORT.test(String(url))).map(([, init]) => JSON.parse((init as RequestInit).body as string));
  const start = (userId = 7) => {
    const stop = startPushRefusalReport(userId);
    stops.push(stop);
    return stop;
  };
  const settle = () => vi.advanceTimersByTimeAsync(0);
  const focus = async () => {
    window.dispatchEvent(new Event("focus"));
    await settle();
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-07-12T10:00:00Z"));
    stops = [];
    permission = "default";
    localStorage.clear();
    localStorage.setItem("accessToken", "jwt-789");
    vi.stubGlobal("Notification", { get permission() { return permission; } });
    fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    stops.forEach((s) => s());
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("[AUTH-PUSH-SUBSCRIPTION-17] a refusal reports once per change into denied and again after the resend interval", async () => {
    start();
    await settle();
    expect(reports()).toHaveLength(0); // default

    permission = "denied";
    await focus();
    expect(reports()).toEqual([{ platform: "web", phase: "refused", permission: "denied", build: "web" }]);
    const [, init] = fetchMock.mock.calls.find(([url]) => REPORT.test(String(url)))!;
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer jwt-789" });

    await focus(); // still denied, nothing changed
    expect(reports()).toHaveLength(1);

    stops.pop()!(); // a later page load: the memory survives
    start();
    await settle();
    expect(reports()).toHaveLength(1);

    permission = "granted";
    await focus();
    permission = "denied";
    await focus();
    expect(reports()).toHaveLength(2); // a new refusal after granting

    vi.setSystemTime(Date.now() + (PUSH_REFUSAL_RESEND_DAYS * DAY - 1000));
    await focus();
    expect(reports()).toHaveLength(2); // not before the interval
    vi.setSystemTime(Date.now() + 2000);
    await focus();
    expect(reports()).toHaveLength(3); // once more after it
  });

  it("[AUTH-PUSH-SUBSCRIPTION-17] two readers that see the first denied at once post once", async () => {
    permission = "denied";
    start();
    start();
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    await settle();
    expect(reports()).toHaveLength(1);
  });

  it("[AUTH-PUSH-SUBSCRIPTION-17] a failed post writes no memory, is not retried on a read and is sent at the next page load", async () => {
    permission = "denied";
    fetchMock.mockImplementation(async () => new Response(null, { status: 503 }));
    start();
    await settle();
    await focus();
    await focus();
    expect(reports()).toHaveLength(1); // not on every read
    expect(localStorage.getItem("pushRefusalReport:7")).toBeNull();

    stops.splice(0).forEach((s) => s());
    vi.resetModules(); // a new page load
    const fresh = await import("./pushRefusalReport");
    fetchMock.mockImplementation(async () => new Response(null, { status: 204 }));
    stops.push(fresh.startPushRefusalReport(7));
    await settle();
    expect(reports()).toHaveLength(2);
  });

  it("[AUTH-PUSH-SUBSCRIPTION-17] a browser without the Notification API reports nothing, and a throwing localStorage reports once", async () => {
    vi.stubGlobal("Notification", undefined);
    start();
    await settle();
    await focus();
    expect(reports()).toHaveLength(0);
    stops.splice(0).forEach((s) => s());

    vi.stubGlobal("Notification", { get permission() { return "denied"; } });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    // the token is read from the storage the spies break: give it another way
    vi.doMock("@/api/client", () => ({ webTokenStorage: { getToken: async () => "jwt-789" } }));
    vi.resetModules();
    const again = await import("./pushRefusalReport");
    stops.push(again.startPushRefusalReport(7));
    await settle();
    await focus();
    expect(reports()).toHaveLength(1);
    vi.doUnmock("@/api/client");
  });

  it("[ADMIN-ENGINE-HEALTH-39] the resend interval is the constant and shorter than the count window", () => {
    expect(PUSH_REFUSAL_RESEND_DAYS).toBe(3); // const:PUSH_REFUSAL_RESEND_DAYS
    expect(PUSH_REFUSAL_RESEND_DAYS).toBeLessThan(7); // const:MESSAGE_RECIPIENT_WINDOW_DAYS
  });

  it("[AUTH-PUSH-SUBSCRIPTION-17] a stopped reporter sends nothing", async () => {
    start()();
    permission = "denied";
    await focus();
    expect(reports()).toHaveLength(0);
  });
});
