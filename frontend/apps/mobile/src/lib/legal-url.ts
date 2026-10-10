/**
 * auth.legal-pages rule 3 (PAD-601): the hosted legal pages take `?lang=pt|en`; the app opens them
 * in the account's language so the Portuguese view (its notice, and the translation once it
 * lands) is what a Portuguese user reads. Any other language falls back to English. Kept free of
 * `__DEV__` and the API target so it can be unit-tested without the config module's globals.
 */
export function legalUrl(base: string, language: string | undefined): string {
  const lang = (language ?? "").toLowerCase().startsWith("pt") ? "pt" : "en";
  return `${base}?lang=${lang}`;
}
