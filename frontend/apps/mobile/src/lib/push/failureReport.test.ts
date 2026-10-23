/**
 * admin.engine-health rule 8d (PAD-746): a failed push registration reaches the server as one
 * report with closed fields (platform, phase, permission, build, errorClass), never the token.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.fn();
vi.mock("@/lib/api", () => ({ api: { post: (...a: unknown[]) => post(...a), delete: vi.fn() } }));
const config = vi.hoisted(() => ({
  expoConfig: { version: "1.3.1", ios: { buildNumber: "33" }, android: { versionCode: 12 } } as Record<string, unknown>,
}));
vi.mock("expo-constants", () => ({ default: config }));
const notifications = vi.hoisted(() => ({ permission: "granted" as string, throws: false }));
vi.mock("expo-notifications", () => ({
  getPermissionsAsync: vi.fn(async () => {
    if (notifications.throws) throw new Error("no native module");
    return { status: notifications.permission };
  }),
}));

import { Platform } from "@/test/mocks/react-native";

import { REGISTRATION_FAILURE_ENDPOINT, startPushFailureReport } from "./failureReport";
import type { PushFailure, PushRegistrar } from "./types";

function fakeRegistrar() {
  const listeners = new Set<(f: PushFailure) => void>();
  const registrar = {
    onRegistrationFailure: (l: (f: PushFailure) => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  } as unknown as PushRegistrar;
  return { registrar, fire: (f: PushFailure) => listeners.forEach((l) => l(f)), count: () => listeners.size };
}

const reports = () => post.mock.calls.filter(([path]) => path === REGISTRATION_FAILURE_ENDPOINT).map(([, body]) => body);

beforeEach(() => {
  post.mockReset().mockResolvedValue({});
  notifications.permission = "granted";
  notifications.throws = false;
  Platform.OS = "ios";
});

afterEach(() => {
  Platform.OS = "ios";
});

describe("startPushFailureReport (rule 8d)", () => {
  it("posts one report per failure with the closed fields", async () => {
    const { registrar, fire } = fakeRegistrar();
    startPushFailureReport(registrar);
    fire({ phase: "post", errorClass: "http_503" });
    await vi.waitFor(() => expect(reports()).toHaveLength(1));
    expect(reports()[0]).toEqual({ platform: "ios", phase: "post", permission: "granted", build: "33", errorClass: "http_503" });
  });

  it("names the Android build and an unreadable permission", async () => {
    Platform.OS = "android";
    notifications.throws = true;
    const { registrar, fire } = fakeRegistrar();
    startPushFailureReport(registrar);
    fire({ phase: "token", errorClass: "TypeError" });
    await vi.waitFor(() => expect(reports()).toHaveLength(1));
    expect(reports()[0]).toMatchObject({ platform: "android", phase: "token", permission: "unknown", build: "12" });
  });

  it("never sends a class the server would refuse", async () => {
    const { registrar, fire } = fakeRegistrar();
    startPushFailureReport(registrar);
    fire({ phase: "post", errorClass: "Network Error: https://exp.host" });
    await vi.waitFor(() => expect(reports()).toHaveLength(1));
    expect(reports()[0]).toMatchObject({ errorClass: "unknown" });
  });

  it("a failed report is dropped, and stopping removes the listener", async () => {
    post.mockRejectedValue(new Error("offline"));
    const { registrar, fire, count } = fakeRegistrar();
    const stop = startPushFailureReport(registrar);
    fire({ phase: "post", errorClass: "http_500" });
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    stop();
    expect(count()).toBe(0);
  });
});
