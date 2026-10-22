/**
 * messaging.push-notifications rule 15 (PAD-744, B-678): a granted permission registers without a
 * restart, only login, sign-up and the banner's tap prompt, a rotated token is sent and cached, and
 * a failed registration is retried and then shown.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.fn();
const del = vi.fn();
vi.mock("@/lib/api", () => ({ api: { post: (...a: unknown[]) => post(...a), delete: (...a: unknown[]) => del(...a) } }));
vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: { eas: { projectId: "p" } } } } }));
const device = vi.hoisted(() => ({ isDevice: true }));
vi.mock("expo-device", () => device);

const notifications = vi.hoisted(() => ({
  permission: "granted" as string,
  requested: 0,
  token: "ExponentPushToken[abc]",
  tokenListener: null as null | ((t: { data: unknown }) => void),
}));
vi.mock("expo-notifications", () => ({
  AndroidImportance: { HIGH: 4 },
  setNotificationChannelAsync: vi.fn(async () => undefined),
  getPermissionsAsync: vi.fn(async () => ({ status: notifications.permission })),
  requestPermissionsAsync: vi.fn(async () => {
    notifications.requested += 1;
    return { status: notifications.permission };
  }),
  getExpoPushTokenAsync: vi.fn(async () => ({ data: notifications.token })),
  addPushTokenListener: vi.fn((listener: (t: { data: unknown }) => void) => {
    notifications.tokenListener = listener;
    return { remove: () => (notifications.tokenListener = null) };
  }),
}));

import { ExpoPushRegistrar, PUSH_TOKEN_ENDPOINT, RETRY_DELAYS_MS, errorClassOf } from "./expoPushRegistrar";
import { startPushRecovery } from "./recovery";
import { __emitAppState } from "@/test/mocks/react-native";

const posted = () => post.mock.calls.filter(([path]) => path === PUSH_TOKEN_ENDPOINT).map(([, body]) => (body as { token: string }).token);

beforeEach(() => {
  vi.useFakeTimers();
  post.mockReset().mockResolvedValue({});
  del.mockReset().mockResolvedValue({});
  notifications.permission = "granted";
  notifications.requested = 0;
  notifications.token = "ExponentPushToken[abc]";
  notifications.tokenListener = null;
  device.isDevice = true;
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ExpoPushRegistrar (rule 15)", () => {
  it("registers without a prompt once permission is granted, and never prompts before that", async () => {
    const registrar = new ExpoPushRegistrar();
    notifications.permission = "undetermined";
    await registrar.registerIfPermitted();
    expect(notifications.requested).toBe(0);
    expect(posted()).toEqual([]);
    expect(registrar.status()).toBe("no-permission");

    notifications.permission = "granted"; // granted in the banner or in Settings
    await registrar.registerIfPermitted();
    expect(notifications.requested).toBe(0);
    expect(posted()).toEqual(["ExponentPushToken[abc]"]);
    expect(registrar.status()).toBe("registered");
  });

  it("register() still prompts (login, sign-up, restore)", async () => {
    const registrar = new ExpoPushRegistrar();
    notifications.permission = "undetermined";
    await registrar.register();
    expect(notifications.requested).toBe(1);
  });

  it("retries a failed POST at 2 s, 10 s and 30 s, then reports failed", async () => {
    post.mockRejectedValue(new Error("network"));
    const registrar = new ExpoPushRegistrar();
    await registrar.register();
    expect(posted()).toHaveLength(1);
    expect(registrar.status()).toBe("unknown");
    for (const delay of RETRY_DELAYS_MS) await vi.advanceTimersByTimeAsync(delay);
    expect(posted()).toHaveLength(4);
    expect(registrar.status()).toBe("failed");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(posted()).toHaveLength(4);
  });

  it("a retry that succeeds ends as registered", async () => {
    post.mockRejectedValueOnce(new Error("network"));
    const registrar = new ExpoPushRegistrar();
    await registrar.register();
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);
    expect(posted()).toHaveLength(2);
    expect(registrar.status()).toBe("registered");
  });

  it("a denial is not retried", async () => {
    notifications.permission = "denied";
    const registrar = new ExpoPushRegistrar();
    await registrar.register();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(posted()).toEqual([]);
    expect(registrar.status()).toBe("no-permission");
  });

  it("a logout during the waits cancels the remaining retries", async () => {
    post.mockRejectedValue(new Error("network"));
    const registrar = new ExpoPushRegistrar();
    await registrar.register();
    await registrar.unregister();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(posted()).toHaveLength(1);
    expect(registrar.status()).toBe("unknown");
  });

  it("a simulator is unsupported, not failed", async () => {
    device.isDevice = false;
    const registrar = new ExpoPushRegistrar();
    await registrar.register();
    expect(posted()).toEqual([]);
    expect(registrar.status()).toBe("unsupported");
  });

  it("a rotated token is cached and posted, and logout revokes the new one", async () => {
    const registrar = new ExpoPushRegistrar();
    await registrar.register();
    const stop = registrar.watchTokenRotation();
    notifications.tokenListener?.({ data: "ExponentPushToken[new]" });
    await vi.advanceTimersByTimeAsync(0);
    expect(posted()).toEqual(["ExponentPushToken[abc]", "ExponentPushToken[new]"]);
    expect(registrar.cachedToken()).toBe("ExponentPushToken[new]");
    await registrar.unregister();
    expect(del).toHaveBeenCalledWith(PUSH_TOKEN_ENDPOINT, { data: { token: "ExponentPushToken[new]" } });
    stop();
    expect(notifications.tokenListener).toBeNull();
  });

  it("tells its listeners when the status changes", async () => {
    const registrar = new ExpoPushRegistrar();
    const seen: string[] = [];
    const stop = registrar.onStatusChange((s) => seen.push(s));
    await registrar.register();
    stop();
    await registrar.unregister();
    expect(seen).toEqual(["registered"]);
  });
});

describe("onRegistrationFailure (the PAD-746 hook)", () => {
  it("reports each failed attempt's phase and error class, never the message", async () => {
    post.mockRejectedValue(Object.assign(new Error("secret detail"), { response: { status: 503 } }));
    const registrar = new ExpoPushRegistrar();
    const failures: unknown[] = [];
    registrar.onRegistrationFailure((f) => failures.push(f));
    await registrar.register();
    for (const delay of RETRY_DELAYS_MS) await vi.advanceTimersByTimeAsync(delay);
    expect(failures).toHaveLength(4);
    expect(failures[0]).toEqual({ phase: "post", errorClass: "http_503" });
    expect(JSON.stringify(failures)).not.toContain("secret");
  });

  it("a token fetch that throws is the token phase; a denial and a simulator report nothing", async () => {
    const { getExpoPushTokenAsync } = await import("expo-notifications");
    vi.mocked(getExpoPushTokenAsync).mockRejectedValueOnce(new TypeError("no aps-environment"));
    const registrar = new ExpoPushRegistrar();
    const failures: unknown[] = [];
    registrar.onRegistrationFailure((f) => failures.push(f));
    await registrar.register();
    expect(failures).toEqual([{ phase: "token", errorClass: "TypeError" }]);

    failures.length = 0;
    await registrar.unregister();
    notifications.permission = "denied";
    await registrar.register();
    device.isDevice = false;
    notifications.permission = "granted";
    await registrar.register();
    expect(failures).toEqual([]);
  });

  it("a listener that throws never breaks registration", async () => {
    post.mockRejectedValueOnce(new Error("x"));
    const registrar = new ExpoPushRegistrar();
    registrar.onRegistrationFailure(() => {
      throw new Error("reporter down");
    });
    await registrar.register();
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);
    expect(registrar.status()).toBe("registered");
  });

  it("caps the class at 60 characters", () => {
    const e = new Error("m");
    e.name = "N".repeat(80);
    expect(errorClassOf(e)).toHaveLength(60);
  });
});

describe("startPushRecovery (rule 15)", () => {
  it("a return to the app registers without a prompt until this session has registered", async () => {
    const registrar = new ExpoPushRegistrar();
    notifications.permission = "denied";
    await registrar.register(); // at login: denied, nothing sent
    const stop = startPushRecovery(registrar);

    notifications.permission = "granted"; // allowed in iOS Settings
    __emitAppState("background");
    __emitAppState("active");
    await vi.advanceTimersByTimeAsync(0);
    expect(posted()).toEqual(["ExponentPushToken[abc]"]);

    __emitAppState("background");
    __emitAppState("active");
    await vi.advanceTimersByTimeAsync(0);
    expect(posted()).toHaveLength(1);
    expect(notifications.requested).toBe(1); // the login prompt only

    stop();
    expect(notifications.tokenListener).toBeNull();
  });
});
