import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  coachInviteSchema,
  inviteTokenFromParam,
  playerInviteSchema,
  registerSchema,
  registerUserIdFromParam,
  statusFromError,
  submitOutcomeForError,
  submitOutcomeForStatus,
  validateAccountForm,
} from "./account-setup";

/**
 * PAD-164 — the native register / coach-invite / player-invite screens.
 *
 * The screens themselves are not unit-testable here (mobile vitest stubs out
 * react-native), so everything they decide before rendering was pushed into
 * `account-setup.ts` and is pinned below: what a route param means, whether a
 * form passes, and what an HTTP failure turns into.
 *
 * The last block is a different kind of check and the more important one in
 * practice: mobile i18n is a hand-written static-import list, so a screen that
 * renders `t("auth.playerInvite.title")` renders that literal string on a
 * device if the namespace or the key is missing, and nothing else in the repo
 * notices. These screens are the first mobile consumers of the ~61 `auth.*`
 * keys that were web-only, so every key they can reach is named here.
 */

/* ---------- route params ---------- */

describe("inviteTokenFromParam", () => {
  it("returns the token for a well-formed player param", () => {
    expect(inviteTokenFromParam("player", "abc123")).toBe("abc123");
  });

  it("returns the token for a well-formed coach param", () => {
    expect(inviteTokenFromParam("coach", "xyz789")).toBe("xyz789");
  });

  it("percent-decodes the token", () => {
    expect(inviteTokenFromParam("player", "a%2Bb")).toBe("a+b");
  });

  it("rejects a missing param", () => {
    expect(inviteTokenFromParam("player", undefined)).toBeNull();
  });

  it("rejects an empty or whitespace-only token", () => {
    expect(inviteTokenFromParam("player", "")).toBeNull();
    expect(inviteTokenFromParam("player", "   ")).toBeNull();
    expect(inviteTokenFromParam("coach", "")).toBeNull();
  });

  it("rejects a token that smuggles extra path segments", () => {
    // `/invite/player/a/b` is four segments — not a claimed shape.
    expect(inviteTokenFromParam("player", "a/b")).toBeNull();
  });

  it("takes the first value when the router hands over an array", () => {
    expect(inviteTokenFromParam("player", ["abc123"])).toBe("abc123");
    expect(inviteTokenFromParam("player", [])).toBeNull();
  });

  it("does not let a player param resolve as a coach token", () => {
    // The kind is part of the path the parser is given, so the two can never
    // cross: each route only ever produces its own kind.
    expect(inviteTokenFromParam("coach", "abc")).toBe("abc");
    expect(inviteTokenFromParam("player", "abc")).toBe("abc");
  });
});

describe("registerUserIdFromParam", () => {
  it("returns the id for a well-formed param", () => {
    expect(registerUserIdFromParam("42")).toBe("42");
  });

  it("rejects a missing, empty or blank id", () => {
    expect(registerUserIdFromParam(undefined)).toBeNull();
    expect(registerUserIdFromParam("")).toBeNull();
    expect(registerUserIdFromParam("  ")).toBeNull();
  });

  it("rejects an id carrying extra segments", () => {
    expect(registerUserIdFromParam("42/extra")).toBeNull();
  });

  it("takes the first value of an array param", () => {
    expect(registerUserIdFromParam(["7"])).toBe("7");
  });
});

/* ---------- form validation ---------- */

const validPlayer = {
  username: "nina",
  password: "Nina123!",
  repeatPassword: "Nina123!",
};

const validCoach = { name: "Nina Coach", ...validPlayer };

const validRegister = {
  name: "Nina Player",
  username: "nina",
  email: "nina@example.com",
  phone: "",
  password: "Nina123!",
  repeatPassword: "Nina123!",
};

