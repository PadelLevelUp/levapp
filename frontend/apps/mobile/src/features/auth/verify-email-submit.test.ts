import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * B-089 face C / PAD-314 (`mobile.android-runtime` rule 10): a successful code
 * confirmation must not restyle the code cells in the commit that removes the
 * screen. Resetting `submitting` on success did exactly that, and on Android
 * Fabric moved cell 0's digit Text into the row's Pressable while it still had
 * a parent, blanking the whole app (lane runs 35121109534, 35127379373).
 *
 * The screen imports native modules that don't load under vitest, so this
 * reads the source (the api-capabilities.test.ts pattern) and, per R-032,
 * first proves it found the submit callback.
 */
const SOURCE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "verify-email.tsx");

function submitCallback(): string {
  expect(fs.existsSync(SOURCE), `cannot find ${SOURCE}`).toBe(true);
  const text = fs.readFileSync(SOURCE, "utf8");
  const start = text.indexOf("const submit = React.useCallback(");
  expect(start, "no submit callback in verify-email.tsx").toBeGreaterThanOrEqual(0);
  const end = text.indexOf("[leave, refreshUser, submitting, t]", start);
  expect(end, "the submit callback's dependency list was not found").toBeGreaterThan(start);
  return text.slice(start, end);
}

describe("verify-email submit (B-089 face C)", () => {
  it("found the confirm call and the navigation before judging it (R-032)", () => {
    const body = submitCallback();
    expect(body).toMatch(/confirmEmailVerificationCode\(value\)/);
    expect(body).toMatch(/leave\(me\)/);
  });

  it("does not reset submitting in a finally block, so success leaves it true", () => {
    expect(submitCallback()).not.toMatch(/finally\s*\{[^}]*setSubmitting\(false\)/);
  });

  it("resets submitting on the failure path, so an error never leaves the screen disabled", () => {
    const body = submitCallback();
    const catchAt = body.indexOf("catch (err)");
    expect(catchAt, "no catch block").toBeGreaterThan(0);
    expect(body.slice(catchAt)).toMatch(/setSubmitting\(false\)/);
  });

  it("navigates explicitly on success, independent of the [user] effect", () => {
    const body = submitCallback();
    const tryAt = body.indexOf("try {");
    const catchAt = body.indexOf("catch (err)");
    expect(body.slice(tryAt, catchAt)).toMatch(/leave\(me\)/);
  });
});
