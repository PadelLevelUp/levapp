/**
 * Abstraction over native push-notification registration so the rest of the
 * app never talks to expo-notifications directly. Implementations must be
 * safe to call anywhere: they NEVER throw and NEVER reject.
 */
export interface PushRegistrar {
  /** Request permission, obtain a push token and sync it to the backend. */
  register(): Promise<void>;
  /** Remove this device's token from the backend (e.g. on logout). */
  unregister(): Promise<void>;
  /**
   * The token this session registered, if it is known without a lookup —
   * sent in the /auth/logout body so the server drops the row in the same
   * authenticated request (auth.logout rule 4, PAD-418). Null when unknown.
   */
  cachedToken(): string | null;
}
