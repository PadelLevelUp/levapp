import { describe, expect, it } from "vitest";
import { legalUrl } from "./legal-url";

const TERMS_URL = "https://levapp.app/terms";
const PRIVACY_POLICY_URL = "https://levapp.app/privacy";

// auth.legal-pages rule 3 (PAD-601): the hosted pages open in the account's language.
describe("legalUrl", () => {
  it("appends the account's language, Portuguese for any pt locale", () => {
    expect(legalUrl(TERMS_URL, "pt-PT")).toBe(`${TERMS_URL}?lang=pt`);
    expect(legalUrl(PRIVACY_POLICY_URL, "pt")).toBe(`${PRIVACY_POLICY_URL}?lang=pt`);
  });
  it("falls back to English for English, other languages and no language", () => {
    expect(legalUrl(TERMS_URL, "en-GB")).toBe(`${TERMS_URL}?lang=en`);
    expect(legalUrl(TERMS_URL, "fr")).toBe(`${TERMS_URL}?lang=en`);
    expect(legalUrl(TERMS_URL, undefined)).toBe(`${TERMS_URL}?lang=en`);
  });
});
