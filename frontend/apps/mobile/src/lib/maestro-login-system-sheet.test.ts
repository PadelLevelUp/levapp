import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * B-728: the shared login subflow answers iOS's "Save Password?" sheet by tapping "Not Now". Maestro
 * matches `text:` as a whole-string, case-insensitive regex, so that tap also hit the app's own
 * "Not now" buttons once the sheet was absent (always on Android): on the coach home it dismissed the
 * email-prompt banner (auth.email-verification rule 14) before flow 132 looked for it. A text selector
 * in login.yaml that matches one of the app's own strings must sit in a `runFlow` that runs only on
 * iOS and only while the sheet itself is on screen, keyed on text no app string has.
 */

const MOBILE = path.resolve(__dirname, "../..");
const LOGIN = fs.readFileSync(path.join(MOBILE, ".maestro/subflows/login.yaml"), "utf8").split("\n");
const LOCALES = path.resolve(MOBILE, "../../src/locales");

function strings(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") out.push(node);
  else if (node && typeof node === "object") for (const v of Object.values(node)) strings(v, out);
  return out;
}

const APP_TEXT = ["en", "pt"].flatMap((lang) =>
  fs
    .readdirSync(path.join(LOCALES, lang))
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => strings(JSON.parse(fs.readFileSync(path.join(LOCALES, lang, f), "utf8")))),
);

/** Maestro's `text:` selector: the whole string, ignoring case. */
const matcher = (raw: string) => new RegExp(`^(?:${raw.replace(/\\\\/g, "\\")})$`, "i");
const hitsApp = (raw: string) => APP_TEXT.filter((s) => matcher(raw).test(s));

const indent = (line: string) => line.length - line.trimStart().length;
const textOf = (line: string) => /^\s*text:\s*"(.*)"\s*$/.exec(line)?.[1];

/** The lines of the nearest enclosing `- runFlow:` item, or null at the top level. */
function enclosingRunFlow(at: number): string[] | null {
  let limit = indent(LOGIN[at]);
  for (let i = at - 1; i >= 0; i--) {
    const line = LOGIN[i];
    if (!line.trim() || indent(line) >= limit) continue;
    limit = indent(line);
    if (/^\s*- runFlow:\s*$/.test(line)) {
      const body: string[] = [];
      for (let j = i + 1; j < LOGIN.length && (!LOGIN[j].trim() || indent(LOGIN[j]) > limit); j++) body.push(LOGIN[j]);
      return body;
    }
  }
  return null;
}

describe("B-728: login.yaml's answer to the iOS Save Password sheet", () => {
  it("never taps the app's own 'Not now' / 'Agora não' (the email-prompt banner, B-728)", () => {
    expect(APP_TEXT).toContain("Not now");
    expect(APP_TEXT).toContain("Agora não");

    const selectors = LOGIN.map((line, i) => ({ i, raw: textOf(line) })).filter((s) => s.raw !== undefined);
    const colliding = selectors.filter((s) => hitsApp(s.raw!).length > 0);
    expect(colliding.length).toBeGreaterThan(0); // the sheet's "Not Now" is one of them

    for (const { i, raw } of colliding) {
      const block = enclosingRunFlow(i);
      expect(block, `line ${i + 1} (${raw}) taps app text with no guard`).not.toBeNull();
      const guard = block!.join("\n");
      expect(guard, `line ${i + 1}: iOS only`).toMatch(/^\s*platform:\s*iOS\s*$/m);
      const sheet = block!
        .slice(0, block!.findIndex((l) => /^\s*commands:/.test(l)))
        .map(textOf)
        .filter((t): t is string => t !== undefined);
      expect(sheet.length, `line ${i + 1}: guarded by the sheet's own text`).toBeGreaterThan(0);
      for (const t of sheet) expect(hitsApp(t), `the guard "${t}" must match no app string`).toEqual([]);
    }
  });
});
