import axios, { type AxiosInstance } from "axios";
import type { TokenStorage } from "./storage";

export interface ApiClientOptions {
  baseURL: string;
  storage: TokenStorage;
  /**
   * Called after a 401 response (the token has already been removed from
   * storage). Web redirects to /auth; mobile resets navigation to the login
   * screen.
   */
  onUnauthorized?: () => void;
  /**
   * What this shell understands, sent on every request as one
   * `X-LevApp-Capabilities` header (PAD-352, `eligibility.open-spot-visibility`
   * rule 12). The server withholds features from a client that doesn't list
   * them, because the App Store builds that predate a feature would draw it
   * wrongly. Default: none. A shell declares only what it renders, so a new
   * shell never inherits a promise it can't keep.
   */
  capabilities?: readonly string[];
}

/** The header the server reads capabilities from (PAD-352). */
export const CAPABILITIES_HEADER = "X-LevApp-Capabilities";

/**
 * Creates an axios instance replicating the app's auth behavior:
 * - request interceptor attaches `Authorization: Bearer <token>`, and the
 *   shell's declared capabilities, if any
 * - response interceptor persists the rolling-refresh `x-new-token` header
 * - a 401 removes the token and invokes `onUnauthorized`
 */
export function createApiClient(options: ApiClientOptions): AxiosInstance {
  const { baseURL, storage, onUnauthorized, capabilities } = options;
  const declared = (capabilities ?? []).join(", ");

  const api = axios.create({ baseURL });

  api.interceptors.request.use(async (config) => {
    const token = await storage.getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (declared) {
      config.headers[CAPABILITIES_HEADER] = declared;
    }
    return config;
  });

  api.interceptors.response.use(
    async (response) => {
      const newToken = response.headers["x-new-token"];
      if (newToken) {
        await storage.setToken(newToken);
      }
      return response;
    },
    async (error) => {
      const status = error?.response?.status;

      if (status === 401) {
        await storage.removeToken();
        onUnauthorized?.();
      }

      return Promise.reject(error);
    }
  );

  return api;
}

let apiSingleton: AxiosInstance | null = null;

/** Creates the shared client and registers it as the module singleton. */
export function initApi(options: ApiClientOptions): AxiosInstance {
  apiSingleton = createApiClient(options);
  return apiSingleton;
}

/** Returns the singleton created by `initApi`. */
export function getApi(): AxiosInstance {
  if (!apiSingleton) {
    throw new Error(
      "@levelup/api: initApi() must be called before using the API client"
    );
  }
  return apiSingleton;
}