describe("validateAccountForm — player invite", () => {
  it("accepts a valid form", () => {
    expect(validateAccountForm(playerInviteSchema, validPlayer)).toEqual({});
  });

  it("rejects a username shorter than 3 characters", () => {
    expect(
      validateAccountForm(playerInviteSchema, { ...validPlayer, username: "ni" })
    ).toEqual({ username: "usernameMin" });
  });

  it("rejects a password shorter than 6 characters", () => {
    expect(
      validateAccountForm(playerInviteSchema, {
        ...validPlayer,
        password: "abc12",
        repeatPassword: "abc12",
      })
    ).toEqual({ password: "passwordMin" });
  });

  it("reports mismatched passwords against the repeat field", () => {
    expect(
      validateAccountForm(playerInviteSchema, {
        ...validPlayer,
        repeatPassword: "different1",
      })
    ).toEqual({ repeatPassword: "passwordsMismatch" });
  });

  it("does not ask the player for a name", () => {
    expect(Object.keys(validateAccountForm(playerInviteSchema, validPlayer)))
      .not.toContain("name");
  });
});

describe("validateAccountForm — coach invite", () => {
  it("accepts a valid form", () => {
    expect(validateAccountForm(coachInviteSchema, validCoach)).toEqual({});
  });

  it("requires a name of at least 2 characters", () => {
    expect(
      validateAccountForm(coachInviteSchema, { ...validCoach, name: "N" })
    ).toEqual({ name: "nameMin" });
  });

  it("reports every offending field at once", () => {
    expect(
      validateAccountForm(coachInviteSchema, {
        name: "",
        username: "a",
        password: "x",
        repeatPassword: "y",
      })
    ).toEqual({
      name: "nameMin",
      username: "usernameMin",
      password: "passwordMin",
      repeatPassword: "passwordsMismatch",
    });
  });
});

describe("validateAccountForm — register", () => {
  it("accepts a valid form", () => {
    expect(validateAccountForm(registerSchema, validRegister)).toEqual({});
  });

  it("requires a valid email", () => {
    expect(
      validateAccountForm(registerSchema, { ...validRegister, email: "nope" })
    ).toEqual({ email: "emailInvalid" });
  });

  it("treats phone as optional", () => {
    const { phone: _phone, ...withoutPhone } = validRegister;
    expect(validateAccountForm(registerSchema, withoutPhone)).toEqual({});
  });

  it("reports mismatched passwords", () => {
    expect(
      validateAccountForm(registerSchema, {
        ...validRegister,
        repeatPassword: "Other123!",
      })
    ).toEqual({ repeatPassword: "passwordsMismatch" });
  });
});

/* ---------- submit failures ---------- */

describe("submitOutcomeForStatus", () => {
  it("maps 409 to a recoverable username clash", () => {
    expect(submitOutcomeForStatus(409)).toBe("username-taken");
  });

  it("maps 404 and 410 to a dead link", () => {
    expect(submitOutcomeForStatus(404)).toBe("invalid-token");
    expect(submitOutcomeForStatus(410)).toBe("invalid-token");
  });

  it("maps everything else, including no status at all, to generic", () => {
    expect(submitOutcomeForStatus(500)).toBe("generic");
    expect(submitOutcomeForStatus(400)).toBe("generic");
    expect(submitOutcomeForStatus(undefined)).toBe("generic");
    expect(submitOutcomeForStatus(null)).toBe("generic");
  });
});

describe("statusFromError / submitOutcomeForError", () => {
  it("reads an axios-shaped rejection", () => {
    expect(statusFromError({ response: { status: 409 } })).toBe(409);
    expect(submitOutcomeForError({ response: { status: 410 } })).toBe(
      "invalid-token"
    );
  });

  it("treats a network failure (no response) as generic, not as auth", () => {
    // The App Store 2.1(a) failure mode the login screen already guards
    // against: an unreachable API must never read as "that username is taken".
    expect(statusFromError(new Error("Network Error"))).toBeUndefined();
    expect(submitOutcomeForError(new Error("Network Error"))).toBe("generic");
    expect(submitOutcomeForError(null)).toBe("generic");
    expect(submitOutcomeForError(undefined)).toBe("generic");
  });
});

/* ---------- i18n coverage (the mobile static-import trap) ---------- */

const localesDir = path.resolve(__dirname, "../../../../../src/locales");
const i18nSource = fs.readFileSync(
  path.resolve(__dirname, "../../lib/i18n.ts"),
  "utf-8"
);

function loadAuth(lang: "en" | "pt"): Record<string, unknown> {
  const raw = fs.readFileSync(
    path.join(localesDir, lang, "auth.json"),
    "utf-8"
  );
  return JSON.parse(raw).auth;
}

