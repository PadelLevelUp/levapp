/**
 * auth.legal-pages (PAD-601): the legal texts the app serves at /terms and /privacy, as markdown
 * files next to this index. The body is the text; the metadata here is the header the page shows.
 *
 * English is the canonical text. A Portuguese translation is in preparation; until it lands the PT
 * view renders the English body under a Portuguese notice saying the English version prevails.
 * Publishing a version: replace the markdown, the version and effective date below, and
 * TERMS_VERSION / PRIVACY_VERSION in backend registration_service.py, in one commit.
 */
import privacyEn from "./en/privacy.md?raw";
import termsEn from "./en/terms.md?raw";

export type LegalDocumentId = "terms" | "privacy";
export type LegalLanguage = "en" | "pt";

export interface LegalDocument {
  id: LegalDocumentId;
  /** The version shown in the header: the effective date in ISO form. */
  version: string;
  /** The effective date exactly as the text states it. */
  effectiveDate: string;
  /** Markdown bodies by language; a missing language falls back to English with a notice. */
  bodies: Partial<Record<LegalLanguage, string>>;
}

export const LEGAL_DOCUMENTS: Record<LegalDocumentId, LegalDocument> = {
  terms: { id: "terms", version: "2026-10-10", effectiveDate: "October 10, 2026", bodies: { en: termsEn } },
  privacy: { id: "privacy", version: "2026-10-10", effectiveDate: "October 10, 2026", bodies: { en: privacyEn } },
};

export const PREVAILING_LANGUAGE: LegalLanguage = "en";

/** The body to render for `lang`, and whether it is a fallback to the prevailing language. */
export function legalBody(doc: LegalDocument, lang: LegalLanguage): { body: string; fallback: boolean } {
  const own = doc.bodies[lang];
  if (own) return { body: own, fallback: false };
  return { body: doc.bodies[PREVAILING_LANGUAGE] ?? "", fallback: true };
}

/** The language a legal page shows: `?lang=pt|en`, else the UI language, else English. */
export function legalLanguageFrom(search: string, uiLanguage: string | undefined): LegalLanguage {
  const q = new URLSearchParams(search).get("lang");
  if (q === "pt" || q === "en") return q;
  return (uiLanguage ?? "").toLowerCase().startsWith("pt") ? "pt" : "en";
}
