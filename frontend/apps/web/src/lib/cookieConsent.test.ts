import { afterEach, describe, expect, it } from "vitest";
import {
  CONSENT_STORAGE_KEY,
  clearHubSpotCookies,
  readConsent,
  writeConsent,
} from "./cookieConsent";

/** auth.landing-page rules 11 and 13 (PAD-469). */
describe("cookie consent", () => {
  afterEach(() => {
    localStorage.clear();
    for (const c of document.cookie.split(";")) {
      const name = c.split("=")[0].trim();
      if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }
  });

  const NOW = new Date("2026-10-01T12:00:00Z");

  it("has no choice when nothing is stored", () => {
    expect(readConsent(NOW)).toBeNull();
  });

  it("reads back what it wrote, with the date", () => {
    writeConsent("declined", NOW);
    expect(JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY)!)).toEqual({
      choice: "declined",
      at: "2026-10-01T12:00:00.000Z",
    });
    expect(readConsent(NOW)).toBe("declined");
  });

  it("treats a choice older than 12 months as no choice", () => {
    writeConsent("accepted", new Date("2025-10-01T11:59:59Z"));
    expect(readConsent(NOW)).toBeNull();
  });

  it("keeps a choice younger than 12 months", () => {
    writeConsent("accepted", new Date("2025-10-01T12:00:01Z"));
    expect(readConsent(NOW)).toBe("accepted");
  });

  it.each([
    ["not JSON", "accepted"],
    ["unknown choice", JSON.stringify({ choice: "maybe", at: NOW.toISOString() })],
    ["no date", JSON.stringify({ choice: "accepted" })],
    ["bad date", JSON.stringify({ choice: "accepted", at: "yesterday" })],
  ])("treats a stored value with %s as no choice", (_label, raw) => {
    localStorage.setItem(CONSENT_STORAGE_KEY, raw);
    expect(readConsent(NOW)).toBeNull();
  });

  it("expires HubSpot's cookies and leaves the others", () => {
    document.cookie = "hubspotutk=u; path=/";
    document.cookie = "__hstc=a; path=/";
    document.cookie = "__hssc=b; path=/";
    document.cookie = "__hssrc=c; path=/";
    document.cookie = "__hs_opt_out=no; path=/";
    document.cookie = "theme=dark; path=/";

    clearHubSpotCookies();

    expect(document.cookie).toBe("theme=dark");
  });

  it("expires them on the host and every parent domain", () => {
    const writes: string[] = [];
    const fake = {
      location: { hostname: "staging.levapp.app" },
      get cookie() {
        return "hubspotutk=u; theme=dark";
      },
      set cookie(value: string) {
        writes.push(value);
      },
    } as unknown as Document;

    clearHubSpotCookies(fake);

    expect(writes.every((w) => w.startsWith("hubspotutk=; expires=Thu, 01 Jan 1970"))).toBe(true);
    const domains = writes.map((w) => /domain=([^;]+)/.exec(w)?.[1] ?? "(host-only)");
    expect(domains.sort()).toEqual(
      [
        "(host-only)",
        "staging.levapp.app",
        ".staging.levapp.app",
        "levapp.app",
        ".levapp.app",
      ].sort(),
    );
  });
});
