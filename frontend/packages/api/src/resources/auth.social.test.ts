import { describe, it, expect, vi, beforeEach } from "vitest";
import type { InternalAxiosRequestConfig } from "axios";
import { initApi } from "../client";
import * as authApi from "./auth";
import type { TokenStorage } from "../storage";

const storage: TokenStorage = {
  getToken: vi.fn(async () => null),
  setToken: vi.fn(async () => {}),
  removeToken: vi.fn(async () => {}),
};

function install(data: unknown = {}, status = 200) {
  const client = initApi({ baseURL: "http://api.test", storage });
  const seen: InternalAxiosRequestConfig[] = [];
  client.defaults.adapter = async (config) => {
    seen.push(config);
    return { data, status, statusText: "", headers: {}, config };
  };
  return seen;
}

beforeEach(() => vi.clearAllMocks());

describe("auth.social-sign-in client", () => {
  it("posts the provider token to /auth/social and returns a login answer", async () => {
    const login = { accessToken: "t", user: { id: 1, name: "Ana", role: "coach" } };
    const seen = install(login);
    const res = await authApi.socialSignIn({ provider: "google", idToken: "id-tok" });
    expect(seen[0].method).toBe("post");
    expect(seen[0].url).toBe("/auth/social");
    expect(JSON.parse(seen[0].data)).toEqual({ provider: "google", idToken: "id-tok" });
    expect(res).toEqual(login);
  });

  it("returns the needsProfile answer untouched", async () => {
    const body = { needsProfile: true, signupTicket: "tk", name: "Rita", email: "rita@example.com" };
    install(body);
    const res = await authApi.socialSignIn({ provider: "google", idToken: "x", nonce: "n" });
    expect("needsProfile" in res && res.signupTicket).toBe("tk");
  });

  it("posts the completion to /auth/social/complete", async () => {
    const login = { accessToken: "t", user: { id: 2, name: "Rita", role: "player" } };
    const seen = install(login);
    const payload = {
      signupTicket: "tk",
      role: "student" as const,
      birthDate: "1990-01-01",
      country: "PT",
      termsAccepted: true as const,
    };
    const res = await authApi.completeSocialSignUp(payload);
    expect(seen[0].url).toBe("/auth/social/complete");
    expect(JSON.parse(seen[0].data)).toEqual(payload);
    expect(res).toEqual(login);
  });
});
