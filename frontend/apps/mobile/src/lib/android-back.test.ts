import { describe, expect, it } from "vitest";
import { createBackRegistry } from "./android-back";

/**
 * PAD-298 — mobile.android-runtime rule 3, criterion "Back closes the newest
 * surface first". The registry is the whole decision: LIFO, an unregistered
 * surface is gone, and an empty registry leaves the event to the navigator.
 */
describe("createBackRegistry", () => {
  it("hands the press to the newest registered surface only", () => {
    const registry = createBackRegistry();
    const calls: string[] = [];
    registry.register(() => calls.push("dialog"));
    registry.register(() => calls.push("menu"));
    expect(registry.handle()).toBe(true);
    expect(calls).toEqual(["menu"]);
  });

  it("falls through to older surfaces once the newer ones are gone, then to the navigator", () => {
    const registry = createBackRegistry();
    const calls: string[] = [];
    const unregisterDialog = registry.register(() => calls.push("dialog"));
    const unregisterMenu = registry.register(() => calls.push("menu"));
    unregisterMenu();
    expect(registry.handle()).toBe(true);
    expect(calls).toEqual(["dialog"]);
    unregisterDialog();
    expect(registry.handle()).toBe(false);
  });

  it("a surface closed by other means is no longer in the registry", () => {
    const registry = createBackRegistry();
    const unregister = registry.register(() => {});
    expect(registry.size()).toBe(1);
    unregister();
    unregister(); // idempotent
    expect(registry.size()).toBe(0);
    expect(registry.handle()).toBe(false);
  });
});
