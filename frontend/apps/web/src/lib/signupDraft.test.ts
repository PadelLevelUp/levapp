/**
 * PAD-575 (auth.register rule 20): what a student typed into the sign-up form survives a detour
 * (the Terms or Privacy page opening in the same tab, a back-forward-cache miss, a discarded tab)
 * because it lives in the tab's sessionStorage until the account exists. Passwords never do.
 */
import { describe, expect, it } from "vitest";
import { SIGNUP_DRAFT_KEY, SIGNUP_DRAFT_PRIVATE_FIELDS, signupDraftStore } from "./signupDraft";

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

  it("an empty draft is not written, and clear() removes the key", () => {
    const storage = memory();
    const store = signupDraftStore(storage);
    store.write({ role: "student", form: { name: "", username: "", email: "" }, termsAccepted: false });
    expect(storage.map.has(SIGNUP_DRAFT_KEY)).toBe(false);
    store.write(FILLED);
    expect(storage.map.has(SIGNUP_DRAFT_KEY)).toBe(true);
    store.clear();
    expect(storage.map.has(SIGNUP_DRAFT_KEY)).toBe(false);
  });

  it("a malformed or foreign value reads as no draft", () => {
    expect(signupDraftStore(memory({ [SIGNUP_DRAFT_KEY]: "{not json" })).read()).toBeNull();
    expect(signupDraftStore(memory({ [SIGNUP_DRAFT_KEY]: JSON.stringify({ form: "x" }) })).read()).toBeNull();
    expect(signupDraftStore(memory({ [SIGNUP_DRAFT_KEY]: JSON.stringify({ form: { name: 1 } }) })).read()).toBeNull();
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
