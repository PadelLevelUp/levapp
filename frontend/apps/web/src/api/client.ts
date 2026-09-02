import { initApi, getApi, type TokenStorage } from "@levelup/api";

// Web platform adapter: tokens live in localStorage.
export const webTokenStorage: TokenStorage = {
  async getToken() {
    return localStorage.getItem("accessToken");
  },
  async setToken(token: string) {
    localStorage.setItem("accessToken", token);
  },
  async removeToken() {
    localStorage.removeItem("accessToken");
  },
};

function redirectToAuth() {
  const authPath = "/auth";

  if (window.location.pathname !== authPath) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.assign(`${authPath}?next=${next}`);
  }
}

initApi({
  baseURL: "/api",
  storage: webTokenStorage,
  onUnauthorized: redirectToAuth,
});

export const api = getApi();
