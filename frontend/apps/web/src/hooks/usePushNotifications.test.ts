// auth.push-subscription rule 9 (PAD-744, B-678): a browser with permission granted saves its
// subscription on focus once per page session, without a prompt, and a failed save is a state the
// Messages page shows, never an unhandled rejection.
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePushNotifications } from "./usePushNotifications";

const SAVE = /\/notifications\/save-subscription$/;

describe("usePushNotifications (rule 9)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let saveStatus: number;
  let requestPermission: ReturnType<typeof vi.fn>;
  const saves = () => fetchMock.mock.calls.filter(([url]) => SAVE.test(String(url))).length;

  beforeEach(() => {
    saveStatus = 201;
    requestPermission = vi.fn();
    vi.stubGlobal("Notification", { permission: "granted", requestPermission });
    vi.stubGlobal("PushManager", function PushManager() {});
    const registration = {
      pushManager: {
        subscribe: vi.fn().mockResolvedValue({ endpoint: "https://push.example.com/ep" }),
        getSubscription: vi.fn().mockResolvedValue(null),
      },
    };
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistration: vi.fn().mockResolvedValue(registration) },
    });
    fetchMock = vi.fn((url: string) =>
      Promise.resolve(
        url.endsWith("/notifications/vapid-public-key")
          ? new Response(JSON.stringify({ publicKey: "AAAA" }))
          : new Response("{}", { status: saveStatus }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("focus saves a granted browser's subscription once per session, with no prompt", async () => {
    const { result } = renderHook(() => usePushNotifications("tok-focus"));
    await waitFor(() => expect(result.current.saveState).toBe("saved"));
    expect(saves()).toBe(1);

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("focus"));
    });
    expect(saves()).toBe(1);
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("saves nothing while permission is not granted", async () => {
    vi.stubGlobal("Notification", { permission: "default", requestPermission });
    renderHook(() => usePushNotifications("tok-default"));
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(saves()).toBe(0);
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("a failed save is the failed state, and subscribe() retries it without rejecting", async () => {
    saveStatus = 500;
    const { result } = renderHook(() => usePushNotifications("tok-fail"));
    await waitFor(() => expect(result.current.saveState).toBe("failed"));

    saveStatus = 201;
    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.subscribe();
    });
    expect(outcome).toBe(true);
    expect(result.current.saveState).toBe("saved");
    expect(saves()).toBe(2);
  });

  it("a failed save reports its phase and class to the PAD-746 hook, never the message", async () => {
    const { onPushSaveFailure } = await import("@/utils/pushNotifications");
    const failures: unknown[] = [];
    const stop = onPushSaveFailure((f) => failures.push(f));
    saveStatus = 503;
    const { result } = renderHook(() => usePushNotifications("tok-hook"));
    await waitFor(() => expect(result.current.saveState).toBe("failed"));
    stop();
    expect(failures).toEqual([{ phase: "post", errorClass: "http_503" }]);
  });

  it("permission not granted reports nothing", async () => {
    const { onPushSaveFailure, subscribeToPush } = await import("@/utils/pushNotifications");
    vi.stubGlobal("Notification", { permission: "default", requestPermission });
    const failures: unknown[] = [];
    const stop = onPushSaveFailure((f) => failures.push(f));
    await expect(subscribeToPush("tok-none")).resolves.toBe(false);
    stop();
    expect(failures).toEqual([]);
  });
});
