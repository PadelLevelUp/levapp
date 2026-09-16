import { describe, expect, it } from "vitest";
import { Platform } from "react-native";
import { keyboardAvoidingBehavior } from "./keyboard-avoiding";

/**
 * PAD-298 — mobile.android-runtime rule 2, criterion "Keyboard avoidance
 * follows one policy": padding on both platforms. The first emulator run showed
 * the Android window does not resize under edge-to-edge, so `undefined` there
 * left the login button under the keyboard (rule changed, spec commit).
 */
describe("keyboardAvoidingBehavior", () => {
  it("is padding on iOS and on Android alike", () => {
    Platform.OS = "ios";
    expect(keyboardAvoidingBehavior()).toBe("padding");
    Platform.OS = "android";
    expect(keyboardAvoidingBehavior()).toBe("padding");
    Platform.OS = "ios";
  });
});
