/**
 * PAD-575 (auth.register rule 20): what a student typed into the sign-up form survives a detour
 * (the Terms or Privacy page opening in the same tab, a back-forward-cache miss, a discarded tab)
 * because it lives in the tab's sessionStorage until the account exists. Passwords never do.
 */
import { describe, expect, it } from "vitest";
import { SIGNUP_DRAFT_KEY, SIGNUP_DRAFT_PRIVATE_FIELDS, browserSignupDraft, signupDraftStore } from "./signupDraft";

function memory(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    map,
  };
}

const FILLED = {
  role: "student",
  form: {
    name: "Ana Silva",
    username: "ana.silva",
    email: "ana@example.com",
    password: "Segura123!",
    repeatPassword: "Segura123!",
    birthDate: "2001-05-04",
    country: "PT",
  },
  termsAccepted: true,
};

describe("the sign-up draft (PAD-575)", () => {
  it("lives under one documented key and never stores a password", () => {
    expect(SIGNUP_DRAFT_KEY).toBe("levapp.signupDraft");
    expect([...SIGNUP_DRAFT_PRIVATE_FIELDS].sort()).toEqual(["password", "repeatPassword"]);
  });

  it("round-trips everything but the passwords", () => {
    const storage = memory();
    const store = signupDraftStore(storage);
    store.write(FILLED);
    const raw = storage.map.get(SIGNUP_DRAFT_KEY) ?? "";
    expect(raw).not.toContain("Segura123!");
    expect(store.read()).toEqual({
      role: "student",
      form: { name: "Ana Silva", username: "ana.silva", email: "ana@example.com", birthDate: "2001-05-04", country: "PT" },
      termsAccepted: true,
    });
  });

  it("an empty draft is not written; clearing every field after a restore removes the old one; clear() removes the key", () => {
    const storage = memory();
    const store = signupDraftStore(storage);
    store.write({ role: "student", form: { name: "", username: "", email: "" }, termsAccepted: false });
    expect(storage.map.has(SIGNUP_DRAFT_KEY)).toBe(false);
    store.write(FILLED);
    expect(storage.map.has(SIGNUP_DRAFT_KEY)).toBe(true);
    store.write({ role: "student", form: { name: "", username: "", email: "" }, termsAccepted: false });
    expect(storage.map.has(SIGNUP_DRAFT_KEY)).toBe(false);
    store.write(FILLED);
    store.clear();
    expect(storage.map.has(SIGNUP_DRAFT_KEY)).toBe(false);
  });

  it("keeps the coach role, drops empty values and foreign keys, so a stored empty country never overwrites the default", () => {
    const storage = memory();
    const store = signupDraftStore(storage);
    store.write({ role: "coach", form: { name: "Rui", country: "", admin: "x" } as Record<string, string>, termsAccepted: false });
    expect(store.read()).toEqual({ role: "coach", form: { name: "Rui" }, termsAccepted: false });
    expect(signupDraftStore(memory({ [SIGNUP_DRAFT_KEY]: JSON.stringify({ form: { admin: "x", email: "a@b.c" } }) })).read())
      .toEqual({ role: undefined, form: { email: "a@b.c" }, termsAccepted: false });
  });

  it("a malformed or foreign value reads as no draft", () => {
    expect(signupDraftStore(memory({ [SIGNUP_DRAFT_KEY]: "{not json" })).read()).toBeNull();
    expect(signupDraftStore(memory({ [SIGNUP_DRAFT_KEY]: JSON.stringify({ form: "x" }) })).read()).toBeNull();
    // a non-string value is dropped, not fatal: the rest of the draft still restores
    expect(signupDraftStore(memory({ [SIGNUP_DRAFT_KEY]: JSON.stringify({ form: { name: 1, email: "a@b.c" } }) })).read())
      .toEqual({ role: undefined, form: { email: "a@b.c" }, termsAccepted: false });
  });

  it("browserSignupDraft survives a sessionStorage getter that throws (Safari with site data blocked)", () => {
    const original = Object.getOwnPropertyDescriptor(window, "sessionStorage");
    Object.defineProperty(window, "sessionStorage", { configurable: true, get() { throw new Error("SecurityError"); } });
    try {
      const store = browserSignupDraft();
      expect(store.read()).toBeNull();
      expect(() => store.write(FILLED)).not.toThrow();
    } finally {
      if (original) Object.defineProperty(window, "sessionStorage", original);
    }
  });

  it("storage that throws (private mode) never breaks the page", () => {
    const throwing = {
      getItem: () => { throw new Error("SecurityError"); },
      setItem: () => { throw new Error("QuotaExceededError"); },
      removeItem: () => { throw new Error("SecurityError"); },
    };
    const store = signupDraftStore(throwing);
    expect(store.read()).toBeNull();
    expect(() => store.write(FILLED)).not.toThrow();
    expect(() => store.clear()).not.toThrow();
    expect(signupDraftStore(null).read()).toBeNull();
  });
});
