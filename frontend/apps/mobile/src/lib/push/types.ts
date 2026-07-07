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
}
