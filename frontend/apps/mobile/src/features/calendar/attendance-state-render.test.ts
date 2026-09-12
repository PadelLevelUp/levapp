import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ATTENDANCE_STATES, attendanceStateLabelKey } from "@levelup/config";

/**
 * PAD-313 on iOS (`attendance.confirm` rule 25, `calendar.event-detail` rule 3a).
 *
 * There is no render harness on mobile — the house pattern for a screen-level
 * guarantee here is to read the screen's own source, the way
 * `event-detail-i18n.test.ts` does for its keys. So this test asserts the two
 * things that actually regressed on the phone: the participant row and the class
 * screen render ONE state word from the shared helper, and neither of them still
 * carries the second decline affordance or the raw-column reads that produced
 * "presença confirmada" + "falta justificada" + "ausente" at once.
 *
 * Every state label is also resolved against both locale trees, built exactly
 * the way `src/lib/i18n.ts` builds them — a mobile screen that renders a missing
 * key shows the key path to the user, and no device test catches it.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOBILE_ROOT = path.resolve(HERE, "../../..");
const ROW = path.join(MOBILE_ROOT, "src/features/calendar/ParticipantRow.tsx");
const SCREEN = path.join(MOBILE_ROOT, "app/class/[id].tsx");
const LOCALES = path.resolve(MOBILE_ROOT, "../../src/locales");

const row = () => fs.readFileSync(ROW, "utf8");
const screen = () => fs.readFileSync(SCREEN, "utf8");

type Dict = Record<string, unknown>;

function deepMerge(target: Dict, source: Dict): Dict {
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = target[key];
    if (sv && tv && typeof sv === "object" && typeof tv === "object" && !Array.isArray(sv)) {
      deepMerge(tv as Dict, sv as Dict);
    } else {
      target[key] = sv;
    }
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

function resolve(treeFor: Dict, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => {
    if (node && typeof node === "object") return (node as Dict)[part];
    return undefined;
  }, treeFor);
}

describe("the participant row shows one state word", () => {
  it("reads the state through the shared helper", () => {
    expect(row()).toMatch(/attendanceStateOf\(/);
    expect(row()).toMatch(/from "@levelup\/config"/);
  });

  it("exposes the state as a testID the flows can assert", () => {
    expect(row()).toMatch(/testID="attendance-state"/);
  });

  it("no longer renders the chip that called a cancellation confirmed", () => {
    expect(row()).not.toMatch(/attendance-signal/);
    expect(row()).not.toMatch(/calendar\.attendance\.confirmedAttendance/);
  });

  it("no longer decides what to display from the raw columns", () => {
    // The coach's present/absent toggle still WRITES `attendance.status` — what
    // must be gone is reading those columns to choose a status word.
    expect(row()).not.toMatch(/presence\.confirmed\s*\n?\s*\?/);
    expect(row()).not.toMatch(/attendance\.justification === "justified"\s*\n?\s*\?\s*t\(/);
  });
});

describe("the class screen has one decline action", () => {
  it("dropped the second affordance and its gate", () => {
    expect(screen()).not.toMatch(/class-proactive-decline/);
    // Not merely unmentioned — not USED. The comments that explain why the gate
    // went away are worth keeping; a call or a prop would mean it still decides
    // what renders.
    expect(screen()).not.toMatch(/canDeclineProactively\(/);
    expect(screen()).not.toMatch(/canDeclineProactively:/);
  });

  it("keeps one action, labelled in the person's own words", () => {
    expect(screen()).toMatch(/testID="class-cancel-attendance"/);
    expect(screen()).toMatch(/calendar\.detail\.proactiveDecline/);
  });

  it("shows the student's own state as one word, not a panel plus a chip", () => {
    expect(screen()).toMatch(/attendanceStateOf\(/);
    expect(screen()).not.toMatch(/calendar\.detail\.notAttendingJustified/);
  });

  it("lets the server's classification choose the toast", () => {
    expect(screen()).toMatch(/proactive/);
  });
});

describe("every state label resolves in both languages", () => {
  const trees = { pt: tree("pt"), en: tree("en") };

  it("has a string for all five states, both audiences", () => {
    for (const [locale, treeFor] of Object.entries(trees)) {
      for (const state of ATTENDANCE_STATES) {
        for (const audience of ["student", "coach"] as const) {
          const key = attendanceStateLabelKey(state, audience);
          expect(typeof resolve(treeFor, key), `${locale} ${key}`).toBe("string");
        }
      }
      expect(
        typeof resolve(treeFor, "calendar.attendanceState.reminderSent"),
        `${locale} reminderSent`
      ).toBe("string");
    }
  });

  it("speaks to the student in the second person in Portuguese", () => {
    expect(resolve(trees.pt, "calendar.attendanceState.coming.student")).toBe("Vais");
    expect(resolve(trees.pt, "calendar.attendanceState.coming.coach")).toBe("Vai");
  });
});
