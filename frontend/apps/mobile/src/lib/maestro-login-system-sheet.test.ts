import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * B-728: the shared login subflow answers iOS's "Save Password?" sheet by tapping "Not Now". Maestro
 * matches `text:` as a whole-string, case-insensitive regex, so that tap also hit the app's own
 * "Not now" buttons once the sheet was absent (always on Android): on the coach home it dismissed the
 * email-prompt banner (auth.email-verification rule 14) before flow 132 looked for it. A text selector
 * in any flow or subflow that matches one of the app's own strings must sit in a `runFlow` that runs only on
 * iOS and only while the sheet itself is on screen, keyed on text no app string has.
 *
 * Flow 01's own student sign-in had no answer to the sheet at all, and stalled behind it on iOS. The
 * answer now lives in one subflow, `dismiss-save-password.yaml`, and every successful sign-in runs it.
 * Both checks read every flow and subflow, not only login.yaml.
 */

const MOBILE = path.resolve(__dirname, "../..");
const MAESTRO = path.join(MOBILE, ".maestro");
const YAML = ["flows", "subflows"].flatMap((dir) =>
  fs
    .readdirSync(path.join(MAESTRO, dir))
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => ({ name: `${dir}/${f}`, lines: fs.readFileSync(path.join(MAESTRO, dir, f), "utf8").split("\n") })),
);
const SHEET_SUBFLOW = "dismiss-save-password.yaml";
/** The sheet's dismiss button, as iOS labels it in English and Portuguese. */
const SHEET_BUTTON = ["Not Now", "Agora não"];
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
function enclosingRunFlow(lines: string[], at: number): string[] | null {
  let limit = indent(lines[at]);
  for (let i = at - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line.trim() || indent(line) >= limit) continue;
    limit = indent(line);
    if (/^\s*- runFlow:\s*$/.test(line)) {
      const body: string[] = [];
      for (let j = i + 1; j < lines.length && (!lines[j].trim() || indent(lines[j]) > limit); j++) body.push(lines[j]);
      return body;
    }
  }
  return null;
}

describe("B-728: the flows' answer to the iOS Save Password sheet", () => {
  it("never taps the app's own 'Not now' / 'Agora não' (the email-prompt banner, B-728)", () => {
    expect(APP_TEXT).toContain("Not now");
    expect(APP_TEXT).toContain("Agora não");

    const colliding = YAML.flatMap(({ name, lines }) =>
      lines
        .map((line, i) => ({ name, lines, i, raw: textOf(line) }))
        // A selector aimed at the sheet's "Not Now" button that also matches app text. Other flows assert
        // the app's own words on purpose (flow 09's "Message deleted"); those are not sheet taps.
        .filter((s) => s.raw !== undefined && SHEET_BUTTON.some((b) => matcher(s.raw!).test(b)) && hitsApp(s.raw).length > 0),
    );
    expect(colliding.map((c) => c.name)).toContain(`subflows/${SHEET_SUBFLOW}`); // the sheet's "Not Now"

    for (const { name, lines, i, raw } of colliding) {
      const block = enclosingRunFlow(lines, i);
      expect(block, `${name} line ${i + 1} (${raw}) taps app text with no guard`).not.toBeNull();
      const guard = block!.join("\n");
      expect(guard, `${name} line ${i + 1}: iOS only`).toMatch(/^\s*platform:\s*iOS\s*$/m);
      const sheet = block!
        .slice(0, block!.findIndex((l) => /^\s*commands:/.test(l)))
        .map(textOf)
        .filter((t): t is string => t !== undefined);
      expect(sheet.length, `${name} line ${i + 1}: guarded by the sheet's own text`).toBeGreaterThan(0);
      for (const t of sheet) expect(hitsApp(t), `the guard "${t}" must match no app string`).toEqual([]);
    }
  });

  it("answers the sheet after every sign-in that succeeds (flow 01's student sign-in, B-728)", () => {
    // A failed sign-in shows no sheet: the step after its submit waits for the error.
    const FAILED = /id:\s*"?(login-error|login-rejected)"?/;
    const submits = YAML.flatMap(({ name, lines }) =>
      lines.map((line, i) => ({ name, lines, i })).filter(({ lines, i }) => /id:\s*"?login-submit"?\s*$/.test(lines[i])),
    );
    expect(submits.length).toBeGreaterThan(4);
    for (const { name, lines, i } of submits) {
      const next = lines.slice(i + 1).filter((l) => l.trim() && !l.trim().startsWith("#")).slice(0, 4).join("\n");
      if (FAILED.test(next)) continue;
      expect(next, `${name} line ${i + 1}: a sign-in that succeeds runs ${SHEET_SUBFLOW} next`).toContain(SHEET_SUBFLOW);
    }
  });
});
