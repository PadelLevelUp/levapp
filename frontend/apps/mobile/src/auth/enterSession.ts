import { router } from "expo-router";
import type { authApi } from "@levelup/api";
import { postLoginLanding } from "@/auth/postLoginRoute";
import { consumePendingJoin } from "@/auth/pendingJoin";
import { consumePendingClaim } from "@/auth/pendingClaim";

type Session = {
  login: (accessToken: string) => Promise<void>;
  refreshUser: () => Promise<authApi.MeResponse | null>;
};

/**
 * Session in hand: hydrate and route exactly as a fresh password login does (login screen, PAD-233
 * and earlier). auth.register rule 11: route by approval / club state, not straight to the tabs.
 * players.join-token rule 9: a join link opened without a session comes first, once the account is
 * one that can use it. players.claim rule 3: an invite link opened to LINK an existing account.
 * Also the landing of a provider sign-in (auth.social-sign-in rule 5).
 */
export async function enterSession({ login, refreshUser }: Session, accessToken: string): Promise<void> {
  await login(accessToken);
  const route = postLoginLanding(await refreshUser());
  const pending = consumePendingJoin();
  const pendingClaim = consumePendingClaim();
  if (pendingClaim && (route === "/(tabs)/dashboard" || route === "/connect")) {
    router.replace(`/invite/player/${pendingClaim}`);
    return;
  }
  router.replace(pending && (route === "/(tabs)/dashboard" || route === "/connect") ? `/join/coach/${pending}` : route);
}

/** What a screen does with the server's answer to POST /auth/social (rules 2–3). */
export async function routeSocialResult(session: Session, res: authApi.SocialSignInResponse): Promise<void> {
  if ("needsProfile" in res) {
    router.push({
      pathname: "/signup-complete",
      params: { signupTicket: res.signupTicket, name: res.name, email: res.email },
    });
    return;
  }
  await enterSession(session, res.accessToken);
}
