import { getApi } from "../client";

export type MeResponse = {
  /** auth.parental-consent rule 11 (PAD-198): "granted" once a guardian consented; null otherwise. */
  guardianConsent?: "granted" | null;
  birthDate?: string | null;
  country?: string | null;
  id: number;
  username: string;
  name: string;
  roles: string[];
  coachId: string | null;
  /**
   * PAD-225: a student's coaches (`coach_in_player`), `[]` for a coach. This —
   * not an empty calendar — is what "not connected to a coach yet" means.
   */
  coaches?: { id: number; name: string }[];
  isSuperAdmin: boolean;
  language?: "pt" | "en";
  /** PAD-81: profile fields the Settings profile form is hydrated from. */
  abbreviation?: string;
  email?: string | null;
  phone?: string | null;
  /**
   * PAD-112: the student's standing block preferences for class-slot
   * solicitations. Three INDEPENDENT levels — `blockAllNotifications` is a
   * superset in effect, but it does not imply or clear the other two.
   */
  blockAutoInvitations?: boolean;
  blockManualInvitations?: boolean;
  blockAllNotifications?: boolean;
  /** Free text the student writes; deliberately visible to their coach. */
  notificationBlockReason?: string;
  /** PAD-232: request alerts opt-out (notifications.request-alerts rule 6). */
  requestAlerts?: boolean;
  /**
   * auth.coach-approval: a self-registered coach is `pending` until a LevApp
   * admin approves them; `null` for students. Existing coaches were backfilled
   * to `approved`, so an absent value is treated as approved by callers.
   */
  coachApproval?: CoachApprovalStatus | null;
  /** auth.register rule 9: the coach's clubs (empty for a student). */
  clubs?: ClubSummary[];
  /** clubs.join-request rule 6: the most recent pending request, or null. */
  pendingClubJoinRequest?: PendingClubJoinRequest | null;
  /**
   * auth.email-verification rule 2: `pending` means the person must type the
   * 6-digit code before anything else opens (self-signup, or a new email
   * saved in Settings). `unverified` is an email nobody asked them to verify
   * (coach-typed) — never held. Absent on an older backend: treated as
   * verified.
   */
  emailVerification?: EmailVerificationState;
  /** Seconds until "Send a new code" is allowed again; 0 when it is. */
  emailVerificationResendInSeconds?: number;
};

export type EmailVerificationState = "verified" | "pending" | "unverified";

export type CoachApprovalStatus = "pending" | "approved" | "rejected";

export type ClubSummary = { id: number; name: string };

export type PendingClubJoinRequest = {
  id: number;
  clubId: number;
  clubName: string;
};

/** auth.register rule 1 (+ rules 16–17, PAD-198): the self-service signup body. */
export type RegisterPayload = {
  role: "coach" | "student";
  name: string;
  username: string;
  email: string;
  password: string;
  /** YYYY-MM-DD, required since PAD-198. */
  birthDate: string;
  /** ISO 3166-1 alpha-2, required since PAD-198. */
  country: string;
  /** Required when the person is under their country's age of digital consent. */
  guardianEmail?: string;
};

/**
 * An adult gets the login shape (`accessToken` + `user`). A minor gets no
 * token: `guardianConsent: "pending"` plus where the guardian's mail went
 * (auth.parental-consent rule 3).
 */
export type RegisterResponse = {
  accessToken?: string;
  guardianConsent?: "pending";
  guardianEmail?: string | null;
  resendAvailableInSeconds?: number;
  user: {
    id: number;
    name: string;
    role: "coach" | "player";
    emailVerification?: EmailVerificationState;
    guardianConsent?: "pending";
  };
};

/**
 * auth.register: create your own account. 201 on success; 400 (validation) or
 * 409 (username/email taken) come back as `{error, field?}` on the axios
 * error's `response.data`.
 */
export async function register(payload: RegisterPayload): Promise<RegisterResponse> {
  const res = await getApi().post("/auth/register", payload);
  return res.data;
}

/**
 * PAD-81: partial update of the signed-in user's own profile. Only the keys
 * present are changed server-side, so callers can save a single field.
 */
export type UpdateMePayload = {
  language?: "pt" | "en";
  name?: string;
  abbreviation?: string;
  email?: string;
  phone?: string;
  /** PAD-112 — see MeResponse. Sending `false` clears the flag. */
  blockAutoInvitations?: boolean;
  blockManualInvitations?: boolean;
  blockAllNotifications?: boolean;
  notificationBlockReason?: string;
  /** PAD-232: request alerts opt-out (notifications.request-alerts rule 6). */
  requestAlerts?: boolean;
};

export async function getMe(): Promise<MeResponse> {
  const res = await getApi().get("/auth/me");
  return res.data;
}

export async function updateMe(payload: UpdateMePayload): Promise<MeResponse> {
  const res = await getApi().patch("/auth/me", payload);
  return res.data;
}

/** Soft-deletes the signed-in account and invalidates all sessions server-side (App Store 5.1.1(v)). */
export async function deleteAccount(): Promise<void> {
  await getApi().delete("/auth/me");
}

// ── auth.email-verification ────────────────────────────────────────────────

export type SendVerificationCodeResponse = {
  email: string;
  expiresInSeconds: number;
  resendAvailableInSeconds: number;
};

/**
 * Rule 4: mail a fresh 6-digit code to the signed-in user's own email.
 * Errors come back as `{error, retryAfterSeconds?}` on `response.data`:
 * 429 RESEND_TOO_SOON, 409 ALREADY_VERIFIED, 400 NO_EMAIL, 503 MAIL_FAILED.
 */
