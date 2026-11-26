/**
 * client.route-loading rule 9 (PAD-866): a page chunk that fails twice within 10 s is rethrown by
 * `lazyWithReload` (rule 4); the boundary above the routes turns that into an error screen with a
 * reload action instead of letting React unmount the app to a blank page.
 */
import { Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

import { CHUNK_RELOAD_KEY, lazyWithReload } from "@/lib/lazyWithReload";
import { RouteErrorBoundary } from "./RouteErrorBoundary";

describe("RouteErrorBoundary (PAD-866)", () => {
  const reload = vi.fn();
  const realLocation = window.location;

  beforeEach(() => {
    reload.mockReset();
    Object.defineProperty(window, "location", { configurable: true, value: { ...realLocation, reload } });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: realLocation });
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("[CLIENT-ROUTE-LOADING-11] shows the error screen when a chunk fails twice, and its button reloads", async () => {
    // A reload already happened 3 s ago, so rule 4 rethrows instead of reloading again.
    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now() - 3_000));
    const Page = lazyWithReload(() => Promise.reject(new TypeError("Failed to fetch dynamically imported module")));

    render(
      <RouteErrorBoundary>
        <Suspense fallback={<div data-testid="route-fallback" />}>
          <Page />
        </Suspense>
      </RouteErrorBoundary>
    );

    expect(await screen.findByTestId("route-error")).toBeInTheDocument();
    expect(screen.getByText("common.routeError.title")).toBeInTheDocument();
    expect(screen.getByText("common.routeError.body")).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("route-error-reload"));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("renders its children when nothing throws", () => {
    render(
      <RouteErrorBoundary>
        <p>page</p>
      </RouteErrorBoundary>
    );
    expect(screen.getByText("page")).toBeInTheDocument();
    expect(screen.queryByTestId("route-error")).toBeNull();
  });
});
