import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HUBSPOT_FORMS_HOST_SUFFIXES,
  HUBSPOT_TRACKING_HOST_SUFFIXES,
} from "@/lib/hubspotConfig";

/**
 * Static guards for auth.landing-page (PAD-469) — blind spots the E2E guard
 * cannot see.
 */
const web = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(web, p), "utf8");

describe("landing page static guards", () => {
  it.each([
    "src/pages/LandingPage.tsx",
    "src/components/landing/CookieBanner.tsx",
    "src/components/landing/DemoRequestDialog.tsx",
  ])("%s leaves the page only through ExitLink (rule 5)", (file) => {
    const src = read(file);
    // An exit written with react-router's Link could skip the new document.
    expect(src).not.toMatch(/<Link[\s>]/);
    expect(src).not.toMatch(/import\s*{[^}]*\bLink\b[^}]*}\s*from\s*"react-router-dom"/);
  });

  it("index.html names no HubSpot host, not even as a preconnect or dns-prefetch hint", () => {
    // Resource hints never show up as requests, so the E2E zero-request guard
    // cannot see them; this does (rule 11).
    const html = read("index.html").toLowerCase();
    for (const host of ["hubspot", ...HUBSPOT_TRACKING_HOST_SUFFIXES, ...HUBSPOT_FORMS_HOST_SUFFIXES]) {
      expect(html).not.toContain(host);
    }
  });
});
