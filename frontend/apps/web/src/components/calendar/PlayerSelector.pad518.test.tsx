/**
 * PAD-518 (classes.create rule 10): picking a student from the search results clears the
 * search and keeps the cursor in the field, so the coach can type the next name. Unticking keeps
 * the search.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import type { CoachPlayer } from "@/types";
import { PlayerSelector } from "./PlayerSelector";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

const ROSTER = ["1", "2", "3"].map(
  (id) => ({ id: `cp-${id}`, playerId: id, name: `Student ${id}`, levelId: "1" }) as unknown as CoachPlayer
);

function Holder() {
  const [ids, setIds] = useState<string[]>([]);
  const props = {
    players: ROSTER,
    levels: [],
    selectedPlayerIds: ids,
    classLevelId: null,
    onToggle: (id: string) => setIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])),
  } as unknown as Parameters<typeof PlayerSelector>[0];
  return <PlayerSelector {...props} />;
}

describe("PAD-518: the picker's search clears after a pick", () => {
  it("clears and keeps focus after ticking a search result, and keeps the text after unticking", () => {
    render(<Holder />);
    fireEvent.mouseDown(screen.getByTestId("player-selector-tab-all"));
    fireEvent.click(screen.getByTestId("player-selector-tab-all"));
    const search = screen.getByTestId("player-selector-search") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "Student 3" } });
    fireEvent.click(screen.getByTestId("player-selector-row-3"));
    expect(search.value).toBe("");
    expect(document.activeElement).toBe(search);

    fireEvent.change(search, { target: { value: "Student 3" } });
    fireEvent.click(screen.getByTestId("player-selector-row-3")); // unticks
    expect(search.value).toBe("Student 3");
  });
});

describe("PAD-516 with PAD-518: an out-of-order search finds the student, and the pick clears it", () => {
  it("finds \"Pedro Mesquita e Sousa\" by \"sousa pedro\", hides the others, and clears after the tick", () => {
    const people = [
      { id: "cp-7", playerId: "7", name: "Pedro Mesquita e Sousa", levelId: "1" },
      { id: "cp-8", playerId: "8", name: "Pedro Alves", levelId: "1" },
    ] as unknown as CoachPlayer[];
    function Two() {
      const [ids, setIds] = useState<string[]>([]);
      const props = {
        players: people, levels: [], selectedPlayerIds: ids, classLevelId: null,
        onToggle: (id: string) => setIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])),
      } as unknown as Parameters<typeof PlayerSelector>[0];
      return <PlayerSelector {...props} />;
    }
    render(<Two />);
    fireEvent.mouseDown(screen.getByTestId("player-selector-tab-all"));
    fireEvent.click(screen.getByTestId("player-selector-tab-all"));
    const search = screen.getByTestId("player-selector-search") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "sousa pedro" } });
    expect(screen.queryByTestId("player-selector-row-7")).not.toBeNull();
    expect(screen.queryByTestId("player-selector-row-8")).toBeNull();
    fireEvent.click(screen.getByTestId("player-selector-row-7"));
    expect(search.value).toBe("");
    expect(screen.queryByTestId("player-selector-row-8")).not.toBeNull();
  });
});

describe("PAD-516 + PAD-518 + PAD-527 together", () => {
  it("an out-of-order search finds the student with the class-level chip, the tick clears it, the others keep theirs", () => {
    const people = [
      { id: "cp-7", playerId: "7", name: "Pedro Mesquita e Sousa", levelId: "1" },
      { id: "cp-8", playerId: "8", name: "Pedro Alves", levelId: "2" },
    ] as unknown as CoachPlayer[];
    const levels = [{ id: "1", code: "I1" }, { id: "2", code: "B2" }];
    function Picker() {
      const [ids, setIds] = useState<string[]>([]);
      const props = {
        players: people, levels, selectedPlayerIds: ids, classLevelId: "1",
        onToggle: (id: string) => setIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])),
      } as unknown as Parameters<typeof PlayerSelector>[0];
      return <PlayerSelector {...props} />;
    }
    render(<Picker />);
    fireEvent.mouseDown(screen.getByTestId("player-selector-tab-all"));
    fireEvent.click(screen.getByTestId("player-selector-tab-all"));
    const search = screen.getByTestId("player-selector-search") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "sousa pedro" } });
    expect(screen.queryByTestId("player-selector-row-8")).toBeNull();
    expect(screen.getByTestId("player-level-chip-7").getAttribute("data-level-match")).toBe("same");
    fireEvent.click(screen.getByTestId("player-selector-row-7"));
    expect(search.value).toBe("");
    expect(screen.getByTestId("player-level-chip-8").getAttribute("data-level-match")).toBe("other");
    expect(screen.getByTestId("player-level-chip-8").textContent).toBe("B2");
  });
});
