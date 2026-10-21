import { describe, expect, it } from "vitest";
import { suggestUsername, usernameCharsIssue } from "./signup-username";

/**
 * auth.register rule 21 (PAD-651, B-528): the sign-up username is pre-filled from the name or the
 * email, and an email typed as the username is told so instead of getting the generic characters
 * message.
 */
describe("suggestUsername — rule 21a", () => {
  it("builds it from the name: accents dropped, spaces to dots, lower-case", () => {
    expect(suggestUsername("Jorge Torres", "")).toBe("jorge.torres");
    expect(suggestUsername("  João  Pedro Tomé ", "")).toBe("joao.pedro.tome");
  });

  it("removes characters outside [A-Za-z0-9._-] and collapses separators", () => {
    expect(suggestUsername("Ana-Maria O'Neil", "")).toBe("ana-maria.oneil");
    expect(suggestUsername("..Rui__ Sá..", "")).toBe("rui_sa");
  });

  it("falls back to the email's local part, cut at +, when the name gives under 3 characters", () => {
    expect(suggestUsername("", "Jorge.Torres+padel@gmail.com")).toBe("jorge.torres");
    expect(suggestUsername("Zé", "jpt1990@gmail.com")).toBe("jpt1990");
  });

  it("gives nothing under 3 usable characters, and at most 30", () => {
    expect(suggestUsername("Zé", "")).toBe("");
    expect(suggestUsername("", "ab@x.pt")).toBe("");
    expect(suggestUsername("a".repeat(50), "").length).toBe(30);
  });

  it("every suggestion it gives passes the username's own character rule", () => {
    for (const [name, email] of [["Jorge Torres", ""], ["", "x.y-z+q@a.b"], ["Ñandú Ölsen-Ågård", ""]]) {
      const s = suggestUsername(name, email);
      expect(s).toMatch(/^[a-z0-9._-]{3,30}$/);
      expect(usernameCharsIssue(s)).toBeNull();
    }
  });
});

describe("usernameCharsIssue — rule 21b", () => {
  it("names the mistake when the username is an email", () => {
    expect(usernameCharsIssue("jorge.torres@gmail.com")).toBe("usernameIsEmail");
    expect(usernameCharsIssue("jorge@")).toBe("usernameIsEmail");
  });

  it("keeps the generic message for other characters", () => {
    expect(usernameCharsIssue("jorge torres")).toBe("usernameChars");
    expect(usernameCharsIssue("jorge!")).toBe("usernameChars");
  });

  it("accepts letters (capitals too), digits, dot, hyphen and underscore", () => {
    expect(usernameCharsIssue("JPT")).toBeNull();
    expect(usernameCharsIssue("jorge.torres_1-x")).toBeNull();
  });
});
