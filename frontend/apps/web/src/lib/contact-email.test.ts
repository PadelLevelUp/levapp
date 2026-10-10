/**
 * PAD-599 (auth.landing-page rule 14): the site shows one contact address, admin@levapp.app, and
 * none of the old ones. Reads the files that render it, so a reintroduced literal is caught.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CONTACT_EMAIL } from "@levelup/config";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const LOCALES = path.resolve(WEB, "..", "..", "src", "locales");
const FILES = [
  "src/pages/LandingPage.tsx",
  "src/pages/SupportPage.tsx",
  "public/support.html",
  path.join(LOCALES, "pt", "landing.json"),
  path.join(LOCALES, "en", "landing.json"),
];
const OLD = ["padellevelup2026@gmail.com", "admin@levapp.pt"];

describe("the site's contact email (PAD-599)", () => {
  it("is the owner's address", () => {
    expect(CONTACT_EMAIL).toBe("admin@levapp.app");
  });

  it.each(FILES)("%s carries no old address", (file) => {
    const text = fs.readFileSync(path.isAbsolute(file) ? file : path.join(WEB, file), "utf8");
    for (const old of OLD) expect(text, old).not.toContain(old);
  });

  it("the static support page and the locale copy show the address itself", () => {
    expect(fs.readFileSync(path.join(WEB, "public/support.html"), "utf8")).toContain(`mailto:${CONTACT_EMAIL}`);
    for (const lang of ["pt", "en"]) {
      expect(fs.readFileSync(path.join(LOCALES, lang, "landing.json"), "utf8")).toContain(CONTACT_EMAIL);
    }
  });
});
