import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
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
    // A coach in the legacy diagram means basket mode, whose toolbar has Jogador, not Cone.
    pickTool("player");
    tapCourt(50, 40);
    const d = lastDiagram(onChange);
    expect(d.version).toBe(2);
    expect(d.mode).toBe("basket");
    expect(d.pieces.some((p) => p.kind === "feeder")).toBe(true);
    expect(d.pieces.some((p) => p.kind === "player" && p.label === "A2")).toBe(true);
  });
});

// ── Wave 2 — Exercícios de cesto (PAD-243) ───────────────────────────────────

function pickMode(key: string) {
  fireEvent.click(screen.getByRole("tab", { name: new RegExp(`training\\.board\\.modes\\.${key}\\.title`) }));
}

describe("TacticalBoard — Exercícios de cesto (training.tactical-board rules 14–15)", () => {
  it("switches to basket mode without a prompt on a fresh board and feeds from the feeder", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    pickMode("basket");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    let d = lastDiagram(onChange);
    expect(d.mode).toBe("basket");
    expect(screen.getByTestId("piece-feeder")).toBeInTheDocument();
    expect(screen.getByText("A1")).toBeInTheDocument();
    expect(screen.queryByText("B1")).toBeNull();
    expect(screen.getByRole("tab", { name: /modes\.basket\.title/ })).toHaveAttribute("aria-selected", "true");

    pickTool("ball");
    expect(screen.getByText("training.board.hints.ballBasket")).toBeInTheDocument();
    tapCourt(30, 18);
    d = lastDiagram(onChange);
    expect(d.steps[0].ball?.from).toEqual({ x: 46, y: 55 });
    expect(d.steps[0].ball?.to.x).toBeCloseTo(30, 0);
    expect(d.steps[0].ball?.to.y).toBeCloseTo(18, 0);
  });

  it("Adicionar jogadores adds A3 then A4 and then disables", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    pickMode("basket");
    const add = screen.getByRole("button", { name: "training.board.addPlayers" });
    fireEvent.click(add);
    fireEvent.click(add);
    const d = lastDiagram(onChange);
    expect(d.pieces.filter((p) => p.kind === "player").map((p) => (p as { label: string }).label)).toEqual(["A1", "A2", "A3", "A4"]);
    expect(screen.getByText("A4")).toBeInTheDocument();
    expect(add).toBeDisabled();
  });

  it("Alimentador moves the feeder and Jogador places a player where tapped", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    pickMode("basket");
    pickTool("feeder");
    tapCourt(50, 70);
    let d = lastDiagram(onChange);
    const feeder = d.pieces.find((p) => p.kind === "feeder") as { x: number; y: number };
    expect(feeder.x).toBeCloseTo(50, 0);
    expect(feeder.y).toBeCloseTo(70, 0);
    pickTool("player");
    tapCourt(45, 30);
    d = lastDiagram(onChange);
    expect(d.pieces.find((p) => p.id === "a3")).toMatchObject({ label: "A3" });
  });

  it("switching away from a board with content asks first and resets on confirm", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    pickTool("cone");
    tapCourt(50, 40);
    pickMode("basket");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(lastDiagram(onChange).mode).toBe("game");
    fireEvent.click(screen.getByRole("button", { name: "training.board.switchMode.confirm" }));
    const d = lastDiagram(onChange);
    expect(d.mode).toBe("basket");
    expect(d.pieces.some((p) => p.kind === "cone")).toBe(false);
    expect(d.steps).toEqual([]);
  });
});

// ── Wave 3 — Magnético (PAD-244) ─────────────────────────────────────────────

