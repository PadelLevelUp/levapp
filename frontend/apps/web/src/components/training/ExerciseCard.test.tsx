import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Exercise } from "@/types/training";
import { ExerciseCard } from "./ExerciseCard";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const base: Omit<Exercise, "diagram" | "id" | "name"> = {
  type: "attack",
  difficulty: 2,
  levelIds: [],
  createdAt: "2026-09-08T00:00:00Z",
  updatedAt: "2026-09-08T00:00:00Z",
};

// training.tactical-board — "Thumbnail renders both shapes"
describe("ExerciseCard thumbnail", () => {
  it("[TRAINING-TACTICAL-BOARD-13] renders a court thumbnail for a legacy diagram", () => {
    render(
      <ExerciseCard
        exercise={{
          ...base,
          id: "legacy",
          name: "Legacy",
          diagram: {
            elements: [
              { id: "e1", type: "player_1", x: 80, y: 140 },
              { id: "e5", type: "arrow", x: 80, y: 140, endX: 80, endY: 380, curve: 30 },
            ],
          },
        }}
        onClick={() => {}}
        onDelete={() => {}}
      />
    );
    expect(screen.getByTestId("thumb-court-surface")).toBeInTheDocument();
    expect(screen.getByTestId("thumb-piece-e1")).toBeInTheDocument();
    expect(screen.getByTestId("thumb-ball-path").getAttribute("d")).toMatch(/Q/);
  });

  it("[TRAINING-TACTICAL-BOARD-13] renders a court thumbnail for a v2 diagram", () => {
    render(
      <ExerciseCard
        exercise={{
          ...base,
          id: "v2",
          name: "V2",
          diagram: {
            version: 2,
            mode: "game",
            pieces: [{ id: "a1", kind: "player", team: "A", label: "A1", x: 32, y: 26 }],
            steps: [{ id: "s1", ball: { from: { x: 58, y: 20 }, to: { x: 40, y: 80 }, style: "flat" }, movements: [] }],
          },
        }}
        onClick={() => {}}
        onDelete={() => {}}
      />
    );
    expect(screen.getByTestId("thumb-court-surface")).toBeInTheDocument();
    expect(screen.getByTestId("thumb-piece-a1")).toBeInTheDocument();
    expect(screen.getByTestId("thumb-ball-path").getAttribute("d")).not.toMatch(/Q/);
  });

  it("[TRAINING-TACTICAL-BOARD-24] shows both paths of a step with two ball paths, and one for an older exercise with a single ball", () => {
    const p1 = { from: { x: 58, y: 20 }, to: { x: 40, y: 80 }, style: "flat" as const };
    const p2 = { from: { x: 40, y: 80 }, to: { x: 70, y: 30 }, style: "lob" as const };
    const pieces = [{ id: "a1", kind: "player" as const, team: "A" as const, label: "A1", x: 32, y: 26 }];
    const { rerender } = render(
      <ExerciseCard
        exercise={{
          ...base,
          id: "two",
          name: "Two paths",
          diagram: { version: 2, mode: "game", pieces, steps: [{ id: "s1", balls: [p1, p2], ball: p1, movements: [] }] },
        }}
        onClick={() => {}}
        onDelete={() => {}}
      />
    );
    expect(screen.getByTestId("thumb-ball-path").getAttribute("data-style")).toBe("flat");
    expect(screen.getByTestId("thumb-ball-path-1").getAttribute("data-style")).toBe("lob");

    // Saved before PAD-289: `ball` only.
    rerender(
      <ExerciseCard
        exercise={{
          ...base,
          id: "old",
          name: "Older",
          diagram: { version: 2, mode: "game", pieces, steps: [{ id: "s1", ball: p1, movements: [] }] },
        }}
        onClick={() => {}}
        onDelete={() => {}}
      />
    );
    expect(screen.getByTestId("thumb-ball-path").getAttribute("data-style")).toBe("flat");
    expect(screen.queryByTestId("thumb-ball-path-1")).toBeNull();
  });

  it("renders no thumbnail when there is no diagram", () => {
    render(<ExerciseCard exercise={{ ...base, id: "none", name: "None" }} onClick={() => {}} onDelete={() => {}} />);
    expect(screen.queryByTestId("thumb-court-surface")).toBeNull();
  });
});
