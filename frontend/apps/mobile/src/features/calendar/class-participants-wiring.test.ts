import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * classes.create rule 10 / classes.edit rule 9 (PAD-474, B-239): the mobile
 * new-class and class-detail screens carry the participant picker and send what
 * it chose. The screens mount providers the vitest harness cannot (react-query,
 * expo-router), so this reads their source; Maestro flows 125/126 drive them.
 * Kept under src/, never app/ (expo-router bundles app/*.test.ts as routes).
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..", "..", "..", "app");
const read = (rel: string) => fs.readFileSync(path.join(APP, rel), "utf8");

describe("new-class screen (classes.create rule 10)", () => {
  const src = read("class/new.tsx");

  it("renders the participant picker", () => {
    expect(src).toMatch(/<PlayerSelector\b/);
  });

  it("sends the chosen students, not an empty list", () => {
    expect(src).not.toMatch(/playerIds:\s*\[\]/);
    expect(src).toMatch(/playerIds:\s*selectedPlayers\b/);
  });

  it("warns about unavailable chosen students before saving (student-blockers rule 9)", () => {
    expect(src).toMatch(/checkAvailabilityConflicts\(/);
    expect(src).toMatch(/<UnavailableStudentDialog\b/);
  });
});

describe("class-detail edit (classes.edit rule 9)", () => {
  const src = read("class/[id].tsx");

  it("renders the participant picker in edit mode", () => {
    expect(src).toMatch(/<PlayerSelector\b/);
  });

  it("builds the change set with the participant diff in both save steps", () => {
    // Both saveEdit and commitEdit used to diff EDITABLE_CLASS_FIELDS only and
    // return early when it was empty, dropping a participants-only edit.
    expect(src.match(/buildClassEditChanges\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(src).not.toMatch(/diffInstance\(\s*instance,\s*draft,\s*EDITABLE_CLASS_FIELDS\s*\)/);
  });
});
