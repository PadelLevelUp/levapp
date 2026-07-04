import { initApi, type TokenStorage } from "@levelup/api";
import * as SecureStore from "expo-secure-store";
import { API_URL } from "./config";

const TOKEN_KEY = "accessToken";

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
