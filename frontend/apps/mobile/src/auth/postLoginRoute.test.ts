import { afterEach, describe, expect, it } from "vitest";
import { legalCatchUpSession } from "@levelup/config";
import type { authApi } from "@levelup/api";
import { appStartRoute, postLoginLanding, postLoginRoute } from "./postLoginRoute";

/** PAD-637 (auth.legal-catch-up rules 2, 4, 6): mirrors web's postLoginPath tests. */
const me = (over: Record<string, unknown>) =>
  ({ id: 7, username: "u", status: "active", roles: ["player"], coaches: [{ id: 1 }], ...over }) as unknown as authApi.MeResponse;
const pending = { legalPending: { terms: true, birthDate: false } };

afterEach(() => legalCatchUpSession.reset());

describe("the next-login catch-up on iOS", () => {
  it("lands on the catch-up after sign-in and on app start", () => {
    expect(postLoginLanding(me(pending))).toBe("/legal-catch-up");
    expect(appStartRoute(me(pending))).toBe("/legal-catch-up");
  });

  it("lands as usual when nothing is pending or after a skip", () => {
    expect(postLoginLanding(me({}))).toBe("/(tabs)/dashboard");
    legalCatchUpSession.skip(7);
    expect(postLoginLanding(me(pending))).toBe("/(tabs)/dashboard");
    expect(appStartRoute(me(pending))).toBe("/(tabs)/dashboard");
  });

  it("keeps the email code and the coach holds first", () => {
    expect(postLoginLanding(me({ ...pending, emailVerification: "pending" }))).toBe("/verify-email");
    expect(appStartRoute(me({ ...pending, roles: ["coach"], coachApproval: "pending" }))).toBe("/coach-pending");
  });

  it("is not a gate: the tab-layout guard never sends anyone to it", () => {
    expect(postLoginRoute(me(pending))).toBe("/(tabs)/dashboard");
  });
});
