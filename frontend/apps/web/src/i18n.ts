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

// Eagerly import every locale JSON so translations are bundled (no async loading).
// The monorepo restructure (PR #47) moved this module to apps/web/src/ but left
// the locale files at the repo-root src/locales/ tree, so the glob points there
// (three levels up: apps/web/src -> apps/web -> apps -> repo root).
const modules = import.meta.glob<{ default: Dict }>(
  "../../../src/locales/*/*.json",
  {
    eager: true,
  }
);

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

export const SUPPORTED_LANGUAGES = ["pt", "en"] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

i18n.use(initReactI18next).init({
  resources,
  lng: "pt",
  fallbackLng: "pt", // Fallback locale is Portuguese (PAD-39 locked decision)
  supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
