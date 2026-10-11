/**
 * auth.social-sign-in rule 7 (PAD-618) on iOS: the buttons ship dark, appear together, post the
 * provider's token, keep the Apple raw nonce for the server, stay quiet on a cancel, and say why
 * a refusal happened.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { Platform } from "react-native";
import { renderNative } from "@/test/render-native";

const socialSignIn = vi.hoisted(() => vi.fn());
vi.mock("@levelup/api", () => ({ authApi: { socialSignIn } }));
vi.mock("@levelup/config", () => ({ CONTACT_EMAIL: "help@example.test" }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, o?: Record<string, unknown>) => (o?.email ? `${key}|${o.email}` : key) }),
}));

const isAvailableAsync = vi.hoisted(() => vi.fn());
const signInAsync = vi.hoisted(() => vi.fn());
vi.mock("expo-apple-authentication", async () => {
  const { View } = await import("react-native");
  const { createElement: h } = await import("react");
  return {
    isAvailableAsync,
    signInAsync,
    AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
    AppleAuthenticationButtonType: { CONTINUE: 5 },
    AppleAuthenticationButtonStyle: { BLACK: 2 },
    AppleAuthenticationButton: (p: { testID?: string; onPress?: () => void }) => h(View, { testID: p.testID, onPress: p.onPress } as never),
  };
});
vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  getRandomBytesAsync: vi.fn(async (n: number) => new Uint8Array(n).fill(171)),
  digestStringAsync: vi.fn(async (_a: string, v: string) => `sha256(${v})`),
}));
vi.mock("expo-web-browser", () => ({ maybeCompleteAuthSession: vi.fn() }));
const promptAsync = vi.hoisted(() => vi.fn());
const google = vi.hoisted(() => ({ response: null as unknown, request: {} as unknown }));
vi.mock("expo-auth-session/providers/google", () => ({
  useIdTokenAuthRequest: () => [google.request, google.response, promptAsync],
}));

import { SocialSignInButtons } from "./SocialSignInButtons";

const RAW = "ab".repeat(32);
const loginBody = { accessToken: "tok", user: { id: 1, name: "Ana", role: "player" } };
const refusal = (status: number, error: string) => ({ response: { status, data: { error } } });

async function mount(onResult = vi.fn()) {
  const el = createElement(SocialSignInButtons, { onResult });
  const n = await renderNative(el);
  await n.flush();
  return { n, el, onResult };
}

beforeEach(() => {
  Platform.OS = "ios";
  vi.stubEnv("EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID", "abc.apps.googleusercontent.com");
  isAvailableAsync.mockReset().mockResolvedValue(true);
  signInAsync.mockReset().mockResolvedValue({ identityToken: "apple-jwt" });
  socialSignIn.mockReset().mockResolvedValue(loginBody);
  promptAsync.mockReset();
  google.response = null;
  google.request = {};
});
afterEach(() => vi.unstubAllEnvs());

describe("SocialSignInButtons: shipped dark, shown together", () => {
  it("shows neither button without the Google iOS client id", async () => {
    vi.stubEnv("EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID", "");
    const { n } = await mount();
    expect(n.queryByTestId("social-google")).toBeNull();
    expect(n.queryByTestId("social-apple")).toBeNull();
  });
  it("shows neither button when Sign in with Apple is unavailable", async () => {
    isAvailableAsync.mockResolvedValue(false);
    const { n } = await mount();
    expect(n.queryByTestId("social-google")).toBeNull();
    expect(n.queryByTestId("social-apple")).toBeNull();
  });
  it("shows both when configured", async () => {
    const { n } = await mount();
    expect(n.queryByTestId("social-google")).not.toBeNull();
    expect(n.queryByTestId("social-apple")).not.toBeNull();
  });
});

describe("Google", () => {
  it("opens the Google sheet on press", async () => {
    const { n } = await mount();
    await n.press("social-google");
    expect(promptAsync).toHaveBeenCalledTimes(1);
  });
  it("posts the id_token of a successful response and hands the answer on", async () => {
    const { n, el, onResult } = await mount();
    google.response = { type: "success", params: { id_token: "google-jwt" } };
    await n.rerender(el);
    await n.flush();
    expect(socialSignIn).toHaveBeenCalledWith({ provider: "google", idToken: "google-jwt" });
    expect(onResult).toHaveBeenCalledWith(loginBody);
  });
  it("shows no error when the person closes the sheet", async () => {
    const { n, el } = await mount();
    google.response = { type: "dismiss" };
    await n.rerender(el);
    await n.flush();
    expect(socialSignIn).not.toHaveBeenCalled();
    expect(n.queryByTestId("social-error")).toBeNull();
  });
});

describe("Apple", () => {
  it("gives Apple the SHA-256 and our server the raw nonce", async () => {
    const { n, onResult } = await mount();
    await n.press("social-apple");
    await n.flush();
    const asked = signInAsync.mock.calls[0][0];
    expect(asked.nonce).toBe(`sha256(${RAW})`);
    expect(asked.requestedScopes).toEqual([0, 1]);
    expect(socialSignIn).toHaveBeenCalledWith({ provider: "apple", idToken: "apple-jwt", nonce: RAW });
    expect(onResult).toHaveBeenCalledWith(loginBody);
  });
  it("a cancel is silent", async () => {
    signInAsync.mockRejectedValue({ code: "ERR_REQUEST_CANCELED" });
    const { n } = await mount();
    await n.press("social-apple");
    await n.flush();
    expect(socialSignIn).not.toHaveBeenCalled();
    expect(n.queryByTestId("social-error")).toBeNull();
  });
  it("a credential with no identity token is an error, nothing is posted", async () => {
    signInAsync.mockResolvedValue({ identityToken: null });
    const { n } = await mount();
    await n.press("social-apple");
    await n.flush();
    expect(socialSignIn).not.toHaveBeenCalled();
    expect(n.byTestId("social-error").props.children).toBe("auth.social.native.errorInvalid");
  });
});

describe("refusals carry their own words", () => {
  it.each([
    [refusal(401, "INVALID_PROVIDER_TOKEN"), "auth.social.native.errorInvalid"],
    [refusal(503, "PROVIDER_NOT_CONFIGURED"), "auth.social.native.errorUnavailable"],
    [refusal(503, "PROVIDER_UNAVAILABLE"), "auth.social.native.errorUnavailable"],
    [refusal(409, "ACCOUNT_EMAIL_UNVERIFIED"), "auth.social.native.errorEmailUnverified"],
    [refusal(403, "COACH_REJECTED"), "auth.social.errorCoachRejected|help@example.test"],
    [refusal(401, "ACCOUNT_DISABLED"), "auth.social.errorDisabled|help@example.test"],
    [new Error("Network Error"), "auth.social.native.errorNetwork"],
  ])("%j", async (err, copy) => {
    socialSignIn.mockRejectedValue(err);
    const { n } = await mount();
    await n.press("social-apple");
    await n.flush();
    expect(n.byTestId("social-error").props.children).toBe(copy);
  });
});
