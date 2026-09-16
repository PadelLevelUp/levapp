import { describe, expect, it } from "vitest";

import { registerLink, webAppLink } from "@/lib/web-links";

const BASE = "https://www.padellevelup.com";

describe("webAppLink", () => {
  it("joins a base origin and a relative API path", () => {
    expect(webAppLink(BASE, "/invite/player/tok3n")).toBe(
      "https://www.padellevelup.com/invite/player/tok3n"
    );
  });

  it("produces exactly one slash whichever side supplied it", () => {
    for (const [base, path] of [
      [BASE, "/invite/player/tok3n"],
      [BASE, "invite/player/tok3n"],
      [`${BASE}/`, "/invite/player/tok3n"],
      [`${BASE}/`, "invite/player/tok3n"],
      [`${BASE}///`, "///invite/player/tok3n"],
    ] as const) {
      expect(webAppLink(base, path)).toBe(
        "https://www.padellevelup.com/invite/player/tok3n"
      );
    }
  });

  it("leaves an already-absolute link alone", () => {
    expect(webAppLink(BASE, "https://other.example/invite/x")).toBe(
      "https://other.example/invite/x"
    );
    expect(webAppLink(BASE, "http://other.example/invite/x")).toBe(
      "http://other.example/invite/x"
    );
  });

  it("returns the bare origin for an empty path", () => {
    expect(webAppLink(`${BASE}/`, "")).toBe(BASE);
    expect(webAppLink(BASE, "   ")).toBe(BASE);
  });

  it("trims whitespace around either half", () => {
    expect(webAppLink(`  ${BASE}  `, "  /register/9  ")).toBe(
      "https://www.padellevelup.com/register/9"
    );
  });
});

describe("registerLink", () => {
  it("builds web's /register/:userId link", () => {
    expect(registerLink(BASE, "42")).toBe(
      "https://www.padellevelup.com/register/42"
    );
  });

  it("accepts a numeric id", () => {
    expect(registerLink(BASE, 42)).toBe(
      "https://www.padellevelup.com/register/42"
    );
  });

  // auth.activate rule 2 (PAD-254): the shareable link carries the secret.
  it("appends the activation secret as ?t= when the roster provides one", () => {
    expect(registerLink(BASE, 42, "abc123")).toBe(
      "https://www.padellevelup.com/register/42?t=abc123"
    );
    expect(registerLink(BASE, "42", "a/b c")).toBe(
      "https://www.padellevelup.com/register/42?t=a%2Fb%20c"
    );
  });

  it("omits the secret when it is missing or blank", () => {
    for (const token of [null, undefined, "", "  "]) {
      expect(registerLink(BASE, 42, token)).toBe(
        "https://www.padellevelup.com/register/42"
      );
    }
  });

  it("never attaches a secret to the placeholder link", () => {
    expect(registerLink(BASE, null, "abc123")).toBe(
      "https://www.padellevelup.com/register/player"
    );
  });

  it("falls back to web's 'player' placeholder when the id is missing", () => {
    // Same behaviour as apps/web PlayerHeader: the route renders and reports
    // the link as invalid, rather than the string "undefined" reaching a coach.
    for (const missing of [null, undefined, "", "   "]) {
      expect(registerLink(BASE, missing)).toBe(
        "https://www.padellevelup.com/register/player"
      );
    }
  });
});
