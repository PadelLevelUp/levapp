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

/** Runs `loader`; on failure reloads the page once per window, otherwise rethrows. */
export async function loadWithReload<T>(loader: () => Promise<T>, now: () => number = Date.now): Promise<T> {
  try {
    return await loader();
  } catch (error) {
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
