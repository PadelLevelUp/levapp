import { API_BASE_URL } from "@/api/base";
import { currentPushEndpoint } from "@/utils/pushNotifications";

/** How long the sign-out request waits for this browser's subscription before going without it. */
export const ENDPOINT_WAIT_MS = 1_000;

async function endpointOrNull(): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ENDPOINT_WAIT_MS);
  });
  try {
    return await Promise.race([currentPushEndpoint(), late]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * auth.logout rule 4 (PAD-753): revokes `token` on the server and, in the same request, removes this
 * browser's push subscription, so a signed-out browser stops receiving the account's messages.
 *
 * Best effort, never awaited by the sign-out. `fetch` with the token it is given, not the API client:
 * the client reads the token when the request leaves, when the sign-out has already removed it (or
 * the next account has stored its own), and its 401 and refresh handling would touch that session.
 */
export async function signOutOnServer(token: string): Promise<void> {
  const pushEndpoint = await endpointOrNull();
  try {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(pushEndpoint ? { pushEndpoint } : {}),
    });
  } catch {
    // The token is gone from this browser either way.
  }
}
