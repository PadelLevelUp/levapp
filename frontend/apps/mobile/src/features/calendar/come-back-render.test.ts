import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { reminderAnswerOutcome } from "@levelup/config";

/**
 * PAD-315 on iOS (`attendance.confirm` rule 26) and B-074.
 *
 * No render harness on mobile, so this reads the screens' own source the way
 * `attendance-state-render.test.ts` does, and asserts the two things that would
 * regress: the way back exists and is gated on the state alone, and the three
 * places that interpret the server's answer all delegate to the one mapper
 * instead of keeping their own defaults — the defaults are what turned a
 * refused return into a silent "no" on the phone.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOBILE_ROOT = path.resolve(HERE, "../../..");
const SCREEN = path.join(MOBILE_ROOT, "app/class/[id].tsx");
const CONVERSATION = path.join(MOBILE_ROOT, "app/conversation/[id].tsx");
const REMINDER_STATE = path.join(MOBILE_ROOT, "src/features/messages/reminder-state.ts");
const DASHBOARD = path.join(MOBILE_ROOT, "src/features/dashboard/blocks.tsx");
const LOCALES = path.resolve(MOBILE_ROOT, "../../src/locales");

const read = (p: string) => fs.readFileSync(p, "utf8");

type Dict = Record<string, unknown>;
function deepMerge(target: Dict, source: Dict): Dict {
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = target[key];
    if (sv && tv && typeof sv === "object" && typeof tv === "object" && !Array.isArray(sv)) {
      deepMerge(tv as Dict, sv as Dict);
    } else target[key] = sv;
  }
  return target;
}
function tree(locale: string): Dict {
  const dir = path.join(LOCALES, locale);
  const merged: Dict = {};
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    deepMerge(merged, JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as Dict);
  }
  return merged;
}
function resolve(t: Dict, key: string): unknown {
  return key.split(".").reduce<unknown>((n, part) => (n && typeof n === "object" ? (n as Dict)[part] : undefined), t);
}

describe("the way back exists on the class screen", () => {
  it("offers it through the shared gate", () => {
    expect(read(SCREEN)).toMatch(/canComeBack\(/);
    expect(read(SCREEN)).toMatch(/testID="class-come-back"/);
  });

  it("is gated on the state, never on capacity", () => {
    // rule 26: the client cannot know whether the spot is free without racing
    // the engine, so it must not consult a count to decide what to show.
    const screen = read(SCREEN);
    const gate = screen.slice(screen.indexOf("canComeBack("), screen.indexOf("canComeBack(") + 220);
    expect(gate).not.toMatch(/openSpot|maxPlayers|filled|participantCount/);
  });

  it("asks the server and does not paint the answer itself", () => {
    expect(read(SCREEN)).toMatch(/reminderAnswerOutcome\(/);
  });
});

describe("B-074: one mapper, no local defaults", () => {
  it("the conversation bubble's helper delegates instead of guessing", () => {
    const src = read(REMINDER_STATE);
    expect(src).toMatch(/from "@levelup\/config"/);
    // The exact default that recorded "no" for a refused return — as CODE, not
    // as the comment that explains why it went away (which is worth keeping,
    // and which a bare "must not appear" would forbid).
    expect(src).not.toMatch(/return \{ write: action === "confirmed"/);
    expect(src).not.toMatch(/^\s*(return|const)[^\n]*action === "confirmed" \? "yes" : "no"/m);
  });

  it("the dashboard block no longer toasts a refusal as a success", () => {
    const src = read(DASHBOARD);
    expect(src).not.toMatch(/result\.action === "confirmed" \? "dashboard\.answer\.confirmed" : "dashboard\.answer\.declined"/);
    expect(src).toMatch(/reminderAnswerOutcome\(/);
  });

  it("the conversation screen writes nothing when the mapper records nothing", () => {
    expect(read(CONVERSATION)).toMatch(/reminderAnswerOutcome\(|reminderResponseOutcome\(/);
  });
});

describe("the mapper's own answers, from the shell's point of view", () => {
  it("a refused return records nothing and explains itself", () => {
    const outcome = reminderAnswerOutcome({ action: "spot_filled" });
    expect(outcome.record).toBeNull();
    expect(outcome.messageKey).toBe("calendar.detail.spotFilled");
  });

  it("every key it can return resolves in both languages", () => {
    const keys = [
      "calendar.detail.spotFilled",
      "calendar.detail.comeBack",
      "calendar.detail.comeBackHint",
      "calendar.detail.comeBackDone",
      "messages.reminderExpired",
      "messages.somethingWentWrong",
    ];
    for (const locale of ["pt", "en"]) {
      const t = tree(locale);
      for (const key of keys) {
        expect(typeof resolve(t, key), `${locale} ${key}`).toBe("string");
      }
    }
  });
});
