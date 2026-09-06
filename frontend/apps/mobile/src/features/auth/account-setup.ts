/**
 * Pure logic behind the three native account-creation screens (PAD-164):
 * player-invite, coach-invite and register.
 *
 * Everything a screen decides *before* it renders lives here — what the route
 * param means, whether the form is valid, and what an HTTP failure should say —
 * so that all of it is unit-testable. `apps/mobile`'s vitest setup runs a plain
 * Node environment with `react-native` stubbed out (see vitest.config.ts), so a
 * module that imports a component or a navigator cannot be tested at all. This
 * one imports nothing but zod and the (already pure) universal-link parser.
 *
 * ## Error codes, not error strings
 *
 * The zod schemas carry i18n key *suffixes* (`"usernameMin"`) rather than
 * English messages, exactly as web's three pages do. The screen prefixes them
 * with its own namespace — `auth.playerInvite.usernameMin`,
 * `auth.coachInvite.usernameMin`, `auth.register.usernameMin` — which is why
 * the same suffix appears under all three namespaces in
 * `src/locales/{en,pt}/auth.json`, and why no English literal ever reaches JSX.
 *
 * ## Why the rules are duplicated from web rather than shared
 *
 * `@levelup/validation` holds the schemas both platforms share (login), but
 * web's register/invite pages declare theirs inline in the page files. Lifting
 * those into the shared package would mean editing three web pages in an
 * iOS-parity ticket. The rules are pinned here instead, and the test asserts
 * them against the numbers web uses (name ≥ 2, username ≥ 3, password ≥ 6,
 * matching repeat, valid email on register).
 */
import { z } from "zod";

import { parseUniversalLink } from "@/lib/universalLinks";

/* ---------- route params ---------- */

/**
 * Expo Router hands a dynamic segment over as `string | string[] | undefined`
 * (an array when a catch-all matched). Collapse that to the first value.
 */
function firstParam(raw: string | string[] | undefined): string {
  if (Array.isArray(raw)) return raw[0] ?? "";
  return raw ?? "";
}

/**
 * The token an `/invite/{player,coach}/:token` route was opened with, or `null`
 * when the link is unusable.
 *
 * The raw param is not trusted directly: it is folded back into the path shape
 * and run through `parseUniversalLink`, the one validator PAD-184's test suite
 * pins. That is what rejects a blank, whitespace-only or multi-segment token
 * before the screen fires a request at the API with an empty token in the URL.
 */
export function inviteTokenFromParam(
  kind: "player" | "coach",
  raw: string | string[] | undefined
): string | null {
  const value = firstParam(raw);
  const target = parseUniversalLink(`/invite/${kind}/${value}`);
  if (!target) return null;
  if (kind === "player" && target.kind === "player-invite") return target.token;
  if (kind === "coach" && target.kind === "coach-invite") return target.token;
  return null;
}

/** The user id a `/register/:userId` route was opened with, or `null`. */
export function registerUserIdFromParam(
  raw: string | string[] | undefined
): string | null {
  const value = firstParam(raw);
  const target = parseUniversalLink(`/register/${value}`);
  return target && target.kind === "register" ? target.userId : null;
}

/* ---------- form validation ---------- */

const passwordPair = {
  password: z.string().min(6, "passwordMin"),
  repeatPassword: z.string(),
};

/** The repeat-password rule, spelled the same way on all three forms. */
const passwordsMatch = (data: { password: string; repeatPassword: string }) =>
  data.password === data.repeatPassword;
const mismatchIssue = {
  message: "passwordsMismatch",
  path: ["repeatPassword"],
};

/** `/invite/player/:token` — the player picks a username and password. */
export const playerInviteSchema = z
  .object({
    username: z.string().min(3, "usernameMin"),
    ...passwordPair,
  })
  .refine(passwordsMatch, mismatchIssue);

/** `/invite/coach/:token` — a coach also gives their display name. */
export const coachInviteSchema = z
  .object({
    name: z.string().min(2, "nameMin"),
    username: z.string().min(3, "usernameMin"),
    ...passwordPair,
  })
  .refine(passwordsMatch, mismatchIssue);

/** `/register/:userId` — activation of an account a coach already created. */
export const registerSchema = z
  .object({
    name: z.string().min(2, "nameMin"),
    username: z.string().min(3, "usernameMin"),
    email: z.string().email("emailInvalid"),
    phone: z.string().optional(),
    ...passwordPair,
  })
  .refine(passwordsMatch, mismatchIssue);

export type FieldErrorCodes = Record<string, string>;

/**
 * Validate a form's values against one of the schemas above.
 *
 * Returns the i18n key suffix per offending field (first issue wins, as web's
 * `forEach` assignment effectively does), or an empty object when valid.
 */
export function validateAccountForm(
  schema: z.ZodTypeAny,
  values: Record<string, unknown>
): FieldErrorCodes {
  const result = schema.safeParse(values);
  if (result.success) return {};

  const errors: FieldErrorCodes = {};
  for (const issue of result.error.errors) {
    const field = String(issue.path[0] ?? "");
    if (!field || errors[field]) continue;
    errors[field] = issue.message;
  }
  return errors;
}

/* ---------- submit failures ---------- */

/**
 * What a failed accept/activate call means to the user.
 *
 * - `username-taken` (409): recoverable in place — show it under the form.
 * - `invalid-token` (404/410): the link itself is dead (unknown, used, revoked
 *   or expired), so the screen swaps to its invalid state rather than inviting
 *   another attempt at a request that can never succeed.
 * - `generic`: everything else, including a request that never reached the
 *   server (no `response` at all — the App Store 2.1(a) failure mode the login
 *   screen already guards against).
 */
export type SubmitOutcome = "username-taken" | "invalid-token" | "generic";

export function submitOutcomeForStatus(
  status: number | undefined | null
): SubmitOutcome {
  if (status === 409) return "username-taken";
  if (status === 404 || status === 410) return "invalid-token";
  return "generic";
}

/** Pulls the HTTP status off an axios-shaped rejection, if there is one. */
export function statusFromError(error: unknown): number | undefined {
  const response = (error as { response?: { status?: number } } | null)?.response;
  return typeof response?.status === "number" ? response.status : undefined;
}

/** Convenience: `statusFromError` + `submitOutcomeForStatus`. */
export function submitOutcomeForError(error: unknown): SubmitOutcome {
  return submitOutcomeForStatus(statusFromError(error));
}
