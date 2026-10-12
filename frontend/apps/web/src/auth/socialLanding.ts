import type { MeResponse } from "@/api/auth";
import { postLoginLanding } from "@/auth/postLoginPath";
import { consumePostAuthRedirect } from "@/auth/postAuthRedirect";

/**
 * auth.social-sign-in rule 5 — where a Google sign-in lands once the session is stored.
 * The same decision AuthPage makes after a password login: the role / approval landing
 * (`postLoginLanding`), except that a remembered post-auth path (join link / invite)
 * wins unless a coach gate (pending, no club) or the email-code screen holds the user.
 */
export function socialLandingPath(me: MeResponse | null | undefined): string {
  const target = postLoginLanding(me);
  const remembered = consumePostAuthRedirect();
  const gated = target !== "/dashboard" && target !== "/connect";
  return remembered && !gated ? remembered : target;
}
