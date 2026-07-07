/**
 * Platform-agnostic token storage. Implementations are injected per platform:
 * web uses localStorage, mobile uses AsyncStorage / SecureStore, tests can
 * use an in-memory object.
 */
export interface TokenStorage {
  getToken(): Promise<string | null>;
  setToken(token: string): Promise<void>;
  removeToken(): Promise<void>;
}
