/**
 * PAD-527 (classes.create rule 10): the participant picker shows every student's level —
 * primary for the class's level, amber for another level or none, neutral without a class level.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { CoachPlayer } from "@/types";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { PlayerSelector } from "./PlayerSelector";

const LEVELS = [
  { id: "1", code: "I1", label: "Intermédio" },
  { id: "2", code: "B2", label: "Base" },
];
const student = (id: string, name: string, levelId: string | null) =>
  ({ id: `cp-${id}`, playerId: id, name, levelId }) as unknown as CoachPlayer;
const STUDENTS = [student("1", "Rui", "1"), student("2", "Sara", "2"), student("3", "Tomé", null)];

function chips(classLevelId: string | null) {
  render(
    <PlayerSelector
      players={STUDENTS}
      levels={LEVELS as never}
      selectedPlayerIds={[]}
      classLevelId={classLevelId}
      onToggle={() => {}}
    />
  );
  const tab = screen.getByTestId("player-selector-tab-all");
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
  const read = (id: string) => screen.queryByTestId(`player-level-chip-${id}`)?.getAttribute("data-level-match") ?? null;
  return { rui: read("1"), sara: read("2"), tome: read("3") };
}

describe("PlayerSelector shows every student's level (PAD-527)", () => {
  it("marks the class's level as same, another level or none as other", () => {
    expect(chips("1")).toEqual({ rui: "same", sara: "other", tome: "other" });
  });

  it("is neutral for a class with no level, and a student with no level shows no chip", () => {
    expect(chips(null)).toEqual({ rui: "none", sara: "none", tome: null });
  });
});
