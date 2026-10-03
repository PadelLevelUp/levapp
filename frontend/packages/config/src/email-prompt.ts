// PAD-482 (auth.email-verification rule 14): a signed-in coach with no email is asked for one with a
// banner on the coach home, web and iOS. Never a hold. "Agora não" hides it for the session only:
// nothing is stored, so it is back at the next sign-in or launch.

/** The fields of `/api/auth/me` the ask reads. */
export interface EmailPromptUser {
  id: number | string;
  roles?: string[];
  email?: string | null;
}

/** Rule 14: a coach whose account has no email. A player never: coach-created players have none by design. */
export function asksForEmail(user: EmailPromptUser | null | undefined): boolean {
  if (!user || !(user.roles ?? []).includes("coach")) return false;
  return !(user.email ?? "").trim();
}

// Held in memory only: a reload or a relaunch starts a new session, and signing out ends it.
let dismissedFor: string | null = null;

export const emailPromptSession = {
  /** "Agora não": hide the banner for this user until the session ends. */
  dismiss(userId: number | string): void {
    dismissedFor = String(userId);
  },
  isDismissed(userId: number | string): boolean {
    return dismissedFor === String(userId);
  },
  /** Called on sign-out: the next sign-in asks again. */
  reset(): void {
    dismissedFor = null;
  },
};