export async function sendEmailVerificationCode(): Promise<SendVerificationCodeResponse> {
  const res = await getApi().post("/auth/email-verification/send");
  return res.data;
}

/**
 * Rule 5: check the code. 200 answers with the `/auth/me` payload so the
 * caller can route on it; 400 `{error: "INVALID_CODE", attemptsLeft}`;
 * 410 `{error: "CODE_EXPIRED"}` — offer "Send a new code".
 */
export async function confirmEmailVerificationCode(code: string): Promise<MeResponse> {
  const res = await getApi().post("/auth/email-verification/confirm", { code });
  return res.data;
}

// ── auth.password-recovery (PAD-139) ────────────────────────────────────────

export type PasswordRecoveryRequestResponse = {
  ok: true;
  expiresInSeconds: number;
  resendAvailableInSeconds: number;
};

export type PasswordRecoveryConfirmPayload = {
  email: string;
  code: string;
  newPassword: string;
};

export type PasswordRecoveryConfirmResponse = {
  accessToken: string;
  user: { id: number; name: string; role: "coach" | "player" };
};

/**
 * Rule 2: mail the username and a 6-digit code to the account with this
 * email. Always 200 with the same body, whether or not the email has an
 * account; the only error is 400 `INVALID_EMAIL`. No session needed.
 */
export async function requestPasswordRecovery(email: string): Promise<PasswordRecoveryRequestResponse> {
  const res = await getApi().post("/auth/password-recovery/request", { email });
  return res.data;
}

/**
 * Rule 6: code + new password. 200 answers with the login body (token +
 * user); 400 `{error: "INVALID_CODE", attemptsLeft}` or `WEAK_PASSWORD`;
 * 410 `{error: "CODE_EXPIRED"}` — offer "Send a new code".
 */
export async function confirmPasswordRecovery(
  payload: PasswordRecoveryConfirmPayload,
): Promise<PasswordRecoveryConfirmResponse> {
  const res = await getApi().post("/auth/password-recovery/confirm", payload);
  return res.data;
}

// ── auth.coach-approval rule 12 (PAD-233) ───────────────────────────────────

/**
 * A rejected coach asks for approval again, from the login screen, with the
 * credentials they just typed. 200 answers with the login body (the client
 * signs them in and lands on the pending screen); 401 wrong credentials;
 * 410 not a rejected coach. The login itself answers 403
 * `{error: "COACH_REJECTED", reason}` for a rejected coach (rule 11).
 */
export async function reapplyCoachApproval(payload: { username: string; password: string }): Promise<{
  accessToken: string;
  user: { id: number; name: string; role: "coach" | "player" };
}> {
  const res = await getApi().post("/auth/coach-approval/reapply", payload);
  return res.data;
}

// ── auth.parental-consent (PAD-198) ─────────────────────────────────────────

/** Where the guardian's mail went and when another may be sent. */
export type GuardianPendingInfo = {
  guardianEmail: string | null;
  resendAvailableInSeconds: number;
};

/**
 * Rule 5: a pending minor asks for a new consent link, with the credentials
 * they just typed (no session exists). 401 wrong credentials; 409 NOT_PENDING;
 * 429 RESEND_TOO_SOON {retryAfterSeconds}; 400 {field: "guardianEmail"}.
 */
export async function resendGuardianConsent(payload: {
  username: string;
  password: string;
  guardianEmail?: string;
}): Promise<GuardianPendingInfo> {
  const res = await getApi().post("/auth/guardian-consent/resend", payload);
  return res.data;
}

export type GuardianConsentRequest = {
  minor: { name: string; username: string; birthDate: string | null; country: string | null; role: "coach" | "player" };
  guardianEmail: string;
  termsVersion: string;
  expiresAt: string;
};

/** Rule 7: what the guardian confirms. 410 CONSENT_LINK_EXPIRED; 409 ALREADY_DECIDED. */
export async function getGuardianConsent(token: string): Promise<GuardianConsentRequest> {
  const res = await getApi().get(`/auth/guardian-consent/${encodeURIComponent(token)}`);
  return res.data;
}

export type GuardianConsentPayload = {
  guardianName: string;
  relationship: "parent" | "legal_guardian";
  confirmMinorDetails: boolean;
  acceptTerms: boolean;
};

/** Rule 8: the guardian consents. 400 {field}; 410; 409. */
export async function giveGuardianConsent(token: string, payload: GuardianConsentPayload): Promise<{ ok: true }> {
  const res = await getApi().post(`/auth/guardian-consent/${encodeURIComponent(token)}`, payload);
  return res.data;
}

/** Rule 9: the guardian declines before consenting — the account is removed. */
export async function declineGuardianConsent(token: string): Promise<{ ok: true }> {
  const res = await getApi().post(`/auth/guardian-consent/${encodeURIComponent(token)}/decline`, { confirm: true });
  return res.data;
}

export type GuardianRevokeRequest = {
  minor: { name: string; username: string };
  consentedAt: string | null;
};

/** Rule 9: the withdraw page's data. 410 once withdrawn. */
export async function getGuardianRevoke(token: string): Promise<GuardianRevokeRequest> {
  const res = await getApi().get(`/auth/guardian-consent/revoke/${encodeURIComponent(token)}`);
  return res.data;
}

/** Rule 9: withdraw consent — the account and its data are removed. */
export async function revokeGuardianConsent(token: string): Promise<{ ok: true }> {
  const res = await getApi().post(`/auth/guardian-consent/revoke/${encodeURIComponent(token)}`, { confirm: true });
  return res.data;
}
