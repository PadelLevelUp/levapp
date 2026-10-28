/**
 * PAD-418 / B-167 — messaging.push-notifications rule 9: the app unregisters its
 * push token on logout, so a shared phone stops receiving the previous user's
 * pushes. `/auth/logout` blocklists the access token, so the unregister DELETE
 * must reach the server BEFORE the session is revoked; a DELETE that arrives
 * after it is refused and the token stays on the old account.
 */
import { describe, expect, it, vi } from "vitest";

import { emailPromptSession } from "@levelup/config";

import { endSessionState, signOut } from "./sign-out";

/** A server that refuses the device DELETE once the session is revoked. */
function fakeServer() {
  const events: string[] = [];
  let revoked = false;
  let tokenStillRegistered = true;
  return {
    events,
    get tokenStillRegistered() {
      return tokenStillRegistered;
    },
    deleteDevice: async () => {
      if (revoked) {
        events.push("delete-refused");
        throw new Error("401");
      }
      tokenStillRegistered = false;
      events.push("delete");
    },
    revoke: async () => {
      revoked = true;
      events.push("revoke");
    },
  };
}

describe("signOut", () => {
  it("unregisters the push token before revoking the session, even when the token must be looked up first", async () => {
    const server = fakeServer();
    // Like expoPushRegistrar.unregister() with no cached token: it awaits
    // getDeviceToken() before sending the DELETE.
    const unregisterPush = async () => {
      await new Promise((r) => setTimeout(r, 20));
      await server.deleteDevice().catch(() => undefined);
    };
    const clearToken = vi.fn(async () => {
      server.events.push("clear");
    });

    await signOut({ unregisterPush, revokeSession: server.revoke, clearToken, unregisterTimeoutMs: 1000 });

    expect(server.events).toEqual(["delete", "revoke", "clear"]);
    expect(server.tokenStillRegistered).toBe(false);
  });

  it("never lets a hung unregister block logout", async () => {
    const server = fakeServer();
    const unregisterPush = () => new Promise<void>(() => undefined); // never settles
    const clearToken = vi.fn(async () => {
      server.events.push("clear");
    });

    await signOut({ unregisterPush, revokeSession: server.revoke, clearToken, unregisterTimeoutMs: 30 });

    expect(server.events).toEqual(["revoke", "clear"]);
  });

  it("still revokes and clears when unregister or revoke fail", async () => {
    const events: string[] = [];
    await signOut({
      unregisterPush: async () => {
        throw new Error("offline");
      },
      revokeSession: async () => {
        events.push("revoke");
        throw new Error("offline");
      },
      clearToken: async () => {
        events.push("clear");
      },
      unregisterTimeoutMs: 30,
    });
    expect(events).toEqual(["revoke", "clear"]);
  });

  it("never lets a hung revoke block logout (a blackholed /auth/logout)", async () => {
    const events: string[] = [];
    await signOut({
      unregisterPush: async () => {
        events.push("unregister");
      },
      revokeSession: () => new Promise<void>(() => undefined), // never settles
      clearToken: async () => {
        events.push("clear");
      },
      unregisterTimeoutMs: 30,
      revokeTimeoutMs: 30,
    });
    expect(events).toEqual(["unregister", "clear"]);
  });
});

// PAD-482 (auth.email-verification rule 14): "Agora não" lasts for the session; signing out ends it.
describe("signOut ends the email prompt's dismissal", () => {
  it("the next sign-in asks for a missing email again", async () => {
    emailPromptSession.dismiss(7);
    await signOut({ unregisterPush: async () => {}, revokeSession: async () => {}, clearToken: async () => {} });
    expect(emailPromptSession.isDismissed(7)).toBe(false);
  });
});

