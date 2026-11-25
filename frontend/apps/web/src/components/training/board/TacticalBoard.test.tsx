import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useState } from "react";
import type { AnyCourtDiagram, CourtDiagramV2 } from "@/types/training";
import { TacticalBoard } from "./TacticalBoard";

vi.mock("react-i18next", () => ({
  // Only the step indicator interpolates, so its number can be read; every other key stays itself.
  useTranslation: () => ({
    t: (key: string, o?: { n?: number; m?: number }) =>
      key === "training.board.playback.stepOf" ? `Step ${o?.n} of ${o?.m}` : key,
  }),
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
  it("[TRAINING-TACTICAL-BOARD-1] opens in game mode with the 2v2 starting position, Selecionar active and its hint", () => {
    render(<Harness onChange={vi.fn()} />);
    expect(screen.getByRole("tab", { name: /training\.board\.modes\.game\.title/ })).toHaveAttribute("aria-selected", "true");
    for (const id of ["a1", "a2", "b1", "b2"]) expect(screen.getByTestId(`piece-${id}`)).toBeInTheDocument();
    expect(screen.getByText("A1")).toBeInTheDocument();
    expect(screen.getByText("B2")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "training.board.tools.select" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("training.board.hints.select")).toBeInTheDocument();
  });

  it("[TRAINING-TACTICAL-BOARD-2] Bola draws a flat path between two taps and the midpoint handle toggles it to a lob", () => {
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

  it("[TRAINING-TACTICAL-BOARD-3] Movimentação ties a dashed path to the tapped player", () => {
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

  it("[TRAINING-TACTICAL-BOARD-4] PAD-309: further taps add legs, each drawn from where the last one ended", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    pickTool("movement");
    tapPiece("a1", 32, 26);
    tapCourt(20, 40);
    tapCourt(10, 60);
    const d = lastDiagram(onChange);
    expect(d.steps[0].movements.map((m) => m.pieceId)).toEqual(["a1", "a1"]);
    expect(d.steps[0].movements[1].to.x).toBeCloseTo(10, 0);
    const first = screen.getByTestId("movement-a1").getAttribute("d") ?? "";
    const second = screen.getByTestId("movement-a1-1").getAttribute("d") ?? "";
    // the second leg starts at the first leg's end
    const end = /L\s*([-\d.]+)[ ,]([-\d.]+)/.exec(first);
    const start = /M\s*([-\d.]+)[ ,]([-\d.]+)/.exec(second);
    expect(end && start).toBeTruthy();
    expect(Number(start![1])).toBeCloseTo(Number(end![1]), 1);
    expect(Number(start![2])).toBeCloseTo(Number(end![2]), 1);
  });

  it("[TRAINING-TACTICAL-BOARD-9] Selecionar moves a piece by tap-to-move and by drag", () => {
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

  it("[TRAINING-TACTICAL-BOARD-10] undo reverts the last change", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    pickTool("cone");
    tapCourt(50, 40);
    expect(lastDiagram(onChange).pieces.some((p) => p.kind === "cone")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "training.board.undo" }));
    expect(lastDiagram(onChange).pieces.some((p) => p.kind === "cone")).toBe(false);
    expect(screen.queryByTestId(/^piece-cone/)).toBeNull();
  });

  it("[TRAINING-TACTICAL-BOARD-12] upgrades a legacy diagram on mount and reports it in v2", () => {
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
  it("[TRAINING-TACTICAL-BOARD-14] switches to basket mode without a prompt on a fresh board and feeds from the feeder", () => {
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

  it("[TRAINING-TACTICAL-BOARD-15] Adicionar jogadores adds A3 then A4 and then disables", () => {
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
    const a3 = d.pieces.find((p) => p.id === "a3") as { label: string; x: number; y: number };
    expect(a3.label).toBe("A3");
    expect(a3.x).toBeCloseTo(45, 0);
    expect(a3.y).toBeCloseTo(30, 0);
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
  it("[TRAINING-TACTICAL-BOARD-16] opens with the pen, draws a red stroke, and undo removes it", () => {
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
    expect(screen.getByTestId("board-step-indicator")).toHaveTextContent("Step 1 of 1");
    drawMovement("a1", 32, 26, 20, 40);
    fireEvent.click(screen.getByRole("button", { name: "training.board.playback.addStep" }));
    let d = lastDiagram(onChange);
    expect(d.steps).toHaveLength(2);
    expect(screen.getByTestId("board-step-indicator")).toHaveTextContent("Step 2 of 2");
    // On step 2 the board shows A1 where step 1 left it.
    const a1 = screen.getByTestId("piece-a1");
    expect(a1.getAttribute("transform")).toBe("translate(68 240)");
    fireEvent.click(screen.getByRole("button", { name: "training.board.playback.prevStep" }));
    expect(screen.getByTestId("piece-a1").getAttribute("transform")).toBe("translate(108.8 156)");
    fireEvent.click(screen.getByRole("button", { name: "training.board.playback.nextStep" }));
    fireEvent.click(screen.getByRole("button", { name: "training.board.playback.deleteStep" }));
    d = lastDiagram(onChange);
    expect(d.steps).toHaveLength(1);
    expect(screen.getByTestId("board-step-indicator")).toHaveTextContent("Step 1 of 1");
  });

  it("[TRAINING-TACTICAL-BOARD-29] deleting a middle step shows the step that followed it", () => {
    const onChange = vi.fn();
    const mv = (id: string, x: number, y: number) => ({ id, movements: [{ pieceId: "a1", to: { x, y } }] });
    render(
      <Harness
        initial={{
          version: 2,
          mode: "game",
          pieces: [{ id: "a1", kind: "player", team: "A", label: "A1", x: 32, y: 26 }],
          steps: [mv("s1", 20, 40), mv("s2", 10, 60), mv("s3", 50, 50)],
        }}
        onChange={onChange}
      />
    );
    expect(screen.getByTestId("board-step-indicator")).toHaveTextContent("Step 1 of 3");
    fireEvent.click(screen.getByRole("button", { name: "training.board.playback.nextStep" }));
    expect(screen.getByTestId("board-step-indicator")).toHaveTextContent("Step 2 of 3");
    // The middle step's own path ends at (10 %, 60 %) = view (34, 360).
    expect(screen.getByTestId("movement-a1").getAttribute("d")).toMatch(/L34,360$/);

    fireEvent.click(screen.getByRole("button", { name: "training.board.playback.deleteStep" }));
    const d = lastDiagram(onChange);
    expect(d.steps.map((st) => st.id)).toEqual(["s1", "s3"]);
    // The board stays on the same index, which is now the step that followed: s3 ends at (50 %, 50 %).
    expect(screen.getByTestId("board-step-indicator")).toHaveTextContent("Step 2 of 2");
    expect(screen.getByTestId("movement-a1").getAttribute("d")).toMatch(/L170,300$/);
  });

  it("[TRAINING-TACTICAL-BOARD-17] Passo steps through the end states and wraps to the start", () => {
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

  it("[TRAINING-TACTICAL-BOARD-23] Passo advances one whole step when the step holds two ball paths", () => {
    const onChange = vi.fn();
    const p1 = { from: { x: 58, y: 20 }, to: { x: 40, y: 80 }, style: "flat" as const };
    const p2 = { from: { x: 40, y: 80 }, to: { x: 70, y: 30 }, style: "flat" as const };
    render(
      <Harness
        initial={{
          version: 2,
          mode: "game",
          pieces: [{ id: "a1", kind: "player", team: "A", label: "A1", x: 32, y: 26 }],
          steps: [
            { id: "s1", balls: [p1, p2], ball: p1, movements: [] },
            { id: "s2", movements: [{ pieceId: "a1", to: { x: 20, y: 40 } }] },
          ],
        }}
        onChange={onChange}
      />
    );
    const passo = screen.getByRole("button", { name: "training.board.playback.step" });
    fireEvent.click(passo);
    // One press shows the end of step 1: the ball has travelled both paths and rests at the second one's end
    // (70 %, 30 %) = view (238, 180), not at the first one's end (40 %, 80 %).
    const ball = screen.getByTestId("playback-ball");
    expect(Number(ball.getAttribute("cx"))).toBeCloseTo(238, 1);
    expect(Number(ball.getAttribute("cy"))).toBeCloseTo(180, 1);
    expect(screen.getByTestId("piece-a1").getAttribute("transform")).toBe("translate(108.8 156)");
    // The next press is the end of step 2, not a second half of step 1.
    fireEvent.click(passo);
    expect(screen.getByTestId("piece-a1").getAttribute("transform")).toBe("translate(68 240)");
    expect(screen.queryByTestId("playback-ball")).toBeNull();
  });

  it("[TRAINING-TACTICAL-BOARD-18] AUTO animates through the steps, reads ■ while playing, and an edit stops it", () => {
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

// ── PAD-311 — actions play in the order they were drawn (rule 26) ────────────
describe("sequenced steps (PAD-311)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function ballMoveBall() {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    pickTool("ball");
    tapCourt(58, 20);
    tapCourt(50, 50);
    pickTool("movement");
    tapPiece("a1", 32, 26);
    tapCourt(50, 50);
    pickTool("ball");
    tapCourt(50, 50);
    tapCourt(40, 80);
    return onChange;
  }

  it("[TRAINING-TACTICAL-BOARD-5] numbers every action by its place in the play order", () => {
    const onChange = ballMoveBall();
    const d = lastDiagram(onChange);
    expect(d.steps[0].movements[0].seq).toBe(1);
    expect(screen.getByTestId("ball-number-0")).toHaveTextContent("1");
    expect(screen.getByTestId("movement-order-a1")).toHaveTextContent("2");
    expect(screen.getByTestId("ball-number-1")).toHaveTextContent("3");
  });

  it("[TRAINING-TACTICAL-BOARD-5] AUTO plays the ball first and moves A1 only after it", () => {
    vi.useFakeTimers();
    ballMoveBall();
    const start = screen.getByTestId("piece-a1").getAttribute("transform");
    fireEvent.click(screen.getByRole("button", { name: "training.board.playback.auto" }));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByTestId("playback-ball")).toBeInTheDocument();
    expect(screen.getByTestId("piece-a1").getAttribute("transform")).toBe(start);
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(screen.getByTestId("piece-a1").getAttribute("transform")).not.toBe(start);
  });
});

// ── PAD-310 — playback speed (rule 25) ───────────────────────────────────────
describe("playback speed (PAD-310)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function oneStepOnePath() {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    pickTool("ball");
    tapCourt(58, 20);
    tapCourt(40, 80);
  }
  const autoButton = () => screen.queryByRole("button", { name: "training.board.playback.auto" });

  it("[TRAINING-TACTICAL-BOARD-8] Normal is selected by default, and Rápido finishes an 800 ms step in about 400 ms", () => {
    vi.useFakeTimers();
    oneStepOnePath();
    expect(screen.getByTestId("board-speed-normal")).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByTestId("board-speed-fast"));
    expect(screen.getByTestId("board-speed-fast")).toHaveAttribute("aria-checked", "true");
    fireEvent.click(autoButton()!);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(autoButton()).toBeNull(); // still playing
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(autoButton()).toBeInTheDocument(); // done by ~450 ms, not 800
  });

  it("[TRAINING-TACTICAL-BOARD-8] Lento is still playing after 1000 ms", () => {
    vi.useFakeTimers();
    oneStepOnePath();
    fireEvent.click(screen.getByTestId("board-speed-slow"));
    fireEvent.click(autoButton()!);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(autoButton()).toBeNull();
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(autoButton()).toBeInTheDocument();
  });
});

// ── PAD-289 — several ball paths per step ────────────────────────────────────
describe("several ball paths per step (PAD-289)", () => {
  it("[TRAINING-TACTICAL-BOARD-22] appends a second path, numbers both, toggles only one, reorders and removes", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "training.board.tools.ball" }));
    tapCourt(58, 20);
    tapCourt(40, 80);
    tapCourt(40, 80);
    tapCourt(70, 30);
    let d = lastDiagram(onChange);
    expect(d.steps[0].balls).toHaveLength(2);
    expect(d.steps[0].ball).toEqual(d.steps[0].balls?.[0]);
    expect(screen.getByTestId("ball-number-0")).toHaveTextContent("1");
    expect(screen.getByTestId("ball-number-1")).toHaveTextContent("2");

    fireEvent.click(screen.getByTestId("ball-style-handle-1"));
    d = lastDiagram(onChange);
    expect(d.steps[0].balls?.map((b) => b.style)).toEqual(["flat", "lob"]);

    // The badges read 1 and 2 by position and sit at their path's start. Before ▲ the flat path (starts at
    // 58 %, 20 %) carries 1 and the lob path (starts at 40 %, 80 %) carries 2; after ▲ they swap.
    // (Pointer coordinates are whole pixels in jsdom, so positions are compared to within half a unit.)
    const expectBadge = (i: number, startX: number, startY: number) => {
      const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(screen.getByTestId(`ball-number-${i}`).getAttribute("transform") ?? "");
      expect(Number(m![1])).toBeCloseTo(startX * 3.4 + 13 + i * 18, 0);
      expect(Number(m![2])).toBeCloseTo(startY * 6 - 24, 0);
    };
    const flatBadge = (i: number) => expectBadge(i, 58, 20);
    const lobBadge = (i: number) => expectBadge(i, 40, 80);
    flatBadge(0);
    lobBadge(1);
    fireEvent.click(screen.getByTestId("board-ball-1-up"));
    d = lastDiagram(onChange);
    expect(d.steps[0].balls?.map((b) => b.style)).toEqual(["lob", "flat"]);
    expect(d.steps[0].ball?.style).toBe("lob");
    expect(screen.getByTestId("ball-path").getAttribute("data-style")).toBe("lob");
    expect(screen.getByTestId("ball-path-1").getAttribute("data-style")).toBe("flat");
    lobBadge(0);
    flatBadge(1);
    expect(screen.getByTestId("ball-number-0")).toHaveTextContent("1");
    expect(screen.getByTestId("ball-number-1")).toHaveTextContent("2");

    // ✕ on the second path leaves one path and no number; undo brings it back.
    fireEvent.click(screen.getByTestId("board-ball-1-remove"));
    d = lastDiagram(onChange);
    expect(d.steps[0].balls).toHaveLength(1);
    expect(d.steps[0].ball?.style).toBe("lob");
    expect(screen.queryByTestId("ball-number-0")).toBeNull();
    expect(screen.queryByTestId("ball-number-1")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "training.board.undo" }));
    d = lastDiagram(onChange);
    expect(d.steps[0].balls?.map((b) => b.style)).toEqual(["lob", "flat"]);
    lobBadge(0);
    flatBadge(1);

    fireEvent.click(screen.getByTestId("board-ball-0-remove"));
    d = lastDiagram(onChange);
    expect(d.steps[0].balls).toHaveLength(1);
    expect(d.steps[0].ball?.style).toBe("flat");
    expect(screen.queryByTestId("ball-number-0")).toBeNull();
  });

  it("[TRAINING-TACTICAL-BOARD-24] opening an older exercise reads its single ball as the only path, and saving writes balls plus the mirrored ball", () => {
    const onChange = vi.fn();
    const old = { from: { x: 58, y: 20 }, to: { x: 40, y: 80 }, style: "flat" as const };
    render(
      <Harness
        initial={{
          version: 2,
          mode: "game",
          pieces: [{ id: "a1", kind: "player", team: "A", label: "A1", x: 32, y: 26 }],
          steps: [{ id: "s1", ball: old, movements: [] }],
        }}
        onChange={onChange}
      />
    );
    // One path, so no number badge and no second path.
    expect(screen.getByTestId("ball-path")).toBeInTheDocument();
    expect(screen.queryByTestId("ball-path-1")).toBeNull();
    expect(screen.queryByTestId("ball-number-0")).toBeNull();
    // Saving = the next change the board reports.
    fireEvent.click(screen.getByTestId("ball-style-handle"));
    const saved = lastDiagram(onChange).steps[0];
    expect(saved.balls).toEqual([{ ...old, style: "lob" }]);
    expect(saved.ball).toEqual(saved.balls?.[0]);
  });
});
