import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { CONSENT_STORAGE_KEY, readConsent, writeConsent } from "@/lib/cookieConsent";

const loadTrackingScript = vi.fn();
vi.mock("@/lib/hubspot", () => ({ loadTrackingScript: () => loadTrackingScript() }));

import { useSiteConsent } from "./useSiteConsent";

/** auth.landing-page rules 11–13, now one hook for every public page (PAD-656). */
describe("useSiteConsent", () => {
  const reload = vi.fn();
  beforeEach(() => {
    localStorage.clear();
    loadTrackingScript.mockClear();
    reload.mockClear();
    vi.stubGlobal("location", { ...window.location, reload });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("opens the banner with no stored choice and loads nothing", () => {
    const { result } = renderHook(() => useSiteConsent());
    expect(result.current.bannerOpen).toBe(true);
    expect(loadTrackingScript).not.toHaveBeenCalled();
  });

  it("accepting stores the choice, closes the banner and loads tracking once", () => {
    const { result } = renderHook(() => useSiteConsent());
    act(() => result.current.accept());
    expect(readConsent()).toBe("accepted");
    expect(result.current.bannerOpen).toBe(false);
    expect(loadTrackingScript).toHaveBeenCalledTimes(1);
  });

  it("a stored acceptance keeps the banner closed and loads tracking", () => {
    writeConsent("accepted");
    const { result } = renderHook(() => useSiteConsent());
    expect(result.current.bannerOpen).toBe(false);
    expect(loadTrackingScript).toHaveBeenCalledTimes(1);
  });

  it("declining with no prior acceptance stores it and does not reload", () => {
    const { result } = renderHook(() => useSiteConsent());
    act(() => result.current.decline());
    expect(readConsent()).toBe("declined");
    expect(result.current.bannerOpen).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(loadTrackingScript).not.toHaveBeenCalled();
  });

  it("revoking after an acceptance stores the decline before reloading (rule 13)", () => {
    writeConsent("accepted");
    const { result } = renderHook(() => useSiteConsent());
    act(() => result.current.reopen());
    expect(result.current.bannerOpen).toBe(true);
    act(() => result.current.decline());
    expect(JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY) ?? "{}").choice).toBe("declined");
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