// #509 review: a session lost to a 401 (AuthContext's unauthorized handler) ends the same session-only state.
describe("a session lost to a 401", () => {
  it("endSessionState ends the email prompt's dismissal", () => {
    emailPromptSession.dismiss(7);
    endSessionState();
    expect(emailPromptSession.isDismissed(7)).toBe(false);
  });

  it("the 401 handler calls it before dropping the user", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(path.resolve(__dirname, "AuthContext.tsx"), "utf8");
    const at = src.indexOf("setUnauthorizedHandler(");
    expect(src.slice(at, at + 500)).toMatch(/endSessionState\(\);\s*(leaveToLogin\(\(\) => )?setUser\(null\)/);
  });
});


// PAD-716 (auth.logout rule 6, B-601): the next account on the device must not read the previous
// account's cached answers. The query cache is cleared on sign-out (after the token is gone), on a
// session lost to a 401, and on sign-in.
describe("a session's cached data ends with it", () => {
  it("signOut empties the query cache, including an answer that lands while signing out", async () => {
    const { QueryClient } = await import("@tanstack/react-query");
    const { bindSessionCache } = await import("./session-cache");
    const qc = new QueryClient();
    bindSessionCache(qc);
    qc.setQueryData(["auth-me"], { id: 1, role: "player" });
    qc.setQueryData(["conversations"], [{ id: 9 }]);
    await signOut({
      unregisterPush: async () => undefined,
      revokeSession: async () => {
        // A read that was in flight with the old session lands now.
        qc.setQueryData(["auth-me"], { id: 1, role: "player" });
      },
      clearToken: async () => undefined,
    });
    expect(qc.getQueryData(["auth-me"])).toBeUndefined();
    expect(qc.getQueryData(["conversations"])).toBeUndefined();
  });

  it("a session lost to a 401 empties it too", async () => {
    const { QueryClient } = await import("@tanstack/react-query");
    const { bindSessionCache } = await import("./session-cache");
    const qc = new QueryClient();
    bindSessionCache(qc);
    qc.setQueryData(["auth-me"], { id: 1 });
    endSessionState();
    expect(qc.getQueryData(["auth-me"])).toBeUndefined();
  });

  it("signing in empties it before reading the new account", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(path.resolve(__dirname, "AuthContext.tsx"), "utf8");
    const at = src.indexOf("const login = useCallback(");
    expect(src.slice(at, at + 400)).toMatch(/clearSessionCache\(\);[\s\S]*authApi\.getMe\(\)/);
  });

  it("the root layout binds the app's query client", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(path.resolve(__dirname, "../../app/_layout.tsx"), "utf8");
    expect(src).toMatch(/bindSessionCache\(queryClient\)/);
  });
});

// PAD-777 (auth.logout rule 7, B-697): a session that ends leaves the login screen alone on the root
// stack. `router.replace("/login")` alone swapped only the focused screen (Settings), so the tabs stayed
// underneath and the next sign-in stacked a second `(tabs)`; on iOS Settings' native back then went
// dead. The behaviour is flow 308; this pins the wiring.
describe("a session that ends dismisses the stack before showing the login screen", () => {
  async function authContext() {
    const fs = await import("node:fs");
    const path = await import("node:path");
    return fs.readFileSync(path.resolve(__dirname, "AuthContext.tsx"), "utf8");
  }

  it("leaveToLogin dismisses to the first route, then replaces it with the login screen", async () => {
    const src = await authContext();
    const at = src.indexOf("function leaveToLogin(");
    expect(at).toBeGreaterThan(-1);
    expect(src.slice(at, at + 200)).toMatch(/router\.dismissAll\(\);[\s\S]*dropUser\(\);[\s\S]*router\.replace\("\/login"\)/);
  });

  it("sign-out and a 401 both leave through it, and nothing else replaces to the login screen", async () => {
    const src = await authContext();
    const logout = src.indexOf("const logout = useCallback(");
    expect(src.slice(logout, logout + 1600)).toMatch(/leaveToLogin\(\(\) => setUser\(null\)\)/);
    const unauthorized = src.indexOf("setUnauthorizedHandler(");
    expect(src.slice(unauthorized, unauthorized + 500)).toMatch(/leaveToLogin\(\(\) => setUser\(null\)\)/);
    expect(src.match(/router\.replace\("\/login"\)/g)).toHaveLength(1);
  });
});
