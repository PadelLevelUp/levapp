/**
 * mobile.android-runtime rule 2 (PAD-487, B-265): when the field at the bottom of a scrolling form
 * gains focus, the form scrolls to its end once the keyboard is up, so the field sits above it.
 * The keyboard view shrinking (the header offset) is not enough on its own: the ScrollView keeps
 * its offset, and the field stays where the keyboard now is.
 */
import * as React from "react";
import { act } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Pressable } from "react-native";
import { __emitKeyboardEvent, __keyboardListenerCount, __resetReactNativeMock } from "@/test/mocks/react-native";
import { renderNative } from "@/test/render-native";
import { useScrollToEndOnKeyboard } from "./scroll-to-end-on-keyboard";

function Form({ scrollToEnd }: { scrollToEnd: () => void }) {
  const onFieldFocus = useScrollToEndOnKeyboard(scrollToEnd);
  return <Pressable testID="field" onPress={onFieldFocus} />;
}

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });

afterEach(() => __resetReactNativeMock());

describe("useScrollToEndOnKeyboard (PAD-487)", () => {
  it("scrolls to the end once the keyboard shows after the field is focused", async () => {
    const scrollToEnd = vi.fn();
    const n = await renderNative(<Form scrollToEnd={scrollToEnd} />);
    await n.press("field");
    expect(scrollToEnd).not.toHaveBeenCalled();
    await act(async () => __emitKeyboardEvent("keyboardDidShow", { endCoordinates: { height: 300 } }));
    await settle();
    expect(scrollToEnd).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the keyboard shows for another field", async () => {
    const scrollToEnd = vi.fn();
    await renderNative(<Form scrollToEnd={scrollToEnd} />);
    await act(async () => __emitKeyboardEvent("keyboardDidShow", { endCoordinates: { height: 300 } }));
    await settle();
    expect(scrollToEnd).not.toHaveBeenCalled();
  });

  it("stops listening when the form goes", async () => {
    const n = await renderNative(<Form scrollToEnd={vi.fn()} />);
    expect(__keyboardListenerCount("keyboardDidShow")).toBe(1);
    await act(async () => n.root.unmount());
    expect(__keyboardListenerCount("keyboardDidShow")).toBe(0);
  });
});
