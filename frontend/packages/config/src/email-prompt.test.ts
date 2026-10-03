import { afterEach, describe, expect, it } from "vitest";
import { asksForEmail, emailPromptSession } from "./email-prompt";

// PAD-482 (auth.email-verification rule 14).
describe("asksForEmail", () => {
  it("asks a coach with no email, an empty one or only spaces", () => {
    expect(asksForEmail({ id: 1, roles: ["coach"], email: null })).toBe(true);
    expect(asksForEmail({ id: 1, roles: ["coach"] })).toBe(true);
    expect(asksForEmail({ id: 1, roles: ["coach"], email: "  " })).toBe(true);
  });

  it("never asks a coach who has one, a player, or nobody", () => {
    expect(asksForEmail({ id: 1, roles: ["coach"], email: "rui@example.com" })).toBe(false);
    expect(asksForEmail({ id: 2, roles: ["player"], email: null })).toBe(false);
    expect(asksForEmail({ id: 3, email: null })).toBe(false);
    expect(asksForEmail(null)).toBe(false);
  });
});

describe("emailPromptSession", () => {
  afterEach(() => emailPromptSession.reset());

  it("a dismissal holds for that user until the session is reset (sign-out)", () => {
    emailPromptSession.dismiss(7);
    expect(emailPromptSession.isDismissed(7)).toBe(true);
    expect(emailPromptSession.isDismissed("7")).toBe(true);
    expect(emailPromptSession.isDismissed(8)).toBe(false); // another account signed in after
    emailPromptSession.reset();
    expect(emailPromptSession.isDismissed(7)).toBe(false);
  });
});
