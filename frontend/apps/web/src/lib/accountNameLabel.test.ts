import { describe, expect, it } from "vitest";
import authPt from "../../../../src/locales/pt/auth.json";
import authEn from "../../../../src/locales/en/auth.json";

/**
 * PAD-666: the name field where an account is created asks for the full name. The sign-up form
 * (web SignUpPage, iOS app/signup.tsx: `auth.signup.name`) and the two invitation completions
 * (`auth.register.name`, `auth.coachInvite.name`) share the label. Both apps import these files.
 */
describe("account name label (PAD-666)", () => {
  it.each(["signup", "register", "coachInvite"] as const)("%s asks for first and last name", (form) => {
    expect(authPt.auth[form].name).toBe("Nome e Apelido");
    expect(authEn.auth[form].name).toBe("First and last name");
  });
});
