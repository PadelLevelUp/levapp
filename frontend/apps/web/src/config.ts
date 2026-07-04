export const USE_MOCK_DATA =
  import.meta.env.VITE_USE_MOCK_DATA === "true" ||
  import.meta.env.VITE_USE_MOCK_DATA === undefined; // default to true when env var is not set

// Shared design tokens (single source of truth for web + mobile themes).
// Web styling itself still comes from index.css custom properties; these are
// re-exported for programmatic color needs (charts, canvases, etc.).
export { lightTheme, darkTheme, lightThemeHsl, darkThemeHsl, radius } from "@levelup/config";
