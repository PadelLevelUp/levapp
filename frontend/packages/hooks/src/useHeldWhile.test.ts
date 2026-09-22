// @vitest-environment jsdom
/**
 * evaluations.history / evaluations.evolution (PAD-375): nothing above an open
 * evaluation form may change shape in answer to the coach's own tap — the first
 * rating used to make "Evolução" appear and push the form ~350 pt down, so the
 * next tap landed on nothing (Maestro 57, 2026-09-21).
 */
import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useHeldWhile } from "./useHeldWhile";

type Props = { value: number[] | undefined; held: boolean; resetKey?: number };
const run = (initial: Props) =>
  renderHook(({ value, held, resetKey }: Props) => useHeldWhile(value, held, resetKey), { initialProps: initial });

describe("useHeldWhile", () => {
  it("passes the value through while nothing holds it", () => {
    const h = run({ value: [], held: false });
    h.rerender({ value: [12], held: false });
    expect(h.result.current).toEqual([12]);
  });

  it("keeps the value it had when the hold began, and releases the newest one afterwards", () => {
    const h = run({ value: [], held: false });
    h.rerender({ value: [], held: true });
    h.rerender({ value: [12], held: true });
    expect(h.result.current).toEqual([]);
    h.rerender({ value: [12, 3], held: true });
    expect(h.result.current).toEqual([]);
    h.rerender({ value: [12, 3], held: false });
    expect(h.result.current).toEqual([12, 3]);
  });

  it("lets a first load through: a value that was never there is not something to hold", () => {
    const h = run({ value: undefined, held: true });
    h.rerender({ value: [12], held: true });
    expect(h.result.current).toEqual([12]);
    h.rerender({ value: [12, 3], held: true });
    expect(h.result.current).toEqual([12]);
  });

  it("starts again when what the value belongs to changes (another competency's figures are not held over)", () => {
    const h = run({ value: [1], held: true, resetKey: 12 });
    h.rerender({ value: [2], held: true, resetKey: 12 });
    expect(h.result.current).toEqual([1]);
    h.rerender({ value: [9], held: true, resetKey: 3 });
    expect(h.result.current).toEqual([9]);
  });
});

describe("holdEmpty: a hold that began with nothing keeps showing nothing (review #359 (2))", () => {
  it("does not let a first load through while held, and releases it afterwards", () => {
    const h = renderHook(({ value, held }: { value: number[] | undefined; held: boolean }) => useHeldWhile(value, held, "k", { holdEmpty: true }), {
      initialProps: { value: undefined as number[] | undefined, held: true },
    });
    h.rerender({ value: [1, 2, 3], held: true });
    expect(h.result.current).toBeUndefined();
    h.rerender({ value: [1, 2, 3], held: false });
    expect(h.result.current).toEqual([1, 2, 3]);
  });

  it("without the option a first load still passes through (the default stays)", () => {
    const h = renderHook(({ value, held }: { value: number[] | undefined; held: boolean }) => useHeldWhile(value, held, "k"), {
      initialProps: { value: undefined as number[] | undefined, held: true },
    });
    h.rerender({ value: [1], held: true });
    expect(h.result.current).toEqual([1]);
  });
});
