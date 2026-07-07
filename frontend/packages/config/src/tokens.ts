/**
 * LevelUp design tokens, extracted from apps/web/src/index.css and
 * apps/web/tailwind.config.ts. Values are raw HSL triplet strings
 * ("<hue> <saturation>% <lightness>%") exactly as the web CSS custom
 * properties define them; `lightTheme`/`darkTheme` expose ready-to-use
 * `hsl(...)` strings.
 *
 * Note on `warning`: index.css defines the design-system warning as
 * `35 90% 55%` (light) inside `@layer base`, but an UNLAYERED `:root`/`.dark`
 * rule overrides it to `38 92% 50%` in both themes (unlayered declarations
 * beat layered ones). The tokens below use the EFFECTIVE rendered value.
 */

export const radius = "0.625rem";

export interface ThemeHsl {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
  academy: string;
  academyForeground: string;
  private: string;
  privateForeground: string;
  success: string;
  successForeground: string;
  warning: string;
  warningForeground: string;
  info: string;
  infoForeground: string;
  sidebarBackground: string;
  sidebarForeground: string;
  sidebarPrimary: string;
  sidebarPrimaryForeground: string;
  sidebarAccent: string;
  sidebarAccentForeground: string;
  sidebarBorder: string;
  sidebarRing: string;
}

export const lightThemeHsl: ThemeHsl = {
  background: "210 20% 98%",
  foreground: "220 20% 10%",
  card: "0 0% 100%",
  cardForeground: "220 20% 10%",
  popover: "0 0% 100%",
  popoverForeground: "220 20% 10%",
  // Primary: Vibrant padel court green
  primary: "152 60% 42%",
  primaryForeground: "0 0% 100%",
  // Secondary: Warm accent
  secondary: "35 90% 55%",
  secondaryForeground: "0 0% 100%",
  muted: "210 20% 94%",
  mutedForeground: "220 10% 45%",
  accent: "210 30% 92%",
  accentForeground: "220 20% 10%",
  destructive: "0 72% 51%",
  destructiveForeground: "0 0% 100%",
  border: "210 20% 88%",
  input: "210 20% 88%",
  ring: "152 60% 42%",
  // Custom colors for class types
  academy: "200 80% 50%",
  academyForeground: "0 0% 100%",
  private: "280 60% 55%",
  privateForeground: "0 0% 100%",
  // Status colors
  success: "152 60% 42%",
  successForeground: "0 0% 100%",
  warning: "38 92% 50%", // effective value (unlayered :root override)
  warningForeground: "0 0% 100%",
  info: "200 80% 50%",
  infoForeground: "0 0% 100%",
  // Sidebar
  sidebarBackground: "220 20% 10%",
  sidebarForeground: "210 20% 90%",
  sidebarPrimary: "152 60% 42%",
  sidebarPrimaryForeground: "0 0% 100%",
  sidebarAccent: "220 15% 18%",
  sidebarAccentForeground: "210 20% 90%",
  sidebarBorder: "220 15% 20%",
  sidebarRing: "152 60% 42%",
};

// Values not redefined by `.dark` in index.css inherit the light values;
// those effective values are spelled out here so the theme is complete.
export const darkThemeHsl: ThemeHsl = {
  background: "220 20% 8%",
  foreground: "210 20% 95%",
  card: "220 18% 12%",
  cardForeground: "210 20% 95%",
  popover: "220 18% 12%",
  popoverForeground: "210 20% 95%",
  primary: "152 55% 48%",
  primaryForeground: "0 0% 100%",
  secondary: "35 85% 50%",
  secondaryForeground: "0 0% 100%",
  muted: "220 15% 18%",
  mutedForeground: "210 15% 55%",
  accent: "220 15% 18%",
  accentForeground: "210 20% 95%",
  destructive: "0 65% 45%",
  destructiveForeground: "0 0% 100%",
  border: "220 15% 20%",
  input: "220 15% 20%",
  ring: "152 55% 48%",
  academy: "200 75% 45%",
  academyForeground: "0 0% 100%", // inherited from light
  private: "280 55% 50%",
  privateForeground: "0 0% 100%", // inherited from light
  success: "152 60% 42%", // inherited from light
  successForeground: "0 0% 100%",
  warning: "38 92% 50%", // effective value (unlayered .dark override)
  warningForeground: "0 0% 100%",
  info: "200 80% 50%", // inherited from light
  infoForeground: "0 0% 100%",
  sidebarBackground: "220 25% 6%",
  sidebarForeground: "210 20% 90%",
  sidebarPrimary: "152 55% 48%",
  sidebarPrimaryForeground: "0 0% 100%",
  sidebarAccent: "220 20% 12%",
  sidebarAccentForeground: "210 20% 90%",
  sidebarBorder: "220 15% 15%",
  sidebarRing: "152 55% 48%",
};

function toHslStrings(theme: ThemeHsl): ThemeHsl {
  return Object.fromEntries(
    Object.entries(theme).map(([key, value]) => [key, `hsl(${value})`])
  ) as unknown as ThemeHsl;
}

/** Ready-to-use `hsl(...)` color strings for the light theme. */
export const lightTheme: ThemeHsl = toHslStrings(lightThemeHsl);

/** Ready-to-use `hsl(...)` color strings for the dark theme. */
export const darkTheme: ThemeHsl = toHslStrings(darkThemeHsl);

/**
 * Shapes a theme into a Tailwind/NativeWind `theme.extend.colors` block,
 * mirroring the structure of apps/web/tailwind.config.ts.
 */
export function nativewindTheme(mode: "light" | "dark" = "light") {
  const t = mode === "dark" ? darkTheme : lightTheme;
  return {
    border: t.border,
    input: t.input,
    ring: t.ring,
    background: t.background,
    foreground: t.foreground,
    primary: {
      DEFAULT: t.primary,
      foreground: t.primaryForeground,
    },
    secondary: {
      DEFAULT: t.secondary,
      foreground: t.secondaryForeground,
    },
    destructive: {
      DEFAULT: t.destructive,
      foreground: t.destructiveForeground,
    },
    muted: {
      DEFAULT: t.muted,
      foreground: t.mutedForeground,
    },
    accent: {
      DEFAULT: t.accent,
      foreground: t.accentForeground,
    },
    popover: {
      DEFAULT: t.popover,
      foreground: t.popoverForeground,
    },
    card: {
      DEFAULT: t.card,
      foreground: t.cardForeground,
    },
    sidebar: {
      DEFAULT: t.sidebarBackground,
      foreground: t.sidebarForeground,
      primary: t.sidebarPrimary,
      "primary-foreground": t.sidebarPrimaryForeground,
      accent: t.sidebarAccent,
      "accent-foreground": t.sidebarAccentForeground,
      border: t.sidebarBorder,
      ring: t.sidebarRing,
    },
    academy: {
      DEFAULT: t.academy,
      foreground: t.academyForeground,
    },
    private: {
      DEFAULT: t.private,
      foreground: t.privateForeground,
    },
    success: {
      DEFAULT: t.success,
      foreground: t.successForeground,
    },
    warning: {
      DEFAULT: t.warning,
      foreground: t.warningForeground,
    },
    info: {
      DEFAULT: t.info,
      foreground: t.infoForeground,
    },
    online: "#22c55e",
    unread: t.primary,
  };
}
