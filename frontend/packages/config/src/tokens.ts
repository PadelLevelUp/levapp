/**
 * LevApp design tokens — the single source of truth for BOTH apps/web (via
 * apps/web/src/index.css, which must mirror these) and apps/mobile (via
 * `nativewindTheme()`). Change a value here and both platforms move.
 *
 * Values are raw HSL triplet strings ("<hue> <saturation>% <lightness>%");
 * `lightTheme`/`darkTheme` expose ready-to-use `hsl(...)` strings.
 *
 * The palette is the navy-and-blue brand lifted from the app icon, replacing
 * the original "padel court green". The one rule worth restating here, because
 * it is the point of the whole scheme: blue carries identity and every primary
 * action, which frees green to mean ONLY "done/confirmed". A green badge is
 * now informative. Never pick a status colour for visual variety.
 *
 * Historical note on `warning`: index.css used to define it inside
 * `@layer base` while an UNLAYERED `:root`/`.dark` rule silently overrode it
 * (unlayered declarations beat layered ones). That override has been removed —
 * `warning` is now defined exactly once, inside the layer. Do not reintroduce
 * unlayered token declarations or the same silent-override bug comes back.
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
  // Page grey and white cards — the system allows exactly two background colours.
  background: "216 29% 93%", // grey-150 #E9EDF3
  foreground: "216 52% 13%", // grey-800 #101E33
  card: "0 0% 100%",
  cardForeground: "216 52% 13%",
  popover: "0 0% 100%",
  popoverForeground: "216 52% 13%",
  // Primary: brand blue, lifted from the app icon. Blue carries identity AND
  // every primary action — that is why green could be demoted to "done".
  primary: "220 84% 47%", // blue-600 #1355DC
  primaryForeground: "0 0% 100%",
  // Secondary: the blue wash, not the old warm amber. This is the secondary
  // button treatment (wash background, blue label).
  secondary: "217 100% 95%", // blue-100 #E8F1FF
  secondaryForeground: "220 84% 47%",
  muted: "213 39% 95%", // grey-100
  mutedForeground: "219 18% 41%", // grey-600
  // `accent` is shadcn's menu/dropdown hover, not a brand accent. It stays
  // NEUTRAL: the hover rule is "one step darker", and blue is for actions.
  accent: "217 32% 92%", // grey-200
  accentForeground: "216 52% 13%",
  destructive: "4 63% 53%", // red-600 #D3453B
  destructiveForeground: "0 0% 100%",
  // shadcn has one `border`; the system has subtle/default/strong. This is
  // `default` (grey-300) — `subtle` is right for cards but too faint for the
  // inputs and dividers that share this token.
  border: "215 28% 86%",
  input: "215 28% 86%",
  ring: "220 84% 47%",
  // Class types
  academy: "214 100% 59%", // blue-500
  academyForeground: "0 0% 100%",
  private: "249 55% 59%", // violet-600 — player-side / non-class
  privateForeground: "0 0% 100%",
  // Status — each colour has exactly one job.
  success: "161 78% 33%", // green-600: DONE/CONFIRMED ONLY
  successForeground: "0 0% 100%",
  warning: "31 72% 50%", // amber-600: needs the coach
  // Ink, not white: white on amber-600 is ~2.4:1 and fails contrast.
  warningForeground: "216 52% 13%",
  info: "214 100% 59%", // blue-500
  infoForeground: "0 0% 100%",
  // Sidebar wears the navy chrome even in the light theme.
  sidebarBackground: "217 58% 12%", // navy-800 #0D1B31
  sidebarForeground: "216 63% 97%", // near-white, never pure
  sidebarPrimary: "213 100% 65%", // blue-400 — primary shifts up on dark
  sidebarPrimaryForeground: "211 68% 7%", // dark text on it
  sidebarAccent: "218 54% 19%", // navy-700
  sidebarAccentForeground: "216 63% 97%",
  sidebarBorder: "213 37% 23%",
  sidebarRing: "213 100% 65%",
};

// Values not redefined by `.dark` in index.css inherit the light values;
// those effective values are spelled out here so the theme is complete.
export const darkThemeHsl: ThemeHsl = {
  // Dark is the brand, not an inversion — the icon's navy is already the
  // darkest surface, so this is where the product looks most like itself.
  // Surfaces step UP in lightness (bg → card → raised) instead of relying on
  // borders. No pure black, and no pure white text.
  background: "218 58% 6%", // #070E1A
  foreground: "216 63% 97%", // #F2F6FC
  card: "217 51% 12%", // #0F1B2E surface
  cardForeground: "216 63% 97%",
  popover: "216 47% 17%", // #17273F raised
  popoverForeground: "216 63% 97%",
  primary: "213 100% 65%", // blue-400 #4A9BFF
  primaryForeground: "211 68% 7%", // DARK text on it, for contrast
  secondary: "215 47% 22%", // #1E3453
  secondaryForeground: "215 100% 81%", // #9CC6FF
  muted: "216 47% 17%",
  mutedForeground: "215 29% 71%", // #9FB1CA
  accent: "216 47% 17%",
  accentForeground: "216 63% 97%",
  destructive: "4 66% 59%", // red lifted for the dark surface
  destructiveForeground: "0 0% 100%",
  border: "213 37% 23%", // #24374F
  input: "213 37% 23%",
  ring: "213 100% 65%",
  // Status keeps its hue but lifts in lightness; each pairs with dark text.
  academy: "213 100% 65%",
  academyForeground: "211 68% 7%",
  private: "250 80% 81%", // #B3A6F5
  privateForeground: "211 68% 7%",
  success: "160 57% 60%", // #5FD3AC
  successForeground: "211 68% 7%",
  warning: "34 81% 69%", // #F0B970
  warningForeground: "211 68% 7%",
  info: "213 100% 65%",
  infoForeground: "211 68% 7%",
  sidebarBackground: "216 53% 9%", // ink-900, deeper than the page
  sidebarForeground: "216 63% 97%",
  sidebarPrimary: "213 100% 65%",
  sidebarPrimaryForeground: "211 68% 7%",
  sidebarAccent: "216 47% 17%",
  sidebarAccentForeground: "216 63% 97%",
  sidebarBorder: "215 43% 19%", // #1C2E47
  sidebarRing: "213 100% 65%",
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
    // "Online" is a presence state, i.e. a live/confirmed reading — that is the
    // one job green has. It used to be a hardcoded #22c55e, which survived the
    // repaint as a stray from the old palette.
    online: t.success,
    unread: t.primary,
  };
}

/**
 * Type stacks, shared so web (tailwind fontFamily) and mobile (expo-font)
 * name the same families.
 *
 * Poppins carries display: screen titles, hero numbers, the wordmark, and the
 * level chip. Everything else is Plus Jakarta Sans. Anything 20px+ in Poppins
 * takes `letter-spacing: -0.02em`.
 */
export const fontFamily = {
  display: ["Poppins", "system-ui", "-apple-system", "sans-serif"],
  body: ["Plus Jakarta Sans", "system-ui", "-apple-system", "sans-serif"],
} as const;

/** Tracking for display type at 20px and above. */
export const trackingDisplay = "-0.02em";
