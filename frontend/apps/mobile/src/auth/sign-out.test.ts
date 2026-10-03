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
    expect(src.slice(at, at + 500)).toMatch(/endSessionState\(\);\s*setUser\(null\)/);
  });
});

