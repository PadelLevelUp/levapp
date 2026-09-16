import { describe, expect, it } from "vitest";
import {
  UNIVERSAL_LINK_HOSTS,
  parseUniversalLink,
  webUrlForUniversalLink,
  type UniversalLinkTarget,
} from "./universalLinks";

/**
 * The single identifier a target carries, whichever kind it is — the token for
 * the two invites, the user id for register. Narrows the union so a test can
 * assert on the extracted value without restating the whole object.
 */
function idOf(target: UniversalLinkTarget | null): string | undefined {
  if (!target) return undefined;
  return target.kind === "register" ? target.userId : target.token;
}

describe("parseUniversalLink — the three claimed paths", () => {
  it("routes a player invite, keeping the token intact", () => {
    expect(parseUniversalLink("https://levapp.app/invite/player/abc123")).toEqual({
      kind: "player-invite",
      token: "abc123",
      path: "/invite/player/abc123",
    });
  });

  it("routes a coach invite", () => {
    expect(parseUniversalLink("https://levapp.app/invite/coach/xyz789")).toEqual({
      kind: "coach-invite",
      token: "xyz789",
      path: "/invite/coach/xyz789",
    });
  });

  it("routes a registration link", () => {
    expect(parseUniversalLink("https://levapp.app/register/42")).toEqual({
      kind: "register",
      userId: "42",
      token: null,
      path: "/register/42",
    });
  });

  // auth.activate rules 2 and 8 (PAD-254): the link's `t` is the account's
  // activation secret, and it must survive the parse — the id alone is not
  // a working link.
  it("keeps the activation secret of a registration link", () => {
    expect(parseUniversalLink("https://levapp.app/register/42?t=abc%2Fdef")).toEqual({
      kind: "register",
      userId: "42",
      token: "abc/def",
      path: "/register/42?t=abc%2Fdef",
    });
    expect(parseUniversalLink("/register/42?next=/invite/player/x&t=s3cret#top")).toMatchObject({
      userId: "42",
      token: "s3cret",
    });
  });

  it("treats a blank or absent secret as none", () => {
    for (const url of ["/register/42?t=", "/register/42?t=%20", "/register/42?x=1"]) {
      expect(parseUniversalLink(url)).toMatchObject({ kind: "register", token: null });
    }
  });

  it("still ignores query strings on invite links", () => {
    expect(parseUniversalLink("https://levapp.app/invite/player/abc?t=zzz")).toEqual({
      kind: "player-invite",
      token: "abc",
      path: "/invite/player/abc",
    });
  });

  it("accepts both claimed hosts and their www aliases", () => {
    for (const host of UNIVERSAL_LINK_HOSTS) {
      expect(parseUniversalLink(`https://${host}/invite/player/t`)).not.toBeNull();
      expect(parseUniversalLink(`https://www.${host}/invite/player/t`)).not.toBeNull();
    }
  });

  it("accepts the shapes Expo Router hands over (rooted and bare paths)", () => {
    // extractExactPathFromURL strips the origin, and expo-router then strips the
    // leading slash — so the parser sees both of these in practice.
    expect(idOf(parseUniversalLink("/invite/player/abc"))).toBe("abc");
    expect(idOf(parseUniversalLink("invite/player/abc"))).toBe("abc");
  });

  it("is case-insensitive about the host but not the token", () => {
    const parsed = parseUniversalLink("HTTPS://LevApp.App/invite/player/AbC");
    expect(parsed).toEqual({
      kind: "player-invite",
      token: "AbC",
      path: "/invite/player/AbC",
    });
  });
});

describe("parseUniversalLink — token handling", () => {
  it("percent-decodes the token", () => {
    expect(idOf(parseUniversalLink("https://levapp.app/invite/player/a%2Bb%3Dc"))).toBe(
      "a+b=c"
    );
  });

  it("re-encodes the decoded token in the in-app path, so it survives a round trip", () => {
    const parsed = parseUniversalLink("https://levapp.app/invite/player/a%2Bb%3Dc");
    expect(parsed?.path).toBe("/invite/player/a%2Bb%3Dc");
    expect(idOf(parseUniversalLink(parsed!.path))).toBe("a+b=c");
  });

  it("does not throw on a malformed escape sequence", () => {
    expect(idOf(parseUniversalLink("https://levapp.app/invite/player/%zz"))).toBe("%zz");
  });

  it("ignores query string and fragment", () => {
    expect(
      parseUniversalLink("https://levapp.app/invite/player/abc?utm_source=sms#top")
    ).toEqual({
      kind: "player-invite",
      token: "abc",
      path: "/invite/player/abc",
    });
  });

  it("does not read a claimed path out of the query string", () => {
    expect(parseUniversalLink("https://levapp.app/?next=/invite/player/abc")).toBeNull();
  });

  it("tolerates a trailing slash", () => {
    expect(idOf(parseUniversalLink("https://levapp.app/invite/player/abc/"))).toBe("abc");
  });
});

describe("parseUniversalLink — what it refuses", () => {
  it.each([
    ["an unclaimed host", "https://evil.example.com/invite/player/abc"],
    ["a lookalike host", "https://levapp.app.evil.com/invite/player/abc"],
    ["an unknown path", "https://levapp.app/dashboard"],
    ["a claimed prefix with no token", "https://levapp.app/invite/player"],
    ["a claimed prefix with an extra segment", "https://levapp.app/invite/player/abc/extra"],
    ["an unknown invite kind", "https://levapp.app/invite/club/abc"],
    ["register with no id", "https://levapp.app/register"],
    ["register with an extra segment", "https://levapp.app/register/42/extra"],
    ["a blank token", "https://levapp.app/invite/player/%20"],
    ["the bare origin", "https://levapp.app/"],
    ["an empty string", ""],
    ["whitespace", "   "],
  ])("returns null for %s", (_label, input) => {
    expect(parseUniversalLink(input)).toBeNull();
  });

  it("returns null for the routes push notifications own, so the two cannot collide", () => {
    // usePushNotificationRouting emits these; nothing here should claim them.
    expect(parseUniversalLink("/conversation/7")).toBeNull();
    expect(parseUniversalLink("/class/12")).toBeNull();
  });

  it("returns null for a non-string input", () => {
    expect(parseUniversalLink(undefined as unknown as string)).toBeNull();
  });
});

describe("webUrlForUniversalLink", () => {
  it("joins the base URL and the path", () => {
    const target = parseUniversalLink("/invite/player/abc")!;
    expect(webUrlForUniversalLink(target, "https://www.padellevelup.com")).toBe(
      "https://www.padellevelup.com/invite/player/abc"
    );
  });

  it("does not double up the slash when the base URL has a trailing one", () => {
    const target = parseUniversalLink("/register/42")!;
    expect(webUrlForUniversalLink(target, "https://levapp.app/")).toBe(
      "https://levapp.app/register/42"
    );
  });
});
