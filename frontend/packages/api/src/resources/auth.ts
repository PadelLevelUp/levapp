import { getApi } from "../client";

export type MeResponse = {
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

/** auth.register rule 1: the self-service signup body. */
export type RegisterPayload = {
  role: "coach" | "student";
  name: string;
  username: string;
  email: string;
  password: string;
};

/** Same shape `POST /auth/login` returns, so the client signs in without a second request. */
export type RegisterResponse = {
  accessToken: string;
  user: {
    id: number;
    name: string;
    role: "coach" | "player";
    emailVerification?: EmailVerificationState;
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
