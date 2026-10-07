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
  return (
    <PlayerSelector
      {...({
        players: ROSTER,
        levels: [],
        selectedPlayerIds: ids,
        classLevelId: null,
        onToggle: (id: string) => setIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])),
      } as never)}
    />
  );
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
