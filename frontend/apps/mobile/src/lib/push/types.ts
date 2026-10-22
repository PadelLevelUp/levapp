/**
 * Abstraction over native push-notification registration so the rest of the
 * app never talks to expo-notifications directly. Implementations must be
 * safe to call anywhere: they NEVER throw and NEVER reject.
 */
/**
 * messaging.push-notifications rule 15 (PAD-744): what the last registration came to.
 * `failed` is set only once the bounded retries are spent; `unsupported` is a simulator.
 */
export type PushStatus = "unknown" | "registered" | "no-permission" | "failed" | "unsupported";

export interface PushRegistrar {
  /**
   * Request permission, obtain a push token and sync it to the backend. Prompts: called only by
   * login, sign-up, a restored session and the Messages banner's tap (rule 15).
   */
  register(): Promise<void>;
  /**
   * Register without ever prompting: reads the permission and stops unless it is granted. The
   * foreground and the banner's grant use this (rule 15).
   */
  registerIfPermitted(): Promise<void>;
  /**
   * Listen for a rotated push token while signed in; the new token is cached and sent. Returns the
   * function that stops listening.
   */
  watchTokenRotation(): () => void;
  status(): PushStatus;
  /** Calls `listener` on every status change; returns the unsubscribe function. */
  onStatusChange(listener: (status: PushStatus) => void): () => void;
  /** Remove this device's token from the backend (e.g. on logout). */
  unregister(): Promise<void>;
  /**
   * The token this session registered, if it is known without a lookup —
   * sent in the /auth/logout body so the server drops the row in the same
   * authenticated request (auth.logout rule 4, PAD-418). Null when unknown.
   */
  cachedToken(): string | null;
}
