import { lazy, type ComponentType, type LazyExoticComponent } from "react";

/**
 * client.route-loading rule 4 (PAD-585): a page chunk that fails to load reloads the app once.
 *
 * A deploy replaces every hashed chunk, and the server answers a missing one with 404 (PAD-584),
 * so a tab opened before the deploy cannot fetch a page it has not visited yet. Reloading picks
 * up the new `index.html` and its new chunk names. The timestamp in `sessionStorage` stops a
 * reload loop when the chunk is missing for another reason: a second failure within
 * `RELOAD_WINDOW_MS` rethrows instead.
 */
export const CHUNK_RELOAD_KEY = "levapp.chunkReloadAt";
export const RELOAD_WINDOW_MS = 10_000;

function readReloadAt(): number | null {
  try {
    const raw = window.sessionStorage.getItem(CHUNK_RELOAD_KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

function writeReloadAt(at: number): boolean {
  try {
    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(at));
    return true;
  } catch {
    // Without storage there is no loop guard, so do not reload at all.
    return false;
  }
}

/**
 * B-532: a navigation away from the page cancels its in-flight chunk loads — WebKit rejects the
 * dynamic import — and reloading then sends the browser back to the page being left, swallowing
 * the navigation (the webkit E2E `goto` after login, or a Safari user typing an address while a
 * page loads). `beforeunload` marks the moment; for `LEAVING_WINDOW_MS` after it a failed chunk
 * neither reloads nor throws. The window ends on its own, so a leave the user cancels (the
 * Settings leave guard's prompt) does not switch the reload off for good — its cost is that a
 * chunk failing for another reason inside those 2 s keeps the loading fallback until the user
 * moves on, rather than reloading.
 */
export const LEAVING_WINDOW_MS = 2_000;
let leavingAt: number | null = null;

/** Record that the page is being left, at `at` (the `beforeunload` moment). */
export function markLeaving(at: number | null): void {
  leavingAt = at;
}

/** Whether a failed chunk at `now` is the page being left rather than a missing chunk. */
export function isLeaving(now: number): boolean {
  return leavingAt !== null && now - leavingAt >= 0 && now - leavingAt < LEAVING_WINDOW_MS;
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => markLeaving(Date.now()));
}

/** Runs `loader`; on failure reloads the page once per window, otherwise rethrows. */
export async function loadWithReload<T>(loader: () => Promise<T>, now: () => number = Date.now): Promise<T> {
  try {
    return await loader();
  } catch (error) {
    if (isLeaving(now())) {
      // The page is being replaced: let the navigation finish.
      return new Promise<T>(() => {});
    }
    const last = readReloadAt();
    const at = now();
    if ((last === null || at - last > RELOAD_WINDOW_MS) && writeReloadAt(at)) {
      window.location.reload();
      // Keep Suspense showing its fallback until the reload replaces the page.
      return new Promise<T>(() => {});
    }
    throw error;
  }
}

export function lazyWithReload<P>(
  loader: () => Promise<{ default: ComponentType<P> }>,
): LazyExoticComponent<ComponentType<P>> {
  return lazy(() => loadWithReload(loader));
}
