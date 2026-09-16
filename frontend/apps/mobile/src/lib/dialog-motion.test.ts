import { afterEach, describe, expect, it, vi } from "vitest";
import { Platform } from "react-native";

/**
 * B-089 / PAD-314 (`mobile.android-runtime` rule 9): portalled dialogs, alert
 * dialogs and selects carry no layout animation on Android. The exit animation
 * left a dialog drawn after React removed it (face A); the entering animation
 * left the content at opacity 0 behind a drawn overlay (face B, measured on
 * the emulator lane: runs 35114681841 and 35114685284). iOS keeps both fades.
 */

vi.mock("react-native-reanimated", () => {
  const builder = (kind: string) => ({
    duration: (ms: number) => ({ kind, ms }),
  });
  return { FadeIn: builder("FadeIn"), FadeOut: builder("FadeOut") };
});

const { dialogEntering, dialogExiting } = await import("./dialog-motion");

afterEach(() => {
  Platform.OS = "ios";
});

describe("dialog motion (B-089)", () => {
  it("fades in and out on iOS", () => {
    Platform.OS = "ios";
    expect(dialogEntering()).toEqual({ kind: "FadeIn", ms: 150 });
    expect(dialogExiting()).toEqual({ kind: "FadeOut", ms: 150 });
  });

  it("has no entering animation on Android (face B)", () => {
    Platform.OS = "android";
    expect(dialogEntering()).toBeUndefined();
  });

  it("has no exiting animation on Android (face A)", () => {
    Platform.OS = "android";
    expect(dialogExiting()).toBeUndefined();
  });
});
