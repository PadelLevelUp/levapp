/**
 * PAD-592 — mobile.interaction-performance rule 3: the AppState → focusManager bridge refocuses
 * on a return from the background (also through a transient `inactive`) and never on
 * `inactive → active` alone. Pure subscription, as use-flush-on-background.test.ts pins its hook.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { __emitAppState, __resetReactNativeMock } from "@/test/mocks/react-native";
import { subscribeAppStateFocus } from "./useAppStateFocus";

afterEach(() => __resetReactNativeMock());

describe("subscribeAppStateFocus", () => {
  it("Control Centre (active → inactive → active) is not a focus event", () => {
    const setFocused = vi.fn();
    subscribeAppStateFocus(setFocused);
    __emitAppState("inactive");
    __emitAppState("active");
    expect(setFocused).not.toHaveBeenCalled();
  });

  it("a return from the background is, once, also when it passes through inactive", () => {
    const setFocused = vi.fn();
    subscribeAppStateFocus(setFocused);
    __emitAppState("background");
    expect(setFocused).toHaveBeenCalledWith(false);
    __emitAppState("inactive");
    __emitAppState("active");
    expect(setFocused).toHaveBeenLastCalledWith(true);
    expect(setFocused).toHaveBeenCalledTimes(2);
  });

  it("unsubscribes", () => {
    const setFocused = vi.fn();
    const unsubscribe = subscribeAppStateFocus(setFocused);
    unsubscribe();
    __emitAppState("background");
    __emitAppState("active");
    expect(setFocused).not.toHaveBeenCalled();
  });
});
