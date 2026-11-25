// PAD-652 / B-581: sign-in saves the push subscription twice at once (`login()` and the token
// effect both call `requestAndSubscribe`); the second call must join the first save, not send
// its own. Covers auth.push-subscription rule 8.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isIosBrowserWithoutApp, requestAndSubscribe, subscribeToPush, unsubscribeFromPush } from "./pushNotifications";

const SAVE = /\/notifications\/save-subscription$/;

function savesSent(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([url]) => SAVE.test(String(url))).length;
}

describe("subscribeToPush in-flight dedupe", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let pending: Array<() => void>;
  const releaseSave = () => pending.shift()?.();

  beforeEach(() => {
    pending = [];
    vi.stubGlobal("Notification", { permission: "granted", requestPermission: vi.fn() });
    vi.stubGlobal("PushManager", function PushManager() {});
    const registration = { pushManager: { subscribe: vi.fn().mockResolvedValue({ endpoint: "https://push.example.com/ep" }) } };
    vi.stubGlobal("navigator", { serviceWorker: { getRegistration: vi.fn().mockResolvedValue(registration) } });
    fetchMock = vi.fn((url: string) => {
      if (url.endsWith("/notifications/vapid-public-key")) {
        return Promise.resolve(new Response(JSON.stringify({ publicKey: "AAAA" })));
      }
      return new Promise<Response>((resolve) => {
        pending.push(() => resolve(new Response("{}", { status: 201 })));
      });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("[AUTH-PUSH-SUBSCRIPTION-5] sends one save when sign-in asks twice at once", async () => {
    const first = requestAndSubscribe("tok-1");
    const second = requestAndSubscribe("tok-1");
    await vi.waitFor(() => expect(savesSent(fetchMock)).toBe(1));
    releaseSave();
    await Promise.all([first, second]);

    expect(savesSent(fetchMock)).toBe(1);
  });

  it("[AUTH-PUSH-SUBSCRIPTION-5] sends a new save once the earlier one has finished", async () => {
    const first = subscribeToPush("tok-1");
    await vi.waitFor(() => expect(savesSent(fetchMock)).toBe(1));
    releaseSave();
    await expect(first).resolves.toBe(true);

    const again = subscribeToPush("tok-1");
    await vi.waitFor(() => expect(savesSent(fetchMock)).toBe(2));
    releaseSave();
    await expect(again).resolves.toBe(true);
  });

  it("[AUTH-PUSH-SUBSCRIPTION-5] does not share a save across different tokens", async () => {
    const a = subscribeToPush("tok-1");
    await vi.waitFor(() => expect(savesSent(fetchMock)).toBe(1));
    const b = subscribeToPush("tok-2");
    await vi.waitFor(() => expect(savesSent(fetchMock)).toBe(2));
    releaseSave();
    releaseSave();
    await expect(Promise.all([a, b])).resolves.toEqual([true, true]);
  });
});

describe("isIosBrowserWithoutApp", () => {
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";
  const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15";

  it("[DASHBOARD-STUDENT-SETUP-GUIDE-9] isIosBrowserWithoutApp detects Safari on an iPhone outside an installed app", () => {
    expect(isIosBrowserWithoutApp({ userAgent: IPHONE, maxTouchPoints: 5 }, false)).toBe(true);
    // iPadOS reports itself as a Mac, with touch.
    expect(isIosBrowserWithoutApp({ userAgent: MAC, maxTouchPoints: 5 }, false)).toBe(true);
    // Inside an installed web app.
    expect(isIosBrowserWithoutApp({ userAgent: IPHONE, maxTouchPoints: 5, standalone: true }, false)).toBe(false);
    expect(isIosBrowserWithoutApp({ userAgent: IPHONE, maxTouchPoints: 5 }, true)).toBe(false);
    // A desktop Mac has no touch.
    expect(isIosBrowserWithoutApp({ userAgent: MAC, maxTouchPoints: 0 }, false)).toBe(false);
  });
});

describe("unsubscribeFromPush names its browser (PAD-753)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("[AUTH-PUSH-SUBSCRIPTION-12] sends this browser's endpoint, and nothing when it has no subscription", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    const getSubscription = vi.fn().mockResolvedValue({ endpoint: "https://push.example.com/ep", unsubscribe });
    vi.stubGlobal("navigator", {
      serviceWorker: { getRegistration: vi.fn().mockResolvedValue({ pushManager: { getSubscription } }) },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(unsubscribeFromPush("tok-1")).resolves.toBe(true);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/notifications\/unsubscribe$/);
    expect(JSON.parse(init.body)).toEqual({ endpoint: "https://push.example.com/ep" });

    getSubscription.mockResolvedValue(null);
    await expect(unsubscribeFromPush("tok-1")).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
