import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useBoardHistory } from "./useBoardHistory";

// training.tactical-board rule 4 / "Undo reverts the last change"
describe("useBoardHistory", () => {
  it("commit forwards the next value and undo restores the previous one", () => {
    const onChange = vi.fn();
    let value = 1;
    const { result, rerender } = renderHook(() => useBoardHistory(value, onChange));
    expect(result.current.canUndo).toBe(false);

    act(() => result.current.commit(2));
    expect(onChange).toHaveBeenLastCalledWith(2);
    value = 2;
    rerender();
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.undo());
    expect(onChange).toHaveBeenLastCalledWith(1);
    expect(result.current.canUndo).toBe(false);
  });

  it("undo with an empty stack changes nothing", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useBoardHistory(0, onChange));
    act(() => result.current.undo());
    expect(onChange).not.toHaveBeenCalled();
  });
});
