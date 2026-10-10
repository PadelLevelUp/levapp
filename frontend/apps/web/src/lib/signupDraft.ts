/**
 * PAD-575 (auth.register rule 20): what a student typed into the sign-up form survives a detour.
 * On iOS Safari the report was: fill the form, open the Terms, come back, everything gone — a
 * same-tab trip that remounts the SPA route, a back-forward-cache miss, or a discarded tab. The
 * form's draft therefore lives in the tab's sessionStorage from the first keystroke until the
 * account exists, and the page restores it on mount. Passwords are never written: the one thing a
 * returning student retypes. Pure, with the storage injected, so the rule is unit-tested.
 */

export const SIGNUP_DRAFT_KEY = "levapp.signupDraft";
export const SIGNUP_DRAFT_PRIVATE_FIELDS: readonly string[] = ["password", "repeatPassword"];

export type SignupDraft = {
  role?: string;
  form?: Record<string, string>;
  termsAccepted?: boolean;
};

export type DraftStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function sanitise(draft: SignupDraft): SignupDraft {
  const form: Record<string, string> = {};
  for (const [k, v] of Object.entries(draft.form ?? {})) {
    if (SIGNUP_DRAFT_PRIVATE_FIELDS.includes(k)) continue;
    if (typeof v === "string") form[k] = v;
  }
  return { role: draft.role, form, termsAccepted: !!draft.termsAccepted };
}

function isBlank(draft: SignupDraft): boolean {
  return !draft.termsAccepted && Object.values(draft.form ?? {}).every((v) => !v || v === "");
}

function parse(raw: string | null): SignupDraft | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const v = value as Record<string, unknown>;
    if (v.form !== undefined && (typeof v.form !== "object" || v.form === null)) return null;
    const form = (v.form ?? {}) as Record<string, unknown>;
    if (Object.values(form).some((x) => typeof x !== "string")) return null;
    return sanitise({
      role: typeof v.role === "string" ? v.role : undefined,
      form: form as Record<string, string>,
      termsAccepted: v.termsAccepted === true,
    });
  } catch {
    return null;
  }
}

export function signupDraftStore(storage: DraftStorage | null | undefined) {
  return {
    /** The saved draft, or null when there is none or it cannot be read (private mode, garbage). */
    read(): SignupDraft | null {
      try {
        return parse(storage?.getItem(SIGNUP_DRAFT_KEY) ?? null);
      } catch {
        return null;
      }
    },
    /** Save the draft without its passwords; a blank draft is not written at all. */
    write(draft: SignupDraft): void {
      const clean = sanitise(draft);
      try {
        if (isBlank(clean)) return;
        storage?.setItem(SIGNUP_DRAFT_KEY, JSON.stringify(clean));
      } catch {
        // private mode / quota: the page keeps working without a draft
      }
    },
    /** The account exists (or the student gave up): nothing to restore any more. */
    clear(): void {
      try {
        storage?.removeItem(SIGNUP_DRAFT_KEY);
      } catch {
        // nothing to do
      }
    },
  };
}
