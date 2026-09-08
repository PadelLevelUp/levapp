import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import type { AnyCourtDiagram, CourtDiagramV2 } from "@/types/training";
import { TacticalBoard } from "./TacticalBoard";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// The court renders 340×600 in these tests, so percent ↔ client is x·3.4, y·6.
// jsdom's MouseEvent keeps integer client coordinates, so anything read back from a
// pointer event is asserted to within half a percent (toBeCloseTo(_, 0)).
const W = 340;
const H = 600;
const client = (xPct: number, yPct: number) => ({ clientX: xPct * (W / 100), clientY: yPct * (H / 100) });

function Harness({ initial, onChange }: { initial?: AnyCourtDiagram; onChange: (d: CourtDiagramV2) => void }) {
  const [value, setValue] = useState<AnyCourtDiagram | undefined>(initial);
  return (
    <TacticalBoard
      value={value}
      onChange={(d) => {
        setValue(d);
        onChange(d);
      }}
    />
  );
}

function court() {
  return screen.getByTestId("court-surface");
}

function tapCourt(xPct: number, yPct: number) {
  const c = court();
  fireEvent.pointerDown(c, { ...client(xPct, yPct), button: 0, isPrimary: true });
  fireEvent.pointerUp(c, { ...client(xPct, yPct), button: 0, isPrimary: true });
}

function tapPiece(id: string, xPct: number, yPct: number) {
  const p = screen.getByTestId(`piece-${id}`);
  fireEvent.pointerDown(p, { ...client(xPct, yPct), button: 0, isPrimary: true });
  fireEvent.pointerUp(p, { ...client(xPct, yPct), button: 0, isPrimary: true });
}

function pickTool(key: string) {
  fireEvent.click(screen.getByRole("radio", { name: `training.board.tools.${key}` }));
}

function lastDiagram(onChange: ReturnType<typeof vi.fn>): CourtDiagramV2 {
  return onChange.mock.calls[onChange.mock.calls.length - 1][0] as CourtDiagramV2;
}

// jsdom has no PointerEvent, and testing-library's fallback Event drops clientX/Y.
// A MouseEvent subclass keeps the coordinates and the pointer fields the board reads.
class JsdomPointerEvent extends MouseEvent {
  pointerId: number;
  pointerType: string;
  isPrimary: boolean;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? "mouse";
    this.isPrimary = init.isPrimary ?? true;
  }
}

beforeEach(() => {
  if (typeof window.PointerEvent === "undefined") {
    (window as unknown as { PointerEvent: typeof JsdomPointerEvent }).PointerEvent = JsdomPointerEvent;
  }
  // jsdom has no layout: give the SVG the canvas size so percent maths is exact.
  vi.spyOn(SVGElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: W, bottom: H, width: W, height: H, toJSON: () => ({}),
  } as DOMRect);
});

describe("TacticalBoard — Situações de jogo (training.tactical-board)", () => {
  it("opens in game mode with the 2v2 starting position, Selecionar active and its hint", () => {
    render(<Harness onChange={vi.fn()} />);
    expect(screen.getByRole("tab", { name: /training\.board\.modes\.game\.title/ })).toHaveAttribute("aria-selected", "true");
    for (const id of ["a1", "a2", "b1", "b2"]) expect(screen.getByTestId(`piece-${id}`)).toBeInTheDocument();
    expect(screen.getByText("A1")).toBeInTheDocument();
    expect(screen.getByText("B2")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "training.board.tools.select" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("training.board.hints.select")).toBeInTheDocument();
  });

  it("Bola draws a flat path between two taps and the midpoint handle toggles it to a lob", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    pickTool("ball");
    expect(screen.getByText("training.board.hints.ball")).toBeInTheDocument();
    tapCourt(58, 20);
    tapCourt(40, 80);
    let d = lastDiagram(onChange);
    expect(d.version).toBe(2);
    expect(d.mode).toBe("game");
    expect(d.steps).toHaveLength(1);
    expect(d.steps[0].ball?.style).toBe("flat");
    expect(d.steps[0].ball?.from.x).toBeCloseTo(58, 0);
    expect(d.steps[0].ball?.from.y).toBeCloseTo(20, 0);
    expect(d.steps[0].ball?.to.x).toBeCloseTo(40, 0);
    expect(d.steps[0].ball?.to.y).toBeCloseTo(80, 0);

    fireEvent.click(screen.getByTestId("ball-style-handle"));
    d = lastDiagram(onChange);
    expect(d.steps[0].ball?.style).toBe("lob");
    expect(screen.getByTestId("ball-path").getAttribute("d")).toMatch(/Q/);
  });

  it("Movimentação ties a dashed path to the tapped player", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    pickTool("movement");
    tapPiece("a1", 32, 26);
    tapCourt(20, 40);
    const d = lastDiagram(onChange);
    expect(d.steps[0].movements).toHaveLength(1);
    expect(d.steps[0].movements[0].pieceId).toBe("a1");
    expect(d.steps[0].movements[0].to.x).toBeCloseTo(20, 0);
    expect(d.steps[0].movements[0].to.y).toBeCloseTo(40, 0);
    expect(screen.getByTestId("movement-a1")).toHaveAttribute("stroke-dasharray");
  });

  it("Selecionar moves a piece by tap-to-move and by drag", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    tapPiece("b2", 62, 70);
    tapCourt(50, 85);
    let d = lastDiagram(onChange);
    expect(d.pieces.find((p) => p.id === "b2")).toMatchObject({ x: 50, y: 85 });

    const a2 = screen.getByTestId("piece-a2");
    fireEvent.pointerDown(a2, { ...client(62, 26), button: 0, isPrimary: true });
    fireEvent.pointerMove(court(), { ...client(66, 28), button: 0, isPrimary: true });
    fireEvent.pointerMove(court(), { ...client(70, 30), button: 0, isPrimary: true });
    fireEvent.pointerUp(court(), { ...client(70, 30), button: 0, isPrimary: true });
    d = lastDiagram(onChange);
    const moved = d.pieces.find((p) => p.id === "a2") as { x: number; y: number };
    expect(moved.x).toBeCloseTo(70, 0);
    expect(moved.y).toBeCloseTo(30, 0);
  });

  it("undo reverts the last change", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    pickTool("cone");
    tapCourt(50, 40);
    expect(lastDiagram(onChange).pieces.some((p) => p.kind === "cone")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "training.board.undo" }));
    expect(lastDiagram(onChange).pieces.some((p) => p.kind === "cone")).toBe(false);
    expect(screen.queryByTestId(/^piece-cone/)).toBeNull();
  });

  it("upgrades a legacy diagram on mount and reports it in v2", () => {
    const onChange = vi.fn();
    render(
      <Harness
        initial={{
          elements: [
            { id: "e1", type: "player_1", x: 80, y: 140 },
            { id: "e3", type: "coach", x: 140, y: 260 },
            { id: "e4", type: "blocker", x: 100, y: 100 },
          ],
        }}
        onChange={onChange}
      />
    );
    expect(screen.getByTestId("piece-e3")).toBeInTheDocument();
    expect(screen.getByText("A1")).toBeInTheDocument();
    expect(screen.queryByTestId("piece-e4")).toBeNull();
    pickTool("cone");
    tapCourt(50, 40);
    const d = lastDiagram(onChange);
    expect(d.version).toBe(2);
    expect(d.mode).toBe("basket");
    expect(d.pieces.some((p) => p.kind === "feeder")).toBe(true);
  });
});
