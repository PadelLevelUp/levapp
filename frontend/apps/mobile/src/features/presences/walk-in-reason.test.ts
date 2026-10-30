import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { walkInEmptyReason } from "@levelup/config";
import type { PendingValidationClass } from "@levelup/types";
import { describe, expect, it } from "vitest";

import { availableRoster, filterRoster, inClassOptions } from "./validate-state";

/**
 * PAD-787 (attendance.validation rule 8b, B-705): the iOS walk-in picker says why it lists nobody.
 * The decision is the shared `walkInEmptyReason` over `inClassOptions`, proved here on the
 * picker's own inputs; the sheet's wiring is read from its source (it mounts react-query hooks,
 * which the mobile harness cannot).
 */
const klass = {
  lessonInstanceId: 1,
  players: [{ playerId: 10, name: "Gonçalo Simões" }],
} as unknown as PendingValidationClass;
const roster = [
  { id: 10, name: "Gonçalo Simões", nickname: "Gugu" },
  { id: 91, name: "Zé Costa" },
];

/** What the picker computes for a typed query. */
function reasonFor(query: string) {
  const offered = filterRoster(availableRoster(roster, klass), query);
  return walkInEmptyReason(inClassOptions(klass, roster), offered.length, query);
}

describe("the picker's reason (rule 8b)", () => {
  it("a student already in the class is named, by real name or nickname", () => {
    expect(reasonFor("Gonçalo Simões")).toEqual({ kind: "inClass", playerId: 10 });
    expect(reasonFor("gugu")).toEqual({ kind: "inClass", playerId: 10 });
  });

  it("a name nobody has is not on the roster", () => {
    expect(reasonFor("Xavier")).toEqual({ kind: "notOnRoster" });
  });

  it("nothing to explain while someone is offered", () => {
    expect(reasonFor("ze")).toEqual({ kind: "none" });
  });

  it("inClassOptions carries the coach's nickname from the roster", () => {
    expect(inClassOptions(klass, roster)).toEqual([{ id: 10, name: "Gonçalo Simões", nickname: "Gugu" }]);
  });
});

describe("the sheet's wiring (rule 8b)", () => {
  const SHEET = readFileSync(resolve(__dirname, "ValidateClassesSheet.tsx"), "utf8");
  const SCREEN = readFileSync(resolve(__dirname, "PresencesScreen.tsx"), "utf8");

  it("both pickers get the class's own players and a row key", () => {
    expect(SHEET.match(/inClass=\{inClassOptions\((klass|detail), roster\)\}/g)).toHaveLength(2);
    expect(SHEET.match(/<WalkInPicker[\s\S]*?inClass=\{inClass\}[\s\S]*?rowKey=\{rowKey\}/g)).toHaveLength(2);
  });

  it("names the student with 'Show', which scrolls to their row; offers the players list otherwise", () => {
    expect(SHEET).toContain('testID={`${testIDPrefix}-already-in-class`}');
    expect(SHEET).toMatch(/focus\?\.show\(rowKey\(already\.id\)\)/);
    expect(SHEET).toContain('testID={`${testIDPrefix}-not-on-roster`}');
    expect(SCREEN).toMatch(/onOpenPlayers=\{\(\) => \{\s*setSheetOpen\(false\);\s*router\.push\("\/\(tabs\)\/players"\)/);
  });

  it("every marking row registers for the scroll, in the list and in the detail", () => {
    expect(SHEET.match(/ref=\{\(node\) => focus\??\.register\(rowKey\(player\.playerId\), node\)\}/g)).toHaveLength(2);
    expect(SHEET.match(/innerViewRef=\{/g)).toHaveLength(2);
  });
});
