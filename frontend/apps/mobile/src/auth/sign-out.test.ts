/**
 * PAD-418 / B-167 — messaging.push-notifications rule 9: the app unregisters its
 * push token on logout, so a shared phone stops receiving the previous user's
 * pushes. `/auth/logout` blocklists the access token, so the unregister DELETE
 * must reach the server BEFORE the session is revoked; a DELETE that arrives
 * after it is refused and the token stays on the old account.
 */
import { describe, expect, it, vi } from "vitest";

import { signOut } from "./sign-out";

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
});
