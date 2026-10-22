import { describe, expect, it } from "vitest";
import {
  SAME_DAY_DEFAULT_NOTE_DISMISSED,
  SAME_DAY_DEFAULT_NOTE_STORAGE_KEY,
  sameDayDefaultNoteShown,
} from "./same-day-default-note";

describe("same-day default note (PAD-685, rule 6e)", () => {
  it("keeps the key web and iOS both store under", () => {
    expect(SAME_DAY_DEFAULT_NOTE_STORAGE_KEY).toBe("levapp.sameDayDefaultNote.dismissed");
  });

  it("shows until dismissed", () => {
    expect(sameDayDefaultNoteShown(null)).toBe(true);
    expect(sameDayDefaultNoteShown(undefined)).toBe(true);
    expect(sameDayDefaultNoteShown("")).toBe(true);
    expect(sameDayDefaultNoteShown("garbage")).toBe(true);
    expect(sameDayDefaultNoteShown(SAME_DAY_DEFAULT_NOTE_DISMISSED)).toBe(false);
  });
});
