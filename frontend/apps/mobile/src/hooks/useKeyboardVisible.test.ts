import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it } from "vitest";

import {
  Platform,
  __emitKeyboardEvent,
  __keyboardListenerCount,
  __resetReactNativeMock,
  __subscribedKeyboardEvents,
} from "@/test/mocks/react-native";
import { useKeyboardVisible } from "./useKeyboardVisible";

/**
 * PAD-155. The regression that motivated a mobile unit runner (PAD-145) was a
 * keyboard-layout constant, and the piece of it that a module test can actually
 * reach is this hook: which RN events it subscribes to per platform, and whether
 * it unsubscribes. The `keyboardVerticalOffset` literal in the conversation
 * screen is a JSX prop and stays visually verified — see the PR body.
 */

/** Renders the hook in isolation and reports every value it returns. */
function renderHook() {
  const values: boolean[] = [];

  function Probe() {
    values.push(useKeyboardVisible());
    return null;
  }

  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(createElement(Probe));
  });

  return {
    get current() {
      return values[values.length - 1];
    },
    unmount: () => act(() => renderer.unmount()),
  };
}

afterEach(() => {
  __resetReactNativeMock();
});

describe("useKeyboardVisible", () => {
  it("starts hidden", () => {
    const hook = renderHook();
    expect(hook.current).toBe(false);
    hook.unmount();
  });

  it("subscribes to the `will` pair on iOS so layout rides the keyboard animation", () => {
    Platform.OS = "ios";
    const hook = renderHook();

    expect(__subscribedKeyboardEvents()).toEqual([
      "keyboardWillHide",
      "keyboardWillShow",
    ]);
    expect(__keyboardListenerCount("keyboardDidShow")).toBe(0);
    expect(__keyboardListenerCount("keyboardDidHide")).toBe(0);

    hook.unmount();
  });

  it("subscribes to the `did` pair on Android, which never fires the `will` pair", () => {
    Platform.OS = "android";
    const hook = renderHook();

    expect(__subscribedKeyboardEvents()).toEqual([
      "keyboardDidHide",
      "keyboardDidShow",
    ]);
    expect(__keyboardListenerCount("keyboardWillShow")).toBe(0);
    expect(__keyboardListenerCount("keyboardWillHide")).toBe(0);

    hook.unmount();
  });

  it("tracks show/hide on iOS", () => {
    Platform.OS = "ios";
    const hook = renderHook();

    act(() => __emitKeyboardEvent("keyboardWillShow"));
    expect(hook.current).toBe(true);

    act(() => __emitKeyboardEvent("keyboardWillHide"));
    expect(hook.current).toBe(false);

    hook.unmount();
  });

  it("tracks show/hide on Android", () => {
    Platform.OS = "android";
    const hook = renderHook();

    act(() => __emitKeyboardEvent("keyboardDidShow"));
    expect(hook.current).toBe(true);

    act(() => __emitKeyboardEvent("keyboardDidHide"));
    expect(hook.current).toBe(false);

    hook.unmount();
  });

  it("ignores the other platform's events", () => {
    Platform.OS = "ios";
    const hook = renderHook();

    act(() => __emitKeyboardEvent("keyboardDidShow"));
    expect(hook.current).toBe(false);

    hook.unmount();
  });

  it("removes every listener on unmount", () => {
    Platform.OS = "ios";
    const hook = renderHook();
    expect(__subscribedKeyboardEvents()).toHaveLength(2);

    hook.unmount();
    expect(__subscribedKeyboardEvents()).toEqual([]);
  });
});
