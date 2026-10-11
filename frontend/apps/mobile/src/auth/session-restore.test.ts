/**
 * PAD-587 (mobile.launch rule 1): the session restore runs once per launch however many callers
 * ask for it, and a consumed restore can be forgotten so a remount restores afresh.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const { getMe } = vi.hoisted(() => ({ getMe: vi.fn(async () => ({ id: 1, roles: ["coach"] })) }));
vi.mock("@levelup/api", () => ({ authApi: { getMe } }));
vi.mock("@/lib/api", () => ({
  api: {},
  purgeTokenOnFreshInstall: vi.fn(async () => undefined),
  secureTokenStorage: { getToken: vi.fn(async () => "token"), removeToken: vi.fn(async () => undefined) },
  setUnauthorizedHandler: vi.fn(),
}));
vi.mock("@/lib/i18n", () => ({ default: { language: "pt", changeLanguage: vi.fn() } }));
vi.mock("@/lib/push", () => ({ getPushRegistrar: () => ({ register: vi.fn() }) }));
vi.mock("expo-router", () => ({ router: { replace: vi.fn() } }));
vi.mock("expo-notifications", () => ({}));
vi.mock("@/auth/sign-out", () => ({ endSessionState: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/launch-timeline", () => ({ launchMark: vi.fn() }));

import { resetSessionRestore, startSessionRestore } from "./AuthContext";

afterEach(() => {
  resetSessionRestore();
  getMe.mockClear();
});

describe("startSessionRestore (PAD-587)", () => {
  it("two callers share one /auth/me", async () => {
    const [a, b] = await Promise.all([startSessionRestore(), startSessionRestore()]);
    expect(a).toEqual({ id: 1, roles: ["coach"] });
    expect(b).toBe(a);
    expect(getMe).toHaveBeenCalledTimes(1);
  });

  it("after a reset the next caller restores afresh", async () => {
    await startSessionRestore();
    resetSessionRestore();
    await startSessionRestore();
    expect(getMe).toHaveBeenCalledTimes(2);
  });
});
