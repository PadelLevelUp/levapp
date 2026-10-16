/**
 * auth.social-sign-in rule 7 (PAD-618): the provider gate (Google AND Apple, or neither: Guideline 4.8),
 * the Apple nonce pair, and the error-to-copy mapping.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Platform } from "react-native";

const isAvailableAsync = vi.hoisted(() => vi.fn());
vi.mock("expo-apple-authentication", () => ({ isAvailableAsync }));
vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  getRandomBytesAsync: vi.fn(async (n: number) => Uint8Array.from({ length: n }, (_, i) => i)),
  digestStringAsync: vi.fn(async (_alg: string, value: string) => `sha256(${value})`),
}));

import {
  googleIosClientId,
  isAppleCancel,
  newAppleNonce,
  socialErrorKey,
  socialProvidersEnabled,
} from "./social-providers";

beforeEach(() => {
  isAvailableAsync.mockReset().mockResolvedValue(true);
  Platform.OS = "ios";
  vi.stubEnv("EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID", "abc.apps.googleusercontent.com");
});
afterEach(() => vi.unstubAllEnvs());

describe("googleIosClientId", () => {
  it("is the trimmed env value", () => {
    vi.stubEnv("EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID", "  abc  ");
    expect(googleIosClientId()).toBe("abc");
  });
  it("is null when empty, blank or unset", () => {
    vi.stubEnv("EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID", "   ");
    expect(googleIosClientId()).toBeNull();
    vi.stubEnv("EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID", "");
    expect(googleIosClientId()).toBeNull();
  });
});

describe("socialProvidersEnabled: both or neither", () => {
  it("is on with iOS, a client id and Apple available", async () => {
    expect(await socialProvidersEnabled()).toBe(true);
  });
  it("is off without the client id, even though Apple is available", async () => {
    vi.stubEnv("EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID", "");
    expect(await socialProvidersEnabled()).toBe(false);
  });
  it("is off when Apple is unavailable, even with the client id", async () => {
    isAvailableAsync.mockResolvedValue(false);
    expect(await socialProvidersEnabled()).toBe(false);
  });
  it("is off when the availability check throws", async () => {
    isAvailableAsync.mockRejectedValue(new Error("native"));
    expect(await socialProvidersEnabled()).toBe(false);
  });
  it("is off on Android", async () => {
    Platform.OS = "android";
    expect(await socialProvidersEnabled()).toBe(false);
  });
});

describe("newAppleNonce", () => {
  it("returns a 64-char hex raw nonce and the SHA-256 of that raw value", async () => {
    const { raw, hashed } = await newAppleNonce();
    expect(raw).toMatch(/^[0-9a-f]{64}$/);
    expect(hashed).toBe(`sha256(${raw})`);
  });
});

describe("isAppleCancel", () => {
  it("recognises only ERR_REQUEST_CANCELED", () => {
    expect(isAppleCancel({ code: "ERR_REQUEST_CANCELED" })).toBe(true);
    expect(isAppleCancel({ code: "ERR_REQUEST_FAILED" })).toBe(false);
    expect(isAppleCancel(null)).toBe(false);
  });
});

describe("socialErrorKey", () => {
  const res = (status: number, error?: string) => ({ response: { status, data: { error } } });
  it.each([
    [res(503, "PROVIDER_NOT_CONFIGURED"), "errorUnavailable", false],
    [res(503, "PROVIDER_UNAVAILABLE"), "errorUnavailable", false],
    [res(409, "ACCOUNT_EMAIL_UNVERIFIED"), "errorEmailUnverified", false],
    [res(403, "COACH_REJECTED"), "errorCoachRejected", true],
    [res(401, "ACCOUNT_DISABLED"), "errorDisabled", true],
    [res(401, "INVALID_PROVIDER_TOKEN"), "errorInvalid", false],
    [new Error("Network Error"), "errorNetwork", false],
  ])("%j -> %s", (err, key, shared) => {
    expect(socialErrorKey(err)).toEqual({ key, shared });
  });
});