describe("TacticalBoard — Magnético (training.tactical-board rules 16–17)", () => {
  it("opens with the pen, draws a red stroke, and undo removes it", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    pickMode("magnetic");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(lastDiagram(onChange).mode).toBe("magnetic");
    expect(lastDiagram(onChange).pieces).toEqual([]);
    expect(screen.getByRole("radio", { name: "training.board.tools.pen" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("training.board.hints.pen")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "training.board.colors.red" }));
    const c = court();
    fireEvent.pointerDown(c, { ...client(10, 10), button: 0, isPrimary: true });
    fireEvent.pointerMove(c, { ...client(20, 12), button: 0, isPrimary: true });
    fireEvent.pointerMove(c, { ...client(30, 30), button: 0, isPrimary: true });
    fireEvent.pointerUp(c, { ...client(30, 30), button: 0, isPrimary: true });
    let d = lastDiagram(onChange);
    const stroke = d.pieces.find((p) => p.kind === "stroke");
    expect(stroke).toMatchObject({ color: "red" });
    expect(stroke && stroke.kind === "stroke" ? stroke.points.length : 0).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId("piece-stroke-1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "training.board.undo" }));
    d = lastDiagram(onChange);
    expect(d.pieces.some((p) => p.kind === "stroke")).toBe(false);
  });

  it("Jogador with the red swatch places B1; Cone takes the colour", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    pickMode("magnetic");
    pickTool("player");
    fireEvent.click(screen.getByRole("radio", { name: "training.board.colors.red" }));
    tapCourt(60, 70);
    expect(lastDiagram(onChange).pieces[0]).toMatchObject({ kind: "player", team: "B", label: "B1" });
    expect(screen.getByText("B1")).toBeInTheDocument();
    pickTool("cone");
    fireEvent.click(screen.getByRole("radio", { name: "training.board.colors.green" }));
    tapCourt(20, 20);
    expect(lastDiagram(onChange).pieces.find((p) => p.kind === "cone")).toMatchObject({ color: "green" });
  });
});

// ── Wave 4 — steps and playback (PAD-245) ────────────────────────────────────

function drawMovement(id: string, fromX: number, fromY: number, toX: number, toY: number) {
  pickTool("movement");
  tapPiece(id, fromX, fromY);
  tapCourt(toX, toY);
}

describe("TacticalBoard — steps and playback (training.tactical-board rules 18–20)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the step indicator, adds a second step that starts from the first step's end", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(screen.getByTestId("board-step-indicator")).toHaveTextContent("training.board.playback.stepOf");
    drawMovement("a1", 32, 26, 20, 40);
    fireEvent.click(screen.getByRole("button", { name: "training.board.playback.addStep" }));
    let d = lastDiagram(onChange);
    expect(d.steps).toHaveLength(2);
    // On step 2 the board shows A1 where step 1 left it.
    const a1 = screen.getByTestId("piece-a1");
    expect(a1.getAttribute("transform")).toBe("translate(68 240)");
    fireEvent.click(screen.getByRole("button", { name: "training.board.playback.prevStep" }));
    expect(screen.getByTestId("piece-a1").getAttribute("transform")).toBe("translate(108.8 156)");
    fireEvent.click(screen.getByRole("button", { name: "training.board.playback.nextStep" }));
    fireEvent.click(screen.getByRole("button", { name: "training.board.playback.deleteStep" }));
    d = lastDiagram(onChange);
    expect(d.steps).toHaveLength(1);
  });

  it("Passo steps through the end states and wraps to the start", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    drawMovement("a1", 32, 26, 20, 40);
    fireEvent.click(screen.getByRole("button", { name: "training.board.playback.addStep" }));
    drawMovement("a1", 20, 40, 10, 60);
    const passo = screen.getByRole("button", { name: "training.board.playback.step" });
    fireEvent.click(passo);
    expect(screen.getByTestId("piece-a1").getAttribute("transform")).toBe("translate(68 240)");
    fireEvent.click(passo);
    expect(screen.getByTestId("piece-a1").getAttribute("transform")).toBe("translate(34 360)");
    fireEvent.click(passo);
    expect(screen.getByTestId("piece-a1").getAttribute("transform")).toBe("translate(108.8 156)");
  });

  it("AUTO animates through the steps, reads ■ while playing, and an edit stops it", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    pickTool("ball");
    tapCourt(58, 20);
    tapCourt(40, 80);
    fireEvent.click(screen.getByRole("button", { name: "training.board.playback.addStep" }));
    drawMovement("a1", 32, 26, 10, 60);
    const auto = screen.getByRole("button", { name: "training.board.playback.auto" });
    fireEvent.click(auto);
    expect(screen.getByRole("button", { name: "training.board.playback.stop" })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    // mid-way through step 1 the ball is between its endpoints
    const ball = screen.getByTestId("playback-ball");
    const cx = Number(ball.getAttribute("cx"));
    expect(cx).toBeGreaterThan(136);
    expect(cx).toBeLessThan(197.2);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    // step 2 is playing: A1 has left its start
    expect(screen.getByTestId("piece-a1").getAttribute("transform")).not.toBe("translate(108.8 156)");
    pickTool("cone");
    tapCourt(50, 40);
    expect(screen.getByRole("button", { name: "training.board.playback.auto" })).toBeInTheDocument();
    expect(screen.queryByTestId("playback-ball")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole("button", { name: "training.board.playback.auto" })).toBeInTheDocument();
  });
});
