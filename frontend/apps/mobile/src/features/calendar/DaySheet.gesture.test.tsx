/**
 * PAD-592 — mobile.interaction-performance rule 4: the pan writes the sheet's shared value per
 * frame and commits React state once, on release; a `top` set from outside (bounds re-clamp,
 * Android back) moves the shared value too. The gesture builder is stubbed to hand back its
 * callbacks; Reanimated to plain values.
 */
import * as React from "react";
import { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { renderNative } from "@/test/render-native";

const captured: Record<string, (e: { translationY: number }) => void> = {};
vi.mock("react-native-gesture-handler", () => {
  const chain: Record<string, unknown> = {};
  for (const k of ["onBegin", "onUpdate", "onEnd"]) {
    chain[k] = (fn: (e: { translationY: number }) => void) => {
      captured[k] = fn;
      return chain;
    };
  }
  chain.runOnJS = () => chain;
  return { Gesture: { Pan: () => chain }, GestureDetector: ({ children }: { children: React.ReactNode }) => children };
});
const shared: { value: number }[] = [];
vi.mock("react-native-reanimated", async () => {
  const { View } = await import("react-native");
  return {
    default: { View },
    useSharedValue: (v: number) => {
      const box = React.useRef({ value: v }).current;
      if (!shared.includes(box)) shared.push(box);
      return box;
    },
    useAnimatedStyle: (f: () => unknown) => f(),
  };
});
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }) }));
vi.mock("./DayHeader", () => ({ DayHeader: () => null }));
vi.mock("./EventCard", () => ({ EventCard: () => null }));
vi.mock("@/components/empty-state", () => ({ EmptyState: () => null }));

import { DaySheet } from "./DaySheet";

const bounds = { min: 100, max: 600, initial: 400 };
const props = { bounds, day: new Date(2026, 9, 29), events: [], levelCodeById: new Map<string, string>() };

describe("DaySheet drag (PAD-592)", () => {
  it("ten frames move the shared value and commit state once, clamped, on release", async () => {
    const onTopChange = vi.fn();
    await renderNative(<DaySheet {...props} top={400} onTopChange={onTopChange} />);
    act(() => captured.onBegin!({ translationY: 0 }));
    for (let i = 1; i <= 10; i++) act(() => captured.onUpdate!({ translationY: -i * 50 }));
    expect(onTopChange).not.toHaveBeenCalled(); // no React commit per frame
    act(() => captured.onEnd!({ translationY: -500 }));
    expect(onTopChange).toHaveBeenCalledTimes(1);
    expect(onTopChange).toHaveBeenCalledWith(100); // 400 - 500 clamped to min
    const sheetY = shared[0]!;
    expect(sheetY.value).toBe(100); // the frames moved the shared value
  });

  it("a top set from outside moves the shared value", async () => {
    const n = await renderNative(<DaySheet {...props} top={400} onTopChange={vi.fn()} />);
    const sheetY = shared[shared.length - 1]!;
    await n.rerender(<DaySheet {...props} top={250} onTopChange={vi.fn()} />);
    expect(sheetY.value).toBe(250);
  });
});
