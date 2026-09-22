/**
 * evaluations.records rule 7 (PAD-396): a pending step or note is flushed when the app
 * leaves the foreground, so the last input of a form left inside its quiet period is
 * never lost when the coach switches apps or locks the phone. The mobile vitest
 * environment renders no React (see vitest.config.ts), so this pins the pure
 * subscription the hook wraps.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { __appStateListenerCount, __emitAppState, __resetReactNativeMock } from "@/test/mocks/react-native";
import { subscribeFlushOnBackground } from "./use-flush-on-background";

afterEach(() => __resetReactNativeMock());

describe("subscribeFlushOnBackground", () => {
  it("flushes when the app goes to the background, and again when it goes inactive — never on active", () => {
    const flush = vi.fn();
    subscribeFlushOnBackground(() => flush);
    __emitAppState("background");
    expect(flush).toHaveBeenCalledTimes(1);
    __emitAppState("active");
    expect(flush).toHaveBeenCalledTimes(1);
    __emitAppState("inactive");
    expect(flush).toHaveBeenCalledTimes(2);
  });

  it("calls whatever flush the getter returns at the time, and unsubscribes when told", () => {
    const first = vi.fn();
    const second = vi.fn();
    let current = first;
    const unsubscribe = subscribeFlushOnBackground(() => current);
    expect(__appStateListenerCount()).toBe(1);
    current = second;
    __emitAppState("background");
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(__appStateListenerCount()).toBe(0);
    __emitAppState("background");
    expect(second).toHaveBeenCalledTimes(1);
  });
});
