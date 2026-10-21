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
    "src/components/landing/DemoRequestForm.tsx",
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

  // PAD-595 (inventory item 7): a shared link's preview names the canonical domain.
  it("index.html's link preview points at levapp.app, never the old domain", () => {
    const html = read("index.html");
    expect(html).toContain('<meta property="og:url" content="https://levapp.app/" />');
    expect(html).toContain('<meta property="og:image" content="https://levapp.app/og-image.png" />');
    expect(html).toContain('<meta name="twitter:image" content="https://levapp.app/og-image.png" />');
    expect(html).not.toContain("padellevelup.com");
  });

  it.each(["index.html", "../admin/index.html"])("%s names no Google font host (PAD-635)", (file) => {
    // The fonts are self-hosted: not even a preconnect may tell Google about a visit.
    const html = read(file).toLowerCase();
    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).not.toContain("fonts.gstatic.com");
  });
});