function leaf(tree: Record<string, unknown>, dottedKey: string): unknown {
  let node: unknown = tree;
  for (const part of dottedKey.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

const trees = { en: loadAuth("en"), pt: loadAuth("pt") } as const;

/** Every key the three screens and the legal links can render. */
const SCREEN_KEYS = [
  "legal.privacyPolicy",
  "legal.terms",
  "legal.separator",

  "playerInvite.title",
  "playerInvite.description",
  "playerInvite.username",
  "playerInvite.password",
  "playerInvite.repeatPassword",
  "playerInvite.complete",
  "playerInvite.completing",
  "playerInvite.welcomeTitle",
  "playerInvite.welcomeDescription",
  "playerInvite.usernameTaken",
  "playerInvite.genericError",
  "playerInvite.invalidTitle",
  "playerInvite.invalidDescription",
  "playerInvite.goToLogin",

  "coachInvite.title",
  "coachInvite.description",
  "coachInvite.name",
  "coachInvite.username",
  "coachInvite.password",
  "coachInvite.repeatPassword",
  "coachInvite.join",
  "coachInvite.joining",
  "coachInvite.welcomeTitle",
  "coachInvite.welcomeDescription",
  "coachInvite.usernameTaken",
  "coachInvite.genericError",
  "coachInvite.invalidTitle",
  "coachInvite.invalidDescription",
  "coachInvite.goToLogin",

  "register.title",
  "register.description",
  "register.name",
  "register.username",
  "register.email",
  "register.phone",
  "register.password",
  "register.repeatPassword",
  "register.activate",
  "register.activating",
  "register.activatedTitle",
  "register.activatedDescription",
  "register.failedTitle",
  "register.failedDescription",
  "register.invalidLinkTitle",
  "register.invalidLinkDescription",
  "register.alreadyRegisteredTitle",
  "register.alreadyRegisteredDescription",
  "register.goToLogin",
] as const;

/** Every validation code, under the namespace that prefixes it. */
const ERROR_KEYS = [
  "playerInvite.usernameMin",
  "playerInvite.passwordMin",
  "playerInvite.passwordsMismatch",

  "coachInvite.nameMin",
  "coachInvite.usernameMin",
  "coachInvite.passwordMin",
  "coachInvite.passwordsMismatch",

  "register.nameMin",
  "register.usernameMin",
  "register.emailInvalid",
  "register.passwordMin",
  "register.passwordsMismatch",
] as const;

describe("auth namespace on mobile", () => {
  it("is statically imported by i18n.ts in both languages", () => {
    // Without this the screens render "auth.playerInvite.title" verbatim.
    expect(i18nSource).toMatch(/locales\/en\/auth\.json/);
    expect(i18nSource).toMatch(/locales\/pt\/auth\.json/);
    expect(i18nSource).toMatch(/\bauthEn\b/);
    expect(i18nSource).toMatch(/\bauthPt\b/);
  });

  it.each(["en", "pt"] as const)("resolves every screen key in %s", (lang) => {
    const missing = SCREEN_KEYS.filter(
      (key) => typeof leaf(trees[lang], key) !== "string"
    );
    expect(missing).toEqual([]);
  });

  it.each(["en", "pt"] as const)(
    "resolves every validation error key in %s",
    (lang) => {
      const missing = ERROR_KEYS.filter(
        (key) => typeof leaf(trees[lang], key) !== "string"
      );
      expect(missing).toEqual([]);
    }
  );

  it.each(["en", "pt"] as const)(
    "keeps the interpolation placeholders the screens pass in %s",
    (lang) => {
      expect(leaf(trees[lang], "playerInvite.title")).toContain(
        "{{playerName}}"
      );
      expect(leaf(trees[lang], "coachInvite.title")).toContain("{{clubName}}");
      expect(leaf(trees[lang], "coachInvite.welcomeDescription")).toContain(
        "{{clubName}}"
      );
    }
  );

  it("no longer carries the PAD-184 hand-off strings the screens replaced", () => {
    // The placeholder screen (UniversalLinkHandoff) is gone; its strings would
    // be dead weight in every bundle and in the translators' file.
    expect(leaf(trees.en, "universalLink")).toBeUndefined();
    expect(leaf(trees.pt, "universalLink")).toBeUndefined();
  });
});
