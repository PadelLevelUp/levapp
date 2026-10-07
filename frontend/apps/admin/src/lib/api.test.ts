import { afterEach, describe, expect, it, vi } from "vitest";

import { adminApi, api, ApiError, clearSession, getToken, readSession, SESSION_KEY, storeSession, TOKEN_KEY, UNAUTHORIZED_EVENT } from "./api";

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(body === undefined ? "" : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

afterEach(() => {
  clearSession();
  vi.restoreAllMocks();
});

describe("the admin API client (admin.foundation rule 3)", () => {
  it("sends the admin token as a bearer header and nothing else", async () => {
    storeSession("tok-1", { email: "ana@levapp.app", role: "operator", roleId: 1, expiresAt: new Date(Date.now() + 3600_000).toISOString() });
    const fetchImpl = fakeFetch(200, { items: [] });
    await api("/roles", { fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/admin/api/roles");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-1");
    expect(document.cookie).toBe("");
  });

  it("does not send a token on the two unauthenticated routes", async () => {
    storeSession("tok-1", { email: "ana@levapp.app", role: "operator", roleId: 1, expiresAt: new Date(Date.now() + 3600_000).toISOString() });
    const fetchImpl = fakeFetch(200, { configured: true, googleClientId: "x", staffDomain: "levapp.app" });
    await api("/auth/config", { auth: false, fetchImpl });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("a 401 ends the session: storage cleared and the app told", async () => {
    storeSession("tok-1", { email: "ana@levapp.app", role: "operator", roleId: 1, expiresAt: new Date(Date.now() + 3600_000).toISOString() });
    const heard = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, heard);
    await expect(api("/audit", { fetchImpl: fakeFetch(401, { error: "ADMIN_TOKEN_REQUIRED" }) })).rejects.toMatchObject({ status: 401, code: "ADMIN_TOKEN_REQUIRED" });
    expect(getToken()).toBeNull();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    expect(heard).toHaveBeenCalledTimes(1);
    window.removeEventListener(UNAUTHORIZED_EVENT, heard);
  });

  it("a refused sign-in keeps its error code and is not a session event", async () => {
    const heard = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, heard);
    await expect(api("/auth/google", { method: "POST", body: { credential: "c" }, auth: false, fetchImpl: fakeFetch(403, { error: "NOT_STAFF_DOMAIN" }) })).rejects.toBeInstanceOf(ApiError);
    expect(heard).not.toHaveBeenCalled();
    window.removeEventListener(UNAUTHORIZED_EVENT, heard);
  });

  it("a network failure is NETWORK", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(api("/roles", { fetchImpl })).rejects.toMatchObject({ status: 0, code: "NETWORK" });
  });

  it("an expired stored session is not read back (rule 3: no refresh)", () => {
    storeSession("tok-1", { email: "ana@levapp.app", role: "operator", roleId: 1, expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect(readSession()).toBeNull();
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("the audit query drops empty filters", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(fakeFetch(200, { items: [], page: 2, hasMore: false }) as unknown as typeof fetch);
    await adminApi.audit({ actorEmail: "", action: "role.grant", page: "2" });
    expect((spy.mock.calls[0] as unknown as [string])[0]).toBe("/admin/api/audit?action=role.grant&page=2");
  });
});
