import { describe, expect, it } from "vitest";
import { LEGAL_DOCUMENTS, legalBody, legalLanguageFrom } from "./index";

// auth.legal-pages rules 1–3 (PAD-601): English is the text, PT falls back with a notice until it lands.
describe("legal documents", () => {
  it("serves the English body for every document", () => {
    expect(LEGAL_DOCUMENTS.terms.bodies.en).toMatch(/^# Terms of Service/);
    expect(LEGAL_DOCUMENTS.privacy.bodies.en).toMatch(/^# Privacy Policy/);
  });

  it("falls back to English for Portuguese while no translation exists, and says so", () => {
    expect(legalBody(LEGAL_DOCUMENTS.terms, "pt")).toEqual({ body: LEGAL_DOCUMENTS.terms.bodies.en, fallback: true });
    expect(legalBody(LEGAL_DOCUMENTS.terms, "en").fallback).toBe(false);
  });

  it("keeps the header in step with the text's own effective date", () => {
    expect(LEGAL_DOCUMENTS.terms.bodies.en).toContain(`Effective date: ${LEGAL_DOCUMENTS.terms.effectiveDate}`);
    expect(LEGAL_DOCUMENTS.privacy.bodies.en).toContain(`Effective date: ${LEGAL_DOCUMENTS.privacy.effectiveDate}`);
  });

  it("picks the language from ?lang first, then the UI language, then English", () => {
    expect(legalLanguageFrom("?lang=pt", "en")).toBe("pt");
    expect(legalLanguageFrom("?lang=en", "pt-PT")).toBe("en");
    expect(legalLanguageFrom("", "pt-PT")).toBe("pt");
    expect(legalLanguageFrom("?lang=fr", undefined)).toBe("en");
  });
});
