/**
 * settings.save-on-change rules 2-3 (PAD-473) — the sign beside a control that saves on change.
 * Asserted by test id and data-state, never by rendered copy (t is mocked to return the key).
 */
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
}));

import { SAVE_SIGN_PAUSE_MS, SAVE_SIGN_VISIBLE_MS, SaveSign, useSaveSign } from "./SaveSign";

function deferred() {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  promise.catch(() => undefined);
  return { promise, resolve, reject };
}
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useSaveSign (rule 2)", () => {
  it("shows saved once the save is confirmed and a pause passed, then clears", async () => {
    const { result } = renderHook(() => useSaveSign());
    const save = deferred();
    act(() => { void result.current.track("scale", save.promise); });

    await act(async () => { save.resolve(); });
    expect(result.current.status("scale")).toBe("idle");

    await advance(SAVE_SIGN_PAUSE_MS);
    expect(result.current.status("scale")).toBe("saved");

    await advance(SAVE_SIGN_VISIBLE_MS);
    expect(result.current.status("scale")).toBe("idle");
  });

  it("three quick saves give one sign, after the last", async () => {
    const { result } = renderHook(() => useSaveSign());
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      const save = deferred();
      act(() => { void result.current.track("scale", save.promise); });
      await act(async () => { save.resolve(); });
      await advance(150);
      seen.push(result.current.status("scale"));
    }
    expect(seen).toEqual(["idle", "idle", "idle"]);

    await advance(SAVE_SIGN_PAUSE_MS);
    expect(result.current.status("scale")).toBe("saved");
  });

  it("keys are independent", async () => {
    const { result } = renderHook(() => useSaveSign());
    const a = deferred();
    act(() => { void result.current.track("scale", a.promise); });
    await act(async () => { a.resolve(); });
    await advance(SAVE_SIGN_PAUSE_MS);

    expect(result.current.status("scale")).toBe("saved");
    expect(result.current.status("reminder")).toBe("idle");
  });
});

describe("useSaveSign failures (rule 3)", () => {
  it("a failure shows at once and stays until the next change", async () => {
    const { result } = renderHook(() => useSaveSign());
    const save = deferred();
    act(() => { void result.current.track("scale", save.promise); });

    await act(async () => { save.reject(new Error("offline")); });
    expect(result.current.status("scale")).toBe("failed");

    await advance(SAVE_SIGN_VISIBLE_MS * 3);
    expect(result.current.status("scale")).toBe("failed");

    const next = deferred();
    act(() => { void result.current.track("scale", next.promise); });
    expect(result.current.status("scale")).toBe("idle");
  });

  it("an older save failing after a newer one was confirmed does not claim a failure", async () => {
    const { result } = renderHook(() => useSaveSign());
    const older = deferred();
    const newer = deferred();
    act(() => { void result.current.track("toggle", older.promise); });
    act(() => { void result.current.track("toggle", newer.promise); });

    await act(async () => { newer.resolve(); });
    await act(async () => { older.reject(new Error("late")); });
    await advance(SAVE_SIGN_PAUSE_MS);

    expect(result.current.status("toggle")).toBe("saved");
  });

  it("track hands back the caller's promise unchanged", async () => {
    const { result } = renderHook(() => useSaveSign());
    let out: Promise<number> | undefined;
    act(() => { out = result.current.track("scale", Promise.resolve(10)); });
    await expect(out).resolves.toBe(10);
  });
});

describe("<SaveSign>", () => {
  it("is a polite live region from the first render, empty while idle", () => {
    render(<SaveSign status="idle" testId="sign" />);
    const sign = screen.getByTestId("sign");
    expect(sign).toHaveAttribute("role", "status");
    expect(sign).toHaveAttribute("aria-live", "polite");
    expect(sign).toHaveAttribute("data-state", "idle");
    expect(sign).toHaveTextContent("");
  });

  it("says saved, or that the save failed", () => {
    const { rerender } = render(<SaveSign status="saved" testId="sign" />);
    expect(screen.getByTestId("sign")).toHaveTextContent("settings.saveSign.saved");
    rerender(<SaveSign status="failed" testId="sign" />);
    expect(screen.getByTestId("sign")).toHaveTextContent("settings.saveSign.failed");
    expect(screen.getByTestId("sign")).toHaveAttribute("data-state", "failed");
  });
});
