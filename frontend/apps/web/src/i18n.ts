import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// PAD-40: app-wide i18n. Translation strings live in per-area JSON files under
// src/locales/<lng>/<area>.json (e.g. locales/pt/nav.json, locales/en/players.json)
// and are auto-loaded here via Vite's import.meta.glob. Each file contributes a
// disjoint top-level key (nav, dashboard, players, ...) into the single
// `translation` namespace, so new screens are localized by dropping a JSON file —
// this module never needs editing to add coverage.
//
// Infrastructure/library choices are locked by PAD-39: i18next + react-i18next,
// fallback locale = pt. This ticket is coverage only.

type Dict = Record<string, unknown>;

// client.route-loading rule 6 (PAD-585): the fallback language (pt) is bundled eagerly, so the
// first paint never waits; every other language is a lazy chunk the backend below loads when
// `changeLanguage` asks for it. The monorepo restructure (PR #47) left the locale files at the
// repo-root src/locales/ tree, so the globs point there (apps/web/src -> apps/web -> apps -> root).
const modules = import.meta.glob<{ default: Dict }>("../../../src/locales/pt/*.json", {
  eager: true,
});
const lazyModules = import.meta.glob<{ default: Dict }>([
  "../../../src/locales/*/*.json",
  "!../../../src/locales/pt/*.json",
]);

/** Deep-merge source into target (objects merge, everything else overwrites). */
function deepMerge(target: Dict, source: Dict): Dict {
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = target[key];
    if (
      sv &&
      typeof sv === "object" &&
      !Array.isArray(sv) &&
      tv &&
      typeof tv === "object" &&
      !Array.isArray(tv)
    ) {
      target[key] = deepMerge({ ...(tv as Dict) }, sv as Dict);
    } else {
      target[key] = sv;
    }
  }
  return target;
}

const resources: Record<string, { translation: Dict }> = {};

for (const [path, mod] of Object.entries(modules)) {
  // path looks like "../../../src/locales/pt/nav.json" -> capture the language segment.
  const match = path.match(/\/locales\/([^/]+)\//);
  if (!match) continue;
  const lng = match[1];
  const data = (mod as { default?: Dict }).default ?? (mod as Dict);
  if (!resources[lng]) resources[lng] = { translation: {} };
  deepMerge(resources[lng].translation, data);
}

/** Loads and merges every area file of one language (an empty object when there are none). */
async function loadLanguage(lng: string): Promise<Dict> {
  const merged: Dict = {};
  const files = Object.entries(lazyModules).filter(([path]) => path.includes(`/locales/${lng}/`));
  const mods = await Promise.all(files.map(([, load]) => load()));
  for (const mod of mods) {
    deepMerge(merged, ((mod as { default?: Dict }).default ?? (mod as Dict)) as Dict);
  }
  return merged;
}

// An i18next backend over the lazy glob: i18next calls `read` for a language that is not in
// `resources`, and only switches language once the callback has delivered its strings.
const lazyLocaleBackend = {
  type: "backend" as const,
  init() {},
  read(lng: string, _ns: string, callback: (error: unknown, data: Dict | false) => void) {
    loadLanguage(lng).then(
      (data) => callback(null, data),
      (error) => callback(error, false),
    );
  },
};

export const SUPPORTED_LANGUAGES = ["pt", "en"] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

i18n.use(lazyLocaleBackend).use(initReactI18next).init({
  resources,
  // pt is in `resources`; the backend fills in only the languages that are not.
  partialBundledLanguages: true,
  // Synchronous for the bundled language, so nothing suspends on the first render.
  initAsync: false,
  load: "languageOnly",
  lng: "pt",
  fallbackLng: "pt", // Fallback locale is Portuguese (PAD-39 locked decision)
  supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
  interpolation: { escapeValue: false },
  returnNull: false,
});

// Keep <html lang> in step with the UI language. It was hardcoded "en" in
// index.html while the app defaults to pt, so screen readers announced
// Portuguese content with English pronunciation rules, and browser
// translation offered to translate pt into pt.
function syncDocumentLang(lng: string) {
  if (typeof document !== "undefined") {
    document.documentElement.lang = lng;
  }
}
syncDocumentLang(i18n.language);
i18n.on("languageChanged", syncDocumentLang);

export default i18n;
