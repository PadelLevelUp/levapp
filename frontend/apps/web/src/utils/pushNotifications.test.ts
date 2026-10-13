// PAD-652 / B-581: sign-in saves the push subscription twice at once (`login()` and the token
// effect both call `requestAndSubscribe`); the second call must join the first save, not send
// its own. Covers auth.push-subscription rule 8.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requestAndSubscribe, subscribeToPush } from "./pushNotifications";

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

  it("sends one save when sign-in asks twice at once", async () => {
    const first = requestAndSubscribe("tok-1");
    const second = requestAndSubscribe("tok-1");
    await vi.waitFor(() => expect(savesSent(fetchMock)).toBe(1));
    releaseSave();
    await Promise.all([first, second]);

    expect(savesSent(fetchMock)).toBe(1);
  });

  it("sends a new save once the earlier one has finished", async () => {
    const first = subscribeToPush("tok-1");
    await vi.waitFor(() => expect(savesSent(fetchMock)).toBe(1));
    releaseSave();
    await expect(first).resolves.toBe(true);

    const again = subscribeToPush("tok-1");
    await vi.waitFor(() => expect(savesSent(fetchMock)).toBe(2));
    releaseSave();
    await expect(again).resolves.toBe(true);
  });

  it("does not share a save across different tokens", async () => {
    const a = subscribeToPush("tok-1");
    await vi.waitFor(() => expect(savesSent(fetchMock)).toBe(1));
    const b = subscribeToPush("tok-2");
    await vi.waitFor(() => expect(savesSent(fetchMock)).toBe(2));
    releaseSave();
    releaseSave();
    await expect(Promise.all([a, b])).resolves.toEqual([true, true]);
  });
});
