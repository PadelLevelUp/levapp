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
}

/**
 * Creates an axios instance replicating the app's auth behavior:
 * - request interceptor attaches `Authorization: Bearer <token>`
 * - response interceptor persists the rolling-refresh `x-new-token` header
 * - a 401 removes the token and invokes `onUnauthorized`
 */
export function createApiClient(options: ApiClientOptions): AxiosInstance {
  const { baseURL, storage, onUnauthorized } = options;

  const api = axios.create({ baseURL });

  api.interceptors.request.use(async (config) => {
    const token = await storage.getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
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
