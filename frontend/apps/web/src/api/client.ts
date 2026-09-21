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
  // PAD-352 (eligibility.open-spot-visibility rule 12): the web renders open
  // spots, so it asks for them. Without this, the server sends none.
  // PAD-364: `evaluations` is declared from slice 2 on and consumed by nothing yet — it will gate
  // the student dashboard block of a shared evaluation. Keep it: a missing token silently
  // removes the feature, nothing crashes.
  capabilities: ["open-spots", "evaluations"],
});

export const api = getApi();
