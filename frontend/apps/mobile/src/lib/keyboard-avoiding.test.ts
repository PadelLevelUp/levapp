import { describe, expect, it } from "vitest";
import { Platform } from "react-native";
import { keyboardAvoidingBehavior } from "./keyboard-avoiding";

/**
 * PAD-298 — mobile.android-runtime rule 2, criterion "Keyboard avoidance
 * follows one policy": padding on iOS, the window resize on Android.
 */
describe("keyboardAvoidingBehavior", () => {
  it("is padding on iOS and undefined (adjustResize) on Android", () => {
    Platform.OS = "ios";
    expect(keyboardAvoidingBehavior()).toBe("padding");
    Platform.OS = "android";
    expect(keyboardAvoidingBehavior()).toBeUndefined();
    Platform.OS = "ios";
  });
});
