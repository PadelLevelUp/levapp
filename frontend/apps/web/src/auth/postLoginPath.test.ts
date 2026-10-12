import { afterEach, describe, expect, it } from "vitest";
import { legalCatchUpSession } from "@levelup/config";
import type { MeResponse } from "@/api/auth";
import { postLoginLanding, postLoginPath } from "./postLoginPath";

/** PAD-637 (auth.legal-catch-up rules 2, 4, 6): an account with something pending lands on the
 * catch-up screen, after the email code and the coach holds, unless it skipped it this session. */
const me = (over: Partial<MeResponse>): MeResponse =>
  ({ id: 7, username: "u", status: "active", roles: ["player"], coaches: [{ id: 1 }], ...over }) as unknown as MeResponse;

afterEach(() => legalCatchUpSession.reset());

describe("postLoginLanding — the next-login catch-up", () => {
  it("lands on the catch-up when the Terms are pending", () => {
    expect(postLoginLanding(me({ legalPending: { terms: true, birthDate: false } }))).toBe("/legal-catch-up");
  });

  it("lands as usual when nothing is pending or the server predates the field", () => {
    expect(postLoginLanding(me({ legalPending: { terms: false, birthDate: false } }))).toBe("/dashboard");
    expect(postLoginLanding(me({}))).toBe("/dashboard");
  });

  it("lands as usual after a skip this session", () => {
    legalCatchUpSession.skip(7);
    expect(postLoginLanding(me({ legalPending: { terms: true, birthDate: true } }))).toBe("/dashboard");
  });

  it("keeps the email code and the coach holds first", () => {
    const pending = { legalPending: { terms: true, birthDate: true } };
    expect(postLoginLanding(me({ ...pending, emailVerification: "pending" }))).toBe("/verify-email");
    expect(postLoginLanding(me({ ...pending, roles: ["coach"], coachApproval: "pending" }))).toBe("/coach-pending");
  });

  it("is not a gate: the route guard never sends anyone to it", () => {
    expect(postLoginPath(me({ legalPending: { terms: true, birthDate: true } }))).toBe("/dashboard");
  });
});
