/**
 * evaluations.scale rule 7 (PAD-423), iOS twin of the web slider test: a drag is ONE input. The
 * value follows the thumb while dragging and is saved once, when the finger lifts. The native
 * slider is mocked as a host element carrying its props, so the test drives its callbacks the
 * way UIKit would: several onValueChange, then one onSlidingComplete.
 */
import * as React from "react";
import { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { renderNative } from "@/test/render-native";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}|${Object.values(opts).join("|")}` : key),
    i18n: { language: "en" },
  }),
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("@react-native-community/slider", () => ({
  default: (props: Record<string, unknown>) => React.createElement("Slider", props),
}));

import { ScoreSlider } from "./score-slider";

async function slider(score: number | null, onCommit = vi.fn()) {
  const n = await renderNative(
    <ScoreSlider id={7} name="Bandeja" score={score} scaleMin={1} scaleMax={10} onCommit={onCommit} onClear={() => {}} />,
  );
  const input = () => n.byTestId("evaluation-slider-7-input");
  return { n, input, onCommit };
}

describe("what the slider shows", () => {
  it("an unrated competency shows no value until touched, and no clear control", async () => {
    const { n, input } = await slider(null);
    expect(n.queryByTestId("evaluation-slider-7-value-none")).not.toBeNull();
    expect(n.queryByTestId("evaluation-slider-7-clear")).toBeNull();
    expect(input().props).toMatchObject({ minimumValue: 1, maximumValue: 10, step: 1, tapToSeek: true });
  });

  it("a rated one shows its score on its scale", async () => {
    const { n } = await slider(7);
    expect(n.queryByTestId("evaluation-slider-7-value-7")).not.toBeNull();
    expect(n.queryByTestId("evaluation-slider-7-clear")).not.toBeNull();
  });
});

describe("one input, one save", () => {
  it("a drag across several values saves once, when the finger lifts, with the final value", async () => {
    const { n, input, onCommit } = await slider(null);

    await act(async () => { input().props.onValueChange(3); });
    await act(async () => { input().props.onValueChange(6.4); });
    // The value follows the thumb (whole steps) and nothing is saved yet.
    expect(n.queryByTestId("evaluation-slider-7-value-6")).not.toBeNull();
    expect(onCommit).not.toHaveBeenCalled();

    await act(async () => { input().props.onSlidingComplete(6); });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(6);
  });
});
