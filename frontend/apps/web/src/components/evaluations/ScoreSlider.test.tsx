/**
 * evaluations.scale rule 7 (PAD-423): the slider is ONE input. The value follows the thumb while
 * dragging and is saved once, on release; a key press is one input too. By test id, never by
 * rendered copy (t is mocked to return the key).
 */
import * as React from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    i18n: { language: "pt" },
  }),
}));

import { ScoreSlider } from "./ScoreSlider";

beforeAll(() => {
  // jsdom has no layout, no pointer capture and no ResizeObserver; Radix's slider needs all three.
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  if (!("PointerEvent" in window)) {
    class PointerEventStub extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; }
    }
    (window as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventStub;
  }
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.hasPointerCapture ??= () => true;
  Element.prototype.scrollIntoView ??= () => {};
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    { x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20, toJSON: () => ({}) } as DOMRect,
  );
});

function slider(score: number | null, onCommit = vi.fn()) {
  render(<ScoreSlider id={7} name="Bandeja" score={score} scaleMin={1} scaleMax={10} onCommit={onCommit} onClear={() => {}} />);
  return onCommit;
}

describe("what the slider shows", () => {
  it("an unrated competency shows no value until touched", () => {
    slider(null);
    expect(screen.getByTestId("evaluation-slider-7-value")).toHaveAttribute("data-score", "");
    expect(screen.getByTestId("evaluation-slider-7-input")).toHaveAttribute("data-unrated", "true");
    expect(screen.queryByTestId("evaluation-slider-7-clear")).toBeNull();
    expect(screen.getByTestId("evaluation-slider-7-clear-slot")).toBeInTheDocument();
  });

  it("a rated one shows its score on its scale", () => {
    slider(7);
    expect(screen.getByTestId("evaluation-slider-7-value")).toHaveAttribute("data-score", "7");
    expect(screen.getByTestId("evaluation-slider-7-value").textContent).toBe(
      'players.evaluationHistory.stepperValue:{"score":7,"max":10}',
    );
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuemax", "10");
  });
});

describe("one input, one save", () => {
  it("a drag across several values saves once, on release, with the final value", () => {
    const onCommit = slider(null);
    const root = screen.getByTestId("evaluation-slider-7-input");

    fireEvent.pointerDown(root, { pointerId: 1, clientX: 20, button: 0 });
    fireEvent.pointerMove(root, { pointerId: 1, clientX: 50 });
    fireEvent.pointerMove(root, { pointerId: 1, clientX: 70 });
    // The value follows the thumb while dragging, and nothing is saved yet.
    expect(screen.getByTestId("evaluation-slider-7-value")).toHaveAttribute("data-score", "7");
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.pointerUp(root, { pointerId: 1, clientX: 70 });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(7);
  });

  it("a key press is one input", () => {
    const onCommit = slider(7);
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(8);
  });
});
