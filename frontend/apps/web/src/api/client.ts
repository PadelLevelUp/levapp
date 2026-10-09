import { initApi, getApi, type TokenStorage } from "@levelup/api";

import { endViewAs, getViewAsToken, isViewingAs } from "@/lib/viewAs";

// Web platform adapter: tokens live in localStorage. A "view as" token (PAD-532, rule 9) lives in
// this tab's sessionStorage and wins while present; the normal session is then never touched.
export const webTokenStorage: TokenStorage = {
  async getToken() {
    return getViewAsToken() ?? localStorage.getItem("accessToken");
  },
  async setToken(token: string) {
    if (isViewingAs()) return; // never refreshed (the server sends no X-New-Token for it)
    localStorage.setItem("accessToken", token);
  },
  async removeToken() {
    if (isViewingAs()) {
      endViewAs();
      return;
    }
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
  // PAD-429 (eligibility.open-spot-visibility rule 12): `class-type-defaults` lets the server
  // send the `type` open-spots source label instead of falling it back to `coach`.
  capabilities: ["open-spots", "evaluations", "class-type-defaults", "coach-invite-email", "terms-acceptance"],
});

export const api = getApi();
