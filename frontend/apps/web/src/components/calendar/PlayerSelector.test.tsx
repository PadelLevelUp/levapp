/**
 * PAD-527 (classes.create rule 10): the participant picker shows every student's level —
 * primary for the class's level, amber for another level or none, neutral without a class level.
 */
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

// PAD-665 (players.search rule 5, 6, 8): the picker's search runs the shared name rule.
describe("PlayerSelector search (PAD-665)", () => {
  const rowsFor = (query: string) => {
    const people = [
      student("1", "Ana Rita", null),
      student("2", "Rita Zé", null),
      student("3", "Rui Pedro Basto", null),
      student("4", "André", null),
    ];
    render(
      <PlayerSelector players={people} levels={[]} selectedPlayerIds={[]} classLevelId={null} onToggle={() => {}} />
    );
    const tab = screen.getByTestId("player-selector-tab-all");
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    fireEvent.change(screen.getByTestId("player-selector-search"), { target: { value: query } });
    return screen
      .getAllByTestId(/^player-selector-row-/)
      .map((el) => el.getAttribute("data-testid")!.replace("player-selector-row-", ""));
  };

  it("finds 'rui basto' → Rui Pedro Basto and 'andre' → André", () => {
    expect(rowsFor("rui basto")).toEqual(["3"]);
    cleanup();
    expect(rowsFor("andre")).toEqual(["4"]);
  });

  it("lists the best match first and a blank search in the given order", () => {
    expect(rowsFor("rita")).toEqual(["2", "1"]);
    cleanup();
    expect(rowsFor("")).toEqual(["1", "2", "3", "4"]);
  });
});
