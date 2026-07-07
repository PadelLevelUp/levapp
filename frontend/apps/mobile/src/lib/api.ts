import { initApi, type TokenStorage } from "@levelup/api";
import { File, Paths } from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import { API_URL } from "./config";

const TOKEN_KEY = "accessToken";

/**
 * The keychain outlives the app's data container (reinstall, or a test
 * runner's clear-state). Detect a fresh install via a marker file in the
 * document directory and drop any stale token so the app starts logged out.
 */
export async function purgeTokenOnFreshInstall(): Promise<void> {
  try {
    const marker = new File(Paths.document, ".installed");
    if (!marker.exists) {
      await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
      marker.create();
    }
  } catch {
    // Never block startup on marker bookkeeping.
  }
}

/** SecureStore-backed TokenStorage adapter for @levelup/api. */
export const secureTokenStorage: TokenStorage = {
  async getToken() {
    return SecureStore.getItemAsync(TOKEN_KEY);
  },
  async setToken(token: string) {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  },
  async removeToken() {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  },
};

// AuthContext registers the real handler once mounted (it clears user state
// and routes to /login). Indirection avoids a module cycle api <-> auth.
let unauthorizedHandler: (() => void) | undefined;

export function setUnauthorizedHandler(handler: () => void) {
  unauthorizedHandler = handler;
}

export const api = initApi({
  baseURL: API_URL,
  storage: secureTokenStorage,
  onUnauthorized: () => unauthorizedHandler?.(),
});
