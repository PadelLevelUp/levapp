import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDebouncedText } from "./useDebouncedText";

/** players.search rule 10 (PAD-665): a server search waits 200 ms after the last keystroke. */
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useDebouncedText", () => {
  it("settles on the last text only, 200 ms after the last keystroke", () => {
    const { result, rerender } = renderHook(({ text }: { text: string }) => useDebouncedText(text), {
      initialProps: { text: "" },
    });
    expect(result.current).toEqual({ debounced: "", settling: false });
    for (const text of ["r", "ru", "rui"]) {
      rerender({ text });
      act(() => void vi.advanceTimersByTime(100));
    }
    expect(result.current).toEqual({ debounced: "", settling: true });
    act(() => void vi.advanceTimersByTime(99));
    expect(result.current.debounced).toBe("");
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current).toEqual({ debounced: "rui", settling: false });
  });

  it("trims, and is not settling when only the whitespace changed", () => {
    const { result, rerender } = renderHook(({ text }: { text: string }) => useDebouncedText(text), {
      initialProps: { text: "rui" },
    });
    rerender({ text: "  rui " });
    expect(result.current).toEqual({ debounced: "rui", settling: false });
  });
});
