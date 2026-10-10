/**
 * PAD-575 (auth.register rule 20): what a student typed into the sign-up form survives a detour.
 * On iOS Safari the report was: fill the form, open the Terms, come back, everything gone — a
 * same-tab trip that remounts the SPA route, a back-forward-cache miss, or a discarded tab. The
 * form's draft therefore lives in the tab's sessionStorage from the first keystroke until the
 * account exists, and the page restores it on mount. Passwords are never written: the one thing a
 * returning student retypes. Pure, with the storage injected, so the rule is unit-tested; web-only
 * (the native form never unmounts while the documents open), hence `apps/web/src/lib`.
 */

export const SIGNUP_DRAFT_KEY = "levapp.signupDraft";
/** The fields a draft may carry; anything else in storage is dropped on read. */
export const SIGNUP_DRAFT_FIELDS = ["name", "username", "email", "birthDate", "country"] as const;
export const SIGNUP_DRAFT_PRIVATE_FIELDS: readonly string[] = ["password", "repeatPassword"];

export type SignupDraftField = (typeof SIGNUP_DRAFT_FIELDS)[number];
export type SignupDraft = {
  role?: string;
  form?: Partial<Record<SignupDraftField, string>>;
  termsAccepted?: boolean;
};

export type DraftStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

/** The one normaliser: known fields only, strings only, non-empty only, never a password. */
function normalise(value: unknown): SignupDraft | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.form !== undefined && (typeof v.form !== "object" || v.form === null)) return null;
  const raw = (v.form ?? {}) as Record<string, unknown>;
  const form: Partial<Record<SignupDraftField, string>> = {};
  for (const key of SIGNUP_DRAFT_FIELDS) {
    const x = raw[key];
    if (typeof x === "string" && x !== "") form[key] = x;
  }
  return {
    role: typeof v.role === "string" ? v.role : undefined,
    form,
    termsAccepted: v.termsAccepted === true,
  };
}

function isBlank(draft: SignupDraft): boolean {
  return !draft.termsAccepted && Object.keys(draft.form ?? {}).length === 0;
}

export function signupDraftStore(storage: DraftStorage | null | undefined) {
  return {
    /** The saved draft, or null when there is none or it cannot be read (private mode, garbage). */
    read(): SignupDraft | null {
      try {
        const raw = storage?.getItem(SIGNUP_DRAFT_KEY);
        return raw ? normalise(JSON.parse(raw)) : null;
      } catch {
        return null;
      }
    },
    /** Save the draft without its passwords; a blank draft removes whatever was stored. */
    write(draft: SignupDraft): void {
      const clean = normalise(draft);
      try {
        if (!clean || isBlank(clean)) {
          storage?.removeItem(SIGNUP_DRAFT_KEY);
          return;
        }
        storage?.setItem(SIGNUP_DRAFT_KEY, JSON.stringify(clean));
      } catch {
        // private mode / quota: the page keeps working without a draft
      }
    },
    /** The account exists: nothing to restore any more. An abandoned draft is kept on purpose
     *  until the tab closes, so a student who comes back later does not retype. */
    clear(): void {
      try {
        storage?.removeItem(SIGNUP_DRAFT_KEY);
      } catch {
        // nothing to do
      }
    },
  };
}

/**
 * The browser's store. Merely reading `window.sessionStorage` throws in Safari when site data
 * is blocked, so the lookup itself is guarded; such a page runs with no draft rather than no form.
 */
export function browserSignupDraft() {
  try {
    return signupDraftStore(typeof window === "undefined" ? null : window.sessionStorage);
  } catch {
    return signupDraftStore(null);
  }
}
