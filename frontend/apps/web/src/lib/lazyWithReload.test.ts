import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHUNK_RELOAD_KEY, loadWithReload, markLeaving } from "./lazyWithReload";

/** client.route-loading rule 4 (PAD-585): "A missing chunk reloads once, then fails honestly". */
describe("loadWithReload", () => {
  const reload = vi.fn();
  const failing = () => Promise.reject(new TypeError("Failed to fetch dynamically imported module"));

  /** Whether `promise` is still pending after `ms` (a never-settling promise can only be shown so). */
  const pendingAfter = (promise: Promise<unknown>, ms = 20) =>
    Promise.race([
      promise.then(() => "settled", () => "settled"),
      new Promise((r) => setTimeout(() => r("pending"), ms)),
    ]).then((v) => v === "pending");

  beforeEach(() => {
    markLeaving(null); // module state: no test inherits another's leave
    window.sessionStorage.clear();
    reload.mockClear();
    vi.stubGlobal("location", { ...window.location, reload });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("returns the module when the chunk loads", async () => {
    await expect(loadWithReload(() => Promise.resolve({ default: "page" }))).resolves.toEqual({ default: "page" });
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads once and records the time when no reload happened recently", async () => {
    const pending = loadWithReload(failing, () => 50_000);
    await Promise.resolve();
    await Promise.resolve();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBe("50000");
    // Suspense keeps its fallback: the promise never settles before the reload.
    expect(await pendingAfter(pending)).toBe(true);
  });

  it("rethrows without reloading when a reload happened 3 s ago", async () => {
    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, "47000");
    await expect(loadWithReload(failing, () => 50_000)).rejects.toThrow("Failed to fetch dynamically imported module");
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads again once the 10 s window has passed", async () => {
    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, "30000");
    void loadWithReload(failing, () => 50_000);
    await Promise.resolve();
    await Promise.resolve();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  // B-532: a navigation away cancels the page's in-flight chunk loads (WebKit rejects the import);
  // reloading then would send the browser back to the page being left and swallow the navigation.
  it("does not reload when the chunk failed because the page is being left", async () => {
    markLeaving(50_000);
    const pending = loadWithReload(failing, () => 50_500);
    await Promise.resolve();
    await Promise.resolve();
    expect(reload).not.toHaveBeenCalled();
    expect(await pendingAfter(pending)).toBe(true);
  });

  it("reloads again once a cancelled leave is over (2 s after beforeunload)", async () => {
    markLeaving(50_000);
    void loadWithReload(failing, () => 52_500);
    await Promise.resolve();
    await Promise.resolve();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("beforeunload is what marks the page as being left", async () => {
    window.dispatchEvent(new Event("beforeunload"));
    void loadWithReload(failing);
    await Promise.resolve();
    await Promise.resolve();
    expect(reload).not.toHaveBeenCalled();
  });
});
