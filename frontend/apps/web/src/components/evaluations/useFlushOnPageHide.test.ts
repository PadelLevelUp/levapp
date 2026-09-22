/**
 * evaluations.records rule 7 (PAD-396): a pending step or note is flushed when the page is
 * hidden — the tab closed (`pagehide`) or switched away (`visibilitychange` to hidden) — so
 * the last input of a form left inside its quiet period is never lost.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useFlushOnPageHide } from "./useFlushOnPageHide";

const hide = () => {
  Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
};
const show = () => {
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
};

afterEach(() => show());

describe("useFlushOnPageHide", () => {
  it("flushes on pagehide", () => {
    const flush = vi.fn();
    renderHook(() => useFlushOnPageHide(flush));
    window.dispatchEvent(new Event("pagehide"));
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("flushes when the page becomes hidden, and not when it becomes visible again", () => {
    const flush = vi.fn();
    renderHook(() => useFlushOnPageHide(flush));
    hide();
    expect(flush).toHaveBeenCalledTimes(1);
    show();
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("calls the latest flush it was given, and stops listening on unmount", () => {
    const first = vi.fn();
    const second = vi.fn();
    const hook = renderHook(({ f }) => useFlushOnPageHide(f), { initialProps: { f: first } });
    hook.rerender({ f: second });
    window.dispatchEvent(new Event("pagehide"));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    hook.unmount();
    window.dispatchEvent(new Event("pagehide"));
    expect(second).toHaveBeenCalledTimes(1);
  });
});
